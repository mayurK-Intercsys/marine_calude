const { z } = require('zod');
const { rateFor } = require('../../lib/commission');
const { emit } = require('../../lib/messaging');
const config = require('../../config');
const numbering = require('../../lib/numbering');
const { db, json } = require('../../db');
const catalog = require('../../lib/catalog');
const { nextValue, pad } = require('../../lib/sequence');
const { audit } = require('../../lib/audit');
const { round } = require('../../lib/money');
const { today, addDays, annualExpiry, daysInclusive, isISODate } = require('../../lib/dates');
const integrations = require('../../integrations');
const { AppError, conflict, badRequest, unprocessable, forbidden } = require('../../lib/errors');

async function getPolicy(id, conn = db) {
  const policy = await conn('policies').where({ id }).first();
  if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND');
  return policy;
}

/** Called inside the bind transaction once payment has succeeded. */
async function issueFromQuote(trx, { quote, paymentId, user, autoRenew = false, paymentToken = null }) {
  const pc = await catalog.getProductCountry(quote.product_code, quote.country_code, trx);
  const country = await catalog.getCountry(quote.country_code, trx);
  const inception = quote.risk_data.inceptionDate || today();
  const year = inception.slice(0, 4);
  const lineCode = pc.settings.numbering.byType?.[quote.risk_data.productType] || pc.settings.numbering.lineCode;
  const policyNo = await numbering.next(trx, 'policy', { productCode: quote.product_code, countryCode: quote.country_code, channel: quote.channel, line: lineCode, date: `${year}-01-01` });
  const { breakdown } = quote.rating;

  // A renewal keeps the previous token unless the customer gave a new card.
  let token = paymentToken;
  if (!token && quote.renewal_of_policy_id && autoRenew !== false) {
    const previous = await trx('policies').where({ id: quote.renewal_of_policy_id }).first();
    token = previous?.payment_token || null;
  }

  const [policyId] = await trx('policies').insert({
    policy_no: policyNo,
    quote_id: quote.id,
    product_code: quote.product_code,
    country_code: quote.country_code,
    channel: quote.channel,
    customer_id: quote.customer_id,
    broker_id: quote.broker_id,
    status: 'active',
    inception_date: inception,
    expiry_date: quote.rating.period?.expiry || annualExpiry(inception),
    currency: quote.currency,
    sum_insured: quote.rating.sumInsured,
    premium: breakdown.premium,
    policy_fee: breakdown.policyFee,
    tax: breakdown.tax,
    total: breakdown.total,
    risk_data: json({ ...quote.risk_data, autoRenew: Boolean(autoRenew && token) }),
    proposer: json(quote.proposer),
    rating: json(quote.rating),
    uw_terms: json(quote.uw_terms),
    renewed_from_policy_id: quote.renewal_of_policy_id || null,
    payment_token: token,
  });

  await trx('payments').where({ id: paymentId }).update({ policy_id: policyId });
  await trx('quotes').where({ id: quote.id }).update({ status: 'bound', updated_at: trx.fn.now() });

  if (quote.broker_id) {
    const broker = await trx('brokers').where({ id: quote.broker_id }).first();
    const transaction = quote.renewal_of_policy_id ? 'renewal' : 'new_business';
    const { rate, schemeId } = await rateFor(trx, { broker, productCode: quote.product_code, countryCode: quote.country_code, transaction, date: inception });
    const amount = round(breakdown.premium * rate, country.currency_decimals);
    await trx('commissions').insert({ broker_id: broker.id, policy_id: policyId, transaction, base_amount: breakdown.premium, rate, amount, status: 'earned', scheme_id: schemeId });
  }

  await audit(trx, { userId: user?.id, action: quote.renewal_of_policy_id ? 'policy.renew' : 'policy.issue', entity: 'policy', entityId: policyId, data: { policyNo, quoteId: quote.id, total: breakdown.total, renewalOf: quote.renewal_of_policy_id || null } });

  const product = await trx('products').where({ code: quote.product_code }).first();
  const customerUser = await trx('customers').where({ id: quote.customer_id }).first();
  const event = ['policy.issued', {
    entity: 'policy', entityId: policyId, brokerId: quote.broker_id,
    customer: { email: quote.proposer?.email, mobile: quote.proposer?.mobile, locale: quote.proposer?.locale || 'en', userId: customerUser?.user_id },
    data: { policyNo, customerName: quote.proposer?.companyName, productName: product.name_en, inceptionDate: inception, expiryDate: quote.rating.period?.expiry || annualExpiry(inception), total: `${quote.currency} ${breakdown.total}`, link: `${config.appUrl}/en/account/policies/${policyId}` },
  }];

  const issued = await trx('policies').where({ id: policyId }).first();
  return Object.defineProperty(issued, 'pendingEvents', { value: [event], enumerable: false });
}

/** Sends the events raised while issuing, once the transaction has committed. */
async function flushEvents(policy) {
  for (const [name, ctx] of policy?.pendingEvents || []) {
    // eslint-disable-next-line no-await-in-loop
    await emit(name, ctx).catch((e) => console.error(`[emit] ${name}`, e.message));
  }
  return policy;
}

const cancelSchema = z.object({
  effectiveDate: z.string().refine(isISODate, 'Use YYYY-MM-DD').optional(),
  reason: z.string().min(2).max(300),
});

/**
 * FR-CAN-01..03: full refund within the free-look period if no claim;
 * otherwise short-period scale; no refund if any claim exists.
 */
async function cancelPolicy(policy, body, user) {
  if (policy.status !== 'active') throw conflict('POLICY_NOT_ACTIVE');
  const { effectiveDate = today(), reason } = cancelSchema.parse(body);
  if (effectiveDate < policy.inception_date) throw badRequest('CANCEL_BEFORE_INCEPTION');
  if (effectiveDate > policy.expiry_date) throw badRequest('CANCEL_AFTER_EXPIRY');

  const country = await catalog.getCountry(policy.country_code);
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  const dec = country.currency_decimals;
  const claims = await db('claims').where({ policy_id: policy.id }).count({ n: '*' }).first();
  const daysInForce = Math.max(1, daysInclusive(policy.inception_date, effectiveDate));

  let refundPremium = 0;
  let basis = 'no_refund_claim';
  if (Number(claims.n) === 0) {
    if (daysInForce <= country.free_look_days) {
      refundPremium = Number(policy.premium);
      basis = 'free_look';
    } else {
      const band = pc.settings.shortPeriodScale.find((b) => daysInForce <= b.maxDays) || { retain: 1 };
      refundPremium = Number(policy.premium) * (1 - band.retain);
      basis = `short_period_${Math.round(band.retain * 100)}`;
    }
  }
  refundPremium = round(refundPremium, dec);
  const refundTax = round(refundPremium * Number(country.vat_rate), dec);
  const refundFee = basis === 'free_look' ? Number(policy.policy_fee) : 0;
  const refundTotal = round(refundPremium + refundTax + refundFee, dec);

  await db.transaction(async (trx) => {
    const endorsementSeqNo = await numbering.next(trx, 'endorsement', { policyNo: policy.policy_no, productCode: policy.product_code, countryCode: policy.country_code });
    const [endorsementId] = await trx('endorsements').insert({
      policy_id: policy.id, endorsement_no: endorsementSeqNo, type: 'cancellation',
      data: json({ effectiveDate, reason, basis, daysInForce, refundTotal }), premium_delta: -refundPremium, tax_delta: -refundTax, created_by: user.id,
    });
    await trx('policies').where({ id: policy.id }).update({ status: 'cancelled', cancelled_at: new Date(`${effectiveDate}T00:00:00Z`), cancel_refund: refundTotal, updated_at: trx.fn.now() });
    await trx('endorsement_requests').where({ policy_id: policy.id }).whereIn('status', ['referred', 'info_requested', 'approved']).update({ status: 'withdrawn' });
    if (refundTotal > 0) {
      const original = await trx('payments').where({ policy_id: policy.id, status: 'succeeded' }).first();
      const refund = await integrations.payments.refund({ amount: refundTotal, currency: policy.currency, reference: original?.provider_ref });
      await trx('payments').insert({ policy_id: policy.id, amount: -refundTotal, currency: policy.currency, method: original?.method || 'card', status: 'refunded', provider: original?.provider || 'mock', provider_ref: refund.reference });
    }
    if (policy.broker_id && refundPremium > 0) {
      const earned = await trx('commissions').where({ policy_id: policy.id }).whereIn('transaction', ['new_business', 'renewal']).first();
      if (earned) {
        await trx('commissions').insert({ broker_id: policy.broker_id, policy_id: policy.id, endorsement_id: endorsementId, transaction: 'cancellation', base_amount: -refundPremium, rate: earned.rate, amount: round(-refundPremium * Number(earned.rate), dec), status: 'clawback' });
      }
    }
    await audit(trx, { userId: user.id, action: 'policy.cancel', entity: 'policy', entityId: policy.id, data: { effectiveDate, basis, refundTotal } });
  });
  return { refundTotal, basis, daysInForce };
}

const contactSchema = z.object({
  contactName: z.string().min(2).max(160).optional(),
  email: z.string().email().max(160).optional(),
  mobile: z.string().min(7).max(30).optional(),
  lossPayee: z.string().max(200).optional(),
});

const paymentSchema = z.object({
  method: z.enum(['card', 'wallet', 'saved_card', 'broker_credit']),
  card: z.object({ number: z.string().min(12).max(23), expiry: z.string().max(7), cvc: z.string().max(4) }).optional(),
}).optional();

/**
 * Prices a sum-insured change: full annual premium on the new values, then the
 * difference pro rata to the days left (FR-END-01), with the minimum endorsement premium.
 */
/** Which risk fields a mid-term change may touch, by product line. */
const CHANGEABLE = { fire: ['locations'], wc: ['employees', 'categories'], engineering: ['items'] };

function changePatch(line, body) {
  const allowed = CHANGEABLE[line] || [];
  const patch = Object.fromEntries(allowed.filter((k) => body?.[k] !== undefined).map((k) => [k, body[k]]));
  if (!Object.keys(patch).length) throw badRequest('CHANGE_NOT_SUPPORTED', 'Nothing to change for this product');
  return patch;
}

async function previewSumInsured(policy, locations, opts) {
  return previewChange(policy, { locations }, opts);
}

/** Named WC: joiners dated more than 7 days back need an underwriter (UW-W07). */
function flagBackdatedJoiners(policy, patch) {
  if (!patch.employees || policy.risk_data.policyType !== 'named') return patch;
  const known = new Set((policy.risk_data.employees || []).map((e) => e.idNo));
  const limit = addDays(today(), -7);
  const backdated = patch.employees.some((e) => !known.has(e.idNo) && e.startDate && e.startDate < limit);
  return { ...patch, backdatedJoiner: backdated };
}

async function previewChange(policy, rawPatch, { uwTerms = null } = {}) {
  const patch = flagBackdatedJoiners(policy, rawPatch);
  const quotes = require('../quotes/service');
  const quote = await quotes.getQuote(policy.quote_id);
  const country = await catalog.getCountry(policy.country_code);
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  const dec = country.currency_decimals;

  const baseRisk = { ...policy.risk_data, ...patch };
  delete baseRisk.autoRenew;
  delete baseRisk.declaredWages;
  delete baseRisk.inceptionDate;
  const parsed = await quotes.normaliseRisk(quote, baseRisk);

  // Last year's underwriter terms still apply to the price; the referral check runs fresh.
  const terms = uwTerms || (policy.uw_terms ? { ...policy.uw_terms, riskHash: null } : null);
  const rating = await quotes.priceRisk({ quote: { ...quote, channel: policy.channel, broker_id: policy.broker_id }, risk: parsed, uwTerms: terms, proposer: policy.proposer, excludePolicyId: policy.id });
  if (!rating.quotable) throw unprocessable('ENDORSEMENT_NOT_QUOTABLE', rating.notQuotableReason);

  const effective = today() < policy.inception_date ? policy.inception_date : today();
  const totalDays = daysInclusive(policy.inception_date, policy.expiry_date);
  const remaining = daysInclusive(effective, policy.expiry_date);
  let premiumDelta = (rating.breakdown.premium - Number(policy.premium)) * (remaining / totalDays);
  if (premiumDelta > 0 && premiumDelta < pc.settings.minEndorsementPremium) premiumDelta = pc.settings.minEndorsementPremium;
  premiumDelta = round(premiumDelta, dec);
  const taxDelta = round(premiumDelta * Number(country.vat_rate), dec);

  return {
    risk: parsed, patch: rawPatch, rating, effective, premiumDelta, taxDelta, totalDelta: round(premiumDelta + taxDelta, dec),
    newSumInsured: rating.sumInsured, referral: rating.referral, currency: policy.currency,
  };
}

/** FR-END-02: additional premium is collected before the change takes effect; refunds go back to the payer. */
async function collectEndorsementPayment(policy, amount, payment, user) {
  if (amount === 0) return null;
  if (amount < 0) {
    const original = await db('payments').where({ policy_id: policy.id, status: 'succeeded' }).first();
    const refund = await integrations.payments.refund({ amount: -amount, currency: policy.currency, reference: original?.provider_ref });
    return { amount, method: original?.method || 'card', status: 'refunded', provider: original?.provider || integrations.payments.name, provider_ref: refund.reference };
  }
  const p = paymentSchema.parse(payment);
  if (!p) throw unprocessable('PAYMENT_REQUIRED', 'Additional premium must be paid before the change takes effect', { amount });
  if (p.method === 'broker_credit') {
    if (!user.isBroker || user.brokerId !== policy.broker_id) throw forbidden('PAYMENT_METHOD_NOT_ALLOWED');
    return { amount, method: 'broker_credit', status: 'succeeded', provider: 'broker_credit', provider_ref: `CR-${policy.policy_no}` };
  }
  if (p.method === 'saved_card') {
    if (!policy.payment_token) throw badRequest('NO_SAVED_CARD');
    const r = await integrations.payments.charge({ amount, currency: policy.currency, method: 'card_token', token: policy.payment_token });
    if (r.status !== 'succeeded') throw new AppError(402, 'PAYMENT_FAILED', 'Payment was not completed.', { reason: r.reason });
    return { amount, method: 'card_token', status: 'succeeded', provider: integrations.payments.name, provider_ref: r.reference };
  }
  const r = await integrations.payments.charge({ amount, currency: policy.currency, method: p.method, card: p.card });
  if (r.status !== 'succeeded') throw new AppError(402, 'PAYMENT_FAILED', 'Payment was not completed.', { reason: r.reason });
  return { amount, method: p.method, status: 'succeeded', provider: integrations.payments.name, provider_ref: r.reference };
}

/** FR-EMP-07: workforce changes can be billed later on a monthly or quarterly invoice instead of at once. */
async function isBatched(policy, type) {
  if (type !== 'workforce') return false;
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  return ['monthly', 'quarterly'].includes(pc.settings.employeeBilling);
}

async function applySumInsured(policy, preview, { user, paymentRow, requestId = null, type = 'sum_insured', billingStatus = 'billed' }) {
  const country = await catalog.getCountry(policy.country_code);
  const dec = country.currency_decimals;
  return db.transaction(async (trx) => {
    const fresh = await trx('policies').where({ id: policy.id }).forUpdate().first();
    if (fresh.status !== 'active') throw conflict('POLICY_NOT_ACTIVE');
    if (fresh.version !== policy.version) throw conflict('POLICY_CHANGED', 'The policy changed meanwhile; review the change again');
    const endorsementSeqNo = await numbering.next(trx, 'endorsement', { policyNo: policy.policy_no, productCode: policy.product_code, countryCode: policy.country_code });
    const endorsementNo = endorsementSeqNo;
    const [endorsementId] = await trx('endorsements').insert({
      policy_id: policy.id, endorsement_no: endorsementNo, type,
      data: json({ effective: preview.effective, previousSI: policy.sum_insured, newSI: preview.newSumInsured, requestId }),
      premium_delta: preview.premiumDelta, tax_delta: preview.taxDelta, created_by: user.id, billing_status: billingStatus,
    });
    if (paymentRow) await trx('payments').insert({ ...paymentRow, policy_id: policy.id, currency: policy.currency });
    await trx('policies').where({ id: policy.id }).update({
      risk_data: json({ ...preview.risk, backdatedJoiner: undefined, inceptionDate: policy.inception_date, autoRenew: policy.risk_data.autoRenew }),
      rating: json(preview.rating),
      uw_terms: json(preview.uwTerms || policy.uw_terms),
      sum_insured: preview.newSumInsured,
      premium: round(Number(policy.premium) + preview.premiumDelta, dec),
      tax: round(Number(policy.tax) + preview.taxDelta, dec),
      total: round(Number(policy.total) + preview.premiumDelta + preview.taxDelta, dec),
      version: policy.version + 1,
      updated_at: trx.fn.now(),
    });
    if (policy.broker_id && preview.premiumDelta !== 0) {
      const earned = await trx('commissions').where({ policy_id: policy.id }).whereIn('transaction', ['new_business', 'renewal']).first();
      if (earned) {
        await trx('commissions').insert({ broker_id: policy.broker_id, policy_id: policy.id, endorsement_id: endorsementId, transaction: 'endorsement', base_amount: preview.premiumDelta, rate: earned.rate, amount: round(preview.premiumDelta * Number(earned.rate), dec), status: preview.premiumDelta > 0 ? 'earned' : 'clawback' });
      }
    }
    if (requestId) await trx('endorsement_requests').where({ id: requestId }).update({ status: 'applied', endorsement_id: endorsementId, updated_at: trx.fn.now() });
    await audit(trx, { userId: user.id, action: `policy.endorse.${type}`, entity: 'policy', entityId: policy.id, data: { premiumDelta: preview.premiumDelta, newSI: preview.newSumInsured, requestId } });
    return { status: 'applied', endorsementNo, premiumDelta: preview.premiumDelta, taxDelta: preview.taxDelta, newSumInsured: preview.newSumInsured, billing: billingStatus };
  });
}

/** Sends a change that breaks a referral rule to the underwriter queue. */
async function referEndorsement(policy, preview, user, note) {
  const open = await db('endorsement_requests').where({ policy_id: policy.id }).whereIn('status', ['referred', 'info_requested', 'approved']).first();
  if (open) throw conflict('ENDORSEMENT_REQUEST_OPEN', 'Finish the change already in progress first', { requestId: open.id });
  return db.transaction(async (trx) => {
    const [requestId] = await trx('endorsement_requests').insert({
      policy_id: policy.id, type: preview.type || 'sum_insured', data: json({ patch: preview.patch }), rating: json(preview.rating),
      reasons: json(preview.referral.reasons), premium_delta: preview.premiumDelta, tax_delta: preview.taxDelta, status: 'referred', requested_by: user.id,
    });
    const slaDue = new Date(Date.now() + (preview.rating.slaHours || 24) * 3600 * 1000);
    const [referralId] = await trx('referrals').insert({ endorsement_request_id: requestId, status: 'open', reasons: json(preview.referral.reasons), sla_due: slaDue });
    if (note) await trx('referral_messages').insert({ referral_id: referralId, author_id: user.id, body: String(note).slice(0, 4000) });
    await audit(trx, { userId: user.id, action: 'endorsement.refer', entity: 'policy', entityId: policy.id, data: { requestId, referralId } });
    return { status: 'referred', requestId, reasons: preview.referral.reasons, premiumDelta: preview.premiumDelta, taxDelta: preview.taxDelta };
  });
}

async function endorsePolicy(policy, body, user) {
  if (policy.status !== 'active') throw conflict('POLICY_NOT_ACTIVE');
  const type = body?.type;

  if (type === 'contact') {
    const changes = contactSchema.parse(body.data || {});
    const proposer = { ...policy.proposer, ...changes };
    return db.transaction(async (trx) => {
      const endorsementSeqNo = await numbering.next(trx, 'endorsement', { policyNo: policy.policy_no, productCode: policy.product_code, countryCode: policy.country_code });
      const endorsementNo = endorsementSeqNo;
      await trx('endorsements').insert({ policy_id: policy.id, endorsement_no: endorsementNo, type, data: json(changes), created_by: user.id });
      await trx('policies').where({ id: policy.id }).update({ proposer: json(proposer), version: policy.version + 1, updated_at: trx.fn.now() });
      await audit(trx, { userId: user.id, action: 'policy.endorse.contact', entity: 'policy', entityId: policy.id, data: changes });
      return { status: 'applied', endorsementNo, premiumDelta: 0 };
    });
  }

  if (type === 'sum_insured' || type === 'workforce') {
    const product = await catalog.getProduct(policy.product_code);
    const preview = await previewChange(policy, changePatch(product.line, body));
    preview.type = type;
    if (preview.referral.required) return referEndorsement(policy, preview, user, body.note);
    const batched = await isBatched(policy, type);
    const paymentRow = batched ? null : await collectEndorsementPayment(policy, preview.totalDelta, body.payment, user);
    return applySumInsured(policy, preview, { user, paymentRow, type, billingStatus: batched ? 'unbilled' : 'billed' });
  }

  throw badRequest('ENDORSEMENT_TYPE_UNSUPPORTED');
}

/** After underwriter approval the customer or broker accepts the priced change and pays. */
async function acceptEndorsementRequest(policy, requestId, body, user) {
  const request = await db('endorsement_requests').where({ id: requestId, policy_id: policy.id }).first();
  if (!request) throw new AppError(404, 'ENDORSEMENT_REQUEST_NOT_FOUND');
  if (request.status !== 'approved') throw conflict('ENDORSEMENT_NOT_APPROVED', `Request is ${request.status}`);
  if (PROJECT_CHANGES.includes(request.type)) return require('../engineering/projectChanges').acceptProjectChange(policy, request, body, user);
  const terms = { ...request.uw_terms, riskHash: null };
  const preview = await previewChange(policy, request.data.patch || { locations: request.data.locations }, { uwTerms: terms });
  preview.uwTerms = request.uw_terms;
  // The approved price stands unless the policy itself changed; rates moving after approval are absorbed.
  preview.premiumDelta = Number(request.premium_delta);
  preview.taxDelta = Number(request.tax_delta);
  const country = await catalog.getCountry(policy.country_code);
  preview.totalDelta = round(preview.premiumDelta + preview.taxDelta, country.currency_decimals);
  const batched = await isBatched(policy, request.type);
  const paymentRow = batched ? null : await collectEndorsementPayment(policy, preview.totalDelta, body?.payment, user);
  return applySumInsured(policy, preview, { user, paymentRow, requestId: request.id, type: request.type, billingStatus: batched ? 'unbilled' : 'billed' });
}

/** Underwriter decision on an endorsement referral: approve re-prices the change with the terms. */
const PROJECT_CHANGES = ['period_extension', 'contract_value', 'testing_extension', 'annual_project'];

async function decideEndorsement(request, decision, user) {
  if (PROJECT_CHANGES.includes(request.type)) return require('../engineering/projectChanges').decideProjectChange(request, decision, user);
  const policy = await getPolicy(request.policy_id);
  if (decision.outcome === 'decline') {
    await db('endorsement_requests').where({ id: request.id }).update({ status: 'declined', updated_at: db.fn.now() });
    return { status: 'declined' };
  }
  const uwTerms = { loadingPct: decision.loadingPct, discountPct: decision.discountPct, deductible: decision.deductible, warranty: decision.warranty, reasonCode: decision.reasonCode, approvedBy: user.id };
  const preview = await previewChange(policy, request.data.patch || { locations: request.data.locations }, { uwTerms: { ...uwTerms, riskHash: null } });
  await db('endorsement_requests').where({ id: request.id }).update({
    status: 'approved', uw_terms: json(uwTerms), rating: json(preview.rating), premium_delta: preview.premiumDelta, tax_delta: preview.taxDelta, updated_at: db.fn.now(),
  });
  return { status: 'approved', premiumDelta: preview.premiumDelta, taxDelta: preview.taxDelta };
}

/** Pays an invoice for batched changes with the usual payment methods. */
async function payInvoice(policy, invoiceId, body, user) {
  const invoice = await db('invoices').where({ id: invoiceId, policy_id: policy.id }).first();
  if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND');
  if (invoice.status !== 'due') throw conflict('INVOICE_NOT_DUE');
  const paymentRow = await collectEndorsementPayment(policy, Number(invoice.total), body?.payment, user);
  return db.transaction(async (trx) => {
    const [paymentId] = await trx('payments').insert({ ...paymentRow, policy_id: policy.id, currency: policy.currency });
    await trx('invoices').where({ id: invoice.id }).update({ status: 'paid', paid_at: new Date(), payment_id: paymentId });
    await audit(trx, { userId: user.id, action: 'invoice.pay', entity: 'policy', entityId: policy.id, data: { invoiceNo: invoice.invoice_no } });
    return { status: 'paid', invoiceNo: invoice.invoice_no };
  });
}

async function policyView(policy) {
  const invoices = await db('invoices').where({ policy_id: policy.id }).orderBy('id', 'desc');
  const [customer, broker, endorsements, claims, requests, renewalQuote] = await Promise.all([
    db('customers').where({ id: policy.customer_id }).first(),
    policy.broker_id ? db('brokers').where({ id: policy.broker_id }).first() : null,
    db('endorsements').where({ policy_id: policy.id }).orderBy('id'),
    db('claims').where({ policy_id: policy.id }).orderBy('id', 'desc'),
    db('endorsement_requests').where({ policy_id: policy.id }).orderBy('id', 'desc'),
    policy.renewal_quote_id ? db('quotes').where({ id: policy.renewal_quote_id }).first() : null,
  ]);
  return {
    id: policy.id,
    policyNo: policy.policy_no,
    productCode: policy.product_code,
    countryCode: policy.country_code,
    channel: policy.channel,
    status: policy.status,
    version: policy.version,
    inceptionDate: policy.inception_date,
    expiryDate: policy.expiry_date,
    currency: policy.currency,
    sumInsured: policy.sum_insured,
    premium: policy.premium,
    policyFee: policy.policy_fee,
    tax: policy.tax,
    total: policy.total,
    risk: policy.risk_data,
    proposer: policy.proposer,
    breakdown: policy.rating.breakdown,
    locations: policy.rating.locations,
    uwTerms: policy.uw_terms ? { ...policy.uw_terms, riskHash: undefined } : null,
    autoRenew: Boolean(policy.risk_data.autoRenew),
    hasSavedCard: Boolean(policy.payment_token),
    renewedFromPolicyId: policy.renewed_from_policy_id,
    renewal: renewalQuote ? { quoteId: renewalQuote.id, ref: renewalQuote.ref, status: renewalQuote.status, total: renewalQuote.total, inceptionDate: renewalQuote.inception_date } : null,
    customer: customer && { id: customer.id, companyName: customer.company_name, tradeLicence: customer.trade_licence },
    broker: broker && { id: broker.id, name: broker.name },
    endorsements: endorsements.map((e) => ({ no: e.endorsement_no, type: e.type, premiumDelta: e.premium_delta, taxDelta: e.tax_delta, data: e.data, billing: e.billing_status, createdAt: e.created_at })),
    invoices: invoices.map((i) => ({ id: i.id, invoiceNo: i.invoice_no, period: i.period, premium: i.premium, tax: i.tax, total: i.total, status: i.status, dueDate: i.due_date })),
    endorsementRequests: requests.map((r) => ({ id: r.id, type: r.type, status: r.status, premiumDelta: r.premium_delta, taxDelta: r.tax_delta, reasons: r.reasons, warranty: r.uw_terms?.warranty || null, newSumInsured: r.rating?.sumInsured, createdAt: r.created_at })),
    claims: claims.map((c) => ({ id: c.id, claimNo: c.claim_no, status: c.status, lossDate: c.loss_date, cause: c.cause, estimate: c.estimate })),
    cancelledAt: policy.cancelled_at,
    cancelRefund: policy.cancel_refund,
  };
}

module.exports = { flushEvents, payInvoice, isBatched, getPolicy, issueFromQuote, cancelPolicy, endorsePolicy, previewSumInsured, previewChange, changePatch, collectEndorsementPayment, acceptEndorsementRequest, decideEndorsement, policyView };
