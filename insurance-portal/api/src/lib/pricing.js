/**
 * Product configuration in pricing (Admin → Products).
 * Before rating: covers' pricing and deductibles' rating factors override the rate tables.
 * After rating: automatic discounts / loadings, charges (fees) and taxes are applied to the premium.
 */
const { db } = require('../db');
const { evaluate } = require('./rules');
const { round } = require('./money');

const today = () => new Date().toISOString().slice(0, 10);
const inForce = (r, day) => (!r.effective_from || String(r.effective_from).slice(0, 10) <= day) && (!r.effective_to || String(r.effective_to).slice(0, 10) >= day);

async function setup(productCode, countryCode) {
  const [covers, deductibles, adjustments, charges, taxes] = await Promise.all([
    db('product_covers').where({ product_code: productCode }).orderBy('sort'),
    db('product_deductibles').where({ product_code: productCode }).orderBy('sort'),
    db('premium_adjustments').where({ active: true }).andWhere((q) => q.whereNull('product_code').orWhere('product_code', productCode)).orderBy('priority'),
    db('charges').where({ active: true }).andWhere((q) => q.whereNull('product_code').orWhere('product_code', productCode)).andWhere((q) => q.whereNull('country_code').orWhere('country_code', countryCode)).orderBy('sort'),
    db('taxes').where({ active: true, country_code: countryCode }).andWhere((q) => q.whereNull('product_code').orWhere('product_code', productCode)).orderBy('priority'),
  ]);
  return { covers, deductibles, adjustments, charges, taxes };
}

/** Returns rate tables with cover pricing and deductible factors from product configuration. */
function applyToTables(tables, s) {
  const out = { ...tables };
  const key = out.addOns ? 'addOns' : out.extensions ? 'extensions' : null;
  if (key) {
    out[key] = { ...out[key] };
    for (const c of s.covers.filter((x) => x.cover_type === 'optional')) {
      if (!c.active) delete out[key][c.code];
      else if (c.pricing) out[key][c.code] = c.pricing;
    }
  }
  const plain = s.deductibles.filter((d) => d.active && d.rating_factor == null);
  if (plain.length && out.deductibles && typeof out.deductibles === 'object') {
    out.deductibles = JSON.parse(JSON.stringify(out.deductibles));
    for (const d of plain) {
      const value = d.deductible_type === 'fixed' ? { fixed: Number(d.amount) } : { pct: Number(d.percent || 0), min: Number(d.amount || 0) };
      const [a, b] = d.code.split('.');
      if (b) { out.deductibles[a] = { ...(out.deductibles[a] || {}), [b]: value }; } else out.deductibles[a] = value;
    }
  }
  const factors = s.deductibles.filter((d) => d.active && d.rating_factor != null);
  if (factors.length && out.factors?.deductible) {
    out.factors = { ...out.factors, deductible: Object.fromEntries(factors.map((d) => [d.code, Number(d.rating_factor)])) };
  }
  return out;
}

const matches = (row, ctx) => !row.condition || evaluate(row.condition, ctx);

/**
 * Applies adjustments, charges and taxes to a rated breakdown (mutates and returns it).
 * ctx: risk fields, rating facts, channel, productType and transaction (new_business / renewal).
 */
function finalize(breakdown, s, ctx, country) {
  if (!breakdown || breakdown.premium == null) return breakdown;
  const dec = country.currency_decimals;
  const day = today();
  let premium = Number(breakdown.premium);
  const adjustments = [];
  let exclusiveUsed = false;
  for (const a of s.adjustments) {
    if (!inForce(a, day) || (Array.isArray(a.channels) && a.channels.length && !a.channels.includes(ctx.channel)) || !matches(a, ctx)) continue;
    if (a.kind === 'discount' && breakdown.minimumPremiumApplied) continue;
    if (!a.stackable) { if (exclusiveUsed) continue; exclusiveUsed = true; }
    const pct = Number(a.percent) * (a.kind === 'discount' ? -1 : 1);
    const amount = round(premium * pct, dec);
    premium = round(premium + amount, dec);
    adjustments.push({ code: a.code, name: { en: a.name_en, ar: a.name_ar }, kind: a.kind, percent: Number(a.percent), amount });
  }

  const fees = [];
  for (const c of s.charges) {
    if (Array.isArray(c.transactions) && c.transactions.length && !c.transactions.includes(ctx.transaction)) continue;
    if (!matches(c, ctx)) continue;
    let amount = c.charge_type === 'fixed' ? Number(c.amount) : premium * Number(c.percent);
    if (c.min_amount != null) amount = Math.max(amount, Number(c.min_amount));
    if (c.max_amount != null) amount = Math.min(amount, Number(c.max_amount));
    fees.push({ code: c.code, name: { en: c.name_en, ar: c.name_ar }, amount: round(amount, dec), taxable: Boolean(c.taxable) });
  }
  const feeTotal = round(fees.reduce((x, f) => x + f.amount, 0), dec);
  const taxableFees = fees.filter((f) => f.taxable).reduce((x, f) => x + f.amount, 0);

  // One rate per tax code: the most specific matching row (product-specific first, then by priority).
  const byCode = {};
  for (const t of [...s.taxes].sort((a, b) => (b.product_code ? 1 : 0) - (a.product_code ? 1 : 0) || a.priority - b.priority)) {
    if (byCode[t.code] || !inForce(t, day) || !matches(t, ctx)) continue;
    byCode[t.code] = t;
  }
  const taxes = Object.values(byCode).map((t) => {
    const base = premium + (t.applies_to_fees ? taxableFees : 0);
    return { code: t.code, name: { en: t.name_en, ar: t.name_ar }, rate: Number(t.rate), amount: round(base * Number(t.rate), dec) };
  });
  const tax = round(taxes.reduce((x, t) => x + t.amount, 0), dec);

  Object.assign(breakdown, {
    ratedPremium: Number(breakdown.premium), adjustments, premium, fees, policyFee: feeTotal, taxes, tax,
    vatRate: taxes.find((t) => t.code === 'VAT')?.rate ?? 0, total: round(premium + feeTotal + tax, dec),
  });
  return breakdown;
}

module.exports = { setup, applyToTables, finalize };
