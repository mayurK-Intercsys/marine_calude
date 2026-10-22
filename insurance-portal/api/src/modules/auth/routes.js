const express = require('express');
const params = require('../../lib/params');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const { db } = require('../../db');
const config = require('../../config');
const integrations = require('../../integrations');
const { asyncHandler } = require('../../middleware/errors');
const { setSessionCookie, clearSessionCookie } = require('../../middleware/auth');
const { badRequest, unauthorized, AppError } = require('../../lib/errors');
const { audit } = require('../../lib/audit');

const router = express.Router();

const normaliseTarget = (t) => {
  const s = String(t || '').trim();
  return s.includes('@') ? s.toLowerCase() : s.replace(/[\s-]/g, '');
};

const targetSchema = z.object({ target: z.string().min(5).max(160) });

/** B2C sign-in: one-time code to mobile or email (FR-B2C-12). */
router.post('/otp/request', asyncHandler(async (req, res) => {
  const target = normaliseTarget(targetSchema.parse(req.body).target);
  const isEmail = target.includes('@');
  if (!isEmail && !/^\+?\d{8,15}$/.test(target)) throw badRequest('INVALID_MOBILE');
  if (isEmail && !z.string().email().safeParse(target).success) throw badRequest('INVALID_EMAIL');

  const maxCodes = Number(await params.get('security.otpMaxPer15Min', 5));
  const minutes = Number(await params.get('security.otpMinutes', 5));
  const recent = await db('otp_codes').where({ target }).andWhere('created_at', '>', new Date(Date.now() - 15 * 60 * 1000)).count({ n: '*' }).first();
  if (Number(recent.n) >= maxCodes) throw new AppError(429, 'OTP_RATE_LIMITED', 'Too many codes requested. Wait 15 minutes.');

  const code = String(crypto.randomInt(100000, 1000000));
  await db('otp_codes').insert({ target, code_hash: await bcrypt.hash(code, 8), expires_at: new Date(Date.now() + minutes * 60 * 1000) });
  await integrations.notifications.send({ to: target, channel: isEmail ? 'email' : 'sms', template: 'otp', data: { code, minutes }, locale: req.body.locale === 'ar' ? 'ar' : 'en' });
  res.json({ sent: true, expiresInSeconds: minutes * 60, ...(config.devOtpEcho ? { devCode: code } : {}) });
}));

router.post('/otp/verify', asyncHandler(async (req, res) => {
  const { target: raw, code } = z.object({ target: z.string(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const target = normaliseTarget(raw);
  const otp = await db('otp_codes').where({ target, consumed: false }).andWhere('expires_at', '>', new Date()).orderBy('id', 'desc').first();
  if (!otp) throw badRequest('OTP_EXPIRED', 'The code has expired. Request a new one.');
  if (otp.attempts >= 5) throw badRequest('OTP_LOCKED', 'Too many wrong attempts. Request a new code.');
  if (!(await bcrypt.compare(code, otp.code_hash))) {
    await db('otp_codes').where({ id: otp.id }).increment('attempts', 1);
    throw badRequest('OTP_INVALID', 'The code is not correct.');
  }
  await db('otp_codes').where({ id: otp.id }).update({ consumed: true });

  const field = target.includes('@') ? 'email' : 'mobile';
  let user = await db('users').where({ [field]: target }).first();
  if (user && user.role !== 'customer') throw badRequest('USE_PASSWORD_LOGIN', 'Staff and broker accounts sign in with a password.');
  if (!user) {
    const [id] = await db('users').insert({ [field]: target, role: 'customer', locale: req.body.locale === 'ar' ? 'ar' : 'en' });
    user = await db('users').where({ id }).first();
    await audit(db, { userId: id, action: 'user.register', entity: 'user', entityId: id, ip: req.ip });
  }
  await db('users').where({ id: user.id }).update({ last_login_at: new Date() });
  setSessionCookie(res, user);
  res.json({ user: { id: user.id, role: user.role, name: user.full_name, email: user.email, mobile: user.mobile } });
}));

/** Broker and insurer staff: email + password (MFA to be added with the identity provider). */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await db('users').where({ email: email.toLowerCase(), active: true }).first();
  if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) throw unauthorized('INVALID_CREDENTIALS', 'Email or password is not correct.');
  if (user.broker_id) {
    const broker = await db('brokers').where({ id: user.broker_id }).first();
    if (!broker.active || broker.licence_expiry < new Date().toISOString().slice(0, 10)) throw unauthorized('BROKER_LICENCE_EXPIRED', 'Broker licence has expired. Contact the insurer.');
  }
  await db('users').where({ id: user.id }).update({ last_login_at: new Date() });
  await audit(db, { userId: user.id, action: 'user.login', entity: 'user', entityId: user.id, ip: req.ip });
  setSessionCookie(res, user);
  res.json({ user: { id: user.id, role: user.role, name: user.full_name, email: user.email, brokerId: user.broker_id, mustChangePassword: Boolean(user.must_change_password) } });
}));

/** Staff and brokers replace a temporary password set by an administrator. */
router.post('/change-password', asyncHandler(async (req, res) => {
  if (!req.user || req.user.role === 'customer') throw unauthorized();
  const { current, next } = z.object({ current: z.string().min(1), next: z.string().min(10).max(100).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/) }).parse(req.body);
  const user = await db('users').where({ id: req.user.id }).first();
  if (!(await bcrypt.compare(current, user.password_hash || ''))) throw unauthorized('INVALID_CREDENTIALS', 'Current password is not correct.');
  await db('users').where({ id: user.id }).update({ password_hash: await bcrypt.hash(next, 10), must_change_password: false });
  await audit(db, { userId: user.id, action: 'user.change_password', entity: 'user', entityId: user.id });
  res.json({ ok: true });
}));

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', asyncHandler(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  let broker = null;
  if (req.user.brokerId) {
    const b = await db('brokers').where({ id: req.user.brokerId }).first();
    broker = { id: b.id, name: b.name, tier: b.tier };
  }
  return res.json({ user: { ...req.user, broker } });
}));

module.exports = router;
