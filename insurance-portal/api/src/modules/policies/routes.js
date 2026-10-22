const express = require('express');
const { effectiveConfig } = require('../../lib/productConfig');
const { db } = require('../../db');
const service = require('./service');
const catalog = require('../../lib/catalog');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { assertPolicyAccess } = require('../../lib/access');
const { render } = require('../documents/render');
const { renderMarine } = require('../documents/marine');
const { renderWc } = require('../documents/wc');
const { renderEngineering } = require('../documents/engineering');
const { badRequest } = require('../../lib/errors');

const router = express.Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const q = db('policies').join('customers', 'customers.id', 'policies.customer_id')
    .select('policies.*', 'customers.company_name').orderBy('policies.created_at', 'desc').limit(200);
  if (req.user.role === 'customer') q.where('policies.customer_id', req.user.customerId || -1);
  else if (req.user.isBroker) q.where('policies.broker_id', req.user.brokerId);
  else if (!req.user.isStaff) q.whereRaw('1 = 0');
  if (req.query.status) q.andWhere('policies.status', String(req.query.status));
  const rows = await q;
  res.json({
    policies: rows.map((p) => ({
      id: p.id, policyNo: p.policy_no, productCode: p.product_code, status: p.status, insured: p.company_name,
      inceptionDate: p.inception_date, expiryDate: p.expiry_date, currency: p.currency, sumInsured: p.sum_insured, total: p.total, channel: p.channel,
      productType: p.risk_data?.productType || null,
    })),
  });
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const policy = await service.getPolicy(Number(req.params.id));
  assertPolicyAccess(req.user, policy);
  res.json({ policy: await service.policyView(policy) });
}));

router.post('/:id/cancel', requireRole('customer', 'broker_admin', 'broker_user', 'ops', 'uw_manager'), asyncHandler(async (req, res) => {
  const policy = await service.getPolicy(Number(req.params.id));
  assertPolicyAccess(req.user, policy);
  res.json(await service.cancelPolicy(policy, req.body, req.user));
}));

router.post('/:id/endorsements', requireRole('customer', 'broker_admin', 'broker_user', 'ops'), asyncHandler(async (req, res) => {
  const policy = await service.getPolicy(Number(req.params.id));
  assertPolicyAccess(req.user, policy);
  const result = await service.endorsePolicy(policy, req.body, req.user);
  res.status(result.status === 'referred' ? 202 : 201).json(result);
}));

router.post('/:id/endorsements/preview', requireRole('customer', 'broker_admin', 'broker_user', 'ops'), asyncHandler(async (req, res) => {
  const policy = await service.getPolicy(Number(req.params.id));
  assertPolicyAccess(req.user, policy);
  if (policy.status !== 'active') throw badRequest('POLICY_NOT_ACTIVE');
  const catalogProduct = await catalog.getProduct(policy.product_code);
  const p = await service.previewChange(policy, service.changePatch(catalogProduct.line, req.body));
  res.json({
    premiumDelta: p.premiumDelta, taxDelta: p.taxDelta, totalDelta: p.totalDelta, newSumInsured: p.newSumInsured, currency: p.currency,
    referralRequired: p.referral.required, reasons: p.referral.reasons, policyVersion: policy.version,
  });
}));

router.post('/:id/endorsement-requests/:requestId/accept', requireRole('customer', 'broker_admin', 'broker_user'), asyncHandler(async (req, res) => {
  const policy = await service.getPolicy(Number(req.params.id));
  assertPolicyAccess(req.user, policy);
  res.status(201).json(await service.acceptEndorsementRequest(policy, Number(req.params.requestId), req.body, req.user));
}));

/** Customer or broker reply on a policy-change referral; reopens an information request. */
router.post('/:id/endorsement-requests/:requestId/messages', requireRole('customer', 'broker_admin', 'broker_user'), asyncHandler(async (req, res) => {
  const policy = await service.getPolicy(Number(req.params.id));
  assertPolicyAccess(req.user, policy);
  const body = String(req.body?.body || '').trim().slice(0, 4000);
  if (!body) throw badRequest('MESSAGE_REQUIRED');
  const referral = await db('referrals').join('endorsement_requests as e', 'e.id', 'referrals.endorsement_request_id')
    .where({ 'e.id': Number(req.params.requestId), 'e.policy_id': policy.id }).select('referrals.*').first();
  if (!referral || ['approved', 'declined'].includes(referral.status)) throw badRequest('REFERRAL_CLOSED');
  await db.transaction(async (trx) => {
    await trx('referral_messages').insert({ referral_id: referral.id, author_id: req.user.id, body });
    if (referral.status === 'info_requested') {
      await trx('referrals').where({ id: referral.id }).update({ status: 'open' });
      await trx('endorsement_requests').where({ id: referral.endorsement_request_id }).update({ status: 'referred' });
    }
  });
  res.status(201).json({ ok: true });
}));

router.post('/:id/invoices/:invoiceId/pay', requireRole('customer', 'broker_admin', 'broker_user'), asyncHandler(async (req, res) => {
  const policy = await service.getPolicy(Number(req.params.id));
  assertPolicyAccess(req.user, policy);
  res.json(await service.payInvoice(policy, Number(req.params.invoiceId), req.body, req.user));
}));

const DOC_TYPES = ['schedule', 'certificate', 'invoice', 'annex'];

router.get('/:id/documents/:type', requireAuth, asyncHandler(async (req, res) => {
  if (!DOC_TYPES.includes(req.params.type)) throw badRequest('DOCUMENT_TYPE_UNKNOWN');
  const policy = await service.getPolicy(Number(req.params.id));
  assertPolicyAccess(req.user, policy);
  const lang = req.query.lang === 'ar' ? 'ar' : 'en';
  const baseProduct = await catalog.getProduct(policy.product_code);
  const product = { ...baseProduct, config: await effectiveConfig(baseProduct) };
  const country = await catalog.getCountry(policy.country_code);
  const { tables } = await catalog.getRateTables(policy.product_code, policy.country_code);
  if (product.line === 'engineering') {
    return res.type('html').send(await renderEngineering({ type: req.params.type === 'annex' ? 'schedule' : req.params.type, lang, policy, product, country, tables }));
  }
  if (product.line === 'wc') {
    if (req.params.type === 'annex' && policy.risk_data.policyType !== 'named') throw badRequest('ANNEX_NAMED_ONLY');
    return res.type('html').send(await renderWc({ type: req.params.type, lang, policy, product, country, tables }));
  }
  if (product.line === 'marine') {
    return res.type('html').send(await renderMarine({ type: req.params.type, lang, policy, product, country, tables, copy: req.query.copy === 'duplicate' ? 'duplicate' : 'original' }));
  }
  const occ = (tables.occupancies || []).find((o) => o.code === policy.risk_data.occupancy);
  const html = await render({ type: req.params.type, lang, policy, product, country, occupancyName: occ ? (occ.name[lang] || occ.name.en) : policy.risk_data.occupancy });
  return res.type('html').send(html);
}));

module.exports = router;
