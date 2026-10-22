const express = require('express');
const { emit } = require('../../lib/messaging');
const config = require('../../config');
const { z } = require('zod');
const { db, json } = require('../../db');
const quotes = require('../quotes/service');
const policies = require('../policies/service');
const openCover = require('../opencover/service');
const catalog = require('../../lib/catalog');
const { asyncHandler } = require('../../middleware/errors');
const { requireRole } = require('../../middleware/auth');
const { audit } = require('../../lib/audit');
const { conflict, forbidden, notFound } = require('../../lib/errors');

const router = express.Router();
router.use(requireRole('underwriter', 'uw_manager'));

/** One queue for new-business quotes and policy changes, ordered by reply due time. */
router.get('/referrals', asyncHandler(async (req, res) => {
  const status = String(req.query.status || 'open');
  const statuses = status === 'all' ? ['open', 'info_requested', 'approved', 'declined'] : status.split(',');
  const rows = await db('referrals')
    .leftJoin('quotes', 'quotes.id', 'referrals.quote_id')
    .leftJoin('endorsement_requests', 'endorsement_requests.id', 'referrals.endorsement_request_id')
    .leftJoin('policies', 'policies.id', 'endorsement_requests.policy_id')
    .leftJoin('oc_certificates', 'oc_certificates.id', 'referrals.certificate_id')
    .leftJoin('policies as cp', 'cp.id', 'oc_certificates.policy_id')
    .leftJoin('brokers', 'brokers.id', db.raw('COALESCE(quotes.broker_id, policies.broker_id, cp.broker_id)'))
    .whereIn('referrals.status', statuses)
    .orderBy('referrals.sla_due', 'asc')
    .select('referrals.*', 'quotes.ref', 'quotes.product_code', 'quotes.channel', 'quotes.total', 'quotes.currency', 'quotes.risk_data', 'quotes.proposer', 'quotes.rating', 'quotes.renewal_of_policy_id',
      'policies.policy_no', 'policies.channel as p_channel', 'policies.currency as p_currency', 'policies.proposer as p_proposer', 'endorsement_requests.rating as e_rating', 'brokers.name as broker_name',
      'oc_certificates.cert_no', 'oc_certificates.sum_insured as c_si', 'cp.channel as c_channel', 'cp.currency as c_currency', 'cp.proposer as c_proposer', 'quotes.risk_data as q_risk');
  res.json({
    referrals: rows.map((r) => {
      if (r.certificate_id) {
        return {
          id: r.id, status: r.status, slaDue: r.sla_due, overdue: new Date(r.sla_due) < new Date(), kind: 'certificate',
          quoteRef: r.cert_no, channel: r.c_channel, broker: r.broker_name, insured: r.c_proposer?.companyName, sumInsured: r.c_si, currency: r.c_currency, reasons: r.reasons, productCode: 'MARINE',
        };
      }
      const endorsement = Boolean(r.endorsement_request_id);
      return {
        id: r.id, status: r.status, slaDue: r.sla_due, overdue: new Date(r.sla_due) < new Date(),
        kind: endorsement ? 'endorsement' : (r.renewal_of_policy_id ? 'renewal' : 'new_business'),
        quoteId: r.quote_id, quoteRef: endorsement ? r.policy_no : r.ref,
        channel: endorsement ? r.p_channel : r.channel, broker: r.broker_name,
        insured: endorsement ? r.p_proposer?.companyName : (r.proposer?.companyName || r.risk_data?.business?.name || null),
        sumInsured: endorsement ? r.e_rating?.sumInsured : r.rating?.sumInsured,
        tier: endorsement ? r.e_rating?.tier : r.rating?.tier,
        total: r.total, currency: endorsement ? r.p_currency : r.currency,
        reasons: r.reasons,
      };
    }),
  });
}));

async function loadReferral(id) {
  const referral = await db('referrals').where({ id }).first();
  if (!referral) throw notFound('REFERRAL_NOT_FOUND');
  return referral;
}

async function authorityFor(productCode, countryCode, role) {
  const pc = await catalog.getProductCountry(productCode, countryCode);
  return pc.settings.authority[role] || {};
}

router.get('/referrals/:id', asyncHandler(async (req, res) => {
  const referral = await loadReferral(Number(req.params.id));
  const messages = await db('referral_messages').leftJoin('users', 'users.id', 'referral_messages.author_id')
    .where({ referral_id: referral.id }).orderBy('referral_messages.id')
    .select('referral_messages.*', 'users.full_name', 'users.role');
  const base = {
    referral: { id: referral.id, status: referral.status, slaDue: referral.sla_due, reasons: referral.reasons, decision: referral.decision },
    messages: messages.map((m) => ({ id: m.id, body: m.body, at: m.created_at, author: m.full_name, role: m.role })),
  };

  if (referral.certificate_id) {
    const cert = await db('oc_certificates').where({ id: referral.certificate_id }).first();
    const policy = await policies.getPolicy(cert.policy_id);
    return res.json({
      ...base,
      kind: 'certificate',
      myAuthority: await authorityFor(policy.product_code, policy.country_code, req.user.role),
      certificate: { ...openCover.certView(cert), shipment: cert.shipment, facts: cert.rating.facts, breakdown: cert.rating.breakdown, sumInsuredCalc: cert.rating.sumInsuredCalc },
      policy: { id: policy.id, policyNo: policy.policy_no, currency: policy.currency, insured: policy.proposer?.companyName, inceptionDate: policy.inception_date, expiryDate: policy.expiry_date, channel: policy.channel, terms: { estimatedTurnover: policy.risk_data.estimatedTurnover, perSendingLimit: policy.risk_data.perSendingLimit, agreedRates: policy.rating.agreedRates } },
    });
  }

  if (referral.endorsement_request_id) {
    const request = await db('endorsement_requests').where({ id: referral.endorsement_request_id }).first();
    const policy = await policies.getPolicy(request.policy_id);
    return res.json({
      ...base,
      kind: 'endorsement',
      myAuthority: await authorityFor(policy.product_code, policy.country_code, req.user.role),
      endorsement: {
        id: request.id, status: request.status, type: request.type, premiumDelta: request.premium_delta, taxDelta: request.tax_delta,
        currentSumInsured: policy.sum_insured, newSumInsured: request.rating?.sumInsured, facts: request.rating?.facts, breakdown: request.rating?.breakdown,
        locations: request.data.locations,
      },
      policy: { id: policy.id, policyNo: policy.policy_no, currency: policy.currency, insured: policy.proposer?.companyName, inceptionDate: policy.inception_date, expiryDate: policy.expiry_date, channel: policy.channel },
    });
  }

  const quote = await quotes.getQuote(referral.quote_id);
  return res.json({
    ...base,
    kind: quote.renewal_of_policy_id ? 'renewal' : 'new_business',
    quote: quotes.quoteView(quote, { staff: true }),
    myAuthority: await authorityFor(quote.product_code, quote.country_code, req.user.role),
  });
}));

router.post('/referrals/:id/messages', asyncHandler(async (req, res) => {
  const referral = await loadReferral(Number(req.params.id));
  const { body, requestInfo } = z.object({ body: z.string().min(1).max(4000), requestInfo: z.boolean().default(false) }).parse(req.body);
  await db.transaction(async (trx) => {
    await trx('referral_messages').insert({ referral_id: referral.id, author_id: req.user.id, body });
    if (requestInfo && referral.status === 'open') {
      await trx('referrals').where({ id: referral.id }).update({ status: 'info_requested', updated_at: trx.fn.now() });
      if (referral.quote_id) await trx('quotes').where({ id: referral.quote_id }).update({ status: 'info_requested' });
      if (referral.endorsement_request_id) await trx('endorsement_requests').where({ id: referral.endorsement_request_id }).update({ status: 'info_requested' });
      if (referral.certificate_id) await trx('oc_certificates').where({ id: referral.certificate_id }).update({ status: 'info_requested' });
    }
  });
  res.status(201).json({ ok: true });
}));

const decisionSchema = z.object({
  outcome: z.enum(['approve', 'decline']),
  loadingPct: z.number().min(-0.5).max(3).default(0),
  discountPct: z.number().min(0).max(0.5).optional(),
  deductible: z.enum(['standard', 'high']).optional(),
  warranty: z.string().max(1000).optional(),
  reasonCode: z.string().min(2).max(60),
  note: z.string().max(4000).optional(),
});

function checkAuthority(authority, maxLocationSI, discount) {
  if (authority.maxLocationSI != null && maxLocationSI > authority.maxLocationSI) throw forbidden('ABOVE_AUTHORITY', 'Sum insured is above your authority; refer to a UW manager');
  if (authority.maxDiscount != null && (discount ?? 0) > authority.maxDiscount) throw forbidden('DISCOUNT_ABOVE_AUTHORITY');
}

/**
 * Underwriter decision within personal authority (Fire BRD section 8).
 * New business: approval re-prices the quote and ties the terms to the exact risk.
 * Endorsement: approval prices the change; the customer then accepts and pays.
 */
router.post('/referrals/:id/decision', asyncHandler(async (req, res) => {
  const referral = await loadReferral(Number(req.params.id));
  if (!['open', 'info_requested'].includes(referral.status)) throw conflict('REFERRAL_CLOSED');
  const d = decisionSchema.parse(req.body);
  const decision = { ...d, decidedBy: req.user.name, decidedAt: new Date().toISOString() };

  const notifyDecision = async () => {
    const q = referral.quote_id ? await db('quotes').where({ id: referral.quote_id }).first() : null;
    if (!q) return;
    await emit('referral.decided', { entity: 'quote', entityId: q.id, brokerId: q.broker_id, customer: { email: q.proposer?.email, mobile: q.proposer?.mobile }, data: { reference: q.ref, customerName: q.proposer?.companyName || '', outcome: d.outcome === 'approve' ? 'approved' : 'declined', link: config.appUrl } });
  };
  const close = async () => db.transaction(async (trx) => {
    await trx('referrals').where({ id: referral.id }).update({ status: d.outcome === 'approve' ? 'approved' : 'declined', decision: json(decision), decided_by: req.user.id, decided_at: new Date(), updated_at: trx.fn.now() });
    if (d.note) await trx('referral_messages').insert({ referral_id: referral.id, author_id: req.user.id, body: d.note });
    await audit(trx, { userId: req.user.id, action: `referral.${d.outcome}`, entity: referral.quote_id ? 'quote' : (referral.certificate_id ? 'certificate' : 'endorsement_request'), entityId: referral.quote_id || referral.certificate_id || referral.endorsement_request_id, data: decision });
  });

  if (referral.certificate_id) {
    const cert = await db('oc_certificates').where({ id: referral.certificate_id }).first();
    const policy = await policies.getPolicy(cert.policy_id);
    if (d.outcome === 'approve') checkAuthority(await authorityFor(policy.product_code, policy.country_code, req.user.role), Number(cert.sum_insured), 0);
    const result = await openCover.decideCertificate(cert.id, d, req.user);
    await close();
    return res.json({ kind: 'certificate', ...result });
  }

  if (referral.endorsement_request_id) {
    const request = await db('endorsement_requests').where({ id: referral.endorsement_request_id }).first();
    const policy = await policies.getPolicy(request.policy_id);
    if (d.outcome === 'approve') checkAuthority(await authorityFor(policy.product_code, policy.country_code, req.user.role), request.rating?.maxLocationSI, d.discountPct);
    const result = await policies.decideEndorsement(request, d, req.user);
    await close();
    return res.json({ kind: 'endorsement', ...result });
  }

  const quote = await quotes.getQuote(referral.quote_id);
  if (d.outcome === 'approve') checkAuthority(await authorityFor(quote.product_code, quote.country_code, req.user.role), quote.rating.maxLocationSI, d.discountPct);
  await close();
  if (d.outcome === 'decline') {
    await db('quotes').where({ id: quote.id }).update({ status: 'declined', updated_at: db.fn.now() });
  } else {
    const uwTerms = {
      loadingPct: d.loadingPct, discountPct: d.discountPct ?? quote.risk_data.discountPct ?? 0, deductible: d.deductible,
      warranty: d.warranty, reasonCode: d.reasonCode, riskHash: quotes.riskHash(quote.risk_data), approvedBy: req.user.id,
      referralCodes: (quote.rating?.referral?.reasons || []).map((r) => r.code),
    };
    await db('quotes').where({ id: quote.id }).update({ uw_terms: json(uwTerms), status: 'approved' });
    const fresh = await quotes.getQuote(quote.id);
    await quotes.updateRisk(fresh, quote.risk_data, req.user);
  }
  await notifyDecision();
  const updated = await quotes.getQuote(quote.id);
  return res.json({ kind: 'quote', quote: quotes.quoteView(updated, { staff: true }) });
}));

module.exports = router;
