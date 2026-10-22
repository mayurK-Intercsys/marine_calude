/**
 * WC wage declaration and premium adjustment (WC BRD section 9):
 * after expiry the employer or broker declares actual wages per job type; premium is
 * re-calculated on actual wages; additional premium is paid, a return is refunded down
 * to the minimum retained premium (default 75% of the deposit).
 */
const express = require('express');
const numbering = require('../../lib/numbering');
const { z } = require('zod');
const { db, json } = require('../../db');
const catalog = require('../../lib/catalog');
const quotes = require('../quotes/service');
const policies = require('../policies/service');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth } = require('../../middleware/auth');
const { assertPolicyAccess } = require('../../lib/access');
const { nextValue, pad } = require('../../lib/sequence');
const { audit } = require('../../lib/audit');
const { round } = require('../../lib/money');
const { today, addDays } = require('../../lib/dates');
const { AppError, badRequest, conflict } = require('../../lib/errors');

const router = express.Router();
router.use(requireAuth);

async function loadWc(req) {
  const policy = await policies.getPolicy(Number(req.params.id));
  if (policy.product_code !== 'WC') throw new AppError(404, 'POLICY_NOT_FOUND');
  assertPolicyAccess(req.user, policy);
  return policy;
}

async function window(policy) {
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  const d = pc.settings.declaration || { opensDaysBeforeExpiry: 0, dueDaysAfterExpiry: 30 };
  return { opens: addDays(policy.expiry_date, -d.opensDaysBeforeExpiry), due: addDays(policy.expiry_date, d.dueDaysAfterExpiry), minRetainedPct: pc.settings.minRetainedPct ?? 0.75 };
}

router.get('/:id/declaration', asyncHandler(async (req, res) => {
  const policy = await loadWc(req);
  const w = await window(policy);
  const done = await db('endorsements').where({ policy_id: policy.id, type: 'wage_declaration' }).first();
  res.json({
    open: today() >= w.opens && !done && policy.status !== 'cancelled', opens: w.opens, due: w.due, overdue: !done && today() > w.due,
    estimated: (policy.rating.lines || []).map((l) => ({ category: l.category, headcount: l.headcount, annualWages: l.annualWages })),
    declared: done ? { endorsementNo: done.endorsement_no, ...done.data, premiumDelta: done.premium_delta, taxDelta: done.tax_delta } : null,
    currency: policy.currency,
  });
}));

const declarationSchema = z.object({
  categories: z.array(z.object({ category: z.string().min(2).max(20), actualWages: z.number().min(0).max(1e10) })).min(1).max(30),
  payment: z.any().optional(),
});

/** Prices the declaration; `commit` records it, collecting or refunding the difference. */
async function declare(policy, body, user, commit) {
  const { categories, payment } = declarationSchema.parse(body);
  const w = await window(policy);
  if (today() < w.opens) throw conflict('DECLARATION_NOT_OPEN', `Declaration opens on ${w.opens}`);
  if (policy.status === 'cancelled') throw conflict('POLICY_NOT_ACTIVE');
  const already = await db('endorsements').where({ policy_id: policy.id, type: 'wage_declaration' }).first();
  if (already) throw conflict('DECLARATION_DONE');

  const estimated = policy.rating.lines || [];
  const actual = Object.fromEntries(categories.map((c) => [c.category, c.actualWages]));
  for (const l of estimated) if (actual[l.category] == null) throw badRequest('CATEGORY_MISSING', `Declare wages for ${l.category}`);

  const quote = await quotes.getQuote(policy.quote_id);
  const { autoRenew, declaredWages, ...risk } = policy.risk_data;
  const declaredRisk = {
    ...risk,
    policyType: 'unnamed',
    employees: [],
    categories: estimated.map((l) => ({ category: l.category, headcount: l.headcount, avgBasic: l.avgBasic, avgGross: l.avgGross, annualWages: actual[l.category] })),
  };
  const terms = policy.uw_terms ? { ...policy.uw_terms, riskHash: null } : null;
  const rating = await quotes.priceRisk({ quote: { ...quote, channel: policy.channel, broker_id: policy.broker_id }, risk: declaredRisk, uwTerms: terms, proposer: policy.proposer, excludePolicyId: policy.id });
  if (!rating.quotable) throw conflict('DECLARATION_NOT_QUOTABLE', rating.notQuotableReason);

  const country = await catalog.getCountry(policy.country_code);
  const dec = country.currency_decimals;
  const deposit = Number(policy.premium);
  const finalPremium = Math.max(rating.breakdown.premium, deposit * w.minRetainedPct);
  const premiumDelta = round(finalPremium - deposit, dec);
  const taxDelta = round(premiumDelta * Number(country.vat_rate), dec);
  const result = {
    estimatedWages: estimated.reduce((s, l) => s + l.annualWages, 0), actualWages: categories.reduce((s, c) => s + c.actualWages, 0),
    recalculatedPremium: rating.breakdown.premium, deposit, minimumRetained: round(deposit * w.minRetainedPct, dec), premiumDelta, taxDelta, totalDelta: round(premiumDelta + taxDelta, dec), currency: policy.currency,
  };
  if (!commit) return result;

  const paymentRow = await policies.collectEndorsementPayment(policy, result.totalDelta, payment, user);
  return db.transaction(async (trx) => {
    const endorsementSeqNo = await numbering.next(trx, 'endorsement', { policyNo: policy.policy_no, productCode: policy.product_code, countryCode: policy.country_code });
    const endorsementNo = endorsementSeqNo;
    const [endorsementId] = await trx('endorsements').insert({ policy_id: policy.id, endorsement_no: endorsementNo, type: 'wage_declaration', data: json({ categories, estimatedWages: result.estimatedWages, actualWages: result.actualWages }), premium_delta: premiumDelta, tax_delta: taxDelta, created_by: user.id });
    if (paymentRow) await trx('payments').insert({ ...paymentRow, policy_id: policy.id, currency: policy.currency });
    await trx('policies').where({ id: policy.id }).update({
      premium: round(deposit + premiumDelta, dec), tax: round(Number(policy.tax) + taxDelta, dec), total: round(Number(policy.total) + premiumDelta + taxDelta, dec),
      risk_data: json({ ...policy.risk_data, declaredWages: categories }), version: policy.version + 1, updated_at: trx.fn.now(),
    });
    if (policy.broker_id && premiumDelta !== 0) {
      const earned = await trx('commissions').where({ policy_id: policy.id }).whereIn('transaction', ['new_business', 'renewal']).first();
      if (earned) await trx('commissions').insert({ broker_id: policy.broker_id, policy_id: policy.id, endorsement_id: endorsementId, transaction: 'wage_declaration', base_amount: premiumDelta, rate: earned.rate, amount: round(premiumDelta * Number(earned.rate), dec), status: premiumDelta > 0 ? 'earned' : 'clawback' });
    }
    await audit(trx, { userId: user.id, action: 'wc.declaration', entity: 'policy', entityId: policy.id, data: result });
    return { ...result, endorsementNo };
  });
}

router.post('/:id/declaration/preview', asyncHandler(async (req, res) => {
  res.json(await declare(await loadWc(req), req.body, req.user, false));
}));

router.post('/:id/declaration', asyncHandler(async (req, res) => {
  res.status(201).json(await declare(await loadWc(req), req.body, req.user, true));
}));

module.exports = router;
