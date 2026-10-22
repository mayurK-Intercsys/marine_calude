/**
 * Admin module: roles and privileges, drop-down values, system parameters, number formats,
 * templates with SMTP and the outbox, notification rules, in-app notifications, commission
 * schemes and payouts, platform licence (modules, expiry, seats), field properties, help, users.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/db');
const { sign, MODULES } = require('../src/lib/licence');

const app = createApp();
const CARD = { number: '4242424242424242', expiry: '12/29', cvc: '123' };
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fireRisk = () => ({ occupancy: 'SHOP_GROCERY', locations: [{ address: { building: 'Shop 1', area: 'Deira', city: 'Dubai' }, construction: 'concrete', buildingAge: 'lt10', protection: { alarm: true }, civilDefence: true, sumsInsured: { STK: 400000 } }] });
const proposer = (mobile, licence) => ({ companyName: `Admin Test ${licence}`, tradeLicence: licence, licenceExpiry: inDays(300), contactName: 'Owner', contactIdNo: '784-1980-0000000-1', email: `${licence.toLowerCase()}@test.ae`, mobile, inceptionDate: inDays(3), declarations: { truthful: true, noPreviousDecline: true, noOtherInsurance: true, screeningConsent: true, keyFactsRead: true } });

async function login(email, password = 'Passw0rd!') { const a = request.agent(app); await a.post('/api/auth/login').send({ email, password }).expect(200); return a; }
async function customer(mobile) {
  const a = request.agent(app);
  const otp = await a.post('/api/auth/otp/request').send({ target: mobile }).expect(200);
  await a.post('/api/auth/otp/verify').send({ target: mobile, code: otp.body.devCode }).expect(200);
  return a;
}
async function buyFire(agent, mobile, licence, risk = fireRisk()) {
  const c = await (agent || request(app)).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
  const id = c.body.quote.id;
  const tk = c.body.resumeToken;
  await (agent || request(app)).put(`/api/quotes/${id}/risk`).set('x-quote-token', tk).send({ risk }).expect(200);
  const a = agent || await customer(mobile);
  await a.put(`/api/quotes/${id}/proposer`).set('x-quote-token', tk).send(proposer(mobile, licence)).expect(200);
  const bound = await a.post(`/api/quotes/${id}/bind`).set('x-quote-token', tk).send(agent ? { method: 'broker_credit' } : { method: 'card', card: CARD }).expect(201);
  return { agent: a, ...bound.body, quoteId: id };
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

describe('roles and privileges', () => {
  test('admin sees configuration entities; brokers and underwriters cannot open admin', async () => {
    const meta = await admin.get('/api/platform/meta').expect(200);
    expect(Object.keys(meta.body.entities)).toEqual(expect.arrayContaining(['lookupValues', 'parameters', 'numberFormats', 'templates', 'notificationRules', 'commissionSchemes', 'fieldDefinitions', 'helpArticles', 'roles']));
    await (await login('sara@gulfshield.test')).get('/api/platform/meta').expect(403);
    await (await login('uw@portal.test')).get('/api/platform/meta').expect(403);
  });

  test('a custom role gets exactly the privileges ticked for it; temporary passwords must be changed', async () => {
    const role = await admin.post('/api/platform/entities/roles').send({ code: 'senior_uw', name_en: 'Senior underwriter', name_ar: 'مكتتب أول', base_role: 'underwriter', active: true }).expect(201);
    await admin.put(`/api/platform/roles/${role.body.id}/permissions`).send({ codes: ['referrals.decide', 'reports.view'] }).expect(200);
    const created = await admin.post('/api/platform/users').send({ email: 'senior.uw@portal.test', name: 'Senior UW', roleId: role.body.id }).expect(201);
    const a = request.agent(app);
    const first = await a.post('/api/auth/login').send({ email: 'senior.uw@portal.test', password: created.body.temporaryPassword }).expect(200);
    expect(first.body.user.mustChangePassword).toBe(true);
    await a.post('/api/auth/change-password').send({ current: created.body.temporaryPassword, next: 'NewPassw0rd2026' }).expect(200);
    await a.get('/api/uw/referrals').expect(200);
    await a.get('/api/platform/meta').expect(403);
    await admin.put(`/api/platform/roles/${role.body.id}/permissions`).send({ codes: ['referrals.decide', 'admin.access', 'admin.audit'] }).expect(200);
    const meta = await a.get('/api/platform/meta').expect(200);
    expect(meta.body.entities).toEqual({});
    await a.get('/api/platform/audit').expect(200);
    const sys = (await admin.get('/api/platform/entities/roles')).body.rows.find((r) => r.code === 'customer');
    await admin.delete(`/api/platform/entities/roles/${sys.id}`).expect(409);
  });
});

describe('drop-down values, parameters, numbering', () => {
  test('editing a drop-down value changes the product screen; inactive values disappear', async () => {
    const values = (await admin.get('/api/platform/entities/lookupValues?filter=FIRE.constructionClasses')).body.rows;
    const concrete = values.find((v) => v.code === 'concrete');
    const light = values.find((v) => v.code === 'light');
    await put(admin, 'lookupValues', concrete.id, { label_en: 'Reinforced concrete' }).expect(200);
    await put(admin, 'lookupValues', light.id, { active: false }).expect(200);
    const cfg = (await request(app).get('/api/ref/products/FIRE/config?country=AE')).body.config;
    expect(cfg.constructionClasses.map((c) => c.code)).toEqual(['concrete', 'mixed']);
    expect(cfg.constructionClasses[0].name.en).toBe('Reinforced concrete');
    const ext = cfg.extensions.find((e) => e.code === 'X08');
    expect(ext.referral).toBe(true);
    await put(admin, 'lookupValues', light.id, { active: true }).expect(200);
  });

  test('system parameters drive behaviour; secrets are masked', async () => {
    await put(admin, 'parameters', 'security.otpMinutes', { value: 2 }).expect(200);
    const otp = await request(app).post('/api/auth/otp/request').send({ target: '+971500090001' }).expect(200);
    expect(otp.body.expiresInSeconds).toBe(120);
    await put(admin, 'parameters', 'email.smtp.password', { value: 's3cret' }).expect(200);
    const rows = (await admin.get('/api/platform/entities/parameters?filter=email')).body.rows;
    expect(rows.find((r) => r.key === 'email.smtp.password').value).toBe('••••••');
    await put(admin, 'parameters', 'security.otpMinutes', { value: 5 }).expect(200);
  });

  test('a product-specific number format is used for new policies', async () => {
    await admin.post('/api/platform/entities/numberFormats').send({ entity: 'policy', product_code: 'FIRE', pattern: 'FP/{YYYY}' }).expect(400);
    await admin.post('/api/platform/entities/numberFormats').send({ entity: 'policy', product_code: 'FIRE', pattern: 'FP/{CHANNEL}/{YYYY}/{SEQ:5}', active: true }).expect(201);
    const p = await buyFire(null, '+971500090002', 'DED-9090002');
    expect(p.policyNo).toMatch(/^FP\/B2C\/\d{4}\/00001$/);
  });
});

describe('messaging', () => {
  test('SMTP test email, rendered policy emails in the outbox, and rules switched off', async () => {
    await put(admin, 'parameters', 'email.smtp.enabled', { value: true }).expect(200);
    await put(admin, 'parameters', 'email.smtp.host', { value: 'json' }).expect(200);
    const t = await admin.post('/api/platform/email/test').send({ to: 'it@insurer.example' }).expect(200);
    expect(t.body.status).toBe('sent');

    const smsRule = (await admin.get('/api/platform/entities/notificationRules?filter=policy.issued')).body.rows.find((r) => r.channel === 'sms');
    await put(admin, 'notificationRules', smsRule.id, { active: false }).expect(200);
    const p = await buyFire(null, '+971500090003', 'DED-9090003');
    const out = await db('outbox').where({ event: 'policy.issued', related_id: String(p.policyId) });
    expect(out.map((o) => o.channel)).toEqual(['email']);
    expect(out[0].status).toBe('sent');
    expect(out[0].subject).toContain(p.policyNo);
    expect(out[0].body).toContain('[INSURER LEGAL NAME]');
    const tpl = (await admin.get('/api/platform/entities/templates?filter=policy_issued')).body.rows.find((r) => r.channel === 'email' && r.locale === 'en');
    await put(admin, 'templates', tpl.id, { subject: 'Welcome aboard – {{policyNo}}' }).expect(200);
    const p2 = await buyFire(null, '+971500090004', 'DED-9090004');
    expect((await db('outbox').where({ event: 'policy.issued', related_id: String(p2.policyId) }).first()).subject).toBe(`Welcome aboard – ${p2.policyNo}`);
    await put(admin, 'parameters', 'email.smtp.enabled', { value: false }).expect(200);
    const outbox = await (await login('ops@portal.test')).get('/api/platform/entities/outbox').expect(200);
    expect(outbox.body.rows.length).toBeGreaterThan(0);
  });

  test('underwriters get an in-app notification for a new referral', async () => {
    const risk = fireRisk();
    risk.locations[0].civilDefence = false;
    const c = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    await request(app).put(`/api/quotes/${c.body.quote.id}/risk`).set('x-quote-token', c.body.resumeToken).send({ risk }).expect(200);
    const a = await customer('+971500090005');
    await a.put(`/api/quotes/${c.body.quote.id}/proposer`).set('x-quote-token', c.body.resumeToken).send(proposer('+971500090005', 'DED-9090005')).expect(200);
    await a.post(`/api/quotes/${c.body.quote.id}/referral`).set('x-quote-token', c.body.resumeToken).send({}).expect(200);
    const uw = await login('uw@portal.test');
    const n = (await uw.get('/api/ui/notifications').expect(200)).body;
    expect(n.unread).toBeGreaterThanOrEqual(1);
    expect(n.notifications[0].title).toContain(c.body.quote.ref);
    await uw.post('/api/ui/notifications/read').send({}).expect(200);
    expect((await uw.get('/api/ui/notifications')).body.unread).toBe(0);
  });
});

describe('commission', () => {
  test('the most specific scheme sets the rate; finance marks commission paid', async () => {
    const broker = await db('brokers').where({ name: 'Gulf Shield Insurance Brokers LLC' }).first();
    await admin.post('/api/platform/entities/commissionSchemes').send({ name: 'Gulf Shield fire special', broker_id: broker.id, product_code: 'FIRE', rate: 0.2, effective_from: inDays(-1), active: true }).expect(201);
    await admin.post('/api/platform/entities/commissionSchemes').send({ name: 'Bad', rate: 0.9, effective_from: inDays(-1) }).expect(400);
    const sara = await login('sara@gulfshield.test');
    const p = await buyFire(sara, '+971500090006', 'DED-9090006');
    const c = await db('commissions').where({ policy_id: p.policyId }).first();
    expect(Number(c.rate)).toBe(0.2);
    expect(c.scheme_id).not.toBeNull();
    const ops = await login('ops@portal.test');
    const lines = (await ops.get(`/api/platform/commissions?brokerId=${broker.id}`).expect(200)).body.lines;
    await ops.post('/api/platform/commissions/pay').send({ ids: lines.map((l) => l.id), reference: 'PAYOUT-2026-10' }).expect(200);
    expect((await db('commissions').where({ id: c.id }).first()).status).toBe('paid');
  });
});

describe('platform licence', () => {
  const key = (over) => sign({ licenceId: `LIC-T-${Math.random()}`, licensee: 'Test insurer', validFrom: inDays(-10), validTo: inDays(300), maxUsers: 500, graceDays: 15, modules: MODULES, ...over });

  test('unlicensed modules, expiry beyond grace and seat limits are enforced', async () => {
    const lic = await admin.get('/api/platform/licence').expect(200);
    expect(lic.body.licence.active).toBe(true);
    await admin.post('/api/platform/licence').send({ key: 'not-a-key-but-long-enough' }).expect(400);
    await admin.post('/api/platform/licence').send({ key: `${key({}).slice(0, -3)}abc` }).expect(400);

    await admin.post('/api/platform/licence').send({ key: key({ modules: MODULES.filter((m) => m !== 'MARINE') }) }).expect(201);
    const m = await request(app).post('/api/quotes').send({ productCode: 'MARINE', countryCode: 'AE' }).expect(403);
    expect(m.body.error.code).toBe('LICENCE_MODULE');
    await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);

    await admin.post('/api/platform/licence').send({ key: key({ validTo: inDays(-5) }) }).expect(201);
    expect((await admin.get('/api/platform/licence')).body.licence.inGrace).toBe(true);
    await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    await admin.post('/api/platform/licence').send({ key: key({ validTo: inDays(-30) }) }).expect(201);
    expect((await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(403)).body.error.code).toBe('LICENCE_INACTIVE');

    const used = (await admin.get('/api/platform/users?type=staff')).body.seats.used;
    await admin.post('/api/platform/licence').send({ key: key({ maxUsers: used }) }).expect(201);
    const uwRole = (await admin.get('/api/platform/entities/roles')).body.rows.find((r) => r.code === 'underwriter');
    const seat = await admin.post('/api/platform/users').send({ email: 'extra@portal.test', name: 'Extra', roleId: uwRole.id }).expect(403);
    expect(seat.body.error.code).toBe('LICENCE_SEATS');
    await admin.post('/api/platform/licence').send({ key: key({}) }).expect(201);
  });
});

describe('field properties and help', () => {
  test('field labels, tooltips and mandatory flags are configurable and public', async () => {
    const f = (await request(app).get('/api/ui/fields?screen=fire.business').expect(200)).body.fields['fire.business'];
    expect(f.building.mandatory).toBe(true);
    expect(f.construction.tooltip.ar).toBeTruthy();
    const row = (await admin.get('/api/platform/entities/fieldDefinitions?filter=fire.business')).body.rows.find((r) => r.field_key === 'tradeLicence');
    await put(admin, 'fieldDefinitions', row.id, { tooltip_en: 'Enter the number exactly as printed.', mandatory: false }).expect(200);
    const after = (await request(app).get('/api/ui/fields?screen=fire.business')).body.fields['fire.business'].tradeLicence;
    expect(after.tooltip.en).toBe('Enter the number exactly as printed.');
    expect(after.mandatory).toBe(false);
    await admin.post('/api/platform/entities/fieldDefinitions').send({ screen: 'x', field_key: 'y', pattern: '([' }).expect(400);
  });

  test('core fields cannot be hidden; mandatory and pattern rules are enforced by the server', async () => {
    const rows = (await admin.get('/api/platform/entities/fieldDefinitions?filter=common.details')).body.rows;
    const email = rows.find((r) => r.field_key === 'email');
    const locked = await put(admin, 'fieldDefinitions', email.id, { visible: false });
    expect(locked.status).toBe(400);
    expect(locked.body.error.code).toBe('FIELD_LOCKED');
    const taxNo = rows.find((r) => r.field_key === 'taxNo');
    await put(admin, 'fieldDefinitions', taxNo.id, { mandatory: true, pattern: '^1\\d{14}$' }).expect(200);
    const c = await request(app).post('/api/quotes').send({ productCode: 'FIRE', countryCode: 'AE' }).expect(201);
    await request(app).put(`/api/quotes/${c.body.quote.id}/risk`).set('x-quote-token', c.body.resumeToken).send({ risk: fireRisk() }).expect(200);
    const a = await customer('+971500090009');
    const missing = await a.put(`/api/quotes/${c.body.quote.id}/proposer`).set('x-quote-token', c.body.resumeToken).send(proposer('+971500090009', 'DED-9090009')).expect(400);
    expect(missing.body.error.details[0].path).toBe('taxNo');
    const bad = await a.put(`/api/quotes/${c.body.quote.id}/proposer`).set('x-quote-token', c.body.resumeToken).send({ ...proposer('+971500090009', 'DED-9090009'), taxNo: '12345' }).expect(400);
    expect(bad.body.error.details[0].message).toBe('Format not valid');
    await a.put(`/api/quotes/${c.body.quote.id}/proposer`).set('x-quote-token', c.body.resumeToken).send({ ...proposer('+971500090009', 'DED-9090009'), taxNo: '100123456700003' }).expect(200);
    await put(admin, 'fieldDefinitions', taxNo.id, { mandatory: false, pattern: '' }).expect(200);
  });

  test('help manual lists articles by audience and serves them in both languages', async () => {
    const list = (await request(app).get('/api/ui/help?audience=customer').expect(200)).body.articles;
    expect(list.map((a) => a.slug)).toContain('getting-started');
    expect(list.map((a) => a.slug)).not.toContain('admin-overview');
    const a = (await request(app).get('/api/ui/help/wc-law').expect(200)).body.article;
    expect(a.body.ar).toContain('24');
    expect((await request(app).get('/api/ui/lookups/GLOBAL.documentTypes').expect(200)).body.values.length).toBeGreaterThan(5);
  });
});
