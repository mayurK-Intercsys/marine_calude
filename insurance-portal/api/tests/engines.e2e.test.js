/**
 * Rule engine and rating engine administration: versioned rule sets with expression conditions,
 * decision tables and test cases; maker-checker publishing; rating models edited, tested against
 * the live model and published.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/db');

const app = createApp();
const fireRisk = (over = {}, loc = {}) => ({
  occupancy: 'SHOP_GROCERY',
  locations: [{ address: { building: 'Unit 3', area: 'Deira', city: 'Dubai' }, construction: 'concrete', buildingAge: 'lt10', protection: { alarm: true }, civilDefence: true, sumsInsured: { STK: 800000 }, ...loc }],
  ...over,
});
async function login(email) { const a = request.agent(app); await a.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200); return a; }
async function rate(risk) {
  const c = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
  return (await request(app).put(`/api/quotes/${c.body.quote.id}/risk`).set('x-quote-token', c.body.resumeToken).send({ risk }).expect(200)).body.quote;
}
const codes = (q) => q.rating.referral.reasons.map((r) => r.code);

let maker;
let checker;
beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
  maker = await login('config1@portal.test');
  checker = await login('config2@portal.test');
});
afterAll(async () => { await db.destroy(); });

describe('rule engine', () => {
  test('every product’s referral rules are published rule sets; brokers cannot see them', async () => {
    const sets = (await maker.get('/api/engines/rule-sets?status=published').expect(200)).body.sets;
    expect(sets.map((s) => s.productCode).sort()).toEqual(['ENG', 'FIRE', 'MARINE', 'WC']);
    expect(sets.find((s) => s.productCode === 'FIRE').rules).toBe(11);
    await (await login('sara@gulfshield.test')).get('/api/engines/rule-sets').expect(403);
  });

  test('a new version with an expression decline rule needs passing tests and a second approver', async () => {
    const fire = (await maker.get('/api/engines/rule-sets?product=FIRE&status=published')).body.sets.find((s) => s.code === 'REFERRALS');
    const draft = (await maker.post(`/api/engines/rule-sets/${fire.id}/copy`).expect(201)).body.set;
    expect(draft.version).toBe(2);
    await maker.post(`/api/engines/rule-sets/${fire.id}/copy`).expect(409);
    await maker.post(`/api/engines/rule-sets/${draft.id}/rules`).send({ code: 'UW-D1', nameEn: 'Spray-painting workshops above AED 2 million are not offered online', nameAr: 'ورش رش الطلاء التي تتجاوز مليوني درهم غير متاحة عبر الإنترنت', condition: 'occupancy == "WORKSHOP_SPRAY" && maxLocationSI > 2000000', action: 'decline', priority: 1 }).expect(201);
    await maker.post(`/api/engines/rule-sets/${draft.id}/rules`).send({ code: 'BAD', nameEn: 'x x', nameAr: 'x x', condition: 'maxLocationSI >', action: 'refer' }).expect(400);
    await maker.post(`/api/engines/rule-sets/${draft.id}/tests`).send({ name: 'Large spray shop declined', facts: { occupancy: 'WORKSHOP_SPRAY', maxLocationSI: 3000000, hazardOutsideAuthority: true }, expected: { decline: ['UW-D1'], refer: ['UW-02'] } }).expect(201);
    const bench = await maker.post(`/api/engines/rule-sets/${draft.id}/evaluate`).send({ facts: { occupancy: 'WORKSHOP_SPRAY', maxLocationSI: 1000000, noCivilDefence: true } }).expect(200);
    expect(bench.body.result.decline).toEqual([]);
    expect(bench.body.result.refer.map((r) => r.code)).toEqual(['UW-04']);
    expect((await maker.post(`/api/engines/rule-sets/${draft.id}/run-tests`).expect(200)).body.passed).toBe(1);
    await maker.post(`/api/engines/rule-sets/${draft.id}/submit`).expect(200);
    await maker.post(`/api/engines/rule-sets/${draft.id}/approve`).expect(403);
    await checker.post(`/api/engines/rule-sets/${draft.id}/approve`).expect(200);
    expect((await maker.get(`/api/engines/rule-sets/${fire.id}`)).body.set.status).toBe('superseded');

    const big = await rate(fireRisk({ occupancy: 'WORKSHOP_SPRAY' }, { sumsInsured: { PLM: 3000000 } }));
    expect(big.status).toBe('not_quotable');
    expect(big.rating.notQuotableReason).toBe('UW-D1');
    const small = await rate(fireRisk({ occupancy: 'WORKSHOP_SPRAY' }));
    expect(small.status).toBe('quoted');
    expect(codes(small)).toContain('UW-02');
  });

  test('a decision table is tested on the bench, blocked while a test fails, then published', async () => {
    const draft = (await maker.get('/api/engines/rule-sets?product=FIRE&status=draft')).body.sets.find((s) => s.code === 'LARGE_RISKS');
    const detail = (await maker.get(`/api/engines/rule-sets/${draft.id}`)).body;
    expect(detail.tables[0].rows).toHaveLength(3);
    const bench = await maker.post(`/api/engines/rule-sets/${draft.id}/evaluate`).send({ facts: { hazard: 'medium', maxLocationSI: 12000000 } }).expect(200);
    expect(bench.body.result.refer[0].code).toBe('UW-DT1');
    const bad = await maker.post(`/api/engines/rule-sets/${draft.id}/tests`).send({ name: 'Wrong expectation', facts: { hazard: 'high', maxLocationSI: 4000000 }, expected: { refer: [] } }).expect(201);
    const blocked = await maker.post(`/api/engines/rule-sets/${draft.id}/submit`).expect(409);
    expect(blocked.body.error.code).toBe('TESTS_FAILING');
    await maker.delete(`/api/engines/tests/${bad.body.id}`).expect(200);
    await maker.post(`/api/engines/tables/${detail.tables[0].id}`).expect(404);
    await maker.put(`/api/engines/tables/${detail.tables[0].id}`).send({ code: 'UW-DT1', name: 'x', inputs: [{ name: 'Hazard', expr: 'hazard' }], rows: [{ when: ["'high'", 'extra'], then: { action: 'refer' } }] }).expect(400);
    await maker.post(`/api/engines/rule-sets/${draft.id}/submit`).expect(200);
    await checker.post(`/api/engines/rule-sets/${draft.id}/approve`).expect(200);

    const high = await rate(fireRisk({ occupancy: 'FUEL_STATION' }, { sumsInsured: { BLD: 4000000 } }));
    expect(codes(high)).toEqual(expect.arrayContaining(['UW-DT1', 'UW-02']));
    const huge = await rate(fireRisk({}, { sumsInsured: { BLD: 45000000 } }));
    expect(huge.rating.notQuotableReason).toBe('UW-DT1-D');
  });
});

describe('rating engine', () => {
  test('Fire is priced by its published model; a draft is validated, compared on the bench and published', async () => {
    const list = (await maker.get('/api/engines/rating-models').expect(200)).body;
    expect(list.products.find((p) => p.code === 'FIRE').engine).toBe('dynamic');
    expect(list.functions.lazy).toContain('sum');
    const live = list.models.find((m) => m.productCode === 'FIRE' && m.status === 'published');
    const q1 = await rate(fireRisk());
    expect(q1.rating.breakdown.premium).toBeGreaterThan(0);

    const draft = (await maker.post(`/api/engines/rating-models/${live.id}/copy`).expect(201)).body.model;
    const model = JSON.parse(JSON.stringify(draft.model));
    const step = model.steps.find((s) => s.set === 'technical');
    step.expr = '(locationsPremium + extensionsTotal) * deductibleFactor * 1.1';
    const broken = JSON.parse(JSON.stringify(model));
    broken.steps.find((s) => s.set === 'technical').expr = '(locationsPremium + ';
    const bad = await maker.put(`/api/engines/rating-models/${draft.id}`).send({ model: broken }).expect(400);
    expect(bad.body.error.code).toBe('MODEL_INVALID');
    await maker.put(`/api/engines/rating-models/${draft.id}`).send({ model, notes: '10% rate increase' }).expect(200);

    const bench = (await maker.post(`/api/engines/rating-models/${draft.id}/test`).send({ risk: fireRisk() }).expect(200)).body;
    expect(bench.candidate.breakdown.technicalPremium).toBeCloseTo(bench.live.breakdown.technicalPremium * 1.1, 1);

    await maker.post(`/api/engines/rating-models/${draft.id}/submit`).expect(200);
    await maker.post(`/api/engines/rating-models/${draft.id}/approve`).expect(403);
    await checker.post(`/api/engines/rating-models/${draft.id}/approve`).expect(200);
    const q2 = await rate(fireRisk());
    expect(q2.rating.breakdown.technicalPremium).toBeCloseTo(q1.rating.breakdown.technicalPremium * 1.1, 1);
  });
});

describe('product configuration on the engines', () => {
  const marineRisk = { productType: 'single', direction: 'import', commodity: 'GEN_PACKED', mode: 'sea', packing: 'cartons', container: 'fcl', origin: { country: 'CN', place: 'Ningbo' }, destination: { country: 'AE', place: 'Jebel Ali' }, sailingDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), incoterm: 'CIF', vessel: { name: 'MSC AURORA', imo: '9876543' }, invoice: { currency: 'USD', amount: 50000 }, clause: 'ICC-A' };
  async function rateMarine() {
    const c = await request(app).post('/api/quotes').send({ productCode: 'MARINE', countryCode: 'AE' }).expect(201);
    return (await request(app).put(`/api/quotes/${c.body.quote.id}/risk`).set('x-quote-token', c.body.resumeToken).send({ risk: marineRisk }).expect(200)).body.quote;
  }

  test('all four products are priced by published rating models; Marine deductibles come from product configuration', async () => {
    const list = (await maker.get('/api/engines/rating-models')).body;
    expect(list.products.every((p) => p.engine === 'dynamic')).toBe(true);
    const q = await rateMarine();
    expect((await db('quotes').where({ id: q.id }).first()).rating.ratingModel.version).toBe(1);
    expect(q.rating.breakdown.deductible.pct).toBe(0.005);
    const general = (await maker.get('/api/platform/entities/productDeductibles?filter=MARINE')).body.rows.find((r) => r.code === 'general');
    await maker.put(`/api/platform/entities/productDeductibles/${general.id}`).send({ percent: 0.01, amount: 1500 }).expect(200);
    const q2 = await rateMarine();
    // USD 50,000 CIF x 1.10 uplift x 3.6725 = AED 201,987.50; 1% = 2,019.88 (above the 1,500 minimum)
    expect(q2.rating.breakdown.deductible).toEqual({ pct: 0.01, min: 1500, amount: 2019.88 });
  });

  test('with approval switched on, product changes wait for a second person', async () => {
    await maker.put('/api/platform/entities/parameters/products.requireApproval').send({ value: true }).expect(200);
    const fee = (await maker.get('/api/platform/entities/charges?filter=MARINE')).body.rows.find((r) => r.code === 'POLICY_FEE');
    const pending = await maker.put(`/api/platform/entities/charges/${fee.id}`).send({ amount: 40 }).expect(202);
    expect((await rateMarine()).rating.breakdown.policyFee).toBe(25);
    const changes = (await maker.get('/api/platform/changes').expect(200)).body.changes;
    expect(changes[0].id).toBe(pending.body.changeId);
    expect(changes[0].before.amount).toBe(25);
    await maker.post(`/api/platform/changes/${pending.body.changeId}/approve`).expect(403);
    await checker.post(`/api/platform/changes/${pending.body.changeId}/approve`).expect(200);
    expect((await rateMarine()).rating.breakdown.policyFee).toBe(40);

    const rejected = await maker.put(`/api/platform/entities/charges/${fee.id}`).send({ amount: 999 }).expect(202);
    await checker.post(`/api/platform/changes/${rejected.body.changeId}/reject`).send({ reason: 'Not agreed' }).expect(200);
    expect((await rateMarine()).rating.breakdown.policyFee).toBe(40);
    await maker.put(`/api/platform/entities/charges/${fee.id}`).send({ rate: 'x', charge_type: 'nonsense' }).expect(202);
    await maker.put('/api/platform/entities/parameters/products.requireApproval').send({ value: false }).expect(200);
  });
});

