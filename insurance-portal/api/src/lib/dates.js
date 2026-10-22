/** All policy dates are calendar dates (YYYY-MM-DD) in UTC. */
const toISODate = (d) => new Date(d).toISOString().slice(0, 10);
const today = () => toISODate(new Date());

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** Expiry for an annual policy: same date next year minus one day. */
function annualExpiry(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return toISODate(d);
}

/** Whole days from a to b inclusive of both ends (policy days in force). */
function daysInclusive(a, b) {
  const ms = new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

/** MySQL DATETIME rounds fractional seconds up; truncate so 'now' is never in the future. */
const nowSeconds = () => new Date(Math.floor(Date.now() / 1000) * 1000);

const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

module.exports = { toISODate, today, addDays, annualExpiry, daysInclusive, isISODate, nowSeconds };
