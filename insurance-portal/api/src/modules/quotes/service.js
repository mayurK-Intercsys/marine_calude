const crypto = require('crypto');
const { raterFor } = require('../../products/dynamic');
const ruleEngine = require('../../lib/ruleEngine');
const pricing = require('../../lib/pricing');
const licence = require('../../lib/licenceState');
const { emit } = require('../../lib/messaging');
const config = require('../../config');
const numbering = require('../../lib/numbering');
const { z } = require('zod');
const { db, json } = require('../../db');
const catalog = require('../../lib/catalog');
const { getRater } = require('../../products');
const { riskSchemaFor } = require('../../products/schemas');
const { matchRules } = require('../../lib/rules');
const { nextValue, pad } = require('../../lib/sequence');
const { audit } = require('../../lib/audit');
const { today, addDays, isISODate } = require('../../lib/dates');
const integrations = require('../../integrations');
const { badRequest, conflict, forbidden, unprocessable, AppError } = require('../../lib/errors');
const policies = require('../policies/service');

const EDITABLE = ['draft', 'quoted', 'approved', 'info_requested', 'not_quotable', 'expired'];

/** Deterministic JSON so an approved risk can be recognised if it is re-submitted unchanged. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const riskHash = (risk) => crypto.createHash('sha256').update(stableStringify(risk)).digest('hex');

async function brokerFor(brokerId, conn = db) {
  return brokerId ? conn('brokers').where({ id: brokerId }).first() : null;
}

function authorityFor(settings, channel, broker) {
  if (channel === 'b2c') return settings.authority.b2c;
  return settings.authority[broker?.tier || 'standard'] || settings.authority.standard;
}

async function getQuote(id, conn = db) {
  const quote = await conn('quotes').where({ id }).first();
  if (!quote) throw new AppError(404, 'QUOTE_NOT_FOUND');
  return quote;
}

async function createQuote({ productCode, countryCode, user }) {
  const product = await catalog.getProduct(productCode);
  if (product.status !== 'active') throw badRequest('PRODUCT_NOT_AVAILABLE');
  const country = await catalog.getCountry(countryCode);
  const pc = await catalog.getProductCountry(productCode, countryCode);
  const channel = user?.isBroker ? 'b2b' : 'b2c';
  if (!country.active || (channel === 'b2c' && !pc.enabled_b2c) || (channel === 'b2b' && !pc.enabled_b2b)) {
    throw badRequest('PRODUCT_NOT_OFFERED', 'Product is not available in this country for this channel');
  }
  if (user && user.isStaff) throw forbidden('STAFF_CANNOT_QUOTE', 'Insurer staff review quotes; they do not create them in Phase 1');
  await licence.assertCanSell(product.line, channel);

  return db.transaction(async (trx) => {
    const ref = await numbering.next(trx, 'quote', { productCode, countryCode, channel, line: pc.settings.numbering.lineCode });
    const resumeToken = crypto.randomBytes(24).toString('hex');
    const [id] = await trx('quotes').insert({
      ref,
      product_code: productCode,
      country_code: countryCode,
      channel,
      status: 'draft',
      broker_id: user?.isBroker ? user.brokerId : null,
      customer_id: user?.role === 'customer' ? user.customerId : null,
      created_by: user?.id || null,
      resume_token: resumeToken,
      currency: country.currency,
    });
    await audit(trx, { userId: user?.id, action: 'quote.create', entity: 'quote', entityId: id, data: { ref, channel } });
    return { id, resumeToken };
  });
}

/**
 * Sum insured we already carry per site on active policies (UW-11).
 * Phase 1 aggregates in memory; at volume, keep a site-exposure table updated on issue/endorse/cancel.
 */
async function exposureBySite(productCode, countryCode, rater, excludePolicyId = null) {
  const rows = await db('policies').where({ product_code: productCode, country_code: countryCode, status: 'active' })
    .modify((q) => { if (excludePolicyId) q.whereNot('id', excludePolicyId); })
    .select('risk_data', 'rating');
  const exposure = {};
  for (const row of rows) {
    (row.risk_data.locations || []).forEach((loc, i) => {
      const key = rater.siteKey(loc.address);
      exposure[key] = (exposure[key] || 0) + Number(row.rating.locations?.[i]?.sumInsured || rater.locationSumInsured(loc));
    });
  }
  return exposure;
}

/**
 * Prices a risk against the approved tables and evaluates referral rules.
 * Pure with respect to the quote row: callers decide what to persist.
 */
async function priceRisk({ quote, risk, uwTerms = null, tableOverrides = {}, proposer = null, excludePolicyId = null, modelOverride = null }) {
  const product = await catalog.getProduct(quote.product_code);
  const country = await catalog.getCountry(quote.country_code);
  const pc = await catalog.getProductCountry(quote.product_code, quote.country_code);
  const broker = await brokerFor(quote.broker_id);
  const rater = await raterFor(product, quote.country_code, { modelOverride });
  const { tables: baseTables, versions } = await catalog.getRateTables(quote.product_code, quote.country_code, tableOverrides, undefined, rater.REQUIRED_TABLES);
  const productSetup = await pricing.setup(quote.product_code, quote.country_code);
  const tables = pricing.applyToTables(baseTables, productSetup);
  const authority = authorityFor(pc.settings, quote.channel, broker);

  const names = [risk.business?.name, proposer?.companyName, proposer?.contactName].filter(Boolean);
  const screening = names.length ? await integrations.sanctions.screen({ names }) : { hit: false };

  const context = rater.prepare ? await rater.prepare(risk, integrations) : {};
  const existingExposure = rater.siteKey ? await exposureBySite(quote.product_code, quote.country_code, rater, excludePolicyId ?? quote.renewal_of_policy_id) : {};
  const result = rater.rate({
    risk, tables, settings: pc.settings, country, authority, uwTerms, sanctionsHit: screening.hit, existingExposure, context, channel: quote.channel,
  });
  if (!result.valid) throw unprocessable('RISK_INCOMPLETE', 'Risk details are incomplete', result.errors);
  if (result.quotable && result.breakdown) {
    pricing.finalize(result.breakdown, productSetup, { ...risk, ...(result.facts || {}), channel: quote.channel, productType: risk.productType || null, transaction: quote.renewal_of_policy_id ? 'renewal' : 'new_business' }, country);
  }

  let referral = { required: false, reasons: [] };
  if (result.quotable) {
    const decision = await ruleEngine.run({ productCode: quote.product_code, countryCode: quote.country_code, purpose: 'underwriting', facts: { ...risk, ...result.facts, channel: quote.channel } });
    const reasons = decision.refer;
    const cleared = Boolean(uwTerms && uwTerms.riskHash === riskHash(risk));
    referral = { required: reasons.length > 0 && !cleared, reasons, cleared, messages: decision.messages, fired: decision.fired };
    if (decision.decline.length) {
      result.quotable = false;
      result.notQuotableReason = decision.decline[0].code;
      result.declineReasons = decision.decline;
    }
  }

  return {
    ...result,
    referral,
    authority,
    tableVersions: versions,
    ratingModel: rater.dynamic ? { id: rater.modelId, version: rater.modelVersion } : undefined,
    slaHours: pc.settings.uwSlaHours?.[result.tier] || 24,
    // context.asOf lets renewals and tests price as of a given day
    context: Object.keys(context).length ? context : undefined,
    ratedAt: new Date().toISOString(),
  };
}

/** Validates and normalises risk input, filling nat-cat zones from the geo service. */
async function normaliseRisk(quote, rawRisk, { asOf = today() } = {}) {
  const product = await catalog.getProduct(quote.product_code);
  const pc = await catalog.getProductCountry(quote.product_code, quote.country_code);
  const schema = riskSchemaFor(product.line);
  const risk = schema.parse(rawRisk);
  if (quote.channel === 'b2c') {
    risk.discountPct = 0;
    if ((risk.locations || []).length > (pc.settings.maxLocationsB2C || 5)) throw badRequest('TOO_MANY_LOCATIONS');
  }
  for (const loc of risk.locations || []) {
    // eslint-disable-next-line no-await-in-loop
    loc.natcatZone = await integrations.geo.zoneFor(loc.address);
  }
  if (risk.inceptionDate) {
    const max = addDays(asOf, pc.settings.maxInceptionDaysAhead || 60);
    if (risk.inceptionDate < asOf) throw badRequest('INCEPTION_IN_PAST', 'Cover cannot start in the past');
    if (risk.inceptionDate > max) throw badRequest('INCEPTION_TOO_FAR', `Cover must start by ${max}`);
  }
  return risk;
}

async function updateRisk(quote, rawRisk, user, { asOf } = {}) {
  if (!EDITABLE.includes(quote.status)) throw conflict('QUOTE_LOCKED', `Quote is ${quote.status}`);
  const risk = await normaliseRisk(quote, rawRisk, { asOf });

  // An underwriter's terms survive only if the risk they approved is unchanged.
  const keepTerms = quote.uw_terms && quote.uw_terms.riskHash === riskHash(risk);
  const uwTerms = keepTerms ? quote.uw_terms : null;
  const rating = await priceRisk({ quote, risk, uwTerms, proposer: quote.proposer });
  const pc = await catalog.getProductCountry(quote.product_code, quote.country_code);

  let status = 'quoted';
  if (!rating.quotable) status = 'not_quotable';
  else if (keepTerms && quote.status === 'approved') status = 'approved';

  const patch = {
    risk_data: json(risk),
    rating: json(rating),
    referral_reasons: json(rating.referral.reasons),
    uw_terms: json(uwTerms),
    status,
    premium: rating.breakdown?.premium ?? null,
    policy_fee: rating.breakdown?.policyFee ?? null,
    tax: rating.breakdown?.tax ?? null,
    total: rating.breakdown?.total ?? null,
    inception_date: risk.inceptionDate || null,
    valid_until: addDays(today(), pc.settings.quoteValidityDays || 30),
    updated_at: db.fn.now(),
  };
  await db('quotes').where({ id: quote.id }).update(patch);
  await audit(db, { userId: user?.id, action: 'quote.rate', entity: 'quote', entityId: quote.id, data: { status, total: patch.total, referral: rating.referral.required } });
  return getQuote(quote.id);
}

const proposerSchema = z.object({
  companyName: z.string().min(2).max(200),
  tradeLicence: z.string().min(3).max(60),
  licenceExpiry: z.string().refine(isISODate, 'Use YYYY-MM-DD'),
  licenceAuthority: z.string().max(80).optional(),
  taxNo: z.string().max(40).optional(),
  contactName: z.string().min(2).max(160),
  contactIdNo: z.string().min(5).max(40),
  email: z.string().email().max(160),
  mobile: z.string().min(7).max(30),
  lossPayee: z.string().max(200).optional(),
  inceptionDate: z.string().refine(isISODate, 'Use YYYY-MM-DD'),
  marketingConsent: z.boolean().default(false),
  declarations: z.object({
    truthful: z.literal(true),
    noPreviousDecline: z.boolean(),
    noOtherInsurance: z.boolean(),
    screeningConsent: z.literal(true),
    keyFactsRead: z.literal(true),
  }),
});

/** Admin field properties are enforced on the server too: mandatory and pattern (Admin → Field properties). */
async function enforceFieldRules(screen, values) {
  const defs = await db('field_definitions').where({ screen }).andWhere((q) => q.where({ mandatory: true }).orWhereNotNull('pattern'));
  const problems = [];
  for (const d of defs) {
    const v = values[d.field_key];
    const empty = v === undefined || v === null || String(v).trim() === '';
    if (d.mandatory && d.visible && empty) problems.push({ path: d.field_key, message: 'Required' });
    else if (!empty && d.pattern && !new RegExp(d.pattern).test(String(v))) problems.push({ path: d.field_key, message: 'Format not valid' });
  }
  if (problems.length) throw badRequest('VALIDATION_FAILED', 'Check the highlighted details', problems);
}

async function setProposer(quote, body, user) {
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  if (!['quoted', 'approved', 'info_requested'].includes(quote.status)) throw conflict('QUOTE_NOT_READY', `Quote is ${quote.status}`);
  const proposer = proposerSchema.parse(body);
  if (proposer.licenceExpiry < today()) throw badRequest('LICENCE_EXPIRED', 'Trade licence has expired');
  await enforceFieldRules('common.details', proposer);

  const customerId = await db.transaction(async (trx) => {
    const fields = {
      company_name: proposer.companyName,
      trade_licence: proposer.tradeLicence,
      licence_expiry: proposer.licenceExpiry,
      licence_authority: proposer.licenceAuthority || null,
      tax_no: proposer.taxNo || null,
      contact_name: proposer.contactName,
      contact_id_no: proposer.contactIdNo,
      email: proposer.email,
      mobile: proposer.mobile,
      updated_at: trx.fn.now(),
    };
    if (user.role === 'customer') {
      const existing = user.customerId ? await trx('customers').where({ id: user.customerId }).first() : await trx('customers').where({ user_id: user.id }).first();
      if (existing) {
        await trx('customers').where({ id: existing.id }).update(fields);
        return existing.id;
      }
      const [id] = await trx('customers').insert({ ...fields, user_id: user.id, country_code: quote.country_code });
      return id;
    }
    if (user.isBroker) {
      if (quote.broker_id !== user.brokerId) throw forbidden('QUOTE_ACCESS_DENIED');
      const existing = await trx('customers').where({ broker_id: user.brokerId, trade_licence: proposer.tradeLicence, country_code: quote.country_code }).first();
      if (existing) {
        await trx('customers').where({ id: existing.id }).update(fields);
        return existing.id;
      }
      const [id] = await trx('customers').insert({ ...fields, broker_id: user.brokerId, country_code: quote.country_code });
      return id;
    }
    throw forbidden('ROLE_NOT_ALLOWED');
  });

  // The proposer's start date and declarations feed the risk, so re-price.
  const risk = { ...quote.risk_data, inceptionDate: proposer.inceptionDate, previouslyDeclined: proposer.declarations.noPreviousDecline === false };
  await db('quotes').where({ id: quote.id }).update({
    proposer: json(proposer), customer_id: customerId, created_by: quote.created_by || user.id,
  });
  const fresh = await getQuote(quote.id);
  const updated = await updateRisk(fresh, risk, user);
  const product = await catalog.getProduct(quote.product_code);
  await emit('quote.saved', {
    entity: 'quote', entityId: quote.id, dedupeKey: 'quote_saved', brokerId: quote.broker_id,
    customer: { email: proposer.email, mobile: proposer.mobile, locale: user.locale, userId: user.role === 'customer' ? user.id : null },
    data: { quoteRef: quote.ref, customerName: proposer.companyName, productName: product.name_en, total: `${updated.currency} ${updated.total}`, validUntil: updated.valid_until ? new Date(updated.valid_until).toISOString().slice(0, 10) : '', link: config.appUrl },
  });
  return updated;
}

async function submitReferral(quote, note, user) {
  if (quote.status !== 'quoted') throw conflict('QUOTE_NOT_REFERRABLE', `Quote is ${quote.status}`);
  if (!quote.rating?.referral?.required) throw conflict('REFERRAL_NOT_NEEDED');
  return db.transaction(async (trx) => {
    const slaDue = new Date(Date.now() + (quote.rating.slaHours || 24) * 3600 * 1000);
    const [referralId] = await trx('referrals').insert({ quote_id: quote.id, status: 'open', reasons: json(quote.rating.referral.reasons), sla_due: slaDue });
    if (note) await trx('referral_messages').insert({ referral_id: referralId, author_id: user?.id || null, body: String(note).slice(0, 4000) });
    await trx('quotes').where({ id: quote.id }).update({ status: 'referred', updated_at: trx.fn.now() });
    await audit(trx, { userId: user?.id, action: 'referral.create', entity: 'quote', entityId: quote.id, data: { referralId } });
    return getQuote(quote.id, trx);
  }).then(async (q) => {
    await emit('referral.created', { entity: 'quote', entityId: quote.id, brokerId: quote.broker_id, customer: { email: quote.proposer?.email, mobile: quote.proposer?.mobile }, data: { reference: quote.ref, customerName: quote.proposer?.companyName || quote.risk_data?.business?.name || '' } });
    return q;
  });
}

const bindSchema = z.object({
  method: z.enum(['card', 'wallet', 'bank_transfer', 'broker_credit']),
  card: z.object({ number: z.string().min(12).max(23), expiry: z.string().max(7), cvc: z.string().max(4) }).optional(),
  autoRenew: z.boolean().default(false),
});

/**
 * FR-REN-05: a renewal paid after expiry (within the grace period) starts on the day it is
 * paid, so the record continues but there is no cover for the gap.
 */
async function startLateRenewalToday(quote, user) {
  if (!quote.renewal_of_policy_id || !quote.risk_data?.inceptionDate || quote.risk_data.inceptionDate >= today()) return quote;
  const old = await db('policies').where({ id: quote.renewal_of_policy_id }).first();
  const pc = await catalog.getProductCountry(quote.product_code, quote.country_code);
  const graceDays = pc.settings.renewal?.graceDays ?? 30;
  if (today() > addDays(old.expiry_date, graceDays)) throw conflict('RENEWAL_GRACE_EXPIRED', 'The renewal period has ended; start a new quote');
  return updateRisk(quote, { ...quote.risk_data, inceptionDate: today() }, user);
}

/** WC BRD section 9: once a wage declaration is 60 days overdue the deposit is final and new cover is blocked until it is made. */
async function assertNoOverdueDeclaration(quote) {
  const product = await catalog.getProduct(quote.product_code);
  if (product.line !== 'wc' || !quote.customer_id) return;
  const pc = await catalog.getProductCountry(quote.product_code, quote.country_code);
  const finalDays = pc.settings.declaration?.finalAfterDays ?? 60;
  const overdue = await db('policies').where({ customer_id: quote.customer_id, product_code: quote.product_code }).whereIn('status', ['active', 'expired'])
    .andWhere('expiry_date', '<', addDays(today(), -finalDays))
    .whereNotExists(function noDeclaration() { this.select('*').from('endorsements').whereRaw('endorsements.policy_id = policies.id').andWhere('endorsements.type', 'wage_declaration'); })
    .first();
  if (overdue) throw conflict('DECLARATION_OVERDUE', `Declare actual wages for ${overdue.policy_no} first`, { policyNo: overdue.policy_no, policyId: overdue.id });
}

async function bindQuote(inputQuote, body, user) {
  if (!user) throw new AppError(401, 'UNAUTHENTICATED');
  const payment = bindSchema.parse(body);
  const product = await catalog.getProduct(inputQuote.product_code);
  await licence.assertCanSell(product.line, inputQuote.channel);
  const quote = await startLateRenewalToday(inputQuote, user);
  await assertNoOverdueDeclaration(quote);
  if (!['quoted', 'approved'].includes(quote.status)) throw conflict('QUOTE_NOT_BINDABLE', `Quote is ${quote.status}`);
  if (!quote.proposer || !quote.customer_id) throw conflict('PROPOSER_REQUIRED');
  // Renewal quotes stay open until the grace period ends; the re-rate below catches any price change.
  if (!quote.renewal_of_policy_id && quote.valid_until && quote.valid_until < new Date(today())) throw conflict('QUOTE_EXPIRED', 'Quote has expired; review it to get a new price');
  if (quote.channel === 'b2c' && !['card', 'wallet', 'bank_transfer'].includes(payment.method)) throw badRequest('PAYMENT_METHOD_NOT_ALLOWED');
  if (quote.channel === 'b2b' && !user.isBroker) throw forbidden('ROLE_NOT_ALLOWED');

  // FR-ISS-03: re-rate at payment; if anything changed, show the new price first.
  const rating = await priceRisk({ quote, risk: quote.risk_data, uwTerms: quote.uw_terms, proposer: quote.proposer });
  if (!rating.quotable) throw conflict('NOT_QUOTABLE');
  if (rating.referral.required) {
    await db('quotes').where({ id: quote.id }).update({ rating: json(rating), status: 'quoted' });
    throw conflict('REFERRAL_REQUIRED', 'This quote needs underwriter review before cover can start', rating.referral.reasons);
  }
  if (Number(rating.breakdown.total) !== Number(quote.total)) {
    await db('quotes').where({ id: quote.id }).update({ rating: json(rating), premium: rating.breakdown.premium, tax: rating.breakdown.tax, total: rating.breakdown.total });
    throw conflict('PRICE_CHANGED', 'The price has changed. Review the new price.', { total: rating.breakdown.total });
  }

  const amount = Number(quote.total);
  if (payment.method === 'broker_credit') {
    const broker = await brokerFor(quote.broker_id);
    const used = await db('payments').join('quotes', 'payments.quote_id', 'quotes.id')
      .where({ 'quotes.broker_id': broker.id, 'payments.method': 'broker_credit', 'payments.status': 'succeeded' })
      .sum({ s: 'payments.amount' }).first();
    if (Number(used?.s || 0) + amount > Number(broker.credit_limit)) throw unprocessable('CREDIT_LIMIT_EXCEEDED');
  }

  if (payment.method === 'bank_transfer') {
    const [paymentId] = await db('payments').insert({ quote_id: quote.id, amount, currency: quote.currency, method: 'bank_transfer', status: 'pending', provider: 'manual' });
    await audit(db, { userId: user.id, action: 'payment.pending', entity: 'quote', entityId: quote.id, data: { paymentId } });
    return { status: 'payment_pending', paymentId, reference: quote.ref };
  }

  const result = payment.method === 'broker_credit'
    ? { status: 'succeeded', reference: `CR-${quote.ref}` }
    : await integrations.payments.charge({ amount, currency: quote.currency, method: payment.method, card: payment.card });

  if (result.status !== 'succeeded') {
    await db('payments').insert({ quote_id: quote.id, amount, currency: quote.currency, method: payment.method, status: 'failed', provider: integrations.payments.name, failure_reason: result.reason });
    await emit('payment.failed', { entity: 'quote', entityId: quote.id, customer: { email: quote.proposer?.email, mobile: quote.proposer?.mobile, locale: quote.proposer?.locale }, data: { quoteRef: quote.ref, customerName: quote.proposer?.companyName, link: config.appUrl } });
    throw new AppError(402, 'PAYMENT_FAILED', 'Payment was not completed. Your quote is saved; try again or use another method.', { reason: result.reason });
  }

  // Auto-renewal keeps a gateway token, never the card number.
  const paymentToken = payment.autoRenew && payment.method === 'card' && payment.card
    ? (await integrations.payments.tokenize({ card: payment.card })).token : null;

  const policy = await db.transaction(async (trx) => {
    const [paymentId] = await trx('payments').insert({ quote_id: quote.id, amount, currency: quote.currency, method: payment.method, status: 'succeeded', provider: payment.method === 'broker_credit' ? 'broker_credit' : integrations.payments.name, provider_ref: result.reference });
    return policies.issueFromQuote(trx, { quote: { ...quote, rating }, paymentId, user, autoRenew: payment.autoRenew, paymentToken });
  });
  await policies.flushEvents(policy);
  return { status: 'issued', policyId: policy.id, policyNo: policy.policy_no };
}

/** What the journey screens and dashboards need; internal facts only for staff. */
function quoteView(quote, { staff = false } = {}) {
  const rating = quote.rating || null;
  return {
    id: quote.id,
    ref: quote.ref,
    productCode: quote.product_code,
    countryCode: quote.country_code,
    channel: quote.channel,
    status: quote.status,
    currency: quote.currency,
    risk: quote.risk_data,
    proposer: quote.proposer,
    premium: quote.premium,
    policyFee: quote.policy_fee,
    tax: quote.tax,
    total: quote.total,
    validUntil: quote.valid_until,
    renewalOfPolicyId: quote.renewal_of_policy_id || null,
    uwTerms: quote.uw_terms ? { ...quote.uw_terms, riskHash: undefined } : null,
    rating: rating && {
      quotable: rating.quotable,
      notQuotableReason: rating.notQuotableReason,
      tier: rating.tier,
      sumInsured: rating.sumInsured,
      breakdown: rating.breakdown,
      locations: rating.locations,
      referral: rating.referral,
      facts: staff ? rating.facts : undefined,
      authority: staff ? rating.authority : undefined,
      tableVersions: staff ? rating.tableVersions : undefined,
      ratingModel: staff ? rating.ratingModel : undefined,
    },
    createdAt: quote.created_at,
    updatedAt: quote.updated_at,
  };
}

module.exports = { createQuote, getQuote, updateRisk, normaliseRisk, setProposer, submitReferral, bindQuote, priceRisk, quoteView, riskHash, authorityFor };
