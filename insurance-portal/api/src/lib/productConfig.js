/**
 * The configuration a product's screens and documents use: the product's base config with
 * option lists from Admin → Drop-down values and covers / clauses / deductibles from Admin → Products.
 */
const { db } = require('../db');

const name = (r) => ({ en: r.name_en, ar: r.name_ar });
const desc = (r) => (r.description_en || r.description_ar ? { en: r.description_en, ar: r.description_ar } : undefined);

async function effectiveConfig(product) {
  const config = { ...product.config };
  const lists = await db('lookup_lists').where({ product_code: product.code });
  if (lists.length) {
    const values = await db('lookup_values').whereIn('list_code', lists.map((l) => l.code)).andWhere({ active: true }).orderBy([{ column: 'list_code' }, { column: 'sort' }]);
    for (const l of lists) {
      const key = l.code.slice(product.code.length + 1);
      if (!(key in config)) continue;
      config[key] = values.filter((v) => v.list_code === l.code).map((v) => ({ ...(v.attributes || {}), code: typeof config[key][0]?.code === 'number' ? Number(v.code) : v.code, name: { en: v.label_en, ar: v.label_ar }, ...(v.parent_code ? { parent: v.parent_code } : {}) }));
    }
  }
  const covers = await db('product_covers').where({ product_code: product.code, active: true }).orderBy('sort');
  if (covers.length) {
    const optional = covers.filter((c) => c.cover_type === 'optional').map((c) => ({ ...(c.attributes || {}), code: c.code, name: name(c), description: desc(c), ...(c.referral ? { referral: true } : {}) }));
    if ('addOns' in config) config.addOns = optional; else if ('extensions' in config) config.extensions = optional;
    const clauses = covers.filter((c) => c.cover_type === 'clause');
    if (clauses.length && 'clauses' in config) config.clauses = clauses.map((c) => ({ code: c.code, name: name(c), description: desc(c) }));
    const basic = covers.filter((c) => c.cover_type === 'basic');
    if (basic.length && Array.isArray(config.perils)) config.perils = basic.map(name);
    config.covers = covers.map((c) => ({ code: c.code, type: c.cover_type, name: name(c), description: desc(c) }));
  }
  const deductibles = await db('product_deductibles').where({ product_code: product.code, active: true }).orderBy('sort');
  if (deductibles.length && 'deductibles' in config) config.deductibles = deductibles.map((d) => ({ code: d.code, name: name(d), detail: d.detail_en || d.detail_ar ? { en: d.detail_en, ar: d.detail_ar } : undefined, default: Boolean(d.is_default) }));
  return config;
}

module.exports = { effectiveConfig };
