/**
 * Platform licence: a vendor-signed key per insurer tenant listing licensed modules,
 * user seats and validity. Key = base64url(JSON payload) + "." + HMAC-SHA256 signature.
 * Production: switch to an asymmetric signature (vendor private key, public key in the app).
 */
const crypto = require('crypto');

const SECRET = process.env.LICENCE_SECRET || 'dev-licence-secret';
const MODULES = ['FIRE', 'MARINE', 'WC', 'ENGINEERING', 'B2C', 'B2B', 'REPORTS', 'API'];

const b64 = (s) => Buffer.from(s).toString('base64url');
const sig = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function sign(payload) {
  const data = b64(JSON.stringify(payload));
  return `${data}.${sig(data)}`;
}

function verify(key) {
  const [data, signature] = String(key || '').trim().split('.');
  if (!data || !signature) return { valid: false, reason: 'MALFORMED' };
  const expected = sig(data);
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return { valid: false, reason: 'BAD_SIGNATURE' };
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (!payload.licenceId || !payload.licensee || !Array.isArray(payload.modules) || !payload.validTo) return { valid: false, reason: 'INCOMPLETE' };
    return { valid: true, payload };
  } catch (_e) {
    return { valid: false, reason: 'MALFORMED' };
  }
}

module.exports = { sign, verify, MODULES };
