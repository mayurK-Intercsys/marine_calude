/**
 * Annual open cover (Marine BRD section 7): certificates issued online by the holder
 * and the broker within the agreed terms, monthly declarations, and the year-end
 * deposit adjustment.
 */
const { db, json } = require('../../db');
const { raterFor } = require('../../products/dynamic');
const ruleEngine = require('../../lib/ruleEngine');
const { emit } = require('../../lib/messaging');
const numbering = require('../../lib/numbering');
const catalog = require('../../lib/catalog');
const integrations = require('../../integrations');
const { getRater } = require('../../products');
const { certificateSchema } = require('../../products/marine/schema');
const { matchRules } = require('../../lib/rules');
const { nextValue, pad } = require('../../lib/sequence');
const { audit } = require('../../lib/audit');
const { round } = require('../../lib/money');
const { today, addDays } = require('../../lib/dates');
const { AppError, badRequest, conflict, forbidden, unprocessable } = require('../../lib/errors');

const BULK_LIMIT = 500;

async function getOpenCover(id) {
  const policy = await db('policies').where({ id }).first();
  if (!policy || policy.product_code !== 'MARINE' || policy.risk_data.productType !== 'open_cover') throw new AppError(404, 'OPEN_COVER_NOT_FOUND');
  return policy;
}

/** Who may issue certificates (FR-OC, certificate authority on the cover). */
function assertCanIssue(user, policy) {
  const issuers = policy.risk_data.certificateIssuers || { holder: true, broker: true };
  if (user.isStaff) return;
  if (user.isApi && user.apiPolicyId === policy.id) return;
  if (user.role === 'customer' && user.customerId === policy.customer_id && issuers.holder) return;
  if (user.isBroker && user.brokerId === policy.broker_id && issuers.broker) return;
  throw forbidden('CERTIFICATE_AUTHORITY_DENIED', 'Your account cannot issue certificates under this cover');
}

async function turnoverUsed(policyId, conn = db) {
  const r = await conn('oc_certificates').where({ policy_id: policyId, status: 'issued' }).sum({ s: 'sum_insured' }).first();
  return Number(r.s || 0);
}

async function context(policy, shipment) {
  const [country, pc, product] = await Promise.all([
    catalog.getCountry(policy.country_code), catalog.getProductCountry(policy.product_code, policy.country_code), catalog.getProduct(policy.product_code),
  ]);
  const rater = await raterFor(product, policy.country_code);
  const { tables } = await catalog.getRateTables(policy.product_code, policy.country_code, {}, undefined, rater.REQUIRED_TABLES);
  const vessel = shipment.mode === 'sea' ? await integrations.vessels.lookup(shipment.vessel || {}) : null;
  return { country, pc, rater, tables, vessel };
}

/** Prices a certificate against the cover's agreed terms and evaluates referral rules. */
async function priceCertificate(policy, raw, { uwTerms = null, excludeCertificateId = null, user = null } = {}) {
  const shipment = certificateSchema.parse(raw);
  const ctx = await context(policy, shipment);
  const screening = await integrations.sanctions.screen({ names: [policy.proposer?.companyName].filter(Boolean) });
  let used = await turnoverUsed(policy.id);
  if (excludeCertificateId) {
    const self = await db('oc_certificates').where({ id: excludeCertificateId, status: 'issued' }).first();
    if (self) used -= Number(self.sum_insured);
  }
  const result = ctx.rater.rateCertificate({
    shipment, policy, tables: ctx.tables, settings: ctx.pc.settings, country: ctx.country,
    sanctionsHit: screening.hit, context: { vessel: ctx.vessel }, turnoverUsed: used, uwTerms,
  });
  if (!result.valid) throw unprocessable('SHIPMENT_INCOMPLETE', 'Shipment details are incomplete', result.errors);
  if (!result.quotable) throw unprocessable(result.notQuotableReason, 'This shipment cannot be insured online');
  if (shipment.sailingDate < today()) throw badRequest('SAILING_IN_PAST', 'Certificates must be issued before the goods leave');
  if (shipment.sailingDate < policy.inception_date || shipment.sailingDate > policy.expiry_date) throw badRequest('OUTSIDE_COVER_PERIOD');
  // Sub-users and API keys may carry their own per-certificate limit (UW-M14).
  const issuerLimit = user && (user.isApi || user.customerRole === 'user') ? user.certificateLimit : null;
  result.facts.issuerLimitExceeded = issuerLimit != null && result.sumInsured > Number(issuerLimit);
  const reasons = (await ruleEngine.run({ productCode: policy.product_code, countryCode: policy.country_code, purpose: 'underwriting', facts: { ...shipment, ...result.facts } })).refer;
  return { shipment: { ...shipment, clause: result.clause }, result, reasons, ctx, turnoverUsedBefore: used };
}

async function notifyTurnover(policy, usedBefore, usedAfter, settings) {
  const estimate = Number(policy.risk_data.estimatedTurnover);
  for (const threshold of settings.ocTurnoverAlerts || []) {
    if (usedBefore / estimate < threshold && usedAfter / estimate >= threshold) {
      const pctLabel = Math.round(threshold * 100);
      // eslint-disable-next-line no-await-in-loop
      await emit('opencover.turnover', { entity: 'policy', entityId: policy.id, dedupeKey: `oc_turnover_${pctLabel}`, brokerId: policy.broker_id, customer: { email: policy.proposer?.email }, data: { policyNo: policy.policy_no, pct: pctLabel } });
    }
  }
}

async function issueCertificate(policy, raw, user, source = 'portal') {
  if (policy.status !== 'active') throw conflict('POLICY_NOT_ACTIVE');
  assertCanIssue(user, policy);
  const priced = await priceCertificate(policy, raw, { user });
  const { result, reasons, shipment } = priced;
  const status = reasons.length ? 'referred' : 'issued';

  const cert = await db.transaction(async (trx) => {
    const certNo = await numbering.next(trx, 'certificate', { policyNo: policy.policy_no, productCode: policy.product_code, countryCode: policy.country_code });
    const [id] = await trx('oc_certificates').insert({
      cert_no: certNo, policy_id: policy.id, status, source, shipment: json(shipment), rating: json({ ...result, reasons }),
      currency: policy.currency, sum_insured: result.sumInsured, premium: result.breakdown.premium, tax: result.breakdown.tax, total: result.breakdown.total,
      sailing_date: shipment.sailingDate, issued_by: user.id,
    });
    if (status === 'referred') {
      const sla = priced.ctx.pc.settings.uwSlaHours?.certificate || 4;
      await trx('referrals').insert({ certificate_id: id, status: 'open', reasons: json(reasons), sla_due: new Date(Date.now() + sla * 3600 * 1000) });
    }
    await audit(trx, { userId: user.id, action: `certificate.${status}`, entity: 'policy', entityId: policy.id, data: { certNo, sumInsured: result.sumInsured, source } });
    return { id, certNo };
  });
  if (status === 'issued') await notifyTurnover(policy, priced.turnoverUsedBefore, priced.turnoverUsedBefore + result.sumInsured, priced.ctx.pc.settings);

  return {
    status, certificateId: cert.id, certNo: cert.certNo, reasons, sumInsured: result.sumInsured,
    premium: result.breakdown.premium, tax: result.breakdown.tax, total: result.breakdown.total, currency: policy.currency,
  };
}

/** FR-OC-03: validates every row; issues the clean ones, refers the rest, reports errors per row. */
async function issueBulk(policy, rows, user) {
  if (!Array.isArray(rows) || rows.length === 0) throw badRequest('NO_ROWS');
  if (rows.length > BULK_LIMIT) throw badRequest('TOO_MANY_ROWS', `Up to ${BULK_LIMIT} rows per upload`);
  assertCanIssue(user, policy);
  const results = [];
  for (let i = 0; i < rows.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await issueCertificate(policy, rows[i], user, 'bulk');
      results.push({ row: i + 1, status: r.status, certNo: r.certNo, sumInsured: r.sumInsured, premium: r.premium, reasons: r.reasons });
    } catch (e) {
      const code = e.code || (e.name === 'ZodError' ? 'VALIDATION_FAILED' : 'ERROR');
      results.push({ row: i + 1, status: 'error', code, details: e.issues ? e.issues.map((x) => `${x.path.join('.')}: ${x.message}`) : e.details });
    }
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  return { summary: { rows: rows.length, issued: count('issued'), referred: count('referred'), errors: count('error') }, results };
}

/** FR-OC-06: holder or broker may cancel before the sailing date; afterwards only insurer staff. */
async function cancelCertificate(policy, certId, user, reason) {
  const cert = await db('oc_certificates').where({ id: certId, policy_id: policy.id }).first();
  if (!cert) throw new AppError(404, 'CERTIFICATE_NOT_FOUND');
  if (!['issued', 'referred', 'info_requested'].includes(cert.status)) throw conflict('CERTIFICATE_NOT_CANCELLABLE');
  if (cert.declaration_id) throw conflict('CERTIFICATE_DECLARED', 'Already included in a submitted declaration');
  const sailing = typeof cert.sailing_date === 'string' ? cert.sailing_date : new Date(cert.sailing_date).toISOString().slice(0, 10);
  if (sailing <= today() && !user.isStaff) throw forbidden('CERTIFICATE_RISK_ATTACHED', 'Goods have left; contact the underwriter');
  assertCanIssue(user, policy);
  await db.transaction(async (trx) => {
    await trx('oc_certificates').where({ id: cert.id }).update({ status: 'cancelled', updated_at: trx.fn.now() });
    await trx('referrals').where({ certificate_id: cert.id }).whereIn('status', ['open', 'info_requested']).update({ status: 'declined', decision: json({ outcome: 'withdrawn' }) });
    await audit(trx, { userId: user.id, action: 'certificate.cancel', entity: 'policy', entityId: policy.id, data: { certNo: cert.cert_no, reason } });
  });
  return { status: 'cancelled', certNo: cert.cert_no };
}

/** Underwriter decision on a referred certificate; approval re-prices with the loading and issues it. */
async function decideCertificate(certId, decision, user) {
  const cert = await db('oc_certificates').where({ id: certId }).first();
  const policy = await getOpenCover(cert.policy_id);
  if (decision.outcome === 'decline') {
    await db('oc_certificates').where({ id: cert.id }).update({ status: 'declined', updated_at: db.fn.now() });
    return { status: 'declined', certNo: cert.cert_no };
  }
  const uwTerms = { loadingPct: decision.loadingPct || 0, warranty: decision.warranty, reasonCode: decision.reasonCode, approvedBy: user.id };
  const priced = await priceCertificate(policy, cert.shipment, { uwTerms, excludeCertificateId: cert.id });
  const r = priced.result;
  await db('oc_certificates').where({ id: cert.id }).update({
    status: 'issued', uw_terms: json(uwTerms), rating: json({ ...r, reasons: priced.reasons, approved: true }),
    sum_insured: r.sumInsured, premium: r.breakdown.premium, tax: r.breakdown.tax, total: r.breakdown.total, updated_at: db.fn.now(),
  });
  await notifyTurnover(policy, priced.turnoverUsedBefore, priced.turnoverUsedBefore + r.sumInsured, priced.ctx.pc.settings);
  return { status: 'issued', certNo: cert.cert_no, premium: r.breakdown.premium };
}

const certView = (c) => ({
  id: c.id, certNo: c.cert_no, status: c.status, source: c.source, sailingDate: c.sailing_date, currency: c.currency,
  sumInsured: c.sum_insured, premium: c.premium, tax: c.tax, total: c.total, declared: Boolean(c.declaration_id),
  commodity: c.shipment.commodity, mode: c.shipment.mode, origin: c.shipment.origin, destination: c.shipment.destination,
  vessel: c.shipment.vessel?.name || c.shipment.conveyanceRef || null, clause: c.shipment.clause,
  reasons: c.rating.reasons || [], warranty: c.uw_terms?.warranty || null, createdAt: c.created_at,
});

async function listCertificates(policy, { status, limit = 200, user = null } = {}) {
  const q = db('oc_certificates').where({ policy_id: policy.id }).orderBy('id', 'desc').limit(limit);
  if (status) q.andWhere({ status });
  const hide = user && user.role === 'customer' && user.canSeePremium === false;
  return (await q).map(certView).map((c) => (hide ? { ...c, premium: null, tax: null, total: null } : c));
}

const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01`;
};

const monthOf = (d) => (typeof d === 'string' ? d : new Date(d).toISOString()).slice(0, 7);

/** FR-OC-07: monthly declarations built from issued certificates, plus shipments not issued via the portal. */
async function declarations(policy) {
  const certs = await db('oc_certificates').where({ policy_id: policy.id, status: 'issued' });
  const submitted = await db('oc_declarations').where({ policy_id: policy.id });
  const months = {};
  for (let m = policy.inception_date.slice(0, 7); m <= today().slice(0, 7) && m <= policy.expiry_date.slice(0, 7);) {
    months[m] = { period: m, certificates: 0, sumInsured: 0, premium: 0, tax: 0, submitted: false };
    m = nextMonth(m).slice(0, 7);
  }
  for (const c of certs) {
    const m = monthOf(c.sailing_date);
    if (!months[m]) continue;
    months[m].certificates += 1;
    months[m].sumInsured += Number(c.sum_insured);
    months[m].premium += Number(c.premium);
    months[m].tax += Number(c.tax);
  }
  for (const d of submitted) {
    if (months[d.period]) Object.assign(months[d.period], { submitted: true, submittedAt: d.created_at, certificates: d.certificates, sumInsured: Number(d.sum_insured), premium: Number(d.premium), tax: Number(d.tax), extraShipments: d.extra_shipments });
  }
  return Object.values(months).map((m) => ({ ...m, sumInsured: round(m.sumInsured, 3), premium: round(m.premium, 3), tax: round(m.tax, 3) }));
}

async function submitDeclaration(policy, { period, extraShipments = [] }, user) {
  if (!/^\d{4}-\d{2}$/.test(String(period || ''))) throw badRequest('PERIOD_INVALID', 'Use YYYY-MM');
  if (period >= today().slice(0, 7)) throw badRequest('PERIOD_NOT_ENDED', 'Declare a month after it ends');
  if (period < policy.inception_date.slice(0, 7) || period > policy.expiry_date.slice(0, 7)) throw badRequest('OUTSIDE_COVER_PERIOD');
  if (user.isBroker ? user.brokerId !== policy.broker_id : !(user.isStaff || user.customerId === policy.customer_id)) throw forbidden('POLICY_ACCESS_DENIED');
  if (!Array.isArray(extraShipments) || extraShipments.length > 200) throw badRequest('EXTRA_SHIPMENTS_INVALID');

  const country = await catalog.getCountry(policy.country_code);
  const dec = country.currency_decimals;
  const avgRate = policy.rating.breakdown.weightedRate + (policy.rating.agreedWarRate || 0) + (policy.rating.agreedSrccRate || 0);
  const extras = extraShipments.map((e) => ({ description: String(e.description || '').slice(0, 200), sumInsured: Math.max(0, Number(e.sumInsured) || 0) }));
  const extraSI = extras.reduce((s, e) => s + e.sumInsured, 0);
  const extraPremium = round(extraSI * avgRate, dec);

  return db.transaction(async (trx) => {
    const exists = await trx('oc_declarations').where({ policy_id: policy.id, period }).first();
    if (exists) throw conflict('DECLARATION_EXISTS');
    const certs = await trx('oc_certificates').where({ policy_id: policy.id, status: 'issued' }).whereNull('declaration_id')
      .andWhere('sailing_date', '>=', `${period}-01`).andWhere('sailing_date', '<', nextMonth(period)).forUpdate();
    const sumInsured = certs.reduce((s, c) => s + Number(c.sum_insured), 0) + extraSI;
    const premium = round(certs.reduce((s, c) => s + Number(c.premium), 0) + extraPremium, dec);
    const tax = round(certs.reduce((s, c) => s + Number(c.tax), 0) + extraPremium * Number(policy.rating.breakdown.vatRate || 0), dec);
    const [id] = await trx('oc_declarations').insert({ policy_id: policy.id, period, certificates: certs.length, sum_insured: sumInsured, premium, tax, extra_shipments: json(extras), submitted_by: user.id });
    if (certs.length) await trx('oc_certificates').whereIn('id', certs.map((c) => c.id)).update({ declaration_id: id });
    await audit(trx, { userId: user.id, action: 'declaration.submit', entity: 'policy', entityId: policy.id, data: { period, certificates: certs.length, premium } });
    return { id, period, certificates: certs.length, sumInsured, premium, tax };
  });
}

/** Utilisation and premium position of the cover (FR-OC-05, FR-OC-09) and the deposit adjustment. */
async function summary(policy) {
  const [used, issued, referred, declared] = await Promise.all([
    turnoverUsed(policy.id),
    db('oc_certificates').where({ policy_id: policy.id, status: 'issued' }).count({ n: '*' }).sum({ p: 'premium' }).first(),
    db('oc_certificates').where({ policy_id: policy.id }).whereIn('status', ['referred', 'info_requested']).count({ n: '*' }).first(),
    db('oc_declarations').where({ policy_id: policy.id }).sum({ p: 'premium' }).first(),
  ]);
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  const country = await catalog.getCountry(policy.country_code);
  const dec = country.currency_decimals;
  const t = policy.risk_data;
  const deposit = t.premiumBasis === 'deposit' ? Number(policy.premium) : 0;
  const earned = Number(issued.p || 0);
  let adjustment = 0;
  if (t.premiumBasis === 'deposit') {
    const minRetained = deposit * (pc.settings.ocMinRetainedPct ?? 0.8);
    adjustment = round(Math.max(earned, minRetained) - deposit, dec);
  }
  const adjustmentDone = await db('endorsements').where({ policy_id: policy.id, type: 'deposit_adjustment' }).first();
  return {
    policyId: policy.id, policyNo: policy.policy_no, status: policy.status, inceptionDate: policy.inception_date, expiryDate: policy.expiry_date,
    currency: policy.currency, interest: t.interest, premiumBasis: t.premiumBasis,
    estimatedTurnover: Number(t.estimatedTurnover), turnoverUsed: used, turnoverUsedPct: Math.round((used / Number(t.estimatedTurnover)) * 1000) / 10,
    perSendingLimit: Number(t.perSendingLimit), schedule: policy.rating.agreedRates, war: t.war, srcc: t.srcc,
    certificatesIssued: Number(issued.n), certificatesReferred: Number(referred.n),
    certificatePremium: round(earned, dec), declaredPremium: round(Number(declared.p || 0), dec), deposit,
    adjustment: { premiumDelta: adjustment, available: t.premiumBasis === 'deposit' && today() >= addDays(policy.expiry_date, -30), done: Boolean(adjustmentDone) },
    canIssue: policy.status === 'active',
  };
}

/** Year-end deposit adjustment: additional premium if certificates exceeded the deposit, else return down to the minimum retained. */
async function adjustDeposit(policy, user) {
  const s = await summary(policy);
  if (s.premiumBasis !== 'deposit') throw badRequest('NOT_DEPOSIT_BASIS');
  if (!s.adjustment.available) throw conflict('ADJUSTMENT_NOT_DUE', 'Available from 30 days before expiry');
  if (s.adjustment.done) throw conflict('ADJUSTMENT_DONE');
  const country = await catalog.getCountry(policy.country_code);
  const delta = s.adjustment.premiumDelta;
  const tax = round(delta * Number(policy.rating.breakdown.vatRate || 0), country.currency_decimals);
  return db.transaction(async (trx) => {
    const endorsementSeqNo = await numbering.next(trx, 'endorsement', { policyNo: policy.policy_no, productCode: policy.product_code, countryCode: policy.country_code });
    const no = endorsementSeqNo;
    await trx('endorsements').insert({ policy_id: policy.id, endorsement_no: no, type: 'deposit_adjustment', data: json({ deposit: s.deposit, certificatePremium: s.certificatePremium }), premium_delta: delta, tax_delta: tax, created_by: user.id });
    await audit(trx, { userId: user.id, action: 'opencover.adjust', entity: 'policy', entityId: policy.id, data: { delta } });
    return { endorsementNo: no, premiumDelta: delta, taxDelta: tax };
  });
}

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function assertCanManageKeys(user, policy) {
  if (user.isStaff) return;
  if (user.role === 'customer' && user.customerId === policy.customer_id && ['owner', 'admin'].includes(user.customerRole)) return;
  if (user.isBroker && user.brokerId === policy.broker_id) return;
  throw forbidden('API_KEY_ADMIN_ONLY');
}

/** FR-OC-04: keys for the customer's ERP or forwarder to create certificates. The secret is shown once. */
async function createApiKey(policy, { label, certificateLimit }, user) {
  assertCanManageKeys(user, policy);
  const prefix = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(24).toString('hex');
  const [id] = await db('api_keys').insert({ policy_id: policy.id, key_prefix: prefix, key_hash: await bcrypt.hash(secret, 10), label, certificate_limit: certificateLimit ?? null, created_by: user.id });
  await audit(db, { userId: user.id, action: 'apikey.create', entity: 'policy', entityId: policy.id, data: { keyId: id, label } });
  return { id, label, key: `oc_${prefix}_${secret}`, prefix };
}

async function listApiKeys(policy, user) {
  assertCanManageKeys(user, policy);
  const rows = await db('api_keys').where({ policy_id: policy.id }).orderBy('id', 'desc');
  return rows.map((k) => ({ id: k.id, label: k.label, prefix: k.key_prefix, certificateLimit: k.certificate_limit, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at, createdAt: k.created_at }));
}

async function revokeApiKey(policy, keyId, user) {
  assertCanManageKeys(user, policy);
  await db('api_keys').where({ id: keyId, policy_id: policy.id }).whereNull('revoked_at').update({ revoked_at: new Date() });
  await audit(db, { userId: user.id, action: 'apikey.revoke', entity: 'policy', entityId: policy.id, data: { keyId } });
  return { ok: true };
}

/** Resolves `x-api-key: oc_<prefix>_<secret>` to a limited API client for one open cover. */
async function userForApiKey(header) {
  const m = /^oc_([0-9a-f]{12})_([0-9a-f]{48})$/.exec(String(header || ''));
  if (!m) return null;
  const key = await db('api_keys').where({ key_prefix: m[1] }).whereNull('revoked_at').first();
  if (!key || !(await bcrypt.compare(m[2], key.key_hash))) return null;
  await db('api_keys').where({ id: key.id }).update({ last_used_at: new Date() });
  return { id: key.created_by, role: 'api', isApi: true, apiKeyId: key.id, apiPolicyId: key.policy_id, certificateLimit: key.certificate_limit == null ? null : Number(key.certificate_limit), name: `API: ${key.label}` };
}

module.exports = { createApiKey, listApiKeys, revokeApiKey, userForApiKey, getOpenCover, issueCertificate, issueBulk, cancelCertificate, decideCertificate, listCertificates, declarations, submitDeclaration, summary, adjustDeposit, priceCertificate, certView };
