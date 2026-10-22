/**
 * Workmen's Compensation & Employer's Liability rater (WC BRD section 8).
 *
 * Section A = sum over job types of annual wages x rate x trade factor x claims factor
 * Section B = A x Employer's Liability loading for the limit (Standard / Complete plans)
 * Section C = headcount x medical charge per head (Complete plan)
 * + extensions, x short-period factor, then underwriter loading, discount, minimum premium, fee and VAT.
 * Premium is a deposit on estimated wages, adjusted on actual wages after expiry.
 */
const { round } = require('../../lib/money');
const { addDays } = require('../../lib/dates');

const REQUIRED_TABLES = ['trades', 'categories', 'plans', 'factors', 'extensions', 'statutory', 'charges'];

function addMonths(iso, months) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return addDays(d.toISOString().slice(0, 10), -1);
}

/** Workforce per job type, from the employee list (named) or the headcount table (unnamed). */
function workforce(risk) {
  if (risk.policyType === 'named') {
    const by = {};
    for (const e of risk.employees) {
      const row = by[e.category] || (by[e.category] = { category: e.category, headcount: 0, annualWages: 0, basicTotal: 0, grossTotal: 0 });
      row.headcount += 1;
      row.annualWages += Number(e.gross) * 12;
      row.basicTotal += Number(e.basic);
      row.grossTotal += Number(e.gross);
    }
    return Object.values(by).map((r) => ({ category: r.category, headcount: r.headcount, annualWages: r.annualWages, avgBasic: r.basicTotal / r.headcount, avgGross: r.grossTotal / r.headcount }));
  }
  return risk.categories.filter((c) => c.headcount > 0 || c.annualWages > 0).map((c) => ({
    category: c.category, headcount: c.headcount, avgBasic: c.avgBasic, avgGross: c.avgGross,
    annualWages: c.annualWages != null ? Number(c.annualWages) : c.headcount * Number(c.avgGross) * 12,
  }));
}

/** Statutory death / permanent total disability amount for a basic monthly wage (UAE rule as configured). */
function statutoryDeathBenefit(basicMonthly, s) {
  return Math.min(s.deathMax, Math.max(s.deathMin, basicMonthly * s.deathMonths));
}

function rate({ risk, tables, settings, country, authority, uwTerms = null, sanctionsHit = false }) {
  const dec = country.currency_decimals;
  const errors = [];
  const trade = tables.trades.find((x) => x.code === risk.trade);
  if (!trade) errors.push({ code: 'TRADE_UNKNOWN' });
  const plan = tables.plans[risk.plan];
  if (!plan) errors.push({ code: 'PLAN_UNKNOWN' });
  const rows = workforce(risk);
  if (!rows.length) errors.push({ code: 'WORKFORCE_REQUIRED' });
  for (const r of rows) if (!tables.categories.find((c) => c.code === r.category)) errors.push({ code: 'CATEGORY_UNKNOWN', field: r.category });
  const el = plan?.el ? (risk.elLimit || plan.el) : null;
  if (el && tables.factors.elLoading[el] == null) errors.push({ code: 'EL_LIMIT_NOT_OFFERED' });
  for (const code of risk.extensions || []) {
    const ext = tables.extensions[code];
    if (!ext) errors.push({ code: 'EXTENSION_UNKNOWN', field: code });
    else if (ext.plans && !ext.plans.includes(risk.plan)) errors.push({ code: 'EXTENSION_NOT_AVAILABLE', field: code });
  }
  if (errors.length) return { valid: false, errors };

  const employees = rows.reduce((s, r) => s + r.headcount, 0);
  const wages = rows.reduce((s, r) => s + r.annualWages, 0);
  const inception = risk.inceptionDate;
  const period = inception ? { inception, expiry: addMonths(inception, risk.periodMonths) } : undefined;
  const base = { valid: true, tier: 'wc', currency: country.currency, sumInsured: round(wages, dec), maxLocationSI: round(wages, dec), employees, period };

  if (trade.status === 'decline') return { ...base, quotable: false, notQuotableReason: 'TRADE_DECLINED' };
  if (employees > settings.online.maxEmployees || wages > settings.online.maxWages) return { ...base, quotable: false, notQuotableReason: 'ABOVE_ONLINE_LIMIT' };

  const claimsKey = String(Math.min(2, risk.claims3y || 0));
  const claimsFactor = tables.factors.claims[claimsKey];
  const lines = rows.map((r) => {
    const c = tables.categories.find((x) => x.code === r.category);
    const premium = r.annualWages * c.rate * trade.factor * claimsFactor;
    return { ...r, rate: c.rate, medPerHead: c.medPerHead, sectionA: round(premium, dec), avgGross: round(r.avgGross, 2), avgBasic: round(r.avgBasic, 2), deathBenefitAtAvgBasic: statutoryDeathBenefit(r.avgBasic, tables.statutory) };
  });
  const sectionA = lines.reduce((s, l) => s + l.annualWages * l.rate * trade.factor * claimsFactor, 0);
  const sectionB = el ? sectionA * tables.factors.elLoading[el] : 0;
  const sectionC = plan.medical ? lines.reduce((s, l) => s + l.headcount * l.medPerHead, 0) : 0;

  const extensions = [];
  let referralExtension = false;
  for (const code of risk.extensions || []) {
    const ext = tables.extensions[code];
    let amount = 0;
    if (ext.method === 'loading_a') amount = sectionA * ext.pct;
    else if (ext.method === 'per_head') amount = employees * ext.amount;
    else if (ext.method === 'fixed') amount = ext.amount;
    if (ext.referral || ext.method === 'referral_only') referralExtension = true;
    extensions.push({ code, amount: round(amount, dec) });
  }
  const extTotal = extensions.reduce((s, e) => s + e.amount, 0);
  const periodFactor = tables.factors.period[risk.periodMonths] ?? 1;
  const annual = sectionA + sectionB + sectionC + extTotal;
  const technical = annual * periodFactor;
  const loaded = technical * (1 + Number(uwTerms?.loadingPct || 0));
  const discountPct = uwTerms?.discountPct != null ? Number(uwTerms.discountPct) : Number(risk.discountPct || 0);
  const discount = loaded * discountPct;
  const premium = round(Math.max(tables.charges.minPremium, loaded - discount), dec);
  const policyFee = round(tables.charges.policyFee, dec);
  const vatRate = Number(country.vat_rate);
  const tax = round((premium + policyFee) * vatRate, dec);

  const breakdown = {
    sectionA: round(sectionA, dec), sectionB: round(sectionB, dec), sectionC: round(sectionC, dec), elLimit: el, medicalLimit: plan.medical ? tables.statutory.medicalLimitPerEmployee : null,
    extensions, extensionsTotal: round(extTotal, dec), annualPremium: round(annual, dec), periodMonths: risk.periodMonths, periodFactor,
    technicalPremium: round(technical, dec), uwLoadingPct: Number(uwTerms?.loadingPct || 0), uwLoading: round(loaded - technical, dec),
    discountPct, discount: round(discount, dec), minimumPremiumApplied: loaded - discount < tables.charges.minPremium,
    premium, policyFee, vatRate, tax, total: round(premium + policyFee + tax, dec),
    locationsPremium: round(sectionA, dec),
  };

  const facts = {
    employees, wages, hazardClass: trade.hazardClass, tradeFactor: trade.factor,
    exceedsAutoLimit: employees > (authority.maxEmployees ?? Infinity) || wages > (authority.maxWages ?? Infinity),
    hazardOutsideAuthority: trade.status === 'refer' || !(authority.hazardClasses || [1]).includes(trade.hazardClass),
    adverseClaims: (risk.claims3y || 0) >= 2 || risk.fatalClaim3y === true,
    hasReferralExtension: referralExtension,
    wageImplausible: lines.some((l) => l.headcount > 0 && l.avgGross > 0 && l.avgGross < tables.categories.find((c) => c.code === l.category).minWage),
    elAboveAuthority: el != null && el > (authority.maxEL ?? Infinity),
    backdatedJoiner: risk.backdatedJoiner === true,
    discountPct: Number(risk.discountPct || 0),
    discountExceedsBand: Number(risk.discountPct || 0) > (authority.maxDiscount ?? 0),
    sanctionsHit: Boolean(sanctionsHit),
    previouslyDeclined: risk.previouslyDeclined === true,
  };
  return { ...base, quotable: true, lines, breakdown, facts };
}

module.exports = { rate, workforce, statutoryDeathBenefit, addMonths, REQUIRED_TABLES };
