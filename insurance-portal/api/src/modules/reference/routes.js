const express = require('express');
const { db } = require('../../db');
const catalog = require('../../lib/catalog');
const { effectiveConfig } = require('../../lib/productConfig');
const { asyncHandler } = require('../../middleware/errors');

const router = express.Router();

router.get('/countries', asyncHandler(async (_req, res) => {
  const rows = await db('countries').orderBy('code');
  res.json(rows.map((c) => ({ code: c.code, name: { en: c.name_en, ar: c.name_ar }, currency: c.currency, decimals: c.currency_decimals, vatRate: Number(c.vat_rate), active: Boolean(c.active), regulator: c.regulator })));
}));

router.get('/products', asyncHandler(async (req, res) => {
  const country = String(req.query.country || 'AE');
  const rows = await db('products').leftJoin('product_countries', function joinPc() {
    this.on('products.code', '=', 'product_countries.product_code').andOn('product_countries.country_code', '=', db.raw('?', [country]));
  }).select('products.*', 'product_countries.enabled_b2c', 'product_countries.enabled_b2b');
  const lines = ['fire', 'marine', 'wc', 'engineering'];
  res.json(lines.map((line) => {
    const p = rows.find((r) => r.line === line);
    return p
      ? { code: p.code, line, name: { en: p.name_en, ar: p.name_ar }, available: p.status === 'active' && Boolean(p.enabled_b2c || p.enabled_b2b), b2c: Boolean(p.enabled_b2c), b2b: Boolean(p.enabled_b2b) }
      : { code: null, line, available: false };
  }));
}));

/**
 * Everything a journey needs to draw its screens: labels, options and the
 * occupancy list (names only; rates stay server-side).
 */
router.get('/products/:code/config', asyncHandler(async (req, res) => {
  const country = String(req.query.country || 'AE');
  const product = await catalog.getProduct(req.params.code);
  const pc = await catalog.getProductCountry(product.code, country);
  const countryRow = await catalog.getCountry(country);
  const { tables } = await catalog.getRateTables(product.code, country);
  const productConfig = await effectiveConfig(product);
  res.json({
    code: product.code,
    name: { en: product.name_en, ar: product.name_ar },
    country: { code: countryRow.code, currency: countryRow.currency, decimals: countryRow.currency_decimals, vatRate: Number(countryRow.vat_rate) },
    config: productConfig,
    occupancies: (tables.occupancies || []).map((o) => ({ code: o.code, group: o.group, name: o.name, hazard: o.hazard, status: o.status })),
    // Marine pickers: names and allowed clauses only; rates stay server-side.
    commodities: (tables.commodities || []).map((c) => ({ code: c.code, group: c.group, name: c.name, hs: c.hs, clauses: Object.keys(c.rates || {}), referral: Boolean(c.referral), prohibited: Boolean(c.prohibited) })),
    trades: tables.trades ? tables.trades.map((x) => ({ code: x.code, name: x.name, hazardClass: x.hazardClass, status: x.status })) : undefined,
    categories: tables.categories ? tables.categories.map((x) => ({ code: x.code, name: x.name, minWage: x.minWage })) : undefined,
    statutory: tables.statutory,
    equipmentTypes: tables.equipmentTypes ? tables.equipmentTypes.map((x) => ({ code: x.code, product: x.product, name: x.name, referral: Boolean(x.referral), deductible: x.deductible })) : undefined,
    projectTypes: tables.projectTypes ? tables.projectTypes.map((x) => ({ code: x.code, product: x.product, name: x.name, complexity: x.complexity })) : undefined,
    deductibles: tables.deductibles,
    ports: tables.ports,
    countries: tables.countries ? Object.entries(tables.countries).map(([code, c]) => ({ code, name: c.name, region: c.region, status: c.status || 'accept' })) : undefined,
    settings: { tiers: pc.settings.tiers, maxLocationsB2C: pc.settings.maxLocationsB2C, quoteValidityDays: pc.settings.quoteValidityDays, maxInceptionDaysAhead: pc.settings.maxInceptionDaysAhead, othSubLimit: tables.charges?.othSubLimit, maxOnlineSI: pc.settings.maxOnlineSI, fxCurrencies: tables.fx ? Object.keys(tables.fx) : undefined },
  });
}));

module.exports = router;
