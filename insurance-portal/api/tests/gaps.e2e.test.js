/**
 * Phase 1 gap closure: endorsement referrals, operations bank-transfer screen,
 * renewals (quotes, reminders, auto-renewal, expiry), accumulation (UW-11) and MIS reports.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/db');
const integrations = require('../src/integrations');

const app = createApp();
const CARD = { number: '4242424242424242', expiry: '12/29', cvc: '123' };

const inDays = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const baseRisk = (building = 'Shop 4, Al Waha Building') => ({
  occupancy: 'SHOP_GROCERY',
  interest: 'tenant',
  locations: [{
    address: { building, area: 'Al Qusais 2', city: 'Dubai' },
    construction: 'concrete',
    buildingAge: '10to25',
    protection: { alarm: true, extinguishers: true },
    civilDefence: true,
    sumsInsured: { IMP: 150000, PLM: 80000, FFF: 40000, STK: 600000 },
  }],
  extensions: ['X01'],
});

const proposer = (mobile, licence) => ({
  companyName: `Trader ${licence}`,
  tradeLicence: licence,
  licenceExpiry: inDays(300),
  contactName: 'Test Owner',
  contactIdNo: '784-1985-1234567-1',
  email: `${licence.toLowerCase()}@test.ae`,
  mobile,
  inceptionDate: inDays(3),
  declarations: { truthful: true, noPreviousDecline: true, noOtherInsurance: true, screeningConsent: true, keyFactsRead: true },
});

async function customerAgent(mobile) {
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

/** Prices a quote and saves proposer details; returns { agent, id, token }. */
async function readyQuote(mobile, licence, risk = baseRisk()) {
  const created = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
  const { id } = created.body.quote;
  const token = created.body.resumeToken;
  await request(app).put(`/api/quotes/${id}/risk`).set('x-quote-token', token).send({ risk }).expect(200);
  const agent = await customerAgent(mobile);
  await agent.put(`/api/quotes/${id}/proposer`).set('x-quote-token', token).send(proposer(mobile, licence)).expect(200);
  return { agent, id, token };
}

async function buyPolicy(mobile, licence, { autoRenew = false, risk } = {}) {
  const q = await readyQuote(mobile, licence, risk);
  const bound = await q.agent.post(`/api/quotes/${q.id}/bind`).set('x-quote-token', q.token).send({ method: 'card', card: CARD, autoRenew }).expect(201);
  return { ...q, policyId: bound.body.policyId, policyNo: bound.body.policyNo };
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
});

afterAll(async () => {
  await db.destroy();
});

describe('endorsement referral', () => {
  test('an increase above the online limit goes to an underwriter, then the customer accepts and pays', async () => {
    const { agent, policyId } = await buyPolicy('+971500001001', 'DED-1001001');
    const locations = baseRisk().locations;
    locations[0].sumsInsured.STK = 5500000;

    const preview = await agent.post(`/api/policies/${policyId}/endorsements/preview`).send({ locations }).expect(200);
    expect(preview.body.referralRequired).toBe(true);
    expect(preview.body.reasons.map((r) => r.code)).toContain('UW-01');

    const referred = await agent.post(`/api/policies/${policyId}/endorsements`).send({ type: 'sum_insured', locations, note: 'New stock line.' }).expect(202);
    expect(referred.body.status).toBe('referred');
    const again = await agent.post(`/api/policies/${policyId}/endorsements`).send({ type: 'sum_insured', locations }).expect(409);
    expect(again.body.error.code).toBe('ENDORSEMENT_REQUEST_OPEN');

    const uw = await staffAgent('uw@portal.test');
    const queue = await uw.get('/api/uw/referrals').expect(200);
    const item = queue.body.referrals.find((r) => r.kind === 'endorsement');
    expect(item).toBeDefined();
    const detail = await uw.get(`/api/uw/referrals/${item.id}`).expect(200);
    expect(detail.body.endorsement.newSumInsured).toBe(5770000);

    await uw.post(`/api/uw/referrals/${item.id}/messages`).send({ body: 'Send the stock register.', requestInfo: true }).expect(201);
    let policy = (await agent.get(`/api/policies/${policyId}`)).body.policy;
    expect(policy.endorsementRequests[0].status).toBe('info_requested');
    await agent.post(`/api/policies/${policyId}/endorsement-requests/${referred.body.requestId}/messages`).send({ body: 'Uploaded to your email.' }).expect(201);

    const decided = await uw.post(`/api/uw/referrals/${item.id}/decision`).send({ outcome: 'approve', loadingPct: 0.05, warranty: 'Stock kept 15 cm off the floor.', reasonCode: 'UW-01-OK' }).expect(200);
    expect(decided.body.status).toBe('approved');
    expect(decided.body.premiumDelta).toBeGreaterThan(0);

    const unpaid = await agent.post(`/api/policies/${policyId}/endorsement-requests/${referred.body.requestId}/accept`).send({}).expect(422);
    expect(unpaid.body.error.code).toBe('PAYMENT_REQUIRED');
    const applied = await agent.post(`/api/policies/${policyId}/endorsement-requests/${referred.body.requestId}/accept`).send({ payment: { method: 'card', card: CARD } }).expect(201);
    expect(applied.body.newSumInsured).toBe(5770000);
    expect(applied.body.premiumDelta).toBe(decided.body.premiumDelta);

    policy = (await agent.get(`/api/policies/${policyId}`)).body.policy;
    expect(policy.sumInsured).toBe(5770000);
    expect(policy.endorsementRequests[0].status).toBe('applied');
    expect(policy.uwTerms.warranty).toBe('Stock kept 15 cm off the floor.');
  });

  test('a decrease is refunded straight away', async () => {
    const { agent, policyId } = await buyPolicy('+971500001002', 'DED-1001002');
    const locations = baseRisk().locations;
    locations[0].sumsInsured.STK = 300000;
    const res = await agent.post(`/api/policies/${policyId}/endorsements`).send({ type: 'sum_insured', locations }).expect(201);
    expect(res.body.premiumDelta).toBeLessThan(0);
    const refunds = await db('payments').where({ policy_id: policyId, status: 'refunded' });
    expect(refunds).toHaveLength(1);
  });
});

describe('operations: bank transfers', () => {
  test('ops confirm a transfer to issue the policy, or reject it', async () => {
    const q1 = await readyQuote('+971500002001', 'DED-2002001');
    const pending = await q1.agent.post(`/api/quotes/${q1.id}/bind`).set('x-quote-token', q1.token).send({ method: 'bank_transfer' }).expect(202);
    expect(pending.body.status).toBe('payment_pending');
    const q2 = await readyQuote('+971500002002', 'DED-2002002');
    await q2.agent.post(`/api/quotes/${q2.id}/bind`).set('x-quote-token', q2.token).send({ method: 'bank_transfer' }).expect(202);

    await q1.agent.get('/api/admin/payments').expect(403);
    const ops = await staffAgent('ops@portal.test');
    const list = await ops.get('/api/admin/payments').expect(200);
    expect(list.body.payments).toHaveLength(2);

    const confirmed = await ops.post(`/api/admin/payments/${pending.body.paymentId}/confirm`).send({ bankReference: 'FT26293ABC' }).expect(200);
    expect(confirmed.body.policyNo).toMatch(/^AE-FIR-B2C-/);
    const other = list.body.payments.find((p) => p.id !== pending.body.paymentId);
    await ops.post(`/api/admin/payments/${other.id}/reject`).send({ reason: 'Amount short' }).expect(200);
    expect((await ops.get('/api/admin/payments').expect(200)).body.payments).toHaveLength(0);
    expect((await ops.get('/api/admin/payments?status=rejected').expect(200)).body.payments[0].reason).toBe('Amount short');
  });
});

describe('renewals', () => {
  test('daily jobs create renewal quotes, remind once, auto-renew with the saved card and expire lapsed policies', async () => {
    const auto = await buyPolicy('+971500003001', 'DED-3003001', { autoRenew: true });
    const manual = await buyPolicy('+971500003002', 'DED-3003002');
    const lapsed = await buyPolicy('+971500003003', 'DED-3003003');
    expect((await auto.agent.get(`/api/policies/${auto.policyId}`)).body.policy.hasSavedCard).toBe(true);

    await db('policies').where({ id: auto.policyId }).update({ inception_date: inDays(-358), expiry_date: inDays(7) });
    await db('policies').where({ id: manual.policyId }).update({ inception_date: inDays(-335), expiry_date: inDays(30) });
    await db('policies').where({ id: lapsed.policyId }).update({ inception_date: inDays(-366), expiry_date: inDays(-1) });

    integrations.notifications.sent.length = 0;
    const ops = await staffAgent('ops@portal.test');
    const first = await ops.post('/api/admin/jobs/daily').expect(200);
    expect(first.body.errors).toEqual([]);
    expect(first.body.renewalQuotesCreated).toBe(2);
    expect(first.body.autoRenewed).toBe(1);
    expect(first.body.policiesExpired).toBe(1);
    expect(first.body.remindersSent).toBeGreaterThanOrEqual(4);
    expect(integrations.notifications.sent.some((m) => m.template === 'renewal_ready')).toBe(true);

    const second = await ops.post('/api/admin/jobs/daily').expect(200);
    expect(second.body).toMatchObject({ renewalQuotesCreated: 0, autoRenewed: 0, remindersSent: 0, policiesExpired: 0 });

    const autoPolicies = (await auto.agent.get('/api/policies').expect(200)).body.policies;
    expect(autoPolicies).toHaveLength(2);
    const renewed = autoPolicies.find((p) => p.id !== auto.policyId);
    expect(renewed.inceptionDate).toBe(inDays(8));
    const renewedDetail = (await auto.agent.get(`/api/policies/${renewed.id}`)).body.policy;
    expect(renewedDetail.renewedFromPolicyId).toBe(auto.policyId);
    expect(renewedDetail.autoRenew).toBe(true);

    const manualPolicy = (await manual.agent.get(`/api/policies/${manual.policyId}`)).body.policy;
    expect(manualPolicy.renewal.status).toBe('quoted');
    expect(manualPolicy.renewal.inceptionDate).toBe(inDays(31));
    const bound = await manual.agent.post(`/api/quotes/${manualPolicy.renewal.quoteId}/bind`).send({ method: 'card', card: CARD }).expect(201);
    expect(bound.body.policyNo).toBeDefined();

    const lapsedPolicy = (await lapsed.agent.get(`/api/policies/${lapsed.policyId}`)).body.policy;
    expect(lapsedPolicy.status).toBe('expired');
  });
});

describe('accumulation (UW-11)', () => {
  test('a new quote at a building we already insure refers once the site limit would be exceeded', async () => {
    const pc = await db('product_countries').where({ product_code: 'FIRE', country_code: 'AE' }).first();
    await db('product_countries').where({ id: pc.id }).update({ settings: JSON.stringify({ ...pc.settings, accumulationLimitPerSite: 1000000 }) });
    try {
      await buyPolicy('+971500004001', 'DED-4004001', { risk: baseRisk('Tower 9, Unit 1') });
      const created = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
      const res = await request(app).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk: baseRisk('  tower 9,   unit 1 ') }).expect(200);
      expect(res.body.quote.rating.referral.reasons.map((r) => r.code)).toContain('UW-11');
      const elsewhere = await request(app).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk: baseRisk('Another Building') }).expect(200);
      expect(elsewhere.body.quote.rating.referral.reasons.map((r) => r.code)).not.toContain('UW-11');
    } finally {
      await db('product_countries').where({ id: pc.id }).update({ settings: JSON.stringify(pc.settings) });
    }
  });
});

describe('reports', () => {
  test('every report returns data and downloads as CSV; brokers cannot see them', async () => {
    const mgr = await staffAgent('uwm@portal.test');
    const { body: { reports } } = await mgr.get('/api/reports').expect(200);
    expect(reports).toEqual(['funnel', 'gwp', 'referral_ageing', 'broker_hit_ratio', 'commissions', 'accumulation', 'renewal_retention', 'claims']);
    for (const name of reports) {
      // eslint-disable-next-line no-await-in-loop
      const res = await mgr.get(`/api/reports/${name}?from=${inDays(-400)}&to=${inDays(60)}`).expect(200);
      expect(Array.isArray(res.body.columns)).toBe(true);
    }
    const gwp = await mgr.get(`/api/reports/gwp?from=${inDays(-1)}&to=${inDays(1)}`).expect(200);
    expect(gwp.body.totals.policies).toBeGreaterThan(0);
    const retention = await mgr.get(`/api/reports/renewal_retention?from=${inDays(-5)}&to=${inDays(40)}`).expect(200);
    expect(retention.body.rows[0].renewed).toBeGreaterThanOrEqual(2);
    const csv = await mgr.get(`/api/reports/funnel?format=csv&from=${inDays(-1)}&to=${inDays(1)}`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('channel,started,priced');

    const broker = await staffAgent('sara@gulfshield.test');
    await broker.get('/api/reports/gwp').expect(403);
  });
});
