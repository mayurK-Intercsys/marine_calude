/**
 * Configurable number generation (Admin → Number formats). Tokens:
 * {COUNTRY} {LINE} {CHANNEL} {PRODUCT} {YYYY} {YY} {MM} {POLICY} {SEQ:n}
 * The most specific active format wins (product + country + channel > ... > generic).
 * Each distinct prefix has its own gap-free counter, so a yearly token resets the sequence each year.
 */
const { nextValue, pad } = require('./sequence');

async function formatFor(trx, entity, { productCode, countryCode, channel }) {
  const rows = await trx('number_formats').where({ entity, active: true });
  const score = (f) => {
    if ((f.product_code && f.product_code !== productCode) || (f.country_code && f.country_code !== countryCode) || (f.channel && f.channel !== channel)) return -1;
    return (f.product_code ? 4 : 0) + (f.country_code ? 2 : 0) + (f.channel ? 1 : 0);
  };
  const best = rows.map((f) => ({ f, s: score(f) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0];
  if (!best) throw new Error(`No number format for ${entity}`);
  return best.f.pattern;
}

function resolve(pattern, ctx) {
  const date = ctx.date ? new Date(`${ctx.date}T00:00:00Z`) : new Date();
  const map = {
    COUNTRY: ctx.countryCode || '', LINE: ctx.line || '', CHANNEL: (ctx.channel || '').toUpperCase(), PRODUCT: ctx.productCode || '',
    YYYY: String(date.getUTCFullYear()), YY: String(date.getUTCFullYear()).slice(2), MM: String(date.getUTCMonth() + 1).padStart(2, '0'), POLICY: ctx.policyNo || '',
  };
  return pattern.replace(/\{([A-Z]+)\}/g, (m, k) => (k in map ? map[k] : m));
}

/** Next number for an entity, inside the caller's transaction. */
async function next(trx, entity, ctx = {}) {
  const pattern = resolve(await formatFor(trx, entity, ctx), ctx);
  const m = /\{SEQ:(\d+)\}/.exec(pattern);
  const width = m ? Number(m[1]) : 6;
  const key = `${entity}:${pattern.replace(/\{SEQ:\d+\}/, '#')}`.slice(0, 60);
  const seq = await nextValue(trx, key);
  return m ? pattern.replace(m[0], pad(seq, width)) : `${pattern}${pad(seq, width)}`;
}

module.exports = { next, resolve, formatFor };
