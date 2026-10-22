/**
 * Priced CAR / EAR project changes: applied at once when within instant limits, otherwise
 * referred to the underwriter; once approved (with any loading) the customer accepts and pays.
 */
const { db, json } = require('../../db');
const numbering = require('../../lib/numbering');
const catalog = require('../../lib/catalog');
const { nextValue, pad } = require('../../lib/sequence');
const { audit } = require('../../lib/audit');
const { round } = require('../../lib/money');
const { AppError, conflict } = require('../../lib/errors');

async function apply(policy, { type, premiumDelta, data, riskPatch, expiry, payment, user, ratingPatch, requestId = null }) {
  const policies = require('../policies/service');
  const country = await catalog.getCountry(policy.country_code);
  const dec = country.currency_decimals;
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  let delta = round(premiumDelta, dec);
  if (delta > 0 && delta < pc.settings.minEndorsementPremium) delta = pc.settings.minEndorsementPremium;
  const taxDelta = round(delta * Number(country.vat_rate), dec);
  const paymentRow = await policies.collectEndorsementPayment(policy, round(delta + taxDelta, dec), payment, user);
  return db.transaction(async (trx) => {
    const fresh = await trx('policies').where({ id: policy.id }).forUpdate().first();
    if (fresh.version !== policy.version) throw conflict('POLICY_CHANGED', 'The policy changed meanwhile; review the change again');
    const endorsementSeqNo = await numbering.next(trx, 'endorsement', { policyNo: policy.policy_no, productCode: policy.product_code, countryCode: policy.country_code });
    const endorsementNo = endorsementSeqNo;
    const [endorsementId] = await trx('endorsements').insert({ policy_id: policy.id, endorsement_no: endorsementNo, type, data: json(data), premium_delta: delta, tax_delta: taxDelta, created_by: user.id });
    if (paymentRow) await trx('payments').insert({ ...paymentRow, policy_id: policy.id, currency: policy.currency });
    await trx('policies').where({ id: policy.id }).update({
      risk_data: json({ ...policy.risk_data, ...riskPatch, ...(policy.risk_data.project ? { project: { ...policy.risk_data.project, ...(riskPatch.project || {}) } } : {}) }),
      rating: json({ ...policy.rating, ...(ratingPatch || {}) }),
      expiry_date: expiry || policy.expiry_date,
      premium: round(Number(policy.premium) + delta, dec), tax: round(Number(policy.tax) + taxDelta, dec), total: round(Number(policy.total) + delta + taxDelta, dec),
      version: policy.version + 1, updated_at: trx.fn.now(),
    });
    if (requestId) await trx('endorsement_requests').where({ id: requestId }).update({ status: 'applied', endorsement_id: endorsementId, updated_at: trx.fn.now() });
    await audit(trx, { userId: user.id, action: `project.${type}`, entity: 'policy', entityId: policy.id, data: { ...data, premiumDelta: delta } });
    return { status: 'applied', endorsementNo, premiumDelta: delta, taxDelta, totalDelta: round(delta + taxDelta, dec) };
  });
}

/** Stores the change with everything needed to apply it later, and opens a referral. */
async function referProjectChange(policy, { type, premiumDelta, change, reasons, note, user }) {
  const open = await db('endorsement_requests').where({ policy_id: policy.id }).whereIn('status', ['referred', 'info_requested', 'approved']).first();
  if (open) throw conflict('ENDORSEMENT_REQUEST_OPEN', 'Finish the change already in progress first', { requestId: open.id });
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  return db.transaction(async (trx) => {
    const [requestId] = await trx('endorsement_requests').insert({
      policy_id: policy.id, type, data: json({ change, basePremiumDelta: premiumDelta, policyVersion: policy.version }), rating: json({ sumInsured: policy.sum_insured, maxLocationSI: policy.rating.maxLocationSI, facts: change.facts || {} }),
      reasons: json(reasons), premium_delta: round(premiumDelta, 3), tax_delta: 0, status: 'referred', requested_by: user.id,
    });
    const slaDue = new Date(Date.now() + (pc.settings.uwSlaHours?.project || 48) * 3600 * 1000);
    const [referralId] = await trx('referrals').insert({ endorsement_request_id: requestId, status: 'open', reasons: json(reasons), sla_due: slaDue });
    if (note) await trx('referral_messages').insert({ referral_id: referralId, author_id: user.id, body: String(note).slice(0, 4000) });
    await audit(trx, { userId: user.id, action: 'project.refer', entity: 'policy', entityId: policy.id, data: { type, requestId } });
    return { status: 'referred', requestId, reasons, premiumDelta: round(premiumDelta, 2) };
  });
}

async function decideProjectChange(request, decision) {
  if (decision.outcome === 'decline') {
    await db('endorsement_requests').where({ id: request.id }).update({ status: 'declined', updated_at: db.fn.now() });
    return { status: 'declined' };
  }
  const policy = await db('policies').where({ id: request.policy_id }).first();
  const country = await catalog.getCountry(policy.country_code);
  const loading = Number(decision.loadingPct || 0);
  const premiumDelta = round(Number(request.data.basePremiumDelta) * (1 + loading), country.currency_decimals);
  const taxDelta = round(premiumDelta * Number(country.vat_rate), country.currency_decimals);
  await db('endorsement_requests').where({ id: request.id }).update({
    status: 'approved', premium_delta: premiumDelta, tax_delta: taxDelta, uw_terms: json({ loadingPct: loading, warranty: decision.warranty, reasonCode: decision.reasonCode }), updated_at: db.fn.now(),
  });
  return { status: 'approved', premiumDelta, taxDelta };
}

async function acceptProjectChange(policy, request, body, user) {
  if (request.data.policyVersion !== policy.version) throw conflict('POLICY_CHANGED', 'The policy changed after approval; request the change again');
  const c = request.data.change;
  const result = await apply(policy, {
    type: request.type, premiumDelta: Number(request.premium_delta), data: { ...c.data, approved: true, warranty: request.uw_terms?.warranty },
    riskPatch: c.riskPatch, expiry: c.expiry, ratingPatch: c.ratingPatch, payment: body?.payment, user, requestId: request.id,
  });
  return result;
}

async function record(policy, { type, data, riskPatch, user }) {
  return db.transaction(async (trx) => {
    const endorsementSeqNo = await numbering.next(trx, 'endorsement', { policyNo: policy.policy_no, productCode: policy.product_code, countryCode: policy.country_code });
    const endorsementNo = endorsementSeqNo;
    await trx('endorsements').insert({ policy_id: policy.id, endorsement_no: endorsementNo, type, data: json(data), premium_delta: 0, tax_delta: 0, created_by: user.id });
    await trx('policies').where({ id: policy.id }).update({ risk_data: json({ ...policy.risk_data, ...riskPatch, project: { ...policy.risk_data.project, ...(riskPatch.project || {}) } }), version: policy.version + 1, updated_at: trx.fn.now() });
    await audit(trx, { userId: user.id, action: `project.${type}`, entity: 'policy', entityId: policy.id, data });
    return { status: 'recorded', endorsementNo };
  });
}

module.exports = { apply, referProjectChange, decideProjectChange, acceptProjectChange, record, AppError };
