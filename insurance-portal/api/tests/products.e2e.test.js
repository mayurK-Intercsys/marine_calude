/**
 * Product configuration (Admin → Products): lines of business, products, covers (pricing,
 * activation, names), deductibles (rating factor), discounts / loadings, charges and taxes —
 * all taking effect on quotes and documents without code changes.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/db');

const app = createApp();
const CARD = { number: '4242424242424242', expiry: '12/29', cvc: '123' };
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// The Fire BRD example: locations premium 556.49 (see fire.e2e.test.js)
const fireRisk = (over = {}) => ({
  occupancy: 'SHOP_GROCERY', interest: 'tenant',
  locations: [{ address: { building: 'Shop 4, Al Waha Building', area: 'Al Qusais 2', city: 'Dubai' }, construction: 'concrete', buildingAge: '10to25', floorLevel: 'ground', protection: { alarm: true, extensions: true, extinguishers: true }, civilDefence: true, sumsInsured: { IMP: 150000, PLM: 80000, FFF: 40000, STK: 600000 } }],
  claims3y: 0, extensions: ['X01', 'X02'], deductible: 'standard', ...over,
});

async function login(email) { const a = request.agent(app); await a.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200); return a; }
async function rate(product, risk, agent = null) {
  const c = await (agent || request(app)).post('/api/quotes').send({ productCode: product, countryCode: 'AE' }).expect(201);
  const res = await (agent || request(app)).put(`/api/quotes/${c.body.quote.id}/risk`).set('x-quote-token', c.body.resumeToken).send({ risk });
  return { id: c.body.quote.id, token: c.body.resumeToken, res, b: res.body.quote?.rating?.breakdown };
}
async function row(admin, entity, filter, pred) {
  return (await admin.get(`/api/platform/entities/${entity}${filter ? `?filter=${filter}` : ''}`)).body.rows.find(pred);
}
const put = (a, entity, id, body) => a.put(`/api/platform/entities/${entity}/${id}`).send(body);

let admin;
beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
  admin = await login('config1@portal.test');
});
afterAll(async () => { await db.destroy(); });

test('product overview shows the configured structure; other roles cannot edit products', async () => {
  const o = (await admin.get('/api/platform/products/FIRE/overview').expect(200)).body;
  expect(o.product.lob.code).toBe('fire');
  expect(o.covers.filter((c) => c.cover_type === 'basic')).toHaveLength(9);
  expect(o.covers.filter((c) => c.cover_type === 'optional')).toHaveLength(7);
  expect(o.deductibles.map((d) => d.code)).toEqual(['standard', 'high']);
  expect(o.charges.find((c) => c.product_code === 'FIRE').amount).toBe(50);
  const mgr = await login('uwm@portal.test');
  await mgr.get('/api/platform/entities/productCovers').expect(403);
});

test('cover pricing, activation and names come from product configuration', async () => {
  const base = await rate('FIRE', fireRisk());
  expect(base.b.extensions.find((e) => e.code === 'X01').amount).toBe(55.65);
  const x01 = await row(admin, 'productCovers', 'FIRE', (r) => r.code === 'X01');
  await put(admin, 'productCovers', x01.id, { pricing: { method: 'loading', pct: 0.2 }, name_en: 'Accidental damage (sudden and unforeseen)' }).expect(200);
  const more = await rate('FIRE', fireRisk());
  expect(more.b.extensions.find((e) => e.code === 'X01').amount).toBe(111.3);
  const cfg = (await request(app).get('/api/ref/products/FIRE/config?country=AE')).body.config;
  expect(cfg.extensions.find((e) => e.code === 'X01').name.en).toBe('Accidental damage (sudden and unforeseen)');

  const x02 = await row(admin, 'productCovers', 'FIRE', (r) => r.code === 'X02');
  await put(admin, 'productCovers', x02.id, { active: false }).expect(200);
  expect((await request(app).get('/api/ref/products/FIRE/config?country=AE')).body.config.extensions.map((e) => e.code)).not.toContain('X02');
  expect((await rate('FIRE', fireRisk())).res.status).toBe(422);
  await put(admin, 'productCovers', x02.id, { active: true }).expect(200);
  await put(admin, 'productCovers', x01.id, { pricing: { method: 'loading', pct: 0.1 } }).expect(200);
});

test('deductible rating factor changes the premium for that choice', async () => {
  const before = await rate('FIRE', fireRisk({ deductible: 'high' }));
  const high = await row(admin, 'productDeductibles', 'FIRE', (r) => r.code === 'high');
  await put(admin, 'productDeductibles', high.id, { rating_factor: 0.85 }).expect(200);
  const after = await rate('FIRE', fireRisk({ deductible: 'high' }));
  expect(after.b.technicalPremium).toBeCloseTo((before.b.technicalPremium / 0.92) * 0.85, 1);
  await put(admin, 'productDeductibles', high.id, { rating_factor: 3 }).expect(400);
  await put(admin, 'productDeductibles', high.id, { rating_factor: 0.92 }).expect(200);
});

test('automatic discounts apply by channel and condition, in priority order', async () => {
  const online = await row(admin, 'premiumAdjustments', 'FIRE', (r) => r.code === 'ONLINE');
  const ncd = await row(admin, 'premiumAdjustments', 'FIRE', (r) => r.code === 'NO_CLAIMS');
  await put(admin, 'premiumAdjustments', online.id, { active: true }).expect(200);
  await put(admin, 'premiumAdjustments', ncd.id, { active: true }).expect(200);
  const b2c = await rate('FIRE', fireRisk());
  expect(b2c.b.ratedPremium).toBe(684.14);
  expect(b2c.b.adjustments.map((a) => a.code)).toEqual(['ONLINE', 'NO_CLAIMS']);
  expect(b2c.b.premium).toBeCloseTo(684.14 * 0.95 * 0.97, 1);
  expect(b2c.b.total).toBeCloseTo(b2c.b.premium + 50 + b2c.b.tax, 2);
  const claims = await rate('FIRE', fireRisk({ claims3y: 1 }));
  expect(claims.b.adjustments.map((a) => a.code)).toEqual(['ONLINE']);
  const broker = await rate('FIRE', fireRisk(), await login('sara@gulfshield.test'));
  expect(broker.b.adjustments.map((a) => a.code)).toEqual(['NO_CLAIMS']);
  await admin.post('/api/platform/entities/premiumAdjustments').send({ product_code: 'FIRE', code: 'BAD', name_en: 'x', name_ar: 'x', kind: 'discount', percent: 0.1, condition: { fact: 'x', op: 'nonsense', value: 1 } }).expect(400);
  await put(admin, 'premiumAdjustments', online.id, { active: false }).expect(200);
  await put(admin, 'premiumAdjustments', ncd.id, { active: false }).expect(200);
});

test('charges: a non-taxable percentage fee with a minimum is added to the total', async () => {
  await admin.post('/api/platform/entities/charges').send({ code: 'STAMP', name_en: 'Stamp duty', name_ar: 'رسوم الطوابع', product_code: 'FIRE', country_code: 'AE', charge_type: 'percent', percent: 0.001, min_amount: 20, taxable: false, transactions: ['new_business'], sort: 2, active: true }).expect(201);
  const r = await rate('FIRE', fireRisk());
  expect(r.b.fees.map((f) => f.code)).toEqual(['POLICY_FEE', 'STAMP']);
  expect(r.b.fees[1].amount).toBe(20);
  expect(r.b.policyFee).toBe(70);
  expect(r.b.tax).toBe(36.71);
  expect(r.b.total).toBe(684.14 + 70 + 36.71);
  await db('charges').where({ code: 'STAMP' }).del();
});

test('taxes: a product-specific levy is added; Marine exports stay zero-rated', async () => {
  await admin.post('/api/platform/entities/taxes').send({ code: 'LEVY', name_en: 'Insurance levy', name_ar: 'رسم التأمين', country_code: 'AE', product_code: 'WC', rate: 0.01, applies_to_fees: false, priority: 50, active: true }).expect(201);
  const wc = await rate('WC', { trade: 'RETAIL', policyType: 'unnamed', plan: 'essential', categories: [{ category: 'OFFICE', headcount: 10, avgBasic: 5000, avgGross: 8000 }] });
  expect(wc.b.taxes.map((t) => t.code).sort()).toEqual(['LEVY', 'VAT']);
  expect(wc.b.taxes.find((t) => t.code === 'LEVY').amount).toBeCloseTo(wc.b.premium * 0.01, 2);
  const exp = await rate('MARINE', { productType: 'single', direction: 'export', commodity: 'GEN_PACKED', mode: 'sea', packing: 'cartons', container: 'fcl', origin: { country: 'AE', place: 'Jebel Ali' }, destination: { country: 'IN', place: 'Nhava Sheva' }, sailingDate: inDays(10), incoterm: 'CIF', vessel: { name: 'MSC AURORA', imo: '9876543' }, invoice: { currency: 'USD', amount: 50000 }, clause: 'ICC-A' });
  expect(exp.b.tax).toBe(0);
  expect(exp.b.taxes[0].name.en).toContain('zero-rated');
});

test('lines of business and products are editable; renamed covers appear on documents', async () => {
  await admin.post('/api/platform/entities/lobs').send({ code: 'motor', name_en: 'Motor', name_ar: 'المركبات', sort: 5, active: true }).expect(201);
  expect((await admin.get('/api/platform/meta')).body.entities.products.columns.find((c) => c.name === 'line').options.map((o) => o.value)).toContain('motor');
  await admin.post('/api/platform/entities/products').send({ code: 'X' }).expect(400);
  await put(admin, 'products', 'FIRE', { description_en: 'SME property cover' }).expect(200);
  expect((await admin.get('/api/platform/products/FIRE/overview')).body.product.description.en).toBe('SME property cover');

  const x01 = await row(admin, 'productCovers', 'FIRE', (r) => r.code === 'X01');
  await put(admin, 'productCovers', x01.id, { name_en: 'Accidental damage – renamed' }).expect(200);
  const q = await rate('FIRE', fireRisk());
  const agent = request.agent(app);
  const otp = await agent.post('/api/auth/otp/request').send({ target: '+971500100001' }).expect(200);
  await agent.post('/api/auth/otp/verify').send({ target: '+971500100001', code: otp.body.devCode }).expect(200);
  await agent.put(`/api/quotes/${q.id}/proposer`).set('x-quote-token', q.token).send({ companyName: 'Doc Test LLC', tradeLicence: 'DED-1000001', licenceExpiry: inDays(300), contactName: 'Owner', contactIdNo: '784-1980-0000000-1', email: 'doc@test.ae', mobile: '+971500100001', inceptionDate: inDays(3), declarations: { truthful: true, noPreviousDecline: true, noOtherInsurance: true, screeningConsent: true, keyFactsRead: true } }).expect(200);
  const bound = await agent.post(`/api/quotes/${q.id}/bind`).set('x-quote-token', q.token).send({ method: 'card', card: CARD }).expect(201);
  const doc = await agent.get(`/api/policies/${bound.body.policyId}/documents/schedule`).expect(200);
  expect(doc.text).toContain('Accidental damage – renamed');
});
