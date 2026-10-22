/**
 * Engineering rater (Engineering BRD section 8).
 * Equipment (CPM, MB, EEI): sum over items of value x type rate x age x territory (CPM) x claims, plus add-ons.
 * Projects (CAR, EAR): (contract value + owner materials) x annual rate x months / 12 x complexity x nat-cat,
 *   plus third-party liability, maintenance period and add-ons; EAR hot testing / second-hand loadings.
 * Returns instant-issue facts; anything outside them refers.
 */
const { round } = require('../../lib/money');
const { addDays, annualExpiry, today } = require('../../lib/dates');

const REQUIRED_TABLES = ['equipmentTypes', 'projectTypes', 'factors', 'addOns', 'deductibles', 'charges'];
const PROJECT = ['CAR', 'EAR'];

function monthsBetween(a, b) {
  const d1 = new Date(`${a}T00:00:00Z`);
  const d2 = new Date(`${b}T00:00:00Z`);
  let m = (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + (d2.getUTCMonth() - d1.getUTCMonth());
  if (d2.getUTCDate() > d1.getUTCDate()) m += 1;
  return Math.max(1, m);
}

function addMonths(iso, months) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function maintenanceMonths(code) { return code === 'extended24' ? 24 : 12; }

function finish({ base, addOns, extraLines, tables, product, risk, uwTerms, country, authority }) {
  const dec = country.currency_decimals;
  const addOnTotal = addOns.reduce((s, a) => s + a.amount, 0);
  const technical = base + extraLines + addOnTotal;
  const loaded = technical * (1 + Number(uwTerms?.loadingPct || 0));
  const discountPct = uwTerms?.discountPct != null ? Number(uwTerms.discountPct) : Number(risk.discountPct || 0);
  const discount = loaded * discountPct;
  const min = tables.charges.minPremium[product];
  const premium = round(Math.max(min, loaded - discount), dec);
  const policyFee = round(tables.charges.policyFee, dec);
  const vatRate = Number(country.vat_rate);
  const tax = round((premium + policyFee) * vatRate, dec);
  return {
    addOns, extensionsTotal: round(addOnTotal, dec), technicalPremium: round(technical, dec), uwLoadingPct: Number(uwTerms?.loadingPct || 0),
    uwLoading: round(loaded - technical, dec), discountPct, discount: round(discount, dec), minimumPremiumApplied: loaded - discount < min,
    premium, policyFee, vatRate, tax, total: round(premium + policyFee + tax, dec),
    discountExceedsBand: Number(risk.discountPct || 0) > (authority.maxDiscount ?? 0),
  };
}

function addOnLines(risk, tables, product, baseFor, tplPremium, dec) {
  return (risk.addOns || []).map((code) => {
    const a = tables.addOns[code];
    if (!a) return { code, amount: 0, invalid: true };
    let amount = 0;
    if (a.method === 'pct_of_base') amount = baseFor * a.pct;
    else if (a.method === 'rate_on_input') amount = Number(risk.addOnInputs?.[a.input] || 0) * a.rate;
    else if (a.method === 'pct_of_tpl') amount = tplPremium * a.pct;
    return { code, amount: round(amount, dec) };
  });
}

function rateEquipment({ risk, tables, settings, country, authority, uwTerms, sanctionsHit }) {
  const dec = country.currency_decimals;
  const product = risk.productType;
  const errors = [];
  const year = Number((risk.inceptionDate || today()).slice(0, 4));
  const lines = risk.items.map((it, i) => {
    const type = tables.equipmentTypes.find((x) => x.code === it.type && x.product === product);
    if (!type) errors.push({ code: 'EQUIPMENT_TYPE_INVALID', field: `items.${i}` });
    return { it, type, age: Math.max(0, year - it.year) };
  });
  if (errors.length) return { valid: false, errors };

  const f = tables.factors;
  const ageFactor = (age) => (f.age.find((b) => age <= b.maxAge) || f.age[f.age.length - 1]).factor;
  const territory = product === 'CPM' ? f.territory[risk.territory] : 1;
  const claims = f.claims[String(Math.min(2, risk.claims3y || 0))];
  const items = lines.map(({ it, type, age }) => {
    const premium = it.value * type.rate * ageFactor(age) * territory * claims;
    return { type: it.type, make: it.make, model: it.model, year: it.year, serial: it.serial, value: it.value, age, rate: type.rate, premium: round(premium, dec), deductible: type.deductible };
  });
  const total = risk.items.reduce((s, it) => s + it.value, 0);
  const maxItem = Math.max(...risk.items.map((it) => it.value));
  const period = risk.inceptionDate ? { inception: risk.inceptionDate, expiry: annualExpiry(risk.inceptionDate) } : undefined;
  const baseResult = { valid: true, productType: product, tier: 'equipment', currency: country.currency, sumInsured: round(total, dec), maxLocationSI: maxItem, period };
  if (total > settings.online.maxEquipmentTotal) return { ...baseResult, quotable: false, notQuotableReason: 'ABOVE_ONLINE_LIMIT' };

  const base = items.reduce((s, x) => s + x.premium, 0);
  const addOns = addOnLines(risk, tables, product, base, 0, dec);
  const fin = finish({ base, addOns, extraLines: 0, tables, product, risk, uwTerms, country, authority });
  const breakdown = { itemsPremium: round(base, dec), locationsPremium: round(base, dec), territoryFactor: territory, ...fin };
  delete breakdown.discountExceedsBand;
  const facts = {
    sumInsured: total, maxItem,
    exceedsAutoLimit: maxItem > (authority.maxItem ?? Infinity) || total > (authority.maxTotal ?? Infinity),
    oldOrSecondHand: lines.some((l) => l.age > settings.instant.maxEquipmentAge),
    referralItem: lines.some((l) => l.type.referral || (l.type.referAboveMW && Number(l.it.capacityMW || 0) > l.type.referAboveMW)),
    adverseClaims: (risk.claims3y || 0) >= 2 || risk.largeLoss === true,
    complexProject: false, worksStarted: false, groundRisk: false, highNatcat: false,
    discountPct: Number(risk.discountPct || 0), discountExceedsBand: fin.discountExceedsBand,
    sanctionsHit: Boolean(sanctionsHit), previouslyDeclined: risk.previouslyDeclined === true,
  };
  return { ...baseResult, quotable: true, items, breakdown, facts };
}

function rateProject({ risk, tables, settings, country, authority, uwTerms, sanctionsHit, context }) {
  const dec = country.currency_decimals;
  const product = risk.productType;
  const p = risk.project;
  const type = tables.projectTypes.find((x) => x.code === p.projectType && x.product === product);
  if (!type) return { valid: false, errors: [{ code: 'PROJECT_TYPE_INVALID' }] };
  const tplLimit = risk.tplLimit || 1000000;
  if (tables.factors.tpl[tplLimit] == null) return { valid: false, errors: [{ code: 'TPL_LIMIT_NOT_OFFERED' }] };

  const f = tables.factors;
  const months = Math.max(f.minProjectMonths, monthsBetween(p.startDate, p.completionDate));
  const si = p.contractValue + (p.ownerMaterials || 0);
  const zone = context.natcatZone || 'low';
  const maintMonths = maintenanceMonths(p.maintenance);
  const period = { inception: p.startDate, expiry: addMonths(p.completionDate, maintMonths), constructionEnd: p.completionDate, maintenanceMonths: maintMonths };
  const baseResult = { valid: true, productType: product, tier: 'project', currency: country.currency, sumInsured: round(si, dec), maxLocationSI: si, period, months };
  if (p.contractValue > settings.online.maxContractValue) return { ...baseResult, quotable: false, notQuotableReason: 'ABOVE_ONLINE_LIMIT' };

  let works = si * type.rate12 * (months / 12) * f.complexity[type.complexity] * f.natcat[zone];
  if (product === 'EAR' && p.hotTesting) works *= 1 + f.hotTestingLoading;
  if (product === 'EAR' && p.secondHand) works *= 1 + f.secondHandLoading;
  const tpl = p.contractValue * f.tpl[tplLimit];
  const maintenance = works * f.maintenance[p.maintenance];
  const addOns = addOnLines(risk, tables, product, works, tpl, dec);
  const fin = finish({ base: works, addOns, extraLines: tpl + maintenance, tables, product, risk, uwTerms, country, authority });
  const breakdown = {
    worksPremium: round(works, dec), locationsPremium: round(works, dec), tplPremium: round(tpl, dec), tplLimit, maintenancePremium: round(maintenance, dec),
    months, rate12: type.rate12, complexity: type.complexity, natcatZone: zone, worksPerMonth: round(works / months, dec), deductibles: tables.deductibles[product], ...fin,
  };
  delete breakdown.discountExceedsBand;
  const i = settings.instant;
  const maxCv = product === 'EAR' ? authority.earMaxContractValue : authority.maxContractValue;
  const facts = {
    sumInsured: si, contractValue: p.contractValue, months,
    exceedsAutoLimit: p.contractValue > (maxCv ?? Infinity) || months > (authority.maxMonths ?? Infinity),
    complexProject: type.complexity > i.maxComplexity,
    groundRisk: p.basements > i.maxBasements || p.excavationDepth > i.maxExcavation || p.dewatering || p.blasting || p.pilingNearBuildings || p.overWater,
    worksStarted: risk.worksStarted === true || p.startDate < (context.asOf || today()),
    oldOrSecondHand: product === 'EAR' && p.secondHand,
    referralItem: product === 'EAR' && p.hotTesting && p.testingWeeks > i.earMaxHotTestingWeeks,
    highNatcat: zone === 'high',
    permitUnverified: context.permitVerified === false,
    adverseClaims: (risk.claims3y || 0) >= 2 || risk.largeLoss === true,
    discountPct: Number(risk.discountPct || 0), discountExceedsBand: fin.discountExceedsBand,
    sanctionsHit: Boolean(sanctionsHit), previouslyDeclined: risk.previouslyDeclined === true,
  };
  return { ...baseResult, quotable: true, breakdown, facts };
}

/** Annual CAR: a minimum annual premium now; each declared project is charged at the agreed rates. */
function rateAnnual({ risk, tables, country, authority, uwTerms, sanctionsHit, channel }) {
  const dec = country.currency_decimals;
  const a = risk.annual;
  if (a.projectTypes.some((c) => !tables.projectTypes.find((x) => x.code === c && x.product === 'CAR'))) return { valid: false, errors: [{ code: 'PROJECT_TYPE_INVALID' }] };
  const inception = risk.inceptionDate;
  const base = { valid: true, productType: 'CAR_ANNUAL', tier: 'annual', currency: country.currency, sumInsured: round(a.estimatedTurnover, dec), maxLocationSI: a.maxContractValue, period: inception ? { inception, expiry: annualExpiry(inception) } : undefined };
  if (channel === 'b2c') return { ...base, quotable: false, notQuotableReason: 'ANNUAL_CAR_VIA_BROKER' };
  const fin = finish({ base: 0, addOns: [], extraLines: 0, tables, product: 'CAR_ANNUAL', risk, uwTerms, country, authority });
  const agreedFactor = (1 + Number(uwTerms?.loadingPct || 0)) * (1 - (uwTerms?.discountPct != null ? Number(uwTerms.discountPct) : Number(risk.discountPct || 0)));
  const breakdown = { annualMinimum: fin.premium, locationsPremium: fin.premium, ...fin, agreedFactor };
  delete breakdown.discountExceedsBand;
  const facts = {
    sumInsured: a.estimatedTurnover,
    annualNeedsApproval: !authority.canBindAnnual || a.maxContractValue > (authority.maxAnnualProjectValue ?? 0),
    complexProject: a.projectTypes.some((c) => tables.projectTypes.find((x) => x.code === c).complexity > 2),
    discountPct: Number(risk.discountPct || 0), discountExceedsBand: fin.discountExceedsBand,
    sanctionsHit: Boolean(sanctionsHit), previouslyDeclined: risk.previouslyDeclined === true,
  };
  return { ...base, quotable: true, breakdown, facts };
}

function rate(params) {
  if (params.risk.productType === 'CAR_ANNUAL') return rateAnnual(params);
  return PROJECT.includes(params.risk.productType) ? rateProject(params) : rateEquipment(params);
}

async function prepare(risk, integrations) {
  if (!risk.project) return {};
  const [natcatZone, permit] = await Promise.all([
    integrations.geo.zoneFor({ area: risk.project.area, city: risk.project.city }),
    integrations.permits.verify({ permitNo: risk.project.permitNo, city: risk.project.city }),
  ]);
  return { natcatZone, permitVerified: permit.verified };
}

module.exports = { rateProject, rate, prepare, monthsBetween, addMonths, maintenanceMonths, REQUIRED_TABLES };
