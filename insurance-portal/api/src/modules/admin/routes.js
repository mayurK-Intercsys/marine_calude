const express = require('express');
const { z } = require('zod');
const { db, json } = require('../../db');
const quotes = require('../quotes/service');
const { asyncHandler } = require('../../middleware/errors');
const { requireRole } = require('../../middleware/auth');
const { audit } = require('../../lib/audit');
const { conflict, forbidden, notFound } = require('../../lib/errors');
const { nowSeconds } = require('../../lib/dates');

const router = express.Router();

async function loadTable(id) {
  const row = await db('rate_tables').where({ id }).first();
  if (!row) throw notFound('RATE_TABLE_NOT_FOUND');
  return row;
}

const view = (r) => ({ id: r.id, productCode: r.product_code, countryCode: r.country_code, key: r.table_key, version: r.version, status: r.status, data: r.data, effectiveFrom: r.effective_from, createdBy: r.created_by, approvedBy: r.approved_by, approvedAt: r.approved_at, changeNote: r.change_note, updatedAt: r.updated_at });

/** Rate tables with maker-checker (CFG-06, CFG-14): draft -> pending -> approved by a different person. */
router.get('/rate-tables', requireRole('config_admin', 'uw_manager', 'underwriter'), asyncHandler(async (req, res) => {
  const product = String(req.query.product || 'FIRE');
  const country = String(req.query.country || 'AE');
  const rows = await db('rate_tables').where({ product_code: product, country_code: country }).orderBy([{ column: 'table_key' }, { column: 'version', order: 'desc' }]);
  res.json({ tables: rows.map(view) });
}));

router.get('/rate-tables/:id', requireRole('config_admin', 'uw_manager', 'underwriter'), asyncHandler(async (req, res) => {
  res.json({ table: view(await loadTable(Number(req.params.id))) });
}));

router.post('/rate-tables/:id/drafts', requireRole('config_admin'), asyncHandler(async (req, res) => {
  const source = await loadTable(Number(req.params.id));
  const open = await db('rate_tables').where({ product_code: source.product_code, country_code: source.country_code, table_key: source.table_key }).whereIn('status', ['draft', 'pending']).first();
  if (open) throw conflict('DRAFT_EXISTS', 'Finish or reject the existing draft first', { id: open.id });
  const max = await db('rate_tables').where({ product_code: source.product_code, country_code: source.country_code, table_key: source.table_key }).max({ v: 'version' }).first();
  const [id] = await db('rate_tables').insert({ product_code: source.product_code, country_code: source.country_code, table_key: source.table_key, version: Number(max.v) + 1, status: 'draft', data: json(source.data), created_by: req.user.id });
  await audit(db, { userId: req.user.id, action: 'rates.draft', entity: 'rate_table', entityId: id, data: { from: source.id } });
  res.status(201).json({ table: view(await loadTable(id)) });
}));

router.put('/rate-tables/:id', requireRole('config_admin'), asyncHandler(async (req, res) => {
  const row = await loadTable(Number(req.params.id));
  if (row.status !== 'draft') throw conflict('NOT_A_DRAFT');
  const { data, changeNote, effectiveFrom } = z.object({ data: z.any(), changeNote: z.string().max(400).optional(), effectiveFrom: z.string().optional() }).parse(req.body);
  if (data == null || typeof data !== 'object') throw conflict('INVALID_TABLE_DATA');
  await db('rate_tables').where({ id: row.id }).update({ data: json(data), change_note: changeNote ?? row.change_note, effective_from: effectiveFrom ? new Date(effectiveFrom) : null, updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'rates.edit', entity: 'rate_table', entityId: row.id, data: { before: row.data, after: data } });
  res.json({ table: view(await loadTable(row.id)) });
}));

/** Sandbox: price a sample risk against this draft before it goes live. */
router.post('/rate-tables/:id/test', requireRole('config_admin', 'uw_manager'), asyncHandler(async (req, res) => {
  const row = await loadTable(Number(req.params.id));
  const fakeQuote = { product_code: row.product_code, country_code: row.country_code, channel: 'b2c', broker_id: null };
  const risk = req.body?.risk;
  const [draft, live] = await Promise.all([
    quotes.priceRisk({ quote: fakeQuote, risk, tableOverrides: { [row.table_key]: row.data } }),
    quotes.priceRisk({ quote: fakeQuote, risk }),
  ]);
  res.json({ draft: { breakdown: draft.breakdown, referral: draft.referral }, live: { breakdown: live.breakdown, referral: live.referral } });
}));

router.post('/rate-tables/:id/submit', requireRole('config_admin'), asyncHandler(async (req, res) => {
  const row = await loadTable(Number(req.params.id));
  if (row.status !== 'draft') throw conflict('NOT_A_DRAFT');
  await db('rate_tables').where({ id: row.id }).update({ status: 'pending', submitted_by: req.user.id, updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'rates.submit', entity: 'rate_table', entityId: row.id });
  res.json({ table: view(await loadTable(row.id)) });
}));

router.post('/rate-tables/:id/approve', requireRole('config_admin', 'uw_manager'), asyncHandler(async (req, res) => {
  const row = await loadTable(Number(req.params.id));
  if (row.status !== 'pending') throw conflict('NOT_PENDING');
  if (row.created_by === req.user.id || row.submitted_by === req.user.id) throw forbidden('MAKER_CANNOT_APPROVE', 'A different person must approve this change');
  await db.transaction(async (trx) => {
    await trx('rate_tables').where({ product_code: row.product_code, country_code: row.country_code, table_key: row.table_key, status: 'approved' }).update({ status: 'superseded' });
    await trx('rate_tables').where({ id: row.id }).update({ status: 'approved', approved_by: req.user.id, approved_at: nowSeconds(), effective_from: row.effective_from || nowSeconds(), updated_at: trx.fn.now() });
    await audit(trx, { userId: req.user.id, action: 'rates.approve', entity: 'rate_table', entityId: row.id });
  });
  res.json({ table: view(await loadTable(row.id)) });
}));

router.post('/rate-tables/:id/reject', requireRole('config_admin', 'uw_manager'), asyncHandler(async (req, res) => {
  const row = await loadTable(Number(req.params.id));
  if (row.status !== 'pending') throw conflict('NOT_PENDING');
  await db('rate_tables').where({ id: row.id }).update({ status: 'rejected', change_note: String(req.body?.reason || row.change_note || '').slice(0, 400), updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'rates.reject', entity: 'rate_table', entityId: row.id });
  res.json({ table: view(await loadTable(row.id)) });
}));

router.get('/audit', requireRole('config_admin', 'uw_manager', 'ops'), asyncHandler(async (req, res) => {
  const q = db('audit_log').leftJoin('users', 'users.id', 'audit_log.user_id').orderBy('audit_log.id', 'desc').limit(200).select('audit_log.*', 'users.full_name');
  if (req.query.entity) q.where('audit_log.entity', String(req.query.entity));
  if (req.query.entityId) q.where('audit_log.entity_id', String(req.query.entityId));
  res.json({ entries: (await q).map((a) => ({ id: a.id, at: a.created_at, user: a.full_name, action: a.action, entity: a.entity, entityId: a.entity_id, data: a.data })) });
}));

/** Bank transfers waiting for funds (operations screen). */
router.get('/payments', requireRole('ops', 'uw_manager'), asyncHandler(async (req, res) => {
  const status = String(req.query.status || 'pending');
  const rows = await db('payments as p').leftJoin('quotes as q', 'q.id', 'p.quote_id').leftJoin('brokers as b', 'b.id', 'q.broker_id')
    .where('p.method', 'bank_transfer').andWhere('p.status', status).orderBy('p.created_at')
    .select('p.*', 'q.ref', 'q.status as quote_status', 'q.proposer', 'q.channel', 'b.name as broker');
  res.json({
    payments: rows.map((r) => ({
      id: r.id, quoteRef: r.ref, quoteStatus: r.quote_status, insured: r.proposer?.companyName || null, channel: r.channel, broker: r.broker,
      amount: r.amount, currency: r.currency, status: r.status, createdAt: r.created_at, policyId: r.policy_id, reference: r.provider_ref, reason: r.failure_reason,
    })),
  });
}));

router.post('/payments/:id/reject', requireRole('ops'), asyncHandler(async (req, res) => {
  const payment = await db('payments').where({ id: Number(req.params.id) }).first();
  if (!payment || payment.status !== 'pending') throw conflict('PAYMENT_NOT_PENDING');
  const reason = String(req.body?.reason || 'Funds not received').slice(0, 200);
  await db('payments').where({ id: payment.id }).update({ status: 'rejected', failure_reason: reason });
  await audit(db, { userId: req.user.id, action: 'payment.reject', entity: 'payment', entityId: payment.id, data: { reason } });
  res.json({ ok: true });
}));

/** Runs the daily jobs now (renewals, reminders, auto-renewal, expiry). Idempotent. */
router.post('/jobs/daily', requireRole('ops'), asyncHandler(async (req, res) => {
  const { runDaily } = require('../jobs/daily');
  res.json(await runDaily());
}));

/** Ops confirms a bank transfer; the policy is then issued (FR-ISS-01). */
router.post('/payments/:id/confirm', requireRole('ops'), asyncHandler(async (req, res) => {
  const policies = require('../policies/service');
  const payment = await db('payments').where({ id: Number(req.params.id) }).first();
  if (!payment || payment.status !== 'pending') throw conflict('PAYMENT_NOT_PENDING');
  const quote = await quotes.getQuote(payment.quote_id);
  if (!['quoted', 'approved'].includes(quote.status)) throw conflict('QUOTE_NOT_BINDABLE');
  const policy = await db.transaction(async (trx) => {
    await trx('payments').where({ id: payment.id }).update({ status: 'succeeded', provider_ref: String(req.body?.bankReference || 'BANK').slice(0, 80) });
    await audit(trx, { userId: req.user.id, action: 'payment.confirm', entity: 'payment', entityId: payment.id, data: { bankReference: req.body?.bankReference } });
    return policies.issueFromQuote(trx, { quote, paymentId: payment.id, user: req.user });
  });
  await policies.flushEvents(policy);
  res.json({ policyId: policy.id, policyNo: policy.policy_no });
}));

module.exports = router;
