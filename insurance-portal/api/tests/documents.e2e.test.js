/**
 * Document upload and dashboards: required-document checklist, content-type sniffing, virus
 * scanning, size limit, access control, staff review; customer and broker dashboard figures.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/db');

const app = createApp();
const CARD = { number: '4242424242424242', expiry: '12/29', cvc: '123' };
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0)]);
const EICAR = Buffer.from('%PDF-1.4 X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
const fireRisk = (cd = true) => ({ occupancy: 'SHOP_GROCERY', locations: [{ address: { building: 'Shop 9', area: 'Karama', city: 'Dubai' }, construction: 'concrete', buildingAge: 'lt10', protection: { alarm: true }, civilDefence: cd, sumsInsured: { STK: 500000 } }] });
const proposer = (mobile, licence) => ({ companyName: `Docs ${licence}`, tradeLicence: licence, licenceExpiry: inDays(300), contactName: 'Owner', contactIdNo: '784-1980-0000000-1', email: `${licence.toLowerCase()}@test.ae`, mobile, inceptionDate: inDays(1), declarations: { truthful: true, noPreviousDecline: true, noOtherInsurance: true, screeningConsent: true, keyFactsRead: true } });

async function login(email) { const a = request.agent(app); await a.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200); return a; }
async function customer(mobile) {
  const a = request.agent(app);
  const otp = await a.post('/api/auth/otp/request').send({ target: mobile }).expect(200);
  await a.post('/api/auth/otp/verify').send({ target: mobile, code: otp.body.devCode }).expect(200);
  return a;
}
async function buy(agent, mobile, licence, risk = fireRisk()) {
  const c = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
  await request(app).put(`/api/quotes/${c.body.quote.id}/risk`).set('x-quote-token', c.body.resumeToken).send({ risk }).expect(200);
  await agent.put(`/api/quotes/${c.body.quote.id}/proposer`).set('x-quote-token', c.body.resumeToken).send(proposer(mobile, licence)).expect(200);
  return (await agent.post(`/api/quotes/${c.body.quote.id}/bind`).set('x-quote-token', c.body.resumeToken).send({ method: 'card', card: CARD }).expect(201)).body;
}
const upload = (agent, fields, buf, name) => agent.post('/api/documents').field('entity', fields.entity).field('entityId', String(fields.entityId)).field('docType', fields.docType).attach('file', buf, name);

beforeAll(async () => { await db.migrate.rollback(undefined, true); await db.migrate.latest(); await db.seed.run(); });
afterAll(async () => { await db.destroy(); });

describe('documents', () => {
  let owner;
  let claimId;

  test('a fire claim shows its checklist; valid files upload, spoofed, infected and oversized files are refused', async () => {
    owner = await customer('+971500110001');
    const p = await buy(owner, '+971500110001', 'DED-1100001');
    const claim = await owner.post('/api/claims').send({ policyId: p.policyId, lossDate: inDays(0), cause: 'fire', description: 'Kitchen fire damaged stock.' }).expect(201);
    claimId = claim.body.claimId;
    const first = (await owner.get(`/api/documents?entity=claim&entityId=${claimId}`).expect(200)).body;
    expect(first.checklist.map((c) => c.docType)).toEqual(['photo', 'invoice', 'other']);
    expect(first.complete).toBe(false);

    const pdf = await upload(owner, { entity: 'claim', entityId: claimId, docType: 'photo' }, PDF, 'damage.pdf').expect(201);
    expect(pdf.body.document.mime).toBe('application/pdf');
    await upload(owner, { entity: 'claim', entityId: claimId, docType: 'invoice' }, PNG, 'invoice.png').expect(201);
    expect((await upload(owner, { entity: 'claim', entityId: claimId, docType: 'other' }, EXE, 'report.pdf').expect(415)).body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect((await upload(owner, { entity: 'claim', entityId: claimId, docType: 'other' }, EICAR, 'report.pdf').expect(422)).body.error.code).toBe('FILE_INFECTED');
    await upload(owner, { entity: 'claim', entityId: claimId, docType: 'nonsense' }, PDF, 'x.pdf').expect(400);
    await db('system_parameters').where({ key: 'documents.maxSizeMb' }).update({ value: JSON.stringify(0.0005) });
    require('../src/lib/params').invalidate();
    await upload(owner, { entity: 'claim', entityId: claimId, docType: 'other' }, Buffer.concat([PDF, Buffer.alloc(2000, 32)]), 'big.pdf').expect(413);
    await db('system_parameters').where({ key: 'documents.maxSizeMb' }).update({ value: JSON.stringify(10) });
    require('../src/lib/params').invalidate();
    await upload(owner, { entity: 'claim', entityId: claimId, docType: 'other' }, PDF, 'civil-defence-report.pdf').expect(201);
    const after = (await owner.get(`/api/documents?entity=claim&entityId=${claimId}`)).body;
    expect(after.complete).toBe(true);
    expect(after.documents).toHaveLength(3);

    const dl = await owner.get(`/api/documents/${pdf.body.document.id}/download`).buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(Buffer.compare(dl.body, PDF)).toBe(0);
  });

  test('other customers cannot see the documents; staff review; reviewed documents are locked', async () => {
    const stranger = await customer('+971500110002');
    await stranger.get(`/api/documents?entity=claim&entityId=${claimId}`).expect(403);
    const docs = (await owner.get(`/api/documents?entity=claim&entityId=${claimId}`)).body.documents;
    await stranger.get(`/api/documents/${docs[0].id}/download`).expect(403);
    const ops = await login('ops@portal.test');
    expect((await ops.get('/api/ui/notifications')).body.notifications.some((n) => n.title.startsWith('New document'))).toBe(true);
    await owner.post(`/api/documents/${docs[0].id}/review`).send({ status: 'verified' }).expect(403);
    await ops.post(`/api/documents/${docs[0].id}/review`).send({ status: 'verified' }).expect(200);
    await ops.post(`/api/documents/${docs[1].id}/review`).send({ status: 'rejected', note: 'Unreadable' }).expect(200);
    const list = (await owner.get(`/api/documents?entity=claim&entityId=${claimId}`)).body;
    expect(list.checklist.find((c) => c.docType === 'photo').verified).toBe(true);
    expect(list.checklist.find((c) => c.docType === 'invoice').provided).toBe(false);
    await owner.delete(`/api/documents/${docs[0].id}`).expect(403);
    await owner.delete(`/api/documents/${docs[2].id}`).expect(200);
    expect((await owner.get(`/api/documents?entity=claim&entityId=${claimId}`)).body.documents).toHaveLength(2);
  });

  test('a referral without a Civil Defence certificate asks for it; the underwriter can see uploads', async () => {
    const c = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    await request(app).put(`/api/quotes/${c.body.quote.id}/risk`).set('x-quote-token', c.body.resumeToken).send({ risk: fireRisk(false) }).expect(200);
    const a = await customer('+971500110003');
    await a.put(`/api/quotes/${c.body.quote.id}/proposer`).set('x-quote-token', c.body.resumeToken).send(proposer('+971500110003', 'DED-1100003')).expect(200);
    await a.post(`/api/quotes/${c.body.quote.id}/referral`).set('x-quote-token', c.body.resumeToken).send({}).expect(200);
    const list = (await a.get(`/api/documents?entity=quote&entityId=${c.body.quote.id}`).expect(200)).body;
    expect(list.checklist.map((x) => x.docType)).toEqual(['civil_defence', 'trade_licence']);
    await upload(a, { entity: 'quote', entityId: c.body.quote.id, docType: 'civil_defence' }, PDF, 'cd.pdf').expect(201);
    const uw = await login('uw@portal.test');
    const ref = (await uw.get('/api/uw/referrals')).body.referrals.find((r) => r.quoteId === c.body.quote.id);
    const seen = (await uw.get(`/api/documents?entity=referral&entityId=${ref.id}`).expect(200)).body;
    expect(seen.complete).toBe(true);
  });
});

describe('dashboards', () => {
  test('customer dashboard shows their own policies, payments and claims only', async () => {
    const a = await customer('+971500110001');
    const d = (await a.get('/api/dashboard/customer').expect(200)).body;
    expect(d.kpis.activePolicies).toBe(1);
    expect(d.kpis.openClaims).toBe(1);
    expect(d.kpis.premiumPaidYtd).toBeGreaterThan(500);
    expect(d.premiumByProduct.map((x) => x.code)).toEqual(['FIRE']);
    expect(d.paymentsByMonth).toHaveLength(12);
    expect(d.paymentsByMonth[11].value).toBe(d.kpis.premiumPaidYtd);
    await a.get('/api/dashboard/broker').expect(403);
  });

  test('broker dashboard shows premium, funnel, commission and renewals for the firm', async () => {
    const sara = await login('sara@gulfshield.test');
    const c = await sara.post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    await sara.put(`/api/quotes/${c.body.quote.id}/risk`).send({ risk: fireRisk() }).expect(200);
    await sara.put(`/api/quotes/${c.body.quote.id}/proposer`).send(proposer('+971500110009', 'DED-1100009')).expect(200);
    const bound = await sara.post(`/api/quotes/${c.body.quote.id}/bind`).send({ method: 'broker_credit' }).expect(201);
    const policy = await db('policies').where({ id: bound.body.policyId }).first();
    await db('policies').where({ id: policy.id }).update({ expiry_date: inDays(20) });
    const d = (await sara.get('/api/dashboard/broker').expect(200)).body;
    expect(d.kpis.gwpYtd).toBe(Number(policy.premium));
    expect(d.kpis.policiesYtd).toBe(1);
    expect(d.funnel.find((f) => f.stage === 'bound').value).toBe(1);
    expect(d.kpis.commissionEarnedYtd).toBeCloseTo(Number(policy.premium) * 0.15, 1);
    expect(d.productMix[0].code).toBe('FIRE');
    expect(d.renewals[0].policyNo).toBe(policy.policy_no);
    expect(d.topClients[0].client).toBe('Docs DED-1100009');
    expect(d.gwpByMonth[11].value).toBe(Number(policy.premium));
    const other = (await (await login('agent@emiratespremier.test')).get('/api/dashboard/broker').expect(200)).body;
    expect(other.kpis.gwpYtd).toBe(0);
  });
});
