/** Current platform licence and what it allows. Cached briefly; refreshed on install. */
const { db } = require('../db');
const { forbidden } = require('./errors');

const LINE_MODULE = { fire: 'FIRE', marine: 'MARINE', wc: 'WC', engineering: 'ENGINEERING' };
let cached = null;
let at = 0;

async function current() {
  if (cached && Date.now() - at < 30000) return cached;
  const lic = await db('licences').where({ current: true }).orderBy('id', 'desc').first();
  const today = new Date().toISOString().slice(0, 10);
  if (!lic) cached = { installed: false, active: false, modules: [], maxUsers: 0 };
  else {
    const graceEnd = new Date(`${lic.valid_to}T00:00:00Z`);
    graceEnd.setUTCDate(graceEnd.getUTCDate() + lic.grace_days);
    const daysLeft = Math.round((Date.parse(`${lic.valid_to}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    cached = {
      installed: true, licenceId: lic.licence_id, licensee: lic.licensee, modules: lic.modules, maxUsers: lic.max_users, validFrom: lic.valid_from, validTo: lic.valid_to,
      graceDays: lic.grace_days, daysLeft, notStarted: today < lic.valid_from, inGrace: daysLeft < 0 && today <= graceEnd.toISOString().slice(0, 10),
      active: today >= lic.valid_from && today <= graceEnd.toISOString().slice(0, 10),
    };
  }
  at = Date.now();
  return cached;
}

const invalidate = () => { cached = null; };

/** Blocks new business when the licence is missing, expired past grace, or the module is not licensed. */
async function assertCanSell(line, channel) {
  const l = await current();
  if (!l.active) throw forbidden('LICENCE_INACTIVE', 'The platform licence is not active. Contact your administrator.');
  const module = LINE_MODULE[line] || String(line).toUpperCase();
  if (!l.modules.includes(module)) throw forbidden('LICENCE_MODULE', `${module} is not licensed`);
  if (!l.modules.includes(channel === 'b2b' ? 'B2B' : 'B2C')) throw forbidden('LICENCE_MODULE', `${channel.toUpperCase()} channel is not licensed`);
}

/** Staff and broker users count towards seats; customers do not. */
async function assertSeatAvailable(conn = db) {
  const l = await current();
  const r = await conn('users').where({ active: true }).whereNot('role', 'customer').count({ n: '*' }).first();
  if (Number(r.n) >= l.maxUsers) throw forbidden('LICENCE_SEATS', `All ${l.maxUsers} licensed user seats are in use`);
}

module.exports = { current, invalidate, assertCanSell, assertSeatAvailable };
