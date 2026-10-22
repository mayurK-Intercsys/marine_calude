/**
 * Daily jobs (run by cron via `npm run jobs:daily`, by the in-process scheduler, or by ops on demand).
 * Every step is idempotent: running twice on the same day changes nothing the second time.
 *
 *  1. Renewal quotes 45 days before expiry, re-rated on current rates and claims (FR-REN-01)
 *  2. Renewal reminders at 45, 30, 15, 7 and 1 days (FR-REN-02)
 *  3. Auto-renewal with the saved card (FR-REN-04)
 *  4. Expire lapsed policies and stale quotes
 */
const crypto = require('crypto');
const numbering = require('../../lib/numbering');
const { db, json } = require('../../db');
const catalog = require('../../lib/catalog');
const quotes = require('../quotes/service');
const policies = require('../policies/service');
const integrations = require('../../integrations');
const { nextValue, pad } = require('../../lib/sequence');
const { audit } = require('../../lib/audit');
const { today, addDays, daysInclusive } = require('../../lib/dates');

const daysUntil = (from, to) => daysInclusive(from, to) - 1;
const config = require('../../config');
const { emit } = require('../../lib/messaging');

/** Recipients and dedupe for a policy event (one message per rule, recipient and dedupe key). */
const eventFor = (policy, dedupeKey) => ({
  entity: 'policy', entityId: policy.id, dedupeKey, brokerId: policy.broker_id,
  customer: { email: policy.proposer?.email, mobile: policy.proposer?.mobile, locale: policy.proposer?.locale || 'en' },
});
const baseData = (policy) => ({ policyNo: policy.policy_no, customerName: policy.proposer?.companyName, expiryDate: policy.expiry_date, link: `${config.appUrl}/en/account/policies/${policy.id}` });

/** Sends a notification once per entity, kind and recipient. Returns true if sent now. */
async function notifyOnce({ entity, entityId, kind, to, channel, template, data }) {
  if (!to) return false;
  try {
    await db('notification_log').insert({ entity, entity_id: entityId, kind, recipient: to });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return false;
    throw e;
  }
  await integrations.notifications.send({ to, channel, template, data });
  return true;
}

async function brokerContact(brokerId) {
  if (!brokerId) return null;
  const admin = await db('users').where({ broker_id: brokerId, role: 'broker_admin', active: true }).first();
  return admin?.email || null;
}

/** Open cover renewal pack (FR-B2B-M08): next year's turnover estimate from actual certificates, annualised. */
async function openCoverRenewalRisk(policy, risk, asOf) {
  const used = await db('oc_certificates').where({ policy_id: policy.id, status: 'issued' }).sum({ s: 'sum_insured' }).first();
  const months = Math.max(1, Math.round((new Date(`${asOf}T00:00:00Z`) - new Date(`${policy.inception_date}T00:00:00Z`)) / (30.44 * 86400000)));
  const annualised = (Number(used.s || 0) * 12) / months;
  const estimatedTurnover = annualised > 0 ? Math.max(Math.ceil(annualised / 100000) * 100000, risk.perSendingLimit) : risk.estimatedTurnover;
  return { ...risk, estimatedTurnover };
}

async function createRenewalQuote(policy, asOf) {
  const claims = await db('claims').where({ policy_id: policy.id }).count({ n: '*' }).first();
  const inceptionDate = addDays(policy.expiry_date, 1);
  const { autoRenew, declaredWages, backdatedJoiner, completedOn, ...previous } = policy.risk_data;
  let risk = { ...previous, inceptionDate };
  if (previous.claims3y != null || policy.product_code === 'FIRE' || policy.product_code === 'WC') risk.claims3y = Math.min(2, Number(previous.claims3y || 0) + Number(claims.n));
  if (policy.risk_data.productType === 'open_cover') risk = await openCoverRenewalRisk(policy, risk, asOf);
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);

  const quoteId = await db.transaction(async (trx) => {
    const year = inceptionDate.slice(0, 4);
    const ref = await numbering.next(trx, 'renewal_quote', { productCode: policy.product_code, countryCode: policy.country_code, channel: policy.channel, line: pc.settings.numbering.lineCode, date: `${year}-01-01` });
    const [id] = await trx('quotes').insert({
      ref,
      product_code: policy.product_code,
      country_code: policy.country_code,
      channel: policy.channel,
      status: 'draft',
      customer_id: policy.customer_id,
      broker_id: policy.broker_id,
      resume_token: crypto.randomBytes(24).toString('hex'),
      currency: policy.currency,
      renewal_of_policy_id: policy.id,
      proposer: json({ ...policy.proposer, inceptionDate }),
    });
    await trx('policies').where({ id: policy.id }).update({ renewal_quote_id: id });
    await audit(trx, { action: 'renewal.quote', entity: 'policy', entityId: policy.id, data: { quoteId: id } });
    return id;
  });

  const quote = await quotes.getQuote(quoteId);
  let rated = await quotes.updateRisk(quote, risk, null, { asOf });

  // Last year's underwriter terms carry over when the same rules fire again and there were no claims.
  const prior = policy.uw_terms;
  const codes = (rated.rating?.referral?.reasons || []).map((r) => r.code);
  if (rated.rating?.referral?.required && prior?.referralCodes?.length && Number(claims.n) === 0 && codes.every((c) => prior.referralCodes.includes(c))) {
    const terms = { ...prior, riskHash: quotes.riskHash(rated.risk_data), carriedFrom: policy.policy_no, referralCodes: codes };
    await db('quotes').where({ id: rated.id }).update({ uw_terms: json(terms), status: 'approved' });
    rated = await quotes.updateRisk(await quotes.getQuote(rated.id), rated.risk_data, null, { asOf });
    rated.termsCarried = true;
  }
  return rated;
}

const quarterStart = (iso) => `${iso.slice(0, 5)}${String(Math.floor((Number(iso.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;

/** FR-EMP-07: invoices for changes billed monthly or quarterly, once the period has ended. */
async function billUnbilled(asOf) {
  const rows = await db('endorsements').join('policies', 'policies.id', 'endorsements.policy_id')
    .where('endorsements.billing_status', 'unbilled')
    .select('endorsements.id', 'endorsements.premium_delta', 'endorsements.tax_delta', 'endorsements.created_at', 'policies.id as policy_id', 'policies.policy_no', 'policies.product_code', 'policies.country_code', 'policies.proposer');
  const byPolicy = {};
  for (const r of rows) (byPolicy[r.policy_id] ||= []).push(r);
  let created = 0;
  for (const list of Object.values(byPolicy)) {
    const first = list[0];
    // eslint-disable-next-line no-await-in-loop
    const pc = await catalog.getProductCountry(first.product_code, first.country_code);
    const quarterly = pc.settings.employeeBilling === 'quarterly';
    const cutoff = quarterly ? quarterStart(asOf) : `${asOf.slice(0, 7)}-01`;
    const due = list.filter((e) => new Date(e.created_at).toISOString().slice(0, 10) < cutoff);
    if (!due.length) continue;
    const prev = addDays(cutoff, -1);
    const period = quarterly ? `${prev.slice(0, 4)}-Q${Math.floor((Number(prev.slice(5, 7)) - 1) / 3) + 1}` : prev.slice(0, 7);
    const premium = due.reduce((s, e) => s + Number(e.premium_delta), 0);
    const tax = due.reduce((s, e) => s + Number(e.tax_delta), 0);
    // eslint-disable-next-line no-await-in-loop
    await db.transaction(async (trx) => {
      const invoiceNo = await numbering.next(trx, 'invoice', { policyNo: first.policy_no, productCode: first.product_code, countryCode: first.country_code });
      const [invoiceId] = await trx('invoices').insert({
        invoice_no: invoiceNo, policy_id: first.policy_id, period, premium, tax, total: premium + tax,
        status: premium + tax > 0 ? 'due' : 'credit', due_date: addDays(asOf, pc.settings.invoiceDueDays || 30),
      });
      await trx('endorsements').whereIn('id', due.map((e) => e.id)).update({ billing_status: 'invoiced', invoice_id: invoiceId });
      await audit(trx, { action: 'invoice.create', entity: 'policy', entityId: first.policy_id, data: { invoiceId, period, total: premium + tax } });
    });
    // eslint-disable-next-line no-await-in-loop
    await emit('invoice.due', { entity: 'policy', entityId: first.policy_id, dedupeKey: `invoice_${period}`, customer: { email: first.proposer?.email, mobile: first.proposer?.mobile }, data: { policyNo: first.policy_no, period, customerName: first.proposer?.companyName, link: config.appUrl } });
    created += 1;
  }
  return created;
}

/** WC: reminders to declare actual wages after expiry. */
async function declarationReminders(asOf) {
  let sent = 0;
  const wc = await db('policies').where({ product_code: 'WC' }).whereIn('status', ['active', 'expired']).andWhere('expiry_date', '<', asOf)
    .whereNotExists(function noDeclaration() { this.select('*').from('endorsements').whereRaw('endorsements.policy_id = policies.id').andWhere('endorsements.type', 'wage_declaration'); });
  for (const p of wc) {
    // eslint-disable-next-line no-await-in-loop
    const pc = await catalog.getProductCountry(p.product_code, p.country_code);
    const days = daysUntil(p.expiry_date, asOf);
    if ((pc.settings.declaration?.reminderDaysAfterExpiry || []).includes(days)) {
      // eslint-disable-next-line no-await-in-loop
      sent += await emit('declaration.due', { ...eventFor(p, `declaration_reminder_${days}`), data: { ...baseData(p), daysAfterExpiry: days } });
    }
  }
  return sent;
}

async function autoRenew(policy, renewalQuote) {
  const payment = await integrations.payments.charge({ amount: Number(renewalQuote.total), currency: renewalQuote.currency, method: 'card_token', token: policy.payment_token });
  if (payment.status !== 'succeeded') {
    await db('payments').insert({ quote_id: renewalQuote.id, amount: renewalQuote.total, currency: renewalQuote.currency, method: 'card_token', status: 'failed', provider: integrations.payments.name, failure_reason: payment.reason });
    return { renewed: false, reason: payment.reason };
  }
  const issued = await db.transaction(async (trx) => {
    const [paymentId] = await trx('payments').insert({ quote_id: renewalQuote.id, amount: renewalQuote.total, currency: renewalQuote.currency, method: 'card_token', status: 'succeeded', provider: integrations.payments.name, provider_ref: payment.reference });
    return policies.issueFromQuote(trx, { quote: renewalQuote, paymentId, user: null, autoRenew: true, paymentToken: policy.payment_token });
  });
  await policies.flushEvents(issued);
  return { renewed: true, policyNo: issued.policy_no };
}

async function runDaily({ asOf = today() } = {}) {
  const summary = { asOf, renewalTermsCarried: 0, invoicesCreated: 0, declarationReminders: 0, renewalQuotesCreated: 0, renewalReferrals: 0, remindersSent: 0, autoRenewed: 0, autoRenewFailed: 0, policiesExpired: 0, quotesExpired: 0, errors: [] };
  const active = await db('policies').where({ status: 'active' });

  for (const policy of active) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
      const r = pc.settings.renewal;
      if (!r || policy.rating?.tier === 'project') continue; // Not renewable online (single-transit marine, CAR/EAR projects)
      if (r.productTypes && !r.productTypes.includes(policy.risk_data.productType)) continue;
      const left = daysUntil(asOf, policy.expiry_date);
      if (left < 0 || left > r.noticeDays) continue;

      let renewal = policy.renewal_quote_id ? await quotes.getQuote(policy.renewal_quote_id) : null;
      if (!renewal) {
        // eslint-disable-next-line no-await-in-loop
        renewal = await createRenewalQuote(policy, asOf);
        summary.renewalQuotesCreated += 1;
        if (renewal.termsCarried) summary.renewalTermsCarried += 1;
        if (renewal.rating?.referral?.required) {
          // eslint-disable-next-line no-await-in-loop
          await quotes.submitReferral(renewal, 'Renewal: referral rules apply to next year’s terms.', null);
          renewal = await quotes.getQuote(renewal.id);
          summary.renewalReferrals += 1;
        }
        await emit('renewal.ready', { ...eventFor(policy, 'renewal_ready'), data: { ...baseData(policy), renewalRef: renewal.ref, total: `${renewal.currency} ${renewal.total}` } });
      }
      if (renewal.status === 'bound') continue;

      if (r.reminderDays.includes(left)) {
        // eslint-disable-next-line no-await-in-loop
        summary.remindersSent += await emit('renewal.reminder', { ...eventFor(policy, `renewal_reminder_${left}`), data: { ...baseData(policy), daysLeft: left, renewalRef: renewal.ref } });
      }

      const eligible = policy.risk_data.autoRenew && policy.payment_token && left <= r.autoRenewDaysBefore
        && renewal.status === 'quoted' && renewal.rating?.quotable && !renewal.rating?.referral?.required;
      if (eligible) {
        // eslint-disable-next-line no-await-in-loop
        const result = await autoRenew(policy, renewal);
        if (result.renewed) summary.autoRenewed += 1;
        else {
          summary.autoRenewFailed += 1;
          await emit('autorenew.failed', { ...eventFor(policy, 'auto_renew_failed'), data: baseData(policy) });
        }
      }
    } catch (e) {
      summary.errors.push({ policyId: policy.id, code: e.code || 'ERROR', message: e.message });
    }
  }

  summary.invoicesCreated = await billUnbilled(asOf);
  summary.declarationReminders = await declarationReminders(asOf);
  summary.policiesExpired = await db('policies').where({ status: 'active' }).andWhere('expiry_date', '<', asOf).update({ status: 'expired', updated_at: db.fn.now() });
  summary.quotesExpired = await db('quotes').whereIn('status', ['draft', 'quoted', 'approved'])
    .whereNull('renewal_of_policy_id').andWhere('valid_until', '<', asOf).update({ status: 'expired', updated_at: db.fn.now() });

  await audit(db, { action: 'jobs.daily', entity: 'system', data: summary });
  return summary;
}

module.exports = { runDaily, createRenewalQuote, notifyOnce };
