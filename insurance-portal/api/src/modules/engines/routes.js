/**
 * Rule engine and rating engine administration (/api/engines).
 * Drafts are edited, tested on the bench, submitted with passing tests, and approved by a
 * different person; approval publishes the version and supersedes the previous one.
 */
const express = require('express');
const { z } = require('zod');
const { db, json } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth, requirePermission } = require('../../middleware/auth');
const { audit } = require('../../lib/audit');
const ruleEngine = require('../../lib/ruleEngine');
const ratingEngine = require('../../lib/ratingEngine');
const expr = require('../../lib/expr');
const catalog = require('../../lib/catalog');
const quotes = require('../quotes/service');
const { badRequest, conflict, forbidden, notFound } = require('../../lib/errors');

const router = express.Router();
router.use(requireAuth);

const view = (s) => ({ id: s.id, productCode: s.product_code, countryCode: s.country_code, purpose: s.purpose, code: s.code, name: s.name, version: s.version, status: s.status, notes: s.notes, createdBy: s.created_by, approvedBy: s.approved_by, publishedAt: s.published_at, updatedAt: s.updated_at });

async function loadSet(id, { draft = false } = {}) {
  const set = await db('rule_sets').where({ id }).first();
  if (!set) throw notFound('RULE_SET_NOT_FOUND');
  if (draft && set.status !== 'draft') throw conflict('NOT_A_DRAFT', 'Only drafts can be changed; copy the set to make a new version');
  return set;
}

function checkCondition(c) {
  try { ruleEngine.checkCondition(c); } catch (e) { throw badRequest('CONDITION_INVALID', e.message); }
}

/* ---------------- rule sets ---------------- */
const canEditRules = requirePermission('admin.rules');

router.get('/rule-sets', canEditRules, asyncHandler(async (req, res) => {
  const q = db('rule_sets').orderBy([{ column: 'product_code' }, { column: 'code' }, { column: 'version', order: 'desc' }]);
  if (req.query.product) q.where({ product_code: String(req.query.product) });
  if (req.query.status) q.whereIn('status', String(req.query.status).split(','));
  const sets = await q;
  const counts = await db('rules').select('rule_set_id').count({ n: '*' }).groupBy('rule_set_id');
  const tcounts = await db('decision_tables').select('rule_set_id').count({ n: '*' }).groupBy('rule_set_id');
  const n = (list, id) => Number(list.find((c) => c.rule_set_id === id)?.n || 0);
  res.json({ sets: sets.map((s) => ({ ...view(s), rules: n(counts, s.id), tables: n(tcounts, s.id) })) });
}));

router.get('/rule-sets/:id', canEditRules, asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id));
  const { rules, tables } = await ruleEngine.contentOf(set.id);
  const tests = await db('rule_tests').where({ rule_set_id: set.id }).orderBy('id');
  res.json({ set: view(set), rules, tables, tests });
}));

router.post('/rule-sets', canEditRules, asyncHandler(async (req, res) => {
  const b = z.object({ productCode: z.string().min(2), countryCode: z.string().length(2).nullable().optional(), purpose: z.enum(['underwriting', 'eligibility', 'validation', 'pricing']).default('underwriting'), code: z.string().regex(/^[A-Z0-9_-]{2,40}$/), name: z.string().min(2).max(160) }).parse(req.body);
  await catalog.getProduct(b.productCode);
  const latest = await db('rule_sets').where({ product_code: b.productCode, code: b.code }).max({ v: 'version' }).first();
  if (latest.v) throw conflict('RULE_SET_EXISTS', 'A set with this code exists; copy it to make a new version');
  const [id] = await db('rule_sets').insert({ product_code: b.productCode, country_code: b.countryCode || null, purpose: b.purpose, code: b.code, name: b.name, version: 1, status: 'draft', created_by: req.user.id });
  await audit(db, { userId: req.user.id, action: 'rules.create', entity: 'rule_set', entityId: id, data: b });
  res.status(201).json({ set: view(await loadSet(id)) });
}));

router.post('/rule-sets/:id/copy', canEditRules, asyncHandler(async (req, res) => {
  const src = await loadSet(Number(req.params.id));
  const open = await db('rule_sets').where({ product_code: src.product_code, code: src.code }).whereIn('status', ['draft', 'pending']).first();
  if (open) throw conflict('DRAFT_EXISTS', 'Finish the open draft first', { id: open.id });
  const latest = await db('rule_sets').where({ product_code: src.product_code, code: src.code }).max({ v: 'version' }).first();
  const id = await db.transaction(async (trx) => {
    const [newId] = await trx('rule_sets').insert({ product_code: src.product_code, country_code: src.country_code, purpose: src.purpose, code: src.code, name: src.name, version: Number(latest.v) + 1, status: 'draft', notes: `Copied from v${src.version}`, created_by: req.user.id });
    const { rules, tables } = await ruleEngine.contentOf(src.id, trx);
    const tests = await trx('rule_tests').where({ rule_set_id: src.id });
    const strip = ({ id: _i, rule_set_id: _r, ...rest }) => rest;
    if (rules.length) await trx('rules').insert(rules.map((r) => ({ ...strip(r), rule_set_id: newId, condition: json(r.condition), params: json(r.params) })));
    if (tables.length) await trx('decision_tables').insert(tables.map((t) => ({ ...strip(t), rule_set_id: newId, inputs: json(t.inputs), rows: json(t.rows) })));
    if (tests.length) await trx('rule_tests').insert(tests.map((t) => ({ ...strip(t), rule_set_id: newId, facts: json(t.facts), expected: json(t.expected) })));
    return newId;
  });
  await audit(db, { userId: req.user.id, action: 'rules.copy', entity: 'rule_set', entityId: id, data: { from: src.id } });
  res.status(201).json({ set: view(await loadSet(id)) });
}));

router.put('/rule-sets/:id', canEditRules, asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id), { draft: true });
  const b = z.object({ name: z.string().min(2).max(160).optional(), notes: z.string().max(500).optional() }).parse(req.body);
  await db('rule_sets').where({ id: set.id }).update({ ...b, updated_at: db.fn.now() });
  res.json({ ok: true });
}));

const ruleSchema = z.object({
  code: z.string().min(2).max(30), nameEn: z.string().min(2).max(300), nameAr: z.string().min(2).max(300),
  condition: z.union([z.string().min(1).max(2000), z.record(z.any())]),
  action: z.enum(['refer', 'decline', 'message', 'set']), params: z.record(z.any()).default({}),
  priority: z.number().int().min(0).max(10000).default(100), stop: z.boolean().default(false), active: z.boolean().default(true),
});

function ruleRow(b) {
  checkCondition(b.condition);
  if (b.action === 'set') {
    if (!b.params.name) throw badRequest('SET_NEEDS_NAME', 'A "set" action needs params.name');
    if (b.params.expr) { try { expr.check(String(b.params.expr)); } catch (e) { throw badRequest('CONDITION_INVALID', e.message); } }
  }
  return { code: b.code, name_en: b.nameEn, name_ar: b.nameAr, condition: json(b.condition), action: b.action, params: json(b.params), priority: b.priority, stop: b.stop, active: b.active };
}

router.post('/rule-sets/:id/rules', canEditRules, asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id), { draft: true });
  const [id] = await db('rules').insert({ ...ruleRow(ruleSchema.parse(req.body)), rule_set_id: set.id });
  await audit(db, { userId: req.user.id, action: 'rules.rule.create', entity: 'rule_set', entityId: set.id, data: { ruleId: id } });
  res.status(201).json({ id });
}));

router.put('/rules/:ruleId', canEditRules, asyncHandler(async (req, res) => {
  const rule = await db('rules').where({ id: Number(req.params.ruleId) }).first();
  if (!rule) throw notFound('RULE_NOT_FOUND');
  await loadSet(rule.rule_set_id, { draft: true });
  await db('rules').where({ id: rule.id }).update(ruleRow(ruleSchema.parse(req.body)));
  await audit(db, { userId: req.user.id, action: 'rules.rule.update', entity: 'rule_set', entityId: rule.rule_set_id, data: { ruleId: rule.id } });
  res.json({ ok: true });
}));

router.delete('/rules/:ruleId', canEditRules, asyncHandler(async (req, res) => {
  const rule = await db('rules').where({ id: Number(req.params.ruleId) }).first();
  if (!rule) throw notFound('RULE_NOT_FOUND');
  await loadSet(rule.rule_set_id, { draft: true });
  await db('rules').where({ id: rule.id }).del();
  res.json({ ok: true });
}));

const tableSchema = z.object({
  code: z.string().min(2).max(30), name: z.string().min(2).max(200), hitPolicy: z.enum(['first', 'collect']).default('first'), priority: z.number().int().default(200), active: z.boolean().default(true),
  inputs: z.array(z.object({ name: z.string().min(1).max(80), expr: z.string().min(1).max(500) })).min(1).max(12),
  rows: z.array(z.object({ label: z.string().max(60).optional(), when: z.array(z.string().max(300)), then: z.record(z.any()) })).min(1).max(500),
});

function tableRow(b) {
  for (const i of b.inputs) { try { expr.check(i.expr); } catch (e) { throw badRequest('CONDITION_INVALID', `${i.name}: ${e.message}`); } }
  b.rows.forEach((r, n) => {
    if (r.when.length !== b.inputs.length) throw badRequest('ROW_SHAPE', `Row ${n + 1} needs ${b.inputs.length} cells`);
    if (!['refer', 'decline', 'message', 'set'].includes(r.then.action)) throw badRequest('ROW_ACTION', `Row ${n + 1}: action must be refer, decline, message or set`);
    r.when.forEach((c) => { try { ruleEngine.cellMatches(c, null); } catch (e) { throw badRequest('CONDITION_INVALID', `Row ${n + 1} cell "${c}": ${e.message}`); } });
  });
  return { code: b.code, name: b.name, hit_policy: b.hitPolicy, priority: b.priority, active: b.active, inputs: json(b.inputs), rows: json(b.rows) };
}

router.post('/rule-sets/:id/tables', canEditRules, asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id), { draft: true });
  const [id] = await db('decision_tables').insert({ ...tableRow(tableSchema.parse(req.body)), rule_set_id: set.id });
  res.status(201).json({ id });
}));

router.put('/tables/:tableId', canEditRules, asyncHandler(async (req, res) => {
  const t = await db('decision_tables').where({ id: Number(req.params.tableId) }).first();
  if (!t) throw notFound('TABLE_NOT_FOUND');
  await loadSet(t.rule_set_id, { draft: true });
  await db('decision_tables').where({ id: t.id }).update(tableRow(tableSchema.parse(req.body)));
  res.json({ ok: true });
}));

router.delete('/tables/:tableId', canEditRules, asyncHandler(async (req, res) => {
  const t = await db('decision_tables').where({ id: Number(req.params.tableId) }).first();
  if (!t) throw notFound('TABLE_NOT_FOUND');
  await loadSet(t.rule_set_id, { draft: true });
  await db('decision_tables').where({ id: t.id }).del();
  res.json({ ok: true });
}));

router.post('/rule-sets/:id/tests', canEditRules, asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id), { draft: true });
  const b = z.object({ name: z.string().min(2).max(200), facts: z.record(z.any()), expected: z.object({ refer: z.array(z.string()).optional(), decline: z.array(z.string()).optional(), values: z.record(z.any()).optional() }) }).parse(req.body);
  const [id] = await db('rule_tests').insert({ rule_set_id: set.id, name: b.name, facts: json(b.facts), expected: json(b.expected) });
  res.status(201).json({ id });
}));

router.delete('/tests/:testId', canEditRules, asyncHandler(async (req, res) => {
  const t = await db('rule_tests').where({ id: Number(req.params.testId) }).first();
  if (!t) throw notFound('TEST_NOT_FOUND');
  await loadSet(t.rule_set_id, { draft: true });
  await db('rule_tests').where({ id: t.id }).del();
  res.json({ ok: true });
}));

async function evaluateSet(set, facts) {
  const { rules, tables } = await ruleEngine.contentOf(set.id);
  return ruleEngine.runSet(set, rules, tables, facts);
}

router.post('/rule-sets/:id/evaluate', canEditRules, asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id));
  try {
    res.json({ result: await evaluateSet(set, z.record(z.any()).parse(req.body?.facts || {})) });
  } catch (e) {
    throw badRequest('EVALUATION_FAILED', e.message);
  }
}));

async function runTests(set) {
  const tests = await db('rule_tests').where({ rule_set_id: set.id }).orderBy('id');
  const sameCodes = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
  const results = [];
  for (const t of tests) {
    let r;
    let error = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      r = await evaluateSet(set, t.facts);
    } catch (e) { error = e.message; }
    const e = t.expected;
    const pass = !error
      && (e.refer === undefined || sameCodes(r.refer.map((x) => x.code), e.refer))
      && (e.decline === undefined || sameCodes(r.decline.map((x) => x.code), e.decline))
      && (e.values === undefined || Object.entries(e.values).every(([k, v]) => JSON.stringify(r.values[k]) === JSON.stringify(v)));
    results.push({ id: t.id, name: t.name, pass, error, got: r ? { refer: r.refer.map((x) => x.code), decline: r.decline.map((x) => x.code), values: r.values } : null, expected: e });
  }
  return { total: results.length, passed: results.filter((x) => x.pass).length, results };
}

router.post('/rule-sets/:id/run-tests', canEditRules, asyncHandler(async (req, res) => {
  res.json(await runTests(await loadSet(Number(req.params.id))));
}));

router.post('/rule-sets/:id/submit', canEditRules, asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id), { draft: true });
  const t = await runTests(set);
  if (t.passed !== t.total) throw conflict('TESTS_FAILING', `${t.total - t.passed} of ${t.total} tests fail`, t.results.filter((x) => !x.pass));
  await db('rule_sets').where({ id: set.id }).update({ status: 'pending', submitted_by: req.user.id, updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'rules.submit', entity: 'rule_set', entityId: set.id, data: { tests: t.total } });
  res.json({ ok: true, tests: t });
}));

router.post('/rule-sets/:id/approve', requirePermission('engines.approve'), asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id));
  if (set.status !== 'pending') throw conflict('NOT_PENDING');
  if ([set.created_by, set.submitted_by].includes(req.user.id)) throw forbidden('MAKER_CANNOT_APPROVE', 'A different person must approve this change');
  await db.transaction(async (trx) => {
    await trx('rule_sets').where({ product_code: set.product_code, code: set.code, status: 'published' }).update({ status: 'superseded', updated_at: trx.fn.now() });
    await trx('rule_sets').where({ id: set.id }).update({ status: 'published', approved_by: req.user.id, published_at: new Date(), updated_at: trx.fn.now() });
  });
  await audit(db, { userId: req.user.id, action: 'rules.approve', entity: 'rule_set', entityId: set.id });
  res.json({ ok: true });
}));

router.post('/rule-sets/:id/reject', requirePermission('engines.approve'), asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id));
  if (set.status !== 'pending') throw conflict('NOT_PENDING');
  await db('rule_sets').where({ id: set.id }).update({ status: 'draft', notes: String(req.body?.reason || set.notes || '').slice(0, 500), updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'rules.reject', entity: 'rule_set', entityId: set.id });
  res.json({ ok: true });
}));

router.post('/rule-sets/:id/retire', requirePermission('engines.approve'), asyncHandler(async (req, res) => {
  const set = await loadSet(Number(req.params.id));
  if (set.status !== 'published') throw conflict('NOT_PUBLISHED');
  await db('rule_sets').where({ id: set.id }).update({ status: 'superseded', updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'rules.retire', entity: 'rule_set', entityId: set.id });
  res.json({ ok: true });
}));

/* ---------------- rating models ---------------- */
const canEditModels = requirePermission('admin.rating');
const modelView = (m, full) => ({ id: m.id, productCode: m.product_code, countryCode: m.country_code, version: m.version, status: m.status, notes: m.notes, createdBy: m.created_by, approvedBy: m.approved_by, publishedAt: m.published_at, updatedAt: m.updated_at, ...(full ? { model: m.model } : { steps: m.model?.steps?.length || 0 }) });

async function loadModel(id, { draft = false } = {}) {
  const m = await db('rating_models').where({ id }).first();
  if (!m) throw notFound('MODEL_NOT_FOUND');
  if (draft && m.status !== 'draft') throw conflict('NOT_A_DRAFT', 'Only drafts can be changed; copy the model to make a new version');
  return m;
}

router.get('/rating-models', canEditModels, asyncHandler(async (req, res) => {
  const q = db('rating_models').orderBy([{ column: 'product_code' }, { column: 'version', order: 'desc' }]);
  if (req.query.product) q.where({ product_code: String(req.query.product) });
  const products = await db('products').select('code', 'rater');
  res.json({ models: (await q).map((m) => modelView(m)), products: products.map((p) => ({ code: p.code, engine: p.rater === 'dynamic' ? 'dynamic' : `coded:${p.rater}` })), functions: { eager: expr.BUILTINS, lazy: expr.LAZY } });
}));

router.get('/rating-models/:id', canEditModels, asyncHandler(async (req, res) => {
  res.json({ model: modelView(await loadModel(Number(req.params.id)), true) });
}));

router.post('/rating-models/:id/copy', canEditModels, asyncHandler(async (req, res) => {
  const src = await loadModel(Number(req.params.id));
  const open = await db('rating_models').where({ product_code: src.product_code }).whereIn('status', ['draft', 'pending']).first();
  if (open) throw conflict('DRAFT_EXISTS', 'Finish the open draft first', { id: open.id });
  const latest = await db('rating_models').where({ product_code: src.product_code }).max({ v: 'version' }).first();
  const [id] = await db('rating_models').insert({ product_code: src.product_code, country_code: src.country_code, version: Number(latest.v) + 1, status: 'draft', model: json(src.model), notes: `Copied from v${src.version}`, created_by: req.user.id });
  await audit(db, { userId: req.user.id, action: 'rating.copy', entity: 'rating_model', entityId: id, data: { from: src.id } });
  res.status(201).json({ model: modelView(await loadModel(id), true) });
}));

router.put('/rating-models/:id', canEditModels, asyncHandler(async (req, res) => {
  const m = await loadModel(Number(req.params.id), { draft: true });
  const b = z.object({ model: z.record(z.any()), notes: z.string().max(500).optional() }).parse(req.body);
  const problems = ratingEngine.validate(b.model);
  if (problems.length) throw badRequest('MODEL_INVALID', problems[0], problems);
  await db('rating_models').where({ id: m.id }).update({ model: json(b.model), notes: b.notes ?? m.notes, updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'rating.edit', entity: 'rating_model', entityId: m.id });
  res.json({ ok: true });
}));

/** Test bench: prices a sample risk on this model and on the published one, side by side. */
router.post('/rating-models/:id/test', canEditModels, asyncHandler(async (req, res) => {
  const m = await loadModel(Number(req.params.id));
  const b = z.object({ risk: z.record(z.any()), channel: z.enum(['b2c', 'b2b']).default('b2c') }).parse(req.body);
  const quote = { product_code: m.product_code, country_code: m.country_code || 'AE', channel: b.channel, broker_id: null };
  const price = async (modelOverride) => {
    try {
      const risk = await quotes.normaliseRisk(quote, b.risk);
      const r = await quotes.priceRisk({ quote, risk, modelOverride });
      return { quotable: r.quotable, notQuotableReason: r.notQuotableReason, sumInsured: r.sumInsured, breakdown: r.breakdown, referral: r.referral, facts: r.facts };
    } catch (e) { return { error: e.code || 'ERROR', message: e.message, details: e.details }; }
  };
  const product = await catalog.getProduct(m.product_code);
  res.json({ candidate: await price(m.model), live: product.rater === 'dynamic' || m.status === 'published' ? await price(null) : { error: 'NO_LIVE_MODEL' } });
}));

router.post('/rating-models/:id/submit', canEditModels, asyncHandler(async (req, res) => {
  const m = await loadModel(Number(req.params.id), { draft: true });
  const problems = ratingEngine.validate(m.model);
  if (problems.length) throw badRequest('MODEL_INVALID', problems[0], problems);
  await db('rating_models').where({ id: m.id }).update({ status: 'pending', submitted_by: req.user.id, updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'rating.submit', entity: 'rating_model', entityId: m.id });
  res.json({ ok: true });
}));

router.post('/rating-models/:id/approve', requirePermission('engines.approve'), asyncHandler(async (req, res) => {
  const m = await loadModel(Number(req.params.id));
  if (m.status !== 'pending') throw conflict('NOT_PENDING');
  if ([m.created_by, m.submitted_by].includes(req.user.id)) throw forbidden('MAKER_CANNOT_APPROVE', 'A different person must approve this change');
  await db.transaction(async (trx) => {
    await trx('rating_models').where({ product_code: m.product_code, status: 'published' }).andWhere((q) => (m.country_code ? q.where({ country_code: m.country_code }) : q.whereNull('country_code'))).update({ status: 'superseded', updated_at: trx.fn.now() });
    await trx('rating_models').where({ id: m.id }).update({ status: 'published', approved_by: req.user.id, published_at: new Date(), updated_at: trx.fn.now() });
    await trx('products').where({ code: m.product_code }).update({ rater: 'dynamic' });
  });
  await audit(db, { userId: req.user.id, action: 'rating.approve', entity: 'rating_model', entityId: m.id });
  res.json({ ok: true });
}));

router.post('/rating-models/:id/reject', requirePermission('engines.approve'), asyncHandler(async (req, res) => {
  const m = await loadModel(Number(req.params.id));
  if (m.status !== 'pending') throw conflict('NOT_PENDING');
  await db('rating_models').where({ id: m.id }).update({ status: 'draft', notes: String(req.body?.reason || m.notes || '').slice(0, 500), updated_at: db.fn.now() });
  res.json({ ok: true });
}));

module.exports = router;
