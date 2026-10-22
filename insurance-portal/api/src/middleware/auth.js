const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');
const { unauthorized, forbidden } = require('../lib/errors');

const COOKIE = 'portal_session';
const STAFF_ROLES = ['underwriter', 'uw_manager', 'config_admin', 'ops'];
const BROKER_ROLES = ['broker_admin', 'broker_user'];

function signSession(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: `${config.jwtTtlHours}h` });
}

function setSessionCookie(res, user) {
  res.cookie(COOKIE, signSession(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: config.jwtTtlHours * 3600 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Loads the session user (if any) onto req.user. Never fails the request. */
async function loadUser(req, _res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const token = req.cookies?.[COOKIE] || bearer;
    if (!token) return next();
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await db('users').where({ id: payload.sub, active: true }).first();
    if (!user) return next();
    let customerId = null;
    let customerRole = null;
    let certificateLimit = null;
    let canSeePremium = true;
    if (user.role === 'customer') {
      const customer = await db('customers').where({ user_id: user.id }).first();
      if (customer) {
        customerId = customer.id;
        customerRole = 'owner';
      } else {
        // Staff of a customer added by its administrator (e.g. logistics staff issuing certificates).
        const link = await db('customer_users').where({ user_id: user.id, active: true }).first();
        if (link) {
          customerId = link.customer_id;
          customerRole = link.role;
          certificateLimit = link.certificate_limit == null ? null : Number(link.certificate_limit);
          canSeePremium = Boolean(link.can_see_premium) || link.role === 'admin';
        }
      }
    }
    const roleRow = user.role_id ? await db('roles').where({ id: user.role_id, active: true }).first() : await db('roles').where({ code: user.role, system: true }).first();
    const permissions = roleRow ? (await db('role_permissions').where({ role_id: roleRow.id }).pluck('permission_code')) : [];
    req.user = {
      id: user.id,
      roleId: roleRow?.id || null,
      roleName: roleRow ? { en: roleRow.name_en, ar: roleRow.name_ar } : null,
      permissions,
      role: user.role,
      name: user.full_name,
      email: user.email,
      mobile: user.mobile,
      locale: user.locale,
      brokerId: user.broker_id,
      customerId,
      customerRole,
      certificateLimit,
      canSeePremium,
      isStaff: STAFF_ROLES.includes(user.role),
      isBroker: BROKER_ROLES.includes(user.role),
    };
    return next();
  } catch (_e) {
    return next();
  }
}

const requireAuth = (req, _res, next) => (req.user ? next() : next(unauthorized()));

/** Fine-grained privilege check (Admin → Roles). */
const requirePermission = (...codes) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!codes.some((c) => req.user.permissions?.includes(c))) return next(forbidden('PERMISSION_DENIED', `Needs ${codes.join(' or ')}`));
  return next();
};

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden('ROLE_NOT_ALLOWED'));
  return next();
};

module.exports = { requirePermission, loadUser, requireAuth, requireRole, setSessionCookie, clearSessionCookie, STAFF_ROLES, BROKER_ROLES, COOKIE };
