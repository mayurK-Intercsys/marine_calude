/**
 * WC BRD journeys: pricing by job type and plan (checked by hand), short periods, referral and
 * not-quotable rules, plan comparison, named policy with employee annex, mid-term joiners
 * (instant and back-dated referral), wage declaration with additional and minimum-retained
 * return premium, injury claims and statutory documents.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/db');

const app = createApp();
const CARD = { number: '4242424242424242', expiry: '12/29', cvc: '123' };
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const furniture = (over = {}) => ({
  trade: 'FURNITURE', policyType: 'unnamed', plan: 'essential', periodMonths: 12,
  categories: [
    { category: 'OFFICE', headcount: 4, avgBasic: 5000, avgGross: 8000 },
    { category: 'SALES', headcount: 6, avgBasic: 3500, avgGross: 6000 },
    { category: 'DRIVER', headcount: 5, avgBasic: 2000, avgGross: 3500 },
    { category: 'UNSKILLED', headcount: 15, avgBasic: 1200, avgGross: 2000 },
  ],
  business: { name: 'Oasis Home Furniture Trading LLC', establishmentNo: 'EST-77881' },
  ...over,
});

const staff = () => [
  { name: 'Fatima A.', idNo: '784-1990-1111111-1', jobTitle: 'Accountant', category: 'OFFICE', basic: 6000, gross: 9500 },
  { name: 'Joseph M.', idNo: '784-1988-2222222-2', jobTitle: 'Sales executive', category: 'SALES', basic: 3500, gross: 6000 },
  { name: 'Ali H.', idNo: '784-1985-3333333-3', jobTitle: 'Warehouse supervisor', category: 'UNSKILLED', basic: 2500, gross: 4000 },
];

const proposer = (mobile, licence) => ({
  companyName: `Employer ${licence}`, tradeLicence: licence, licenceExpiry: inDays(300), contactName: 'HR Manager', contactIdNo: '784-1980-9999999-9',
  email: `${licence.toLowerCase()}@test.ae`, mobile, inceptionDate: inDays(2),
  declarations: { truthful: true, noPreviousDecline: true, noOtherInsurance: true, screeningConsent: true, keyFactsRead: true },
});

async function customer(mobile) {
  const agent = request.agent(app);
  const otp = await agent.post('/api/auth/otp/request').send({ target: mobile }).expect(200);
  await agent.post('/api/auth/otp/verify').send({ target: mobile, code: otp.body.devCode }).expect(200);
  return agent;
}
async function login(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200);
  return agent;
}
async function rate(risk, agent = request(app)) {
  const created = await request(app).post('/api/quotes').send({ productCode: 'WC', countryCode: 'AE' }).expect(201);
  const res = await request(app).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk });
  return { id: created.body.quote.id, token: created.body.resumeToken, res };
}
async function buy(mobile, licence, risk) {
  const q = await rate(risk);
  expect(q.res.status).toBe(200);
  const agent = await customer(mobile);
  await agent.put(`/api/quotes/${q.id}/proposer`).set('x-quote-token', q.token).send(proposer(mobile, licence)).expect(200);
  const bound = await agent.post(`/api/quotes/${q.id}/bind`).set('x-quote-token', q.token).send({ method: 'card', card: CARD }).expect(201);
  return { agent, policyId: bound.body.policyId, policyNo: bound.body.policyNo, quoteId: q.id, token: q.token };
}
const codes = (res) => res.body.quote.rating.referral.reasons.map((r) => r.code);

beforeAll(async () => { await db.migrate.rollback(undefined, true); await db.migrate.latest(); await db.seed.run(); });
afterAll(async () => { await db.destroy(); });

describe('pricing', () => {
  test('Essential plan: wages x rate by job type x claims factor', async () => {
    const { res } = await rate(furniture());
    expect(res.status).toBe(200);
    const r = res.body.quote.rating;
    expect(r.sumInsured).toBe(1386000);
    expect(r.breakdown.sectionA).toBe(7400.7);
    expect(r.breakdown.premium).toBe(7400.7);
    expect(r.referral.required).toBe(false);
  });

  test('Complete plan adds liability and medical; short periods scale; plans compare without saving', async () => {
    const { res } = await rate(furniture({ plan: 'complete' }));
    const b = res.body.quote.rating.breakdown;
    expect(b.sectionB).toBe(1110.11);
    expect(b.sectionC).toBe(1350);
    expect(b.premium).toBeCloseTo(9860.81, 1);
    const six = await rate(furniture({ periodMonths: 6 }));
    expect(six.res.body.quote.rating.breakdown.premium).toBe(5180.49);
    const q = await rate(furniture());
    const prices = [];
    for (const plan of ['essential', 'standard', 'complete']) {
      // eslint-disable-next-line no-await-in-loop
      const p = await request(app).post(`/api/quotes/${q.id}/price`).set('x-quote-token', q.token).send({ risk: furniture({ plan }) }).expect(200);
      prices.push(p.body.breakdown.premium);
    }
    expect(prices[0]).toBeLessThan(prices[1]);
    expect(prices[1]).toBeLessThan(prices[2]);
  });

  test('referral and not-quotable rules', async () => {
    expect(codes((await rate(furniture({ trade: 'CONSTRUCTION' }))).res)).toContain('UW-W02');
    expect(codes((await rate(furniture({ fatalClaim3y: true }))).res)).toContain('UW-W03');
    expect(codes((await rate(furniture({ extensions: ['X01'] }))).res)).toContain('UW-W04');
    const low = furniture();
    low.categories[3].avgGross = 600;
    expect(codes((await rate(low)).res)).toContain('UW-W05');
    const big = furniture();
    big.categories[3].headcount = 60;
    expect(codes((await rate(big)).res)).toContain('UW-W01');
    expect((await rate(furniture({ trade: 'DEMOLITION' }))).res.body.quote.rating.notQuotableReason).toBe('TRADE_DECLINED');
    const huge = furniture();
    huge.categories[3].headcount = 300;
    expect((await rate(huge)).res.body.quote.rating.notQuotableReason).toBe('ABOVE_ONLINE_LIMIT');
    expect((await rate(furniture({ plan: 'standard', extensions: ['X07'] }))).res.status).toBe(422);
  });
});

describe('named policy', () => {
  let agent;
  let policyId;

  test('buy with an employee list; annex masks IDs; certificate states the law', async () => {
    ({ agent, policyId } = await buy('+971500007001', 'DED-7007001', { trade: 'RETAIL', policyType: 'named', plan: 'standard', employees: staff() }));
    const policy = (await agent.get(`/api/policies/${policyId}`)).body.policy;
    expect(policy.policyNo).toMatch(/^AE-WCE-B2C-/);
    const annex = await agent.get(`/api/policies/${policyId}/documents/annex`).expect(200);
    expect(annex.text).toContain('Fatima A.');
    expect(annex.text).not.toContain('784-1990-1111111-1');
    const cert = await agent.get(`/api/policies/${policyId}/documents/certificate`).expect(200);
    expect(cert.text).toContain('MoHRE');
    expect(cert.text).toContain('24');
    const ar = await agent.get(`/api/policies/${policyId}/documents/schedule?lang=ar`).expect(200);
    expect(ar.text).toContain('dir="rtl"');
  });

  test('a joiner from today is priced pro rata and billed on the quarterly invoice', async () => {
    const employees = [...staff(), { name: 'Sunil P.', idNo: '784-1992-4444444-4', jobTitle: 'Driver', category: 'DRIVER', basic: 2000, gross: 3500, startDate: inDays(0) }];
    const preview = await agent.post(`/api/policies/${policyId}/endorsements/preview`).send({ employees }).expect(200);
    expect(preview.body.referralRequired).toBe(false);
    expect(preview.body.premiumDelta).toBeGreaterThan(0);
    const applied = await agent.post(`/api/policies/${policyId}/endorsements`).send({ type: 'workforce', employees }).expect(201);
    expect(applied.body.premiumDelta).toBe(preview.body.premiumDelta);
    expect(applied.body.billing).toBe('unbilled');
    const policy = (await agent.get(`/api/policies/${policyId}`)).body.policy;
    expect(policy.risk.employees).toHaveLength(4);
  });

  test('a joiner back-dated more than 7 days goes to the underwriter, then is accepted and paid', async () => {
    const current = (await agent.get(`/api/policies/${policyId}`)).body.policy.risk.employees;
    const employees = [...current, { name: 'Late Joiner', idNo: '784-1995-5555555-5', category: 'UNSKILLED', basic: 1200, gross: 2000, startDate: inDays(-30) }];
    const referred = await agent.post(`/api/policies/${policyId}/endorsements`).send({ type: 'workforce', employees }).expect(202);
    expect(referred.body.reasons.map((r) => r.code)).toContain('UW-W07');
    const uw = await login('uw@portal.test');
    const item = (await uw.get('/api/uw/referrals')).body.referrals.find((r) => r.kind === 'endorsement');
    await uw.post(`/api/uw/referrals/${item.id}/decision`).send({ outcome: 'approve', loadingPct: 0, reasonCode: 'UW-W07-OK' }).expect(200);
    await agent.post(`/api/policies/${policyId}/endorsement-requests/${referred.body.requestId}/accept`).send({ payment: { method: 'card', card: CARD } }).expect(201);
    const policy = (await agent.get(`/api/policies/${policyId}`)).body.policy;
    expect(policy.risk.employees).toHaveLength(5);
    expect(policy.risk.backdatedJoiner).toBeUndefined();
  });

  test('injury claims check the employee list and give the legal duties', async () => {
    const unknown = await agent.post('/api/claims').send({ policyId, lossDate: inDays(0), cause: 'fracture', description: 'Fell from a ladder in the store.', employeeIdNo: '784-0000-0000000-0', severity: 'off_work' }).expect(201);
    expect(unknown.body.coverFlags).toContain('EMPLOYEE_NOT_LISTED');
    const ok = await agent.post('/api/claims').send({ policyId, lossDate: inDays(0), cause: 'fracture', description: 'Fell from a ladder in the store.', employeeIdNo: '784-1985-3333333-3', severity: 'off_work', bodyPart: 'Left leg' }).expect(201);
    expect(ok.body.coverFlags).not.toContain('EMPLOYEE_NOT_LISTED');
    expect(ok.body.nextSteps).toContain('REPORT_TO_AUTHORITY_48H');
  });
});

describe('wage declaration', () => {
  test('higher actual wages are charged; much lower wages refund only down to the minimum retained', async () => {
    const up = await buy('+971500008001', 'DED-8008001', furniture());
    await up.agent.get(`/api/wc/${up.policyId}/declaration`).expect(200).then((r) => expect(r.body.open).toBe(false));
    await db('policies').where({ id: up.policyId }).update({ inception_date: inDays(-366), expiry_date: inDays(-1) });
    const d = (await up.agent.get(`/api/wc/${up.policyId}/declaration`)).body;
    expect(d.open).toBe(true);
    const higher = d.estimated.map((l) => ({ category: l.category, actualWages: Math.round(l.annualWages * 1.2) }));
    const preview = await up.agent.post(`/api/wc/${up.policyId}/declaration/preview`).send({ categories: higher }).expect(200);
    expect(preview.body.premiumDelta).toBeCloseTo(7400.7 * 0.2, 0);
    await up.agent.post(`/api/wc/${up.policyId}/declaration`).send({ categories: higher }).expect(422);
    const done = await up.agent.post(`/api/wc/${up.policyId}/declaration`).send({ categories: higher, payment: { method: 'card', card: CARD } }).expect(201);
    expect(done.body.endorsementNo).toMatch(/-E\d{3}$/);
    await up.agent.post(`/api/wc/${up.policyId}/declaration`).send({ categories: higher, payment: { method: 'card', card: CARD } }).expect(409);

    const down = await buy('+971500008002', 'DED-8008002', furniture());
    await db('policies').where({ id: down.policyId }).update({ inception_date: inDays(-366), expiry_date: inDays(-1) });
    const est = (await down.agent.get(`/api/wc/${down.policyId}/declaration`)).body.estimated;
    const lower = est.map((l) => ({ category: l.category, actualWages: Math.round(l.annualWages * 0.4) }));
    const refund = await down.agent.post(`/api/wc/${down.policyId}/declaration`).send({ categories: lower }).expect(201);
    expect(refund.body.premiumDelta).toBeCloseTo(-7400.7 * 0.25, 0);
  });
});

describe('broker', () => {
  test('a standard broker’s larger workforce refers; within authority it binds on credit', async () => {
    const broker = await login('sara@gulfshield.test');
    const created = await broker.post('/api/quotes').send({ productCode: 'WC', countryCode: 'AE' }).expect(201);
    const big = furniture({ trade: 'CLEANING' });
    big.categories[3].headcount = 110;
    const referred = await broker.put(`/api/quotes/${created.body.quote.id}/risk`).send({ risk: big }).expect(200);
    expect(codes(referred)).toContain('UW-W01');
    const ok = await broker.put(`/api/quotes/${created.body.quote.id}/risk`).send({ risk: furniture({ trade: 'CLEANING', plan: 'complete', discountPct: 0.05 }) }).expect(200);
    expect(ok.body.quote.rating.referral.required).toBe(false);
    await broker.put(`/api/quotes/${created.body.quote.id}/proposer`).send(proposer('+971500009001', 'DED-9009001')).expect(200);
    const bound = await broker.post(`/api/quotes/${created.body.quote.id}/bind`).send({ method: 'broker_credit' }).expect(201);
    expect(bound.body.policyNo).toMatch(/^AE-WCE-B2B-/);
  });
});
