/**
 * Raters built from published rating models (Admin → Rating models). A product whose `rater`
 * is "dynamic" is priced by the engine; its model also describes site-exposure keys.
 */
const { db } = require('../db');
const engine = require('../lib/ratingEngine');
const { siteKey, BUILTINS } = require('../lib/expr');
const { getRater } = require('./index');

async function publishedModel(productCode, countryCode, conn = db) {
  const rows = await conn('rating_models').where({ product_code: productCode, status: 'published' }).andWhere((q) => q.whereNull('country_code').orWhere('country_code', countryCode)).orderBy('version', 'desc');
  return rows.find((r) => r.country_code === countryCode) || rows.find((r) => !r.country_code) || null;
}

const norm = (params) => ({ ...params, uwTerms: params.uwTerms || {}, existingExposure: params.existingExposure || {}, context: params.context || {} });

function fromModel(model, meta = {}) {
  const keys = model.exposure?.sumInsuredKeys;
  return {
    dynamic: true,
    modelId: meta.id,
    modelVersion: meta.version,
    REQUIRED_TABLES: model.requiredTables || [],
    rate: (params) => engine.run(model, norm(params)),
    ...(model.entries?.certificate ? { rateCertificate: (params) => engine.run(model, norm(params), 'certificate') } : {}),
    ...(model.entries?.project ? { rateProject: (params) => engine.run(model, norm(params), 'project') } : {}),
    ...(model.prepare?.length ? { prepare: (risk, integrations) => engine.prepare(model, risk, integrations) } : {}),
    ...(keys ? { siteKey, locationSumInsured: (loc) => keys.reduce((s, k) => s + Math.max(0, Number(loc.sumsInsured?.[k]) || 0), 0) } : {}),
  };
}

/** The rater for a product: its published model when dynamic, else the coded rater. */
async function raterFor(product, countryCode, { modelOverride = null, conn = db } = {}) {
  if (modelOverride) return fromModel(modelOverride, { id: null, version: 'draft' });
  if (product.rater !== 'dynamic') return getRater(product.rater);
  const row = await publishedModel(product.code, countryCode, conn);
  if (!row) {
    const e = new Error(`No published rating model for ${product.code}`);
    e.code = 'RATING_MODEL_MISSING';
    throw e;
  }
  return fromModel(row.model, row);
}

module.exports = { raterFor, fromModel, publishedModel, BUILTINS };
