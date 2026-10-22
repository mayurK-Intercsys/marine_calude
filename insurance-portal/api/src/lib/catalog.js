const { db } = require('../db');
const { notFound, badRequest, unprocessable } = require('./errors');

async function getProduct(code, conn = db) {
  const product = await conn('products').where({ code }).first();
  if (!product) throw notFound('PRODUCT_NOT_FOUND');
  return product;
}

async function getCountry(code, conn = db) {
  const country = await conn('countries').where({ code }).first();
  if (!country) throw notFound('COUNTRY_NOT_FOUND');
  return country;
}

async function getProductCountry(productCode, countryCode, conn = db) {
  const pc = await conn('product_countries').where({ product_code: productCode, country_code: countryCode }).first();
  if (!pc) throw badRequest('PRODUCT_NOT_OFFERED', 'Product is not configured for this country');
  return pc;
}

/**
 * Approved rate tables keyed by table_key. `overrides` lets the admin sandbox
 * rate a quote against a draft table before it is approved (CFG-14).
 */
async function getRateTables(productCode, countryCode, overrides = {}, conn = db, required = []) {
  const rows = await conn('rate_tables')
    .where({ product_code: productCode, country_code: countryCode, status: 'approved' })
    .andWhere((q) => q.whereNull('effective_from').orWhere('effective_from', '<=', new Date()))
    .orderBy('version', 'desc');
  const tables = {};
  const versions = {};
  for (const row of rows) {
    if (!(row.table_key in tables)) {
      tables[row.table_key] = row.data;
      versions[row.table_key] = row.version;
    }
  }
  const missing = required.filter((k) => !(k in tables) && !(k in overrides));
  if (missing.length && rows.length) throw unprocessable('RATES_NOT_CONFIGURED', `Approved rate tables missing: ${missing.join(', ')}`);
  if (!rows.length && !Object.keys(overrides).length) throw unprocessable('RATES_NOT_CONFIGURED', 'No approved rate tables for this product and country');
  for (const [key, data] of Object.entries(overrides)) {
    tables[key] = data;
    versions[key] = 'draft';
  }
  return { tables, versions };
}

async function getReferralRules(productCode, countryCode, conn = db) {
  return conn('referral_rules')
    .where({ product_code: productCode, active: true })
    .andWhere((q) => q.whereNull('country_code').orWhere('country_code', countryCode))
    .orderBy('sort');
}

module.exports = { getProduct, getCountry, getProductCountry, getRateTables, getReferralRules };
