/**
 * Feature completion: WC batched invoices, sick-leave tracker and overdue-declaration block;
 * Marine sub-users with limits, API keys, ports and open-cover renewal from usage; Fire renewal
 * carrying underwriter terms; Engineering surveys, permit check, EAR testing referral and handover.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/db');

const app = createApp();
const CARD = { number: '4242424242424242', expiry: '12/29', cvc: '123' };
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const plusMonths = (iso, m) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const proposer = (mobile, licence, extra = {}) => ({
  companyName: `Client ${licence}`, tradeLicence: licence, licenceExpiry: inDays(300), contactName: 'Owner', contactIdNo: '784-1980-0000000-1',
  email: `${licence.toLowerCase()}@test.ae`, mobile, inceptionDate: inDays(3),
  declarations: { truthful: true, noPreviousDecline: true, noOtherInsurance: true, screeningConsent: true, keyFactsRead: true }, ...extra,
});
async function login(email) { const a = request.agent(app); await a.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200); return a; }
async function customer(mobile) {
  const a = request.agent(app);
  const otp = await a.post('/api/auth/otp/request').send({ target: mobile }).expect(200);
  await a.post('/api/auth/otp/verify').send({ target: mobile, code: otp.body.devCode }).expect(200);
  return a;
}
async function quoteAs(agent, product, risk) {
  const created = await (agent || request(app)).post('/api/quotes').send({ productCode: product, countryCode: 'AE' }).expect(201);
  const r = await (agent || request(app)).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk });
  return { id: created.body.quote.id, token: created.body.resumeToken, res: r };
}
async function buy(mobile, licence, product, risk) {
  const q = await quoteAs(null, product, risk);
  expect(q.res.status).toBe(200);
  const a = await customer(mobile);
  await a.put(`/api/quotes/${q.id}/proposer`).set('x-quote-token', q.token).send(proposer(mobile, licence)).expect(200);
  const b = await a.post(`/api/quotes/${q.id}/bind`).set('x-quote-token', q.token).send({ method: 'card', card: CARD }).expect(201);
  return { agent: a, policyId: b.body.policyId, policyNo: b.body.policyNo };
}
const wcRisk = () => ({ trade: 'RETAIL', policyType: 'named', plan: 'essential', employees: [
  { name: 'Ali H.', idNo: '784-1985-3333333-3', category: 'UNSKILLED', basic: 2500, gross: 4000 },
  { name: 'Joseph M.', idNo: '784-1988-2222222-2', category: 'SALES', basic: 3500, gross: 6000 },
] });

beforeAll(async () => { await db.migrate.rollback(undefined, true); await db.migrate.latest(); await db.seed.run(); });
afterAll(async () => { await db.destroy(); });

describe('WC', () => {
  test('joiners are invoiced after the quarter ends and the invoice can be paid', async () => {
    const { agent, policyId } = await buy('+971500020001', 'DED-2020001', 'WC', wcRisk());
    const employees = [...wcRisk().employees, { name: 'New Driver', idNo: '784-1993-7777777-7', category: 'DRIVER', basic: 2000, gross: 3500, startDate: inDays(0) }];
    const r = await agent.post(`/api/policies/${policyId}/endorsements`).send({ type: 'workforce', employees }).expect(201);
    expect(r.body.billing).toBe('unbilled');
    const ops = await login('ops@portal.test');
    expect((await ops.post('/api/admin/jobs/daily').expect(200)).body.invoicesCreated).toBe(0);
    const lastQuarter = new Date(); lastQuarter.setUTCMonth(lastQuarter.getUTCMonth() - 4);
    await db('endorsements').where({ policy_id: policyId, billing_status: 'unbilled' }).update({ created_at: lastQuarter });
    expect((await ops.post('/api/admin/jobs/daily').expect(200)).body.invoicesCreated).toBe(1);
    const policy = (await agent.get(`/api/policies/${policyId}`)).body.policy;
    expect(policy.invoices).toHaveLength(1);
    expect(policy.invoices[0].status).toBe('due');
    expect(Number(policy.invoices[0].premium)).toBe(Number(r.body.premiumDelta));
    await agent.post(`/api/policies/${policyId}/invoices/${policy.invoices[0].id}/pay`).send({ payment: { method: 'card', card: CARD } }).expect(200);
    expect((await agent.get(`/api/policies/${policyId}`)).body.policy.invoices[0].status).toBe('paid');
  });

  test('sick leave is paid at full wage then half wage under the statutory steps', async () => {
    const { agent, policyId } = await buy('+971500020002', 'DED-2020002', 'WC', wcRisk());
    const claim = await agent.post('/api/claims').send({ policyId, lossDate: inDays(0), cause: 'fracture', description: 'Fell while unloading.', employeeIdNo: '784-1985-3333333-3', severity: 'off_work' }).expect(201);
    const p1 = await agent.post(`/api/claims/${claim.body.claimId}/sick-leave`).send({ from: '2027-01-01', to: '2027-01-30' }).expect(201);
    expect(p1.body.period.amount).toBe(4000);
    const p2 = await agent.post(`/api/claims/${claim.body.claimId}/sick-leave`).send({ from: '2027-01-31', to: '2027-07-29' }).expect(201);
    expect(p2.body.period.parts).toHaveLength(2);
    expect(p2.body.period.parts[1].pct).toBe(0.5);
    expect(p2.body.totalAmount).toBeCloseTo(4000 * 6 + 30 * (4000 / 30) * 0.5, 0);
    await agent.post(`/api/claims/${claim.body.claimId}/sick-leave`).send({ from: '2027-01-15', to: '2027-01-20' }).expect(409);
    expect((await agent.get(`/api/claims/${claim.body.claimId}`)).body.claim.data.sickLeave).toHaveLength(2);
  });

  test('a wage declaration more than 60 days overdue blocks new WC cover until it is made', async () => {
    const mobile = '+971500020003';
    const first = await buy(mobile, 'DED-2020003', 'WC', wcRisk());
    await db('policies').where({ id: first.policyId }).update({ inception_date: inDays(-430), expiry_date: inDays(-65) });
    const q = await quoteAs(first.agent, 'WC', wcRisk());
    await first.agent.put(`/api/quotes/${q.id}/proposer`).set('x-quote-token', q.token).send(proposer(mobile, 'DED-2020003')).expect(200);
    const blocked = await first.agent.post(`/api/quotes/${q.id}/bind`).set('x-quote-token', q.token).send({ method: 'card', card: CARD }).expect(409);
    expect(blocked.body.error.code).toBe('DECLARATION_OVERDUE');
    const est = (await first.agent.get(`/api/wc/${first.policyId}/declaration`)).body.estimated;
    await first.agent.post(`/api/wc/${first.policyId}/declaration`).send({ categories: est.map((l) => ({ category: l.category, actualWages: l.annualWages })) }).expect(201);
    await first.agent.post(`/api/quotes/${q.id}/bind`).set('x-quote-token', q.token).send({ method: 'card', card: CARD }).expect(201);
  });
});

describe('Marine open cover', () => {
  let broker;
  let ocId;
  let holder;
  const ship = (over = {}) => ({ productType: 'single', direction: 'import', commodity: 'GEN_PACKED', packing: 'cartons', container: 'fcl', mode: 'sea',
    origin: { country: 'CN', place: 'Ningbo (CNNGB)' }, destination: { country: 'AE', place: 'Jebel Ali (AEJEA)' }, sailingDate: inDays(5), incoterm: 'CIF',
    vessel: { name: 'MSC AURORA', imo: '9876543' }, invoice: { currency: 'USD', amount: 50000 }, ...over });

  test('ports are available for the picker', async () => {
    const c = (await request(app).get('/api/ref/products/MARINE/config?country=AE').expect(200)).body;
    expect(c.ports.AE.map((p) => p[0])).toContain('AEJEA');
  });

  test('set up an open cover for a customer who then manages sub-users with limits', async () => {
    broker = await login('agent@emiratespremier.test');
    const created = await broker.post('/api/quotes').send({ productCode: 'MARINE', countryCode: 'AE' }).expect(201);
    const id = created.body.quote.id;
    await broker.put(`/api/quotes/${id}/risk`).send({ risk: { productType: 'open_cover', estimatedTurnover: 6000000, perSendingLimit: 1000000, commodities: [{ commodity: 'GEN_PACKED', clause: 'ICC-A', share: 1 }], regions: ['asia', 'gcc'], inceptionDate: inDays(1) } }).expect(200);
    await broker.put(`/api/quotes/${id}/proposer`).send(proposer('+971500030001', 'DED-3030001')).expect(200);
    ocId = (await broker.post(`/api/quotes/${id}/bind`).send({ method: 'broker_credit' }).expect(201)).body.policyId;
    // Link the client's own login to the customer record the broker created.
    holder = await customer('+971500030001');
    const cust = await db('customers').where({ trade_licence: 'DED-3030001' }).first();
    const user = await db('users').where({ mobile: '+971500030001' }).first();
    await db('customers').where({ id: cust.id }).update({ user_id: user.id });

    await holder.post('/api/customers/users').send({ target: '+971500030002', name: 'Logistics Clerk', role: 'user', certificateLimit: 200000 }).expect(201);
    expect((await holder.get('/api/customers/users').expect(200)).body.users).toHaveLength(1);
    const clerk = await customer('+971500030002');
    await clerk.get('/api/customers/users').expect(403);
    const small = await clerk.post(`/api/open-covers/${ocId}/certificates`).send({ shipment: ship({ invoice: { currency: 'USD', amount: 40000 } }) }).expect(201);
    expect(small.body.status).toBe('issued');
    const big = await clerk.post(`/api/open-covers/${ocId}/certificates`).send({ shipment: ship({ invoice: { currency: 'USD', amount: 100000 } }) }).expect(202);
    expect(big.body.reasons.map((r) => r.code)).toContain('UW-M14');
    const list = (await clerk.get(`/api/open-covers/${ocId}/certificates`)).body.certificates;
    expect(list[0].premium).toBeNull();
  });

  test('an API key issues certificates for its own cover only, within its scope', async () => {
    const created = await holder.post(`/api/open-covers/${ocId}/api-keys`).send({ label: 'ERP' }).expect(201);
    const key = created.body.key;
    const res = await request(app).post(`/api/open-covers/${ocId}/certificates`).set('x-api-key', key).send({ shipment: ship() }).expect(201);
    expect((await db('oc_certificates').where({ cert_no: res.body.certNo }).first()).source).toBe('api');
    await request(app).get(`/api/open-covers/${ocId}/declarations`).set('x-api-key', key).expect(403);
    await request(app).get(`/api/open-covers/${ocId}/certificates`).set('x-api-key', 'oc_000000000000_' + '0'.repeat(48)).expect(401);
    await holder.post(`/api/open-covers/${ocId}/api-keys/${created.body.id}/revoke`).expect(200);
    await request(app).get(`/api/open-covers/${ocId}/certificates`).set('x-api-key', key).expect(401);
  });

  test('the renewal quote estimates next year’s turnover from actual certificates', async () => {
    await db('policies').where({ id: ocId }).update({ inception_date: inDays(-305), expiry_date: inDays(59) });
    const ops = await login('ops@portal.test');
    const job = await ops.post('/api/admin/jobs/daily').expect(200);
    expect(job.body.errors).toEqual([]);
    const policy = await db('policies').where({ id: ocId }).first();
    const renewal = await db('quotes').where({ id: policy.renewal_quote_id }).first();
    expect(renewal.risk_data.productType).toBe('open_cover');
    expect(renewal.risk_data.estimatedTurnover).toBeGreaterThanOrEqual(1000000);
    expect(renewal.risk_data.estimatedTurnover).toBeLessThan(6000000);
  });
});

describe('Fire renewal keeps underwriter terms', () => {
  test('same referral rules and no claims: the renewal is approved on last year’s terms', async () => {
    const risk = { occupancy: 'SHOP_GROCERY', locations: [{ address: { building: 'Unit 9', area: 'Karama', city: 'Dubai' }, construction: 'concrete', buildingAge: '10to25', protection: { alarm: true }, civilDefence: false, sumsInsured: { STK: 500000 } }] };
    const q = await quoteAs(null, 'FIRE', risk);
    const a = await customer('+971500040001');
    await a.put(`/api/quotes/${q.id}/proposer`).set('x-quote-token', q.token).send(proposer('+971500040001', 'DED-4040001')).expect(200);
    await a.post(`/api/quotes/${q.id}/referral`).set('x-quote-token', q.token).send({}).expect(200);
    const uw = await login('uw@portal.test');
    const item = (await uw.get('/api/uw/referrals')).body.referrals.find((r) => r.quoteId === q.id);
    await uw.post(`/api/uw/referrals/${item.id}/decision`).send({ outcome: 'approve', loadingPct: 0.1, warranty: 'Renew Civil Defence certificate.', reasonCode: 'UW-04-OK' }).expect(200);
    const bound = await a.post(`/api/quotes/${q.id}/bind`).set('x-quote-token', q.token).send({ method: 'card', card: CARD }).expect(201);
    await db('policies').where({ id: bound.body.policyId }).update({ inception_date: inDays(-340), expiry_date: inDays(25) });
    const ops = await login('ops@portal.test');
    const job = await ops.post('/api/admin/jobs/daily').expect(200);
    expect(job.body.renewalTermsCarried).toBeGreaterThanOrEqual(1);
    const renewal = (await a.get(`/api/policies/${bound.body.policyId}`)).body.policy.renewal;
    expect(renewal.status).toBe('approved');
  });
});

describe('Engineering', () => {
  const car = (over = {}) => ({ productType: 'CAR', tplLimit: 1000000, project: { projectType: 'LOWRISE', name: 'Tower B', area: 'JVC', city: 'Dubai', principal: 'Owner LLC', permitNo: 'BP-2026-5555', contractValue: 4000000, startDate: inDays(0), completionDate: plusMonths(inDays(0), 12), maintenance: 'visits', ...over } });

  test('an unverified permit refers; a survey is requested, scheduled and completed by the risk engineer', async () => {
    const q = await quoteAs(null, 'ENG', car({ permitNo: 'unknown' }));
    expect(q.res.body.quote.rating.referral.reasons.map((r) => r.code)).toContain('UW-E11');
    const a = await customer('+971500050001');
    await a.put(`/api/quotes/${q.id}/proposer`).set('x-quote-token', q.token).send(proposer('+971500050001', 'DED-5050001')).expect(200);
    await a.post(`/api/quotes/${q.id}/referral`).set('x-quote-token', q.token).send({}).expect(200);
    const uw = await login('uw@portal.test');
    const item = (await uw.get('/api/uw/referrals')).body.referrals.find((r) => r.quoteId === q.id);
    const engineers = (await uw.get('/api/surveys/engineers').expect(200)).body.engineers;
    const s = await uw.post('/api/surveys').send({ referralId: item.id, site: 'Tower B, JVC', instructions: 'Check permit board and shoring', assignedTo: engineers[0].id }).expect(201);
    const eng = await login('engineer@portal.test');
    expect((await eng.get('/api/surveys').expect(200)).body.surveys).toHaveLength(1);
    await eng.post(`/api/surveys/${s.body.survey.id}/schedule`).send({ date: inDays(2) }).expect(200);
    const done = await eng.post(`/api/surveys/${s.body.survey.id}/complete`).send({ riskGrade: 'acceptable', findings: 'Permit displayed on site; number differs from application.', recommendations: [{ text: 'Provide corrected permit copy', priority: 'high', dueDays: 7 }] }).expect(200);
    expect(done.body.survey.status).toBe('completed');
    expect((await uw.get(`/api/surveys?referralId=${item.id}`)).body.surveys[0].riskGrade).toBe('acceptable');
    await a.get('/api/surveys').expect(403);
  });

  test('EAR testing beyond the agreed period refers; partial handover is recorded', async () => {
    const ear = car({ projectType: 'MEP_HVAC', contractValue: 3000000, testingWeeks: 2, hotTesting: true });
    ear.productType = 'EAR';
    const { agent, policyId } = await buy('+971500050002', 'DED-5050002', 'ENG', ear);
    const ref = await agent.post(`/api/engineering/${policyId}/project/testing-start`).send({ date: inDays(0), hot: true, weeks: 5 }).expect(202);
    expect(ref.body.reasons[0].code).toBe('UW-E06');
    const ho = await agent.post(`/api/engineering/${policyId}/project/handover`).send({ part: 'Chiller plant room', value: 800000, date: inDays(0) }).expect(201);
    expect(ho.body.status).toBe('recorded');
    const p = (await agent.get(`/api/engineering/${policyId}/project`)).body.project;
    expect(p.handedOverValue).toBe(800000);
    await agent.post(`/api/engineering/${policyId}/project/handover`).send({ part: 'Too much', value: 3000000, date: inDays(0) }).expect(400);
  });

  test('annual CAR: broker-only, preferred brokers bind; projects within terms issue, others refer', async () => {
    const annual = { productType: 'CAR_ANNUAL', tplLimit: 1000000, annual: { estimatedTurnover: 30000000, maxContractValue: 5000000, maxMonths: 18, projectTypes: ['VILLA', 'LOWRISE', 'FITOUT'] } };
    expect((await quoteAs(null, 'ENG', annual)).res.body.quote.rating.notQuotableReason).toBe('ANNUAL_CAR_VIA_BROKER');
    const standard = await login('sara@gulfshield.test');
    const sq = await quoteAs(standard, 'ENG', annual);
    expect(sq.res.body.quote.rating.referral.reasons.map((r) => r.code)).toContain('UW-E14');

    const broker = await login('agent@emiratespremier.test');
    const q = await quoteAs(broker, 'ENG', annual);
    expect(q.res.body.quote.rating.referral.required).toBe(false);
    expect(q.res.body.quote.rating.breakdown.premium).toBe(5000);
    await broker.put(`/api/quotes/${q.id}/proposer`).send(proposer('+971500060001', 'DED-6060001')).expect(200);
    const bound = await broker.post(`/api/quotes/${q.id}/bind`).send({ method: 'broker_credit' }).expect(201);
    expect(bound.body.policyNo).toMatch(/^AE-CAA-B2B-/);

    const project = { projectType: 'VILLA', name: 'Villa 12', area: 'Arabian Ranches', city: 'Dubai', principal: 'Owner', permitNo: 'BP-2026-7001', contractValue: 2400000, startDate: inDays(5), completionDate: plusMonths(inDays(5), 12) };
    const pv = await broker.post(`/api/engineering/${bound.body.policyId}/annual/projects`).send({ project, preview: true }).expect(200);
    expect(pv.body.premium).toBe(4500); // works 3,600 + liability 720 + maintenance 180
    const ok = await broker.post(`/api/engineering/${bound.body.policyId}/annual/projects`).send({ project, payment: { method: 'broker_credit' } }).expect(201);
    expect(ok.body.projectRef).toMatch(/\/P001$/);
    const outside = await broker.post(`/api/engineering/${bound.body.policyId}/annual/projects`).send({ project: { ...project, name: 'Road', projectType: 'ROADWORKS' } }).expect(202);
    expect(outside.body.reasons.map((r) => r.code)).toContain('UW-E13');
    const list = (await broker.get(`/api/engineering/${bound.body.policyId}/annual/projects`).expect(200)).body;
    expect(list.projects).toHaveLength(1);
  });
});

