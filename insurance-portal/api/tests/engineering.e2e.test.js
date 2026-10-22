/**
 * Engineering BRD journeys: CAR priced to the prototype (AED 15,928), instant-issue criteria and
 * referrals (ground works, complexity, value, nat-cat, EAR hot testing / second-hand), CPM fleet
 * priced per item with age and floater, MB / EEI referral items, project lifecycle
 * (extension within 25%, contract value change, completion with minimum retained), equipment change,
 * documents and claims.
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

const car = (over = {}, risk = {}) => ({
  productType: 'CAR', tplLimit: 2000000, addOns: ['SURROUNDING', 'CROSS'], addOnInputs: { surroundingSI: 1000000 },
  project: { projectType: 'LOWRISE', name: 'Al Furjan Residence', area: 'Al Furjan', city: 'Dubai', principal: 'Al Furjan Properties LLC', permitNo: 'BP-2026-1188',
    contractValue: 6400000, startDate: inDays(10), completionDate: plusMonths(inDays(10), 14), maintenance: 'visits', basements: 1, excavationDepth: 4.5, ...over },
  ...risk,
});
const fleet = () => ([
  { type: 'EXCAVATOR', make: 'CAT', model: '320', year: 2022, serial: 'CAT0320X81', value: 650000 },
  { type: 'LOADER', make: 'Komatsu', model: 'WA380', year: 2020, serial: 'KMT380X12', value: 520000 },
  { type: 'MOBILE_CRANE', make: 'Tadano', model: 'GR-600', year: 2019, serial: 'TDN600X07', value: 1450000, ownership: 'financed' },
  { type: 'GENERATOR_CPM', make: 'Gen', model: '500kVA', year: 2023, serial: 'GEN500X44', value: 180000, ownership: 'hired_in' },
]);
const proposer = (mobile, licence, inception = inDays(3)) => ({
  companyName: `Contractor ${licence}`, tradeLicence: licence, licenceExpiry: inDays(300), contactName: 'Project Manager', contactIdNo: '784-1979-1212121-2',
  email: `${licence.toLowerCase()}@test.ae`, mobile, inceptionDate: inception,
  declarations: { truthful: true, noPreviousDecline: true, noOtherInsurance: true, screeningConsent: true, keyFactsRead: true },
});
async function rate(risk) {
  const created = await request(app).post('/api/quotes').send({ productCode: 'ENG', countryCode: 'AE' }).expect(201);
  const res = await request(app).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk });
  return { id: created.body.quote.id, token: created.body.resumeToken, res };
}
async function customer(mobile) {
  const agent = request.agent(app);
  const otp = await agent.post('/api/auth/otp/request').send({ target: mobile }).expect(200);
  await agent.post('/api/auth/otp/verify').send({ target: mobile, code: otp.body.devCode }).expect(200);
  return agent;
}
async function buy(mobile, licence, risk) {
  const q = await rate(risk);
  expect(q.res.status).toBe(200);
  const agent = await customer(mobile);
  await agent.put(`/api/quotes/${q.id}/proposer`).set('x-quote-token', q.token).send(proposer(mobile, licence)).expect(200);
  const bound = await agent.post(`/api/quotes/${q.id}/bind`).set('x-quote-token', q.token).send({ method: 'card', card: CARD }).expect(201);
  return { agent, policyId: bound.body.policyId, policyNo: bound.body.policyNo };
}
const codes = (r) => r.res.body.quote.rating.referral.reasons.map((x) => x.code);

beforeAll(async () => { await db.migrate.rollback(undefined, true); await db.migrate.latest(); await db.seed.run(); });
afterAll(async () => { await db.destroy(); });

describe('CAR and EAR', () => {
  test('CAR prices to the BRD prototype and issues instantly', async () => {
    const r = await rate(car());
    expect(r.res.status).toBe(200);
    const b = r.res.body.quote.rating.breakdown;
    expect(b.months).toBe(14);
    expect(b.worksPremium).toBe(11200);
    expect(b.tplPremium).toBe(2880);
    expect(b.maintenancePremium).toBe(560);
    expect(b.extensionsTotal).toBe(1288);
    expect(b.premium).toBe(15928);
    expect(r.res.body.quote.rating.referral.required).toBe(false);
  });

  test('outside instant criteria refers', async () => {
    expect(codes(await rate(car({ basements: 2 })))).toContain('UW-E09');
    expect(codes(await rate(car({ dewatering: true })))).toContain('UW-E09');
    expect(codes(await rate(car({ projectType: 'HIGHRISE' })))).toContain('UW-E02');
    expect(codes(await rate(car({ contractValue: 12000000 })))).toContain('UW-E01');
    expect(codes(await rate(car({ completionDate: plusMonths(inDays(10), 30) })))).toContain('UW-E01');
    expect(codes(await rate(car({ area: 'Wadi Al Safa' })))).toContain('UW-E08');
    const ear = { projectType: 'MEP_HVAC', contractValue: 3000000, hotTesting: true, testingWeeks: 4 };
    expect(codes(await rate(car(ear, { productType: 'EAR', addOns: [] })))).toContain('UW-E06');
    expect(codes(await rate(car({ ...ear, hotTesting: false, secondHand: true }, { productType: 'EAR', addOns: [] })))).toContain('UW-E04');
    expect((await rate(car({ contractValue: 150000000 }))).res.body.quote.rating.notQuotableReason).toBe('ABOVE_ONLINE_LIMIT');
    expect((await rate(car({ completionDate: inDays(5) }))).res.status).toBe(400);
  });

  test('project lifecycle: extension within 25%, contract value change, completion with minimum retained', async () => {
    const { agent, policyId, policyNo } = await buy('+971500010001', 'DED-1010001', car());
    expect(policyNo).toMatch(/^AE-CAR-B2C-/);
    const project = (await agent.get(`/api/engineering/${policyId}/project`).expect(200)).body.project;
    expect(project.phase).toBe('not_started');
    expect(project.maintenanceEnd).toBe(plusMonths(plusMonths(inDays(10), 14), 12));
    const doc = await agent.get(`/api/policies/${policyId}/documents/schedule`).expect(200);
    expect(doc.text).toContain('Al Furjan Residence');

    const to = plusMonths(project.completionDate, 3);
    const preview = await agent.post(`/api/engineering/${policyId}/project/extension`).send({ newCompletionDate: to, reason: 'Late materials', preview: true }).expect(200);
    expect(preview.body.premiumDelta).toBe(2400);
    await agent.post(`/api/engineering/${policyId}/project/extension`).send({ newCompletionDate: to, reason: 'Late materials' }).expect(422);
    await agent.post(`/api/engineering/${policyId}/project/extension`).send({ newCompletionDate: to, reason: 'Late materials', payment: { method: 'card', card: CARD } }).expect(201);
    const big = await agent.post(`/api/engineering/${policyId}/project/extension`).send({ newCompletionDate: plusMonths(to, 5), reason: 'Redesign' }).expect(202);
    expect(big.body.reasons[0].code).toBe('UW-E12');
    const uw = request.agent(app);
    await uw.post('/api/auth/login').send({ email: 'uw@portal.test', password: 'Passw0rd!' }).expect(200);
    const item = (await uw.get('/api/uw/referrals')).body.referrals.find((r) => r.kind === 'endorsement');
    const decided = await uw.post(`/api/uw/referrals/${item.id}/decision`).send({ outcome: 'approve', loadingPct: 0.1, reasonCode: 'UW-E12-OK' }).expect(200);
    expect(decided.body.premiumDelta).toBeCloseTo(big.body.premiumDelta * 1.1, 1);
    await agent.post(`/api/policies/${policyId}/endorsement-requests/${big.body.requestId}/accept`).send({ payment: { method: 'card', card: CARD } }).expect(201);
    expect((await agent.get(`/api/engineering/${policyId}/project`)).body.project.completionDate).toBe(plusMonths(to, 5));

    const cv = await agent.post(`/api/engineering/${policyId}/project/contract-value`).send({ newContractValue: 7000000, payment: { method: 'card', card: CARD } }).expect(201);
    expect(cv.body.premiumDelta).toBeGreaterThan(0);

    const started = await buy('+971500010002', 'DED-1010002', car({ startDate: inDays(0), completionDate: plusMonths(inDays(0), 8) }));
    const done = await started.agent.post(`/api/engineering/${started.policyId}/project/completion`).send({ completionDate: inDays(0), finalContractValue: 5000000 }).expect(201);
    const works = (await started.agent.get(`/api/policies/${started.policyId}`)).body.policy.breakdown.worksPremium;
    expect(done.body.premiumDelta).toBeCloseTo(-works * 0.2, 0);
    expect((await started.agent.get(`/api/engineering/${started.policyId}/project`)).body.project.phase).toBe('maintenance');
  });
});

describe('equipment', () => {
  test('CPM fleet priced per item with age and floater; old or large items refer', async () => {
    const r = await rate({ productType: 'CPM', territory: 'floater', items: fleet() });
    expect(r.res.status).toBe(200);
    expect(r.res.body.quote.rating.breakdown.itemsPremium).toBeCloseTo(44668.88, 1);
    expect(r.res.body.quote.rating.sumInsured).toBe(2800000);
    expect(r.res.body.quote.rating.referral.required).toBe(false);
    expect(codes(await rate({ productType: 'CPM', items: [{ ...fleet()[0], year: 2013 }] }))).toContain('UW-E04');
    expect(codes(await rate({ productType: 'CPM', items: [{ ...fleet()[2], value: 3000000 }] }))).toContain('UW-E01');
    expect((await rate({ productType: 'CPM', items: [{ ...fleet()[0], type: 'CHILLER' }] })).res.status).toBe(422);
  });

  test('MB and EEI referral items', async () => {
    expect(codes(await rate({ productType: 'MB', items: [{ type: 'TRANSFORMER', year: 2021, value: 900000, capacityMW: 10 }] }))).toContain('UW-E06');
    expect(codes(await rate({ productType: 'EEI', items: [{ type: 'MEDICAL_IMAGING', year: 2023, value: 240000 }] }))).toContain('UW-E06');
    const eei = await rate({ productType: 'EEI', items: [{ type: 'OFFICE_IT', year: 2024, value: 350000 }], addOns: ['DATA', 'ICOW'], addOnInputs: { dataSI: 50000, icowSI: 60000 } });
    expect(eei.res.body.quote.rating.breakdown.extensionsTotal).toBe(450);
  });

  test('add a machine mid-term, paid pro rata; claims give engineering instructions', async () => {
    const { agent, policyId } = await buy('+971500011001', 'DED-1111001', { productType: 'CPM', territory: 'floater', items: fleet() });
    const items = [...fleet(), { type: 'CONCRETE_PUMP', make: 'Putz', model: 'M36', year: 2024, serial: 'PTZ36X01', value: 400000 }];
    const preview = await agent.post(`/api/policies/${policyId}/endorsements/preview`).send({ items }).expect(200);
    expect(preview.body.premiumDelta).toBeGreaterThan(0);
    const applied = await agent.post(`/api/policies/${policyId}/endorsements`).send({ type: 'sum_insured', items, payment: { method: 'card', card: CARD } }).expect(201);
    expect(applied.body.newSumInsured).toBe(3200000);
    const claim = await agent.post('/api/claims').send({ policyId, lossDate: inDays(0), cause: 'accident', description: 'Crane outrigger sank and the boom hit scaffolding.', estimate: 180000 }).expect(201);
    expect(claim.body.nextSteps).toContain('NO_REPAIRS_BEFORE_SURVEY');
  });
});
