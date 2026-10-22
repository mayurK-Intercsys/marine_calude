/**
 * Marine BRD journeys: single transit pricing (Incoterm, FX, uplift, war/SRCC, VAT by direction),
 * referral and not-quotable rules, policy and certificate documents, open cover set-up through
 * a broker with underwriter approval, certificates (single, referred, approved, bulk, cancelled),
 * declarations, deposit adjustment and claims against a certificate.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/db');

const app = createApp();
const CARD = { number: '4242424242424242', expiry: '12/29', cvc: '123' };

const inDays = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const shipment = (over = {}) => ({
  productType: 'single',
  direction: 'import',
  commodity: 'ELEC_APPLIANCES',
  description: 'Microwave ovens, 1,200 cartons',
  packing: 'pallets',
  container: 'fcl',
  mode: 'sea',
  origin: { country: 'CN', place: 'Shanghai (CNSHA)' },
  destination: { country: 'AE', place: 'Jebel Ali (AEJEA)' },
  sailingDate: inDays(10),
  incoterm: 'FOB',
  vessel: { name: 'MSC AURORA', imo: '9876543' },
  invoice: { currency: 'USD', amount: 85000 },
  freight: 3200,
  clause: 'ICC-A',
  war: true,
  srcc: true,
  business: { name: 'Gulf Home Appliances Trading LLC' },
  ...over,
});

const proposer = (mobile, licence) => ({
  companyName: `Importer ${licence}`, tradeLicence: licence, licenceExpiry: inDays(300), contactName: 'Rania S.',
  contactIdNo: '784-1990-7654321-2', email: `${licence.toLowerCase()}@test.ae`, mobile, inceptionDate: inDays(1),
  declarations: { truthful: true, noPreviousDecline: true, noOtherInsurance: true, screeningConsent: true, keyFactsRead: true },
});

async function login(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200);
  return agent;
}

async function customer(mobile) {
  const agent = request.agent(app);
  const otp = await agent.post('/api/auth/otp/request').send({ target: mobile }).expect(200);
  await agent.post('/api/auth/otp/verify').send({ target: mobile, code: otp.body.devCode }).expect(200);
  return agent;
}

async function rateAnon(risk) {
  const created = await request(app).post('/api/quotes').send({ productCode: 'MARINE', countryCode: 'AE' }).expect(201);
  const res = await request(app).put(`/api/quotes/${created.body.quote.id}/risk`).set('x-quote-token', created.body.resumeToken).send({ risk });
  return { ...created.body, res };
}

const codes = (quote) => quote.rating.referral.reasons.map((r) => r.code);

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
});

afterAll(async () => {
  await db.destroy();
});

describe('single transit', () => {
  test('prices an FOB import: freight added, 10% uplift, USD converted, war and strikes, 5% VAT', async () => {
    const { res } = await rateAnon(shipment());
    expect(res.status).toBe(200);
    const r = res.body.quote.rating;
    expect(r.quotable).toBe(true);
    expect(r.sumInsured).toBe(356305.95);
    expect(r.breakdown.basePremium).toBe(481.01);
    expect(r.breakdown.warPremium).toBe(106.89);
    expect(r.breakdown.srccPremium).toBe(71.26);
    expect(r.breakdown.premium).toBe(659.17);
    expect(r.breakdown.tax).toBe(34.21);
    expect(r.breakdown.total).toBe(718.38);
    expect(r.referral.required).toBe(false);
  });

  test('exports are zero-rated for VAT and CIF does not add freight again', async () => {
    const { res } = await rateAnon(shipment({ direction: 'export', origin: { country: 'AE', place: 'Jebel Ali' }, destination: { country: 'IN', place: 'Nhava Sheva' }, incoterm: 'CIF' }));
    const r = res.body.quote.rating;
    expect(r.sumInsured).toBe(Math.round(85000 * 1.1 * 3.6725 * 100) / 100);
    expect(r.breakdown.tax).toBe(0);
  });

  test('referral rules: used machinery, war-listed route, old vessel', async () => {
    const used = await rateAnon(shipment({ commodity: 'USED_MACHINERY', clause: 'ICC-C' }));
    expect(codes(used.res.body.quote)).toContain('UW-M02');
    const war = await rateAnon(shipment({ origin: { country: 'SD', place: 'Port Sudan' } }));
    expect(codes(war.res.body.quote)).toContain('UW-M03');
    const old = await rateAnon(shipment({ vessel: { name: 'OLD STAR', imo: '' } }));
    expect(codes(old.res.body.quote)).toContain('UW-M04');
    expect(old.res.body.quote.rating.breakdown.factors.vessel).toBe(1.15);
    const soon = await rateAnon(shipment({ sailingDate: inDays(0) }));
    expect(codes(soon.res.body.quote)).toContain('UW-M06');
  });

  test('declined country and prohibited goods are not quotable; wrong clause and inland war are rejected', async () => {
    const iran = await rateAnon(shipment({ origin: { country: 'IR', place: 'Bandar Abbas' } }));
    expect(iran.res.body.quote.rating.notQuotableReason).toBe('COUNTRY_DECLINED');
    const explosives = await rateAnon(shipment({ commodity: 'EXPLOSIVES' }));
    expect(explosives.res.body.quote.rating.notQuotableReason).toBe('COMMODITY_PROHIBITED');
    const clause = await rateAnon(shipment({ commodity: 'BULK_GRAIN', clause: 'ICC-A' }));
    expect(clause.res.status).toBe(422);
    const inland = await rateAnon(shipment({ productType: 'inland', mode: 'road', clause: 'ITC-A', war: true, origin: { country: 'AE', place: 'Dubai' }, destination: { country: 'AE', place: 'Abu Dhabi' } }));
    expect(inland.res.status).toBe(422);
  });

  test('a customer buys a single transit; the certificate shows the voyage and LC wording', async () => {
    const lc = { bank: 'Emirates Test Bank', number: 'LC/2026/55120', wording: 'Insurance certificate in duplicate for 110% of CIF value.' };
    const created = await request(app).post('/api/quotes').send({ productCode: 'MARINE', countryCode: 'AE' }).expect(201);
    const { id } = created.body.quote;
    const token = created.body.resumeToken;
    await request(app).put(`/api/quotes/${id}/risk`).set('x-quote-token', token).send({ risk: shipment({ lc }) }).expect(200);
    const agent = await customer('+971500005001');
    const saved = await agent.put(`/api/quotes/${id}/proposer`).set('x-quote-token', token).send(proposer('+971500005001', 'DED-5005001')).expect(200);
    expect(saved.body.quote.risk.inceptionDate).toBe(inDays(10));
    const bound = await agent.post(`/api/quotes/${id}/bind`).set('x-quote-token', token).send({ method: 'card', card: CARD }).expect(201);
    expect(bound.body.policyNo).toMatch(/^AE-MST-B2C-/);
    const policy = (await agent.get(`/api/policies/${bound.body.policyId}`)).body.policy;
    expect(policy.expiryDate).toBe(inDays(100));
    const doc = await agent.get(`/api/policies/${bound.body.policyId}/documents/certificate?lang=en&copy=duplicate`).expect(200);
    expect(doc.text).toContain('Certificate of marine cargo insurance');
    expect(doc.text).toContain('Jebel Ali');
    expect(doc.text).toContain('LC/2026/55120');
    expect(doc.text).toContain('Duplicate');
    const ar = await agent.get(`/api/policies/${bound.body.policyId}/documents/certificate?lang=ar`).expect(200);
    expect(ar.text).toContain('dir="rtl"');
  });

  test('customers cannot buy an open cover online', async () => {
    const { res } = await rateAnon({ productType: 'open_cover', estimatedTurnover: 5000000, perSendingLimit: 500000, commodities: [{ commodity: 'GEN_PACKED', clause: 'ICC-A', share: 1 }] });
    expect(res.body.quote.rating.notQuotableReason).toBe('OPEN_COVER_VIA_BROKER');
  });
});

describe('open cover', () => {
  let broker;
  let policyId;
  let referredCertId;

  const ocRisk = {
    productType: 'open_cover', interest: 'import', estimatedTurnover: 24000000, perSendingLimit: 3000000,
    commodities: [{ commodity: 'ELEC_APPLIANCES', clause: 'ICC-A', share: 0.7 }, { commodity: 'FOOD_PACKED', clause: 'ICC-A', share: 0.3 }],
    regions: ['asia', 'gcc'], war: true, srcc: true, premiumBasis: 'deposit', inceptionDate: inDays(1), business: { name: 'Falcon Foodstuff Trading LLC' },
  };

  test('a standard broker’s open cover needs underwriter approval, then binds on broker credit', async () => {
    broker = await login('sara@gulfshield.test');
    const created = await broker.post('/api/quotes').send({ productCode: 'MARINE', countryCode: 'AE' }).expect(201);
    const { id } = created.body.quote;
    const rated = await broker.put(`/api/quotes/${id}/risk`).send({ risk: ocRisk }).expect(200);
    const b = rated.body.quote.rating.breakdown;
    expect(b.estimatedPremium).toBe(47280);
    expect(b.premium).toBe(35460);
    expect(b.total).toBe(37338);
    expect(codes(rated.body.quote)).toContain('UW-M10');

    await broker.put(`/api/quotes/${id}/proposer`).send({ ...proposer('+971500006001', 'DED-6006001'), companyName: 'Falcon Foodstuff Trading LLC' }).expect(200);
    await broker.post(`/api/quotes/${id}/referral`).send({ note: 'Regular importer, clean record.' }).expect(200);
    const uw = await login('uw@portal.test');
    const ref = (await uw.get('/api/uw/referrals')).body.referrals.find((r) => r.quoteId === id);
    await uw.post(`/api/uw/referrals/${ref.id}/decision`).send({ outcome: 'approve', loadingPct: 0, reasonCode: 'UW-M10-OK' }).expect(200);
    const bound = await broker.post(`/api/quotes/${id}/bind`).send({ method: 'broker_credit' }).expect(201);
    expect(bound.body.policyNo).toMatch(/^AE-MOC-B2B-/);
    policyId = bound.body.policyId;

    const oc = (await broker.get(`/api/open-covers/${policyId}`).expect(200)).body.openCover;
    expect(oc.deposit).toBe(35460);
    expect(oc.schedule).toHaveLength(2);
    const schedule = await broker.get(`/api/policies/${policyId}/documents/schedule`).expect(200);
    expect(schedule.text).toContain('Open cover schedule');
  });

  test('a certificate within terms issues instantly at the agreed rate', async () => {
    const s = shipment({ incoterm: 'CIF', invoice: { currency: 'USD', amount: 142500 }, freight: 0, sailingDate: inDays(5) });
    delete s.business;
    const preview = await broker.post(`/api/open-covers/${policyId}/certificates/preview`).send({ shipment: s }).expect(200);
    expect(preview.body.referralRequired).toBe(false);
    const res = await broker.post(`/api/open-covers/${policyId}/certificates`).send({ shipment: s }).expect(201);
    expect(res.body.certNo).toMatch(/\/0001$/);
    expect(res.body.sumInsured).toBe(575664.38);
    expect(res.body.premium).toBe(1151.33);
    expect(res.body.total).toBe(1208.9);
    const doc = await broker.get(`/api/open-covers/${policyId}/certificates/${res.body.certificateId}/document`).expect(200);
    expect(doc.text).toContain(res.body.certNo);
  });

  test('outside terms and over the per-sending limit refer; the underwriter can approve', async () => {
    const frozen = await broker.post(`/api/open-covers/${policyId}/certificates`).send({ shipment: shipment({ commodity: 'FROZEN', container: 'reefer', sailingDate: inDays(6) }) }).expect(202);
    expect(frozen.body.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['UW-M11']));
    const big = await broker.post(`/api/open-covers/${policyId}/certificates`).send({ shipment: shipment({ invoice: { currency: 'USD', amount: 900000 }, sailingDate: inDays(7) }) }).expect(202);
    expect(big.body.reasons.map((r) => r.code)).toContain('UW-M12');
    referredCertId = big.body.certificateId;

    const uw = await login('uw@portal.test');
    const item = (await uw.get('/api/uw/referrals')).body.referrals.find((r) => r.kind === 'certificate' && r.quoteRef === big.body.certNo);
    const detail = await uw.get(`/api/uw/referrals/${item.id}`).expect(200);
    expect(detail.body.certificate.facts.exceedsSendingLimit).toBe(true);
    const decided = await uw.post(`/api/uw/referrals/${item.id}/decision`).send({ outcome: 'approve', loadingPct: 0.1, reasonCode: 'UW-M12-OK' }).expect(200);
    expect(decided.body.status).toBe('issued');
    const list = (await broker.get(`/api/open-covers/${policyId}/certificates`)).body.certificates;
    expect(list.find((c) => c.id === referredCertId).status).toBe('issued');
  });

  test('bulk upload issues clean rows, refers some and reports errors per row', async () => {
    const rows = [
      shipment({ sailingDate: inDays(8), invoice: { currency: 'USD', amount: 20000 } }),
      shipment({ sailingDate: inDays(8), invoice: { currency: 'USD', amount: 0 } }),
      shipment({ sailingDate: inDays(8), origin: { country: 'IR', place: 'Bandar Abbas' } }),
      shipment({ sailingDate: inDays(8), commodity: 'GEN_PACKED' }),
    ].map(({ business, ...r }) => r);
    const res = await broker.post(`/api/open-covers/${policyId}/certificates/bulk`).send({ rows }).expect(200);
    expect(res.body.summary).toEqual({ rows: 4, issued: 1, referred: 1, errors: 2 });
    expect(res.body.results[2].code).toBe('COUNTRY_DECLINED');
  });

  test('another broker cannot issue; a certificate can be cancelled before sailing', async () => {
    const other = await login('agent@emiratespremier.test');
    await other.post(`/api/open-covers/${policyId}/certificates`).send({ shipment: shipment() }).expect(403);
    const before = (await broker.get(`/api/open-covers/${policyId}`)).body.openCover.turnoverUsed;
    const certs = (await broker.get(`/api/open-covers/${policyId}/certificates?status=issued`)).body.certificates;
    const target = certs.find((c) => c.sailingDate === inDays(8));
    await broker.post(`/api/open-covers/${policyId}/certificates/${target.id}/cancel`).send({ reason: 'Order cancelled' }).expect(200);
    const after = (await broker.get(`/api/open-covers/${policyId}`)).body.openCover.turnoverUsed;
    expect(after).toBeLessThan(before);
  });

  test('monthly declaration, deposit adjustment and a claim against a certificate', async () => {
    const now = await broker.post(`/api/open-covers/${policyId}/declarations`).send({ period: inDays(0).slice(0, 7) }).expect(400);
    expect(now.body.error.code).toBe('PERIOD_NOT_ENDED');

    // Move the cover and one certificate into last month so it can be declared.
    const lastMonth = new Date();
    lastMonth.setUTCDate(1);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const period = lastMonth.toISOString().slice(0, 7);
    await db('policies').where({ id: policyId }).update({ inception_date: `${period}-01`, expiry_date: inDays(10) });
    const first = await db('oc_certificates').where({ policy_id: policyId, status: 'issued' }).orderBy('id').first();
    await db('oc_certificates').where({ id: first.id }).update({ sailing_date: `${period}-15` });

    const dec = await broker.post(`/api/open-covers/${policyId}/declarations`).send({ period, extraShipments: [{ description: 'Sample shipment sent by courier', sumInsured: 10000 }] }).expect(201);
    expect(dec.body.certificates).toBe(1);
    expect(dec.body.premium).toBeGreaterThan(1151.33);
    await broker.post(`/api/open-covers/${policyId}/declarations`).send({ period }).expect(409);
    const months = (await broker.get(`/api/open-covers/${policyId}/declarations`)).body.declarations;
    expect(months.find((m) => m.period === period).submitted).toBe(true);
    await broker.post(`/api/open-covers/${policyId}/certificates/${first.id}/cancel`).send({}).expect(409);

    const adj = await broker.post(`/api/open-covers/${policyId}/adjustment`).expect(201);
    expect(adj.body.premiumDelta).toBe(-7092);
    await broker.post(`/api/open-covers/${policyId}/adjustment`).expect(409);

    const claim = await broker.post('/api/claims').send({ policyId, certificateId: first.id, lossDate: inDays(-1), cause: 'damage', description: 'Cartons crushed during discharge at Jebel Ali.', estimate: 25000, carrierReceipt: 'claused' }).expect(201);
    expect(claim.body.nextSteps).toContain('HOLD_CARRIER_LIABLE');
    expect(claim.body.coverFlags).not.toContain('CERTIFICATE_NOT_ISSUED');
  });
});
