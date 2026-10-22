/**
 * End-to-end tests against a real MySQL database (see README: test database).
 * Covers the Fire BRD journeys: B2C quote-to-policy, referral, broker bind,
 * not-quotable risks, payment failure, cancellation, endorsement, claims,
 * documents and rate-table maker-checker.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/db');

const app = createApp();

const inDays = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const baseRisk = () => ({
  occupancy: 'SHOP_GROCERY',
  interest: 'tenant',
  business: { name: 'Al Noor Grocery LLC', tradeLicence: 'DED-1023456' },
  locations: [{
    address: { building: 'Shop 4, Al Waha Building', area: 'Al Qusais 2', city: 'Dubai' },
    construction: 'concrete',
    buildingAge: '10to25',
    floorLevel: 'ground',
    protection: { alarm: true, extinguishers: true },
    civilDefence: true,
    sumsInsured: { IMP: 150000, PLM: 80000, FFF: 40000, STK: 600000 },
  }],
  claims3y: 0,
  extensions: ['X01', 'X02'],
  deductible: 'standard',
});

const proposer = (overrides = {}) => ({
  companyName: 'Al Noor Grocery LLC',
  tradeLicence: 'DED-1023456',
  licenceExpiry: inDays(300),
  contactName: 'Mohammed Rafiq',
  contactIdNo: '784-1985-1234567-1',
  email: 'owner@alnoorgrocery.test',
  mobile: '+971500000001',
  inceptionDate: inDays(5),
  declarations: { truthful: true, noPreviousDecline: true, noOtherInsurance: true, screeningConsent: true, keyFactsRead: true },
  ...overrides,
});

async function customerAgent(mobile = '+971500000001') {
  const agent = request.agent(app);
  const otp = await agent.post('/api/auth/otp/request').send({ target: mobile }).expect(200);
  await agent.post('/api/auth/otp/verify').send({ target: mobile, code: otp.body.devCode }).expect(200);
  return agent;
}

async function staffAgent(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200);
  return agent;
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
});

afterAll(async () => {
  await db.destroy();
});

describe('B2C quote to policy', () => {
  let quoteId;
  let token;
  let policyId;
  let agent;

  test('anonymous visitor gets a price without signing in', async () => {
    const created = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    quoteId = created.body.quote.id;
    token = created.body.resumeToken;
    expect(created.body.quote.channel).toBe('b2c');

    const rated = await request(app).put(`/api/quotes/${quoteId}/risk`).set('x-quote-token', token).send({ risk: baseRisk() }).expect(200);
    const { rating } = rated.body.quote;
    expect(rating.quotable).toBe(true);
    expect(rating.tier).toBe('tier1');
    expect(rating.sumInsured).toBe(870000);
    // 870,000 x 0.75 per mille x 0.9 x 0.95 x 0.95 x 1.05 = 556.49; X01 55.65; X02 72.00
    expect(rating.breakdown.locationsPremium).toBe(556.49);
    expect(rating.breakdown.premium).toBe(684.14);
    expect(rating.breakdown.tax).toBe(36.71);
    expect(rating.breakdown.total).toBe(770.85);
    expect(rating.referral.required).toBe(false);
    expect(rating.facts).toBeUndefined();
  });

  test('a quote cannot be read without its token or ownership', async () => {
    await request(app).get(`/api/quotes/${quoteId}`).expect(403);
  });

  test('customer signs in with a code, adds details and pays by card', async () => {
    agent = await customerAgent();
    await agent.put(`/api/quotes/${quoteId}/proposer`).set('x-quote-token', token).send(proposer()).expect(200);
    const bound = await agent.post(`/api/quotes/${quoteId}/bind`).set('x-quote-token', token).send({ method: 'card', card: { number: '4242424242424242', expiry: '12/29', cvc: '123' } }).expect(201);
    expect(bound.body.policyNo).toMatch(/^AE-FIR-B2C-\d{4}-000001$/);
    policyId = bound.body.policyId;

    const list = await agent.get('/api/policies').expect(200);
    expect(list.body.policies).toHaveLength(1);
    const detail = await agent.get(`/api/policies/${policyId}`).expect(200);
    expect(detail.body.policy.total).toBe(770.85);
    expect(detail.body.policy.status).toBe('active');
  });

  test('documents render in English and Arabic, and the QR check works', async () => {
    const en = await agent.get(`/api/policies/${policyId}/documents/schedule?lang=en`).expect(200);
    expect(en.text).toContain('Policy schedule');
    expect(en.text).toContain('dir="ltr"');
    const ar = await agent.get(`/api/policies/${policyId}/documents/certificate?lang=ar`).expect(200);
    expect(ar.text).toContain('dir="rtl"');
    expect(ar.text).toContain('شهادة التأمين');
    const policy = (await agent.get(`/api/policies/${policyId}`)).body.policy;
    const verify = await request(app).get(`/api/verify/${policy.policyNo}`).expect(200);
    expect(verify.body.valid).toBe(true);
    await request(app).get(`/api/policies/${policyId}/documents/schedule`).expect(401);
  });

  test('a bound quote cannot be changed', async () => {
    await agent.put(`/api/quotes/${quoteId}/risk`).send({ risk: baseRisk() }).expect(409);
  });

  test('sum insured increase is re-rated pro rata', async () => {
    const locations = baseRisk().locations;
    locations[0].sumsInsured.STK = 900000;
    const unpaid = await agent.post(`/api/policies/${policyId}/endorsements`).send({ type: 'sum_insured', locations }).expect(422);
    expect(unpaid.body.error.code).toBe('PAYMENT_REQUIRED');
    const res = await agent.post(`/api/policies/${policyId}/endorsements`).send({ type: 'sum_insured', locations, payment: { method: 'card', card: { number: '4242424242424242', expiry: '12/29', cvc: '1' } } }).expect(201);
    expect(res.body.premiumDelta).toBeGreaterThan(0);
    expect(res.body.newSumInsured).toBe(1170000);
  });

  test('claim notification registers with a cover check', async () => {
    const res = await agent.post('/api/claims').send({ policyId, lossDate: inDays(6), cause: 'fire', description: 'Short circuit started a fire in the store room.', estimate: 45000 }).expect(201);
    expect(res.body.claimNo).toMatch(/^CLM-AE-\d{4}-000001$/);
    expect(res.body.coverFlags).toContain('LOSS_DATE_IN_FUTURE');
  });

  test('cancellation after a claim gives no refund', async () => {
    const res = await agent.post(`/api/policies/${policyId}/cancel`).send({ reason: 'Business closed', effectiveDate: inDays(6) }).expect(200);
    expect(res.body.basis).toBe('no_refund_claim');
    expect(res.body.refundTotal).toBe(0);
  });
});

describe('referral to underwriter', () => {
  test('missing civil defence certificate refers; approval with loading lets the customer buy', async () => {
    const created = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    const { id } = created.body.quote;
    const token = created.body.resumeToken;
    const risk = baseRisk();
    risk.locations[0].civilDefence = false;
    const rated = await request(app).put(`/api/quotes/${id}/risk`).set('x-quote-token', token).send({ risk }).expect(200);
    expect(rated.body.quote.rating.referral.required).toBe(true);
    expect(rated.body.quote.rating.referral.reasons.map((r) => r.code)).toContain('UW-04');

    const agent = await customerAgent('+971500000077');
    await agent.put(`/api/quotes/${id}/proposer`).set('x-quote-token', token).send(proposer({ companyName: 'Desert Rose Trading', tradeLicence: 'DED-7777777', mobile: '+971500000077', email: 'dr@test.ae' })).expect(200);
    const blocked = await agent.post(`/api/quotes/${id}/bind`).set('x-quote-token', token).send({ method: 'card', card: { number: '4242424242424242', expiry: '12/29', cvc: '1' } }).expect(409);
    expect(blocked.body.error.code).toBe('REFERRAL_REQUIRED');

    await agent.post(`/api/quotes/${id}/referral`).set('x-quote-token', token).send({ note: 'Certificate renewal in progress.' }).expect(200);

    const uw = await staffAgent('uw@portal.test');
    const queue = await uw.get('/api/uw/referrals').expect(200);
    const ref = queue.body.referrals.find((r) => r.quoteId === id);
    expect(ref).toBeDefined();
    const detail = await uw.get(`/api/uw/referrals/${ref.id}`).expect(200);
    expect(detail.body.quote.rating.facts.noCivilDefence).toBe(true);

    const before = rated.body.quote.rating.breakdown.premium;
    const decided = await uw.post(`/api/uw/referrals/${ref.id}/decision`).send({ outcome: 'approve', loadingPct: 0.1, warranty: 'Valid Civil Defence certificate within 30 days.', reasonCode: 'UW-04-ACCEPT' }).expect(200);
    expect(decided.body.quote.status).toBe('approved');
    expect(decided.body.quote.rating.breakdown.premium).toBeGreaterThan(before);
    expect(decided.body.quote.rating.referral.cleared).toBe(true);

    const bound = await agent.post(`/api/quotes/${id}/bind`).set('x-quote-token', token).send({ method: 'card', card: { number: '4242424242424242', expiry: '12/29', cvc: '1' } }).expect(201);
    expect(bound.body.policyNo).toBeDefined();
  });

  test('a customer cannot use the underwriter workbench', async () => {
    const agent = await customerAgent();
    await agent.get('/api/uw/referrals').expect(403);
  });
});

describe('risks the portal must not issue', () => {
  test('declined occupancy is not quotable', async () => {
    const created = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    const risk = { ...baseRisk(), occupancy: 'SHOP_FIREWORKS' };
    const res = await request(app).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk }).expect(200);
    expect(res.body.quote.status).toBe('not_quotable');
    expect(res.body.quote.rating.notQuotableReason).toBe('OCCUPANCY_DECLINED');
  });

  test('locations above the online limit go to the underwriting desk', async () => {
    const created = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    const risk = baseRisk();
    risk.locations[0].sumsInsured = { BLD: 60000000 };
    const res = await request(app).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk }).expect(200);
    expect(res.body.quote.rating.notQuotableReason).toBe('ABOVE_ONLINE_LIMIT');
  });

  test('a declined card keeps the quote and issues nothing', async () => {
    const created = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    const { id } = created.body.quote;
    const token = created.body.resumeToken;
    await request(app).put(`/api/quotes/${id}/risk`).set('x-quote-token', token).send({ risk: baseRisk() }).expect(200);
    const agent = await customerAgent('+971500000088');
    await agent.put(`/api/quotes/${id}/proposer`).set('x-quote-token', token).send(proposer({ mobile: '+971500000088', tradeLicence: 'DED-8888888' })).expect(200);
    const res = await agent.post(`/api/quotes/${id}/bind`).set('x-quote-token', token).send({ method: 'card', card: { number: '4000000000000002', expiry: '12/29', cvc: '1' } }).expect(402);
    expect(res.body.error.code).toBe('PAYMENT_FAILED');
    const quote = await agent.get(`/api/quotes/${id}`).set('x-quote-token', token).expect(200);
    expect(quote.body.quote.status).toBe('quoted');
  });

  test('cover cannot start in the past', async () => {
    const created = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    const res = await request(app).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk: { ...baseRisk(), inceptionDate: inDays(-2) } }).expect(400);
    expect(res.body.error.code).toBe('INCEPTION_IN_PAST');
  });
});

describe('broker portal', () => {
  test('discount above the broker band refers; within band binds on credit and earns commission', async () => {
    const broker = await staffAgent('sara@gulfshield.test');
    const created = await broker.post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    expect(created.body.quote.channel).toBe('b2b');
    const { id } = created.body.quote;

    const high = await broker.put(`/api/quotes/${id}/risk`).send({ risk: { ...baseRisk(), discountPct: 0.15 } }).expect(200);
    expect(high.body.quote.rating.referral.reasons.map((r) => r.code)).toContain('UW-07');

    const ok = await broker.put(`/api/quotes/${id}/risk`).send({ risk: { ...baseRisk(), discountPct: 0.05 } }).expect(200);
    expect(ok.body.quote.rating.referral.required).toBe(false);
    expect(ok.body.quote.rating.breakdown.discount).toBeGreaterThan(0);

    await broker.put(`/api/quotes/${id}/proposer`).send(proposer({ companyName: 'Bluewave Laundry LLC', tradeLicence: 'DED-0874412', mobile: '+971500000099', email: 'ops@bluewave.test' })).expect(200);
    const bound = await broker.post(`/api/quotes/${id}/bind`).send({ method: 'broker_credit' }).expect(201);
    expect(bound.body.policyNo).toMatch(/^AE-FIR-B2B-/);

    const dash = await broker.get('/api/broker/dashboard').expect(200);
    expect(dash.body.kpis.gwpMonth).toBeGreaterThan(0);
    const comm = await broker.get('/api/broker/commissions').expect(200);
    expect(comm.body.lines[0].rate).toBe(0.15);
    const clients = await broker.get('/api/broker/clients').expect(200);
    expect(clients.body.clients.map((c) => c.companyName)).toContain('Bluewave Laundry LLC');
  });

  test('a broker cannot see another firm’s quotes', async () => {
    const other = await staffAgent('agent@emiratespremier.test');
    const list = await other.get('/api/quotes').expect(200);
    expect(list.body.quotes.every((q) => q.channel === 'b2b')).toBe(true);
    const mine = await staffAgent('sara@gulfshield.test');
    const created = await mine.post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    await other.get(`/api/quotes/${created.body.quote.id}`).expect(403);
  });
});

describe('rate table maker-checker', () => {
  test('a draft change needs a second person and then prices new quotes', async () => {
    const maker = await staffAgent('config1@portal.test');
    const checker = await staffAgent('config2@portal.test');
    const list = await maker.get('/api/admin/rate-tables?product=FIRE&country=AE').expect(200);
    const charges = list.body.tables.find((t) => t.key === 'charges' && t.status === 'approved');

    const draft = await maker.post(`/api/admin/rate-tables/${charges.id}/drafts`).expect(201);
    const draftId = draft.body.table.id;
    await maker.put(`/api/admin/rate-tables/${draftId}`).send({ data: { ...charges.data, minPremium: 900 }, changeNote: 'Raise minimum premium' }).expect(200);

    const test = await maker.post(`/api/admin/rate-tables/${draftId}/test`).send({ risk: baseRisk() }).expect(200);
    expect(test.body.draft.breakdown.premium).toBe(900);
    expect(test.body.live.breakdown.premium).toBe(684.14);

    await maker.post(`/api/admin/rate-tables/${draftId}/submit`).expect(200);
    const self = await maker.post(`/api/admin/rate-tables/${draftId}/approve`).expect(403);
    expect(self.body.error.code).toBe('MAKER_CANNOT_APPROVE');
    await checker.post(`/api/admin/rate-tables/${draftId}/approve`).expect(200);

    const created = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    const rated = await request(app).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk: baseRisk() }).expect(200);
    expect(rated.body.quote.rating.breakdown.premium).toBe(900);
    expect(rated.body.quote.rating.breakdown.minimumPremiumApplied).toBe(true);

    const audit = await checker.get('/api/admin/audit?entity=rate_table').expect(200);
    expect(audit.body.entries.map((e) => e.action)).toEqual(expect.arrayContaining(['rates.draft', 'rates.edit', 'rates.submit', 'rates.approve']));
  });
});
