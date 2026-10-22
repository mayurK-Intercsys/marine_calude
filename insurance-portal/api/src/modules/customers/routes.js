/**
 * Customer team (Marine BRD FR-OC: certificate authority): the account owner or an admin adds
 * staff who sign in with their own code, each with an optional certificate limit and premium visibility.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireRole } = require('../../middleware/auth');
const { audit } = require('../../lib/audit');
const { badRequest, conflict, forbidden, notFound } = require('../../lib/errors');

const router = express.Router();
router.use(requireRole('customer'));

const assertAdmin = (user) => {
  if (!user.customerId || !['owner', 'admin'].includes(user.customerRole)) throw forbidden('CUSTOMER_ADMIN_ONLY');
};
const norm = (t) => (t.includes('@') ? t.trim().toLowerCase() : t.replace(/[\s-]/g, ''));

router.get('/users', asyncHandler(async (req, res) => {
  assertAdmin(req.user);
  const rows = await db('customer_users as cu').join('users as u', 'u.id', 'cu.user_id').where('cu.customer_id', req.user.customerId)
    .select('cu.*', 'u.full_name', 'u.email', 'u.mobile');
  res.json({ users: rows.map((r) => ({ id: r.id, name: r.full_name, email: r.email, mobile: r.mobile, role: r.role, certificateLimit: r.certificate_limit, canSeePremium: Boolean(r.can_see_premium), active: Boolean(r.active) })) });
}));

router.post('/users', asyncHandler(async (req, res) => {
  assertAdmin(req.user);
  const b = z.object({ target: z.string().min(5).max(160), name: z.string().min(2).max(160), role: z.enum(['admin', 'user']).default('user'), certificateLimit: z.number().positive().nullable().optional(), canSeePremium: z.boolean().default(false) }).parse(req.body);
  const target = norm(b.target);
  const field = target.includes('@') ? 'email' : 'mobile';
  if (field === 'mobile' && !/^\+?\d{8,15}$/.test(target)) throw badRequest('INVALID_MOBILE');
  let user = await db('users').where({ [field]: target }).first();
  if (user && user.role !== 'customer') throw conflict('USER_NOT_A_CUSTOMER');
  if (user && await db('customers').where({ user_id: user.id }).first()) throw conflict('USER_HAS_OWN_ACCOUNT');
  if (!user) {
    const [id] = await db('users').insert({ [field]: target, full_name: b.name, role: 'customer' });
    user = { id };
  }
  const existing = await db('customer_users').where({ customer_id: req.user.customerId, user_id: user.id }).first();
  if (existing) throw conflict('ALREADY_A_MEMBER');
  const [id] = await db('customer_users').insert({ customer_id: req.user.customerId, user_id: user.id, role: b.role, certificate_limit: b.certificateLimit ?? null, can_see_premium: b.canSeePremium });
  await audit(db, { userId: req.user.id, action: 'customer.user.add', entity: 'customer', entityId: req.user.customerId, data: { userId: user.id, role: b.role } });
  res.status(201).json({ id });
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
  assertAdmin(req.user);
  const link = await db('customer_users').where({ id: Number(req.params.id), customer_id: req.user.customerId }).first();
  if (!link) throw notFound('MEMBER_NOT_FOUND');
  const b = z.object({ role: z.enum(['admin', 'user']).optional(), certificateLimit: z.number().positive().nullable().optional(), canSeePremium: z.boolean().optional(), active: z.boolean().optional() }).parse(req.body);
  await db('customer_users').where({ id: link.id }).update({
    ...(b.role ? { role: b.role } : {}), ...(b.certificateLimit !== undefined ? { certificate_limit: b.certificateLimit } : {}),
    ...(b.canSeePremium !== undefined ? { can_see_premium: b.canSeePremium } : {}), ...(b.active !== undefined ? { active: b.active } : {}), updated_at: db.fn.now(),
  });
  await audit(db, { userId: req.user.id, action: 'customer.user.update', entity: 'customer', entityId: req.user.customerId, data: { linkId: link.id, ...b } });
  res.json({ ok: true });
}));

module.exports = router;
