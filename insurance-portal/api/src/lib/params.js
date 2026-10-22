/** System parameters with a short cache. Values are stored as JSON. */
const { db } = require('../db');

let cache = null;
let loadedAt = 0;
const TTL = 15000;

async function all() {
  if (!cache || Date.now() - loadedAt > TTL) {
    const rows = await db('system_parameters');
    cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    loadedAt = Date.now();
  }
  return cache;
}

async function get(key, fallback) {
  const values = await all();
  return values[key] === undefined || values[key] === null ? fallback : values[key];
}

const invalidate = () => { cache = null; };

module.exports = { get, all, invalidate };
