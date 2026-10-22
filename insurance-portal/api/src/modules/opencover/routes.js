const express = require('express');
const { z } = require('zod');
const service = require('./service');
const catalog = require('../../lib/catalog');
const { db } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { assertPolicyAccess } = require('../../lib/access');
const { renderMarine } = require('../documents/marine');

const router = express.Router();

/** API clients authenticate with x-api-key and may only use the certificate endpoints of their own cover. */
const API_ALLOWED = [/^\/\d+\/certificates$/, /^\/\d+\/certificates\/(bulk|preview)$/, /^\/\d+\/certificates\/\d+\/document$/];
router.use(asyncHandler(async (req, res, next) => {
  if (!req.headers['x-api-key']) return next();
  const apiUser = await service.userForApiKey(req.headers['x-api-key']);
  if (!apiUser) return res.status(401).json({ error: { code: 'API_KEY_INVALID' } });
  if (!API_ALLOWED.some((r) => r.test(req.path))) return res.status(403).json({ error: { code: 'API_KEY_SCOPE' } });
  req.user = apiUser;
  return next();
}));
router.use(requireAuth);

async function load(req) {
  const policy = await service.getOpenCover(Number(req.params.id));
  assertPolicyAccess(req.user, policy);
  return policy;
}

router.get('/:id', asyncHandler(async (req, res) => {
  const policy = await load(req);
  res.json({ openCover: await service.summary(policy) });
}));

router.get('/:id/certificates', asyncHandler(async (req, res) => {
  const policy = await load(req);
  res.json({ certificates: await service.listCertificates(policy, { status: req.query.status ? String(req.query.status) : undefined, user: req.user }) });
}));

/** Prices a shipment against the cover without issuing (live price on the certificate form). */
router.post('/:id/certificates/preview', asyncHandler(async (req, res) => {
  const policy = await load(req);
  const p = await service.priceCertificate(policy, req.body?.shipment, { user: req.user });
  res.json({ sumInsured: p.result.sumInsured, sumInsuredCalc: p.result.sumInsuredCalc, clause: p.result.clause, breakdown: p.result.breakdown, referralRequired: p.reasons.length > 0, reasons: p.reasons, currency: policy.currency });
}));

router.post('/:id/certificates', asyncHandler(async (req, res) => {
  const policy = await load(req);
  const result = await service.issueCertificate(policy, req.body?.shipment, req.user, req.user.isApi ? 'api' : 'portal');
  res.status(result.status === 'issued' ? 201 : 202).json(result);
}));

router.post('/:id/certificates/bulk', asyncHandler(async (req, res) => {
  const policy = await load(req);
  res.json(await service.issueBulk(policy, req.body?.rows, req.user));
}));

router.post('/:id/certificates/:certId/cancel', asyncHandler(async (req, res) => {
  const policy = await load(req);
  res.json(await service.cancelCertificate(policy, Number(req.params.certId), req.user, String(req.body?.reason || '').slice(0, 300)));
}));

router.get('/:id/certificates/:certId/document', asyncHandler(async (req, res) => {
  const policy = await load(req);
  const cert = await db('oc_certificates').where({ id: Number(req.params.certId), policy_id: policy.id }).first();
  if (!cert || cert.status !== 'issued') return res.status(404).json({ error: { code: 'CERTIFICATE_NOT_FOUND' } });
  const [product, country] = await Promise.all([catalog.getProduct(policy.product_code), catalog.getCountry(policy.country_code)]);
  const { tables } = await catalog.getRateTables(policy.product_code, policy.country_code);
  const html = await renderMarine({ type: 'certificate', lang: req.query.lang === 'ar' ? 'ar' : 'en', policy, product, country, tables, certificate: cert });
  return res.type('html').send(html);
}));

router.get('/:id/api-keys', asyncHandler(async (req, res) => {
  const policy = await load(req);
  res.json({ keys: await service.listApiKeys(policy, req.user) });
}));

router.post('/:id/api-keys', asyncHandler(async (req, res) => {
  const policy = await load(req);
  const b = z.object({ label: z.string().min(2).max(120), certificateLimit: z.number().positive().nullable().optional() }).parse(req.body);
  res.status(201).json(await service.createApiKey(policy, b, req.user));
}));

router.post('/:id/api-keys/:keyId/revoke', asyncHandler(async (req, res) => {
  const policy = await load(req);
  res.json(await service.revokeApiKey(policy, Number(req.params.keyId), req.user));
}));

router.get('/:id/declarations', asyncHandler(async (req, res) => {
  const policy = await load(req);
  res.json({ declarations: await service.declarations(policy) });
}));

router.post('/:id/declarations', asyncHandler(async (req, res) => {
  const policy = await load(req);
  const body = z.object({ period: z.string(), extraShipments: z.array(z.object({ description: z.string().max(200), sumInsured: z.number().min(0) })).max(200).default([]) }).parse(req.body);
  res.status(201).json(await service.submitDeclaration(policy, body, req.user));
}));

router.post('/:id/adjustment', requireRole('ops', 'uw_manager', 'broker_admin', 'broker_user'), asyncHandler(async (req, res) => {
  const policy = await load(req);
  res.status(201).json(await service.adjustDeposit(policy, req.user));
}));

module.exports = router;
