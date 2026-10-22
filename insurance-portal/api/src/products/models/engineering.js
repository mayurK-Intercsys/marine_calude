/**
 * Engineering rating model (Engineering BRD section 8): equipment (CPM, MB, EEI), projects (CAR, EAR)
 * and the annual CAR policy; the "project" entry also prices projects declared under an annual policy.
 * Step-for-step equivalent of products/engineering/rater.js; the parity test proves identical results.
 */

/** Add-on lines from a base premium variable and a third-party liability premium. */
const addOnSteps = (baseVar, tplVar) => [
  {
    each: 'risk.addOns || []', as: 'code', collect: 'aol', steps: [
      { set: 'a', expr: 'tables.addOns[code]' },
      { set: 'amount', expr: `a == null ? 0 : round(a.method == 'pct_of_base' ? ${baseVar} * a.pct : (a.method == 'rate_on_input' ? num(risk.addOnInputs[a.input] || 0) * a.rate : (a.method == 'pct_of_tpl' ? ${tplVar} * a.pct : 0)), dec)` },
      { set: 'line', expr: 'a == null ? {code: code, amount: 0, invalid: true} : {code: code, amount: amount}' },
    ],
  },
  { set: 'addOns', expr: 'map(aol, item.line)' },
];

/** Common finish: technical premium, underwriter loading, discount, minimum, fee and tax. */
const finishSteps = (baseVar, extraVar, productExpr) => [
  { set: 'addOnTotal', expr: 'sum(addOns, item.amount)' },
  { set: 'technical', expr: `${baseVar} + ${extraVar} + addOnTotal` },
  { set: 'uwLoadingPct', expr: 'num(uwTerms.loadingPct || 0)' },
  { set: 'loaded', expr: 'technical * (1 + uwLoadingPct)' },
  { set: 'discountPct', expr: 'uwTerms.discountPct != null ? num(uwTerms.discountPct) : num(risk.discountPct || 0)' },
  { set: 'discount', expr: 'loaded * discountPct' },
  { set: 'minPremium', expr: `tables.charges.minPremium[${productExpr}]` },
  { set: 'premium', expr: 'round(max(minPremium, loaded - discount), dec)' },
  { set: 'policyFee', expr: 'round(tables.charges.policyFee, dec)' },
  { set: 'vatRate', expr: 'num(country.vat_rate)' },
  { set: 'tax', expr: 'round((premium + policyFee) * vatRate, dec)' },
  { set: 'discountExceedsBand', expr: 'num(risk.discountPct || 0) > (authority.maxDiscount ?? 0)' },
];
const finishOut = {
  'breakdown.addOns': 'addOns', 'breakdown.extensionsTotal': 'round(addOnTotal, dec)', 'breakdown.technicalPremium': 'round(technical, dec)',
  'breakdown.uwLoadingPct': 'uwLoadingPct', 'breakdown.uwLoading': 'round(loaded - technical, dec)', 'breakdown.discountPct': 'discountPct',
  'breakdown.discount': 'round(discount, dec)', 'breakdown.minimumPremiumApplied': 'loaded - discount < minPremium', 'breakdown.premium': 'premium',
  'breakdown.policyFee': 'policyFee', 'breakdown.vatRate': 'vatRate', 'breakdown.tax': 'tax', 'breakdown.total': 'round(premium + policyFee + tax, dec)',
};
const commonFacts = {
  'facts.discountPct': 'num(risk.discountPct || 0)', 'facts.discountExceedsBand': 'discountExceedsBand',
  'facts.sanctionsHit': '!!sanctionsHit', 'facts.previouslyDeclined': 'risk.previouslyDeclined == true',
};

const eqBase = { valid: 'true', productType: 'product', tier: "'equipment'", currency: 'country.currency', sumInsured: 'round(total, dec)', maxLocationSI: 'maxItem', period: 'period' };
const equipment = {
  steps: [
    { set: 'dec', expr: 'country.currency_decimals' },
    { set: 'product', expr: 'risk.productType' },
    { set: 'yr', expr: 'year(risk.inceptionDate || today())' },
    {
      each: 'risk.items', as: 'it', index: 'i', collect: 'lines', steps: [
        { set: 'type', expr: 'find(tables.equipmentTypes, item.code == it.type && item.product == product)' },
        { error: 'EQUIPMENT_TYPE_INVALID', when: 'type == null', field: "'items.' + i" },
        { set: 'age', expr: 'max(0, yr - it.year)' },
      ],
    },
    { checkpoint: true },
    { set: 'f', expr: 'tables.factors' },
    { set: 'territory', expr: "product == 'CPM' ? f.territory[risk.territory] : 1" },
    { set: 'claims', expr: 'f.claims[str(min(2, risk.claims3y || 0))]' },
    {
      each: 'lines', as: 'l', collect: 'itemRows', steps: [
        { set: 'ageF', expr: "band(f.age, l.age, 'factor', 'maxAge', f.age[len(f.age) - 1].factor)" },
        { set: 'premium', expr: 'l.it.value * l.type.rate * ageF * territory * claims' },
        { set: 'row', expr: '{type: l.it.type, make: l.it.make, model: l.it.model, year: l.it.year, serial: l.it.serial, value: l.it.value, age: l.age, rate: l.type.rate, premium: round(premium, dec), deductible: l.type.deductible}' },
      ],
    },
    { set: 'items', expr: 'map(itemRows, item.row)' },
    { set: 'total', expr: 'sum(risk.items, item.value)' },
    { set: 'maxItem', expr: 'max_of(risk.items, item.value)' },
    { set: 'period', expr: 'risk.inceptionDate ? {inception: risk.inceptionDate, expiry: annualExpiry(risk.inceptionDate)} : undefined' },
    { when: 'total > settings.online.maxEquipmentTotal', return: { ...eqBase, quotable: 'false', notQuotableReason: "'ABOVE_ONLINE_LIMIT'" } },
    { set: 'base', expr: 'sum(items, item.premium)' },
    ...addOnSteps('base', '0'),
    ...finishSteps('base', '0', 'product'),
  ],
  output: {
    ...eqBase, quotable: 'true', items: 'items',
    'breakdown.itemsPremium': 'round(base, dec)', 'breakdown.locationsPremium': 'round(base, dec)', 'breakdown.territoryFactor': 'territory', ...finishOut,
    'facts.sumInsured': 'total', 'facts.maxItem': 'maxItem',
    'facts.exceedsAutoLimit': '(authority.maxItem != null && maxItem > authority.maxItem) || (authority.maxTotal != null && total > authority.maxTotal)',
    'facts.oldOrSecondHand': 'any(lines, item.age > settings.instant.maxEquipmentAge)',
    'facts.referralItem': 'any(lines, item.type.referral || (item.type.referAboveMW && num(item.it.capacityMW || 0) > item.type.referAboveMW))',
    'facts.adverseClaims': '(risk.claims3y || 0) >= 2 || risk.largeLoss == true',
    'facts.complexProject': 'false', 'facts.worksStarted': 'false', 'facts.groundRisk': 'false', 'facts.highNatcat': 'false',
    ...commonFacts,
  },
};

const prBase = { valid: 'true', productType: 'product', tier: "'project'", currency: 'country.currency', sumInsured: 'round(si, dec)', maxLocationSI: 'si', period: 'period', months: 'months' };
const project = {
  steps: [
    { set: 'dec', expr: 'country.currency_decimals' },
    { set: 'product', expr: 'risk.productType' },
    { set: 'p', expr: 'risk.project' },
    { set: 'type', expr: 'find(tables.projectTypes, item.code == p.projectType && item.product == product)' },
    { when: 'type == null', return: { valid: 'false', errors: "[{code: 'PROJECT_TYPE_INVALID'}]" } },
    { set: 'tplLimit', expr: 'risk.tplLimit || 1000000' },
    { when: 'tables.factors.tpl[tplLimit] == null', return: { valid: 'false', errors: "[{code: 'TPL_LIMIT_NOT_OFFERED'}]" } },
    { set: 'f', expr: 'tables.factors' },
    { set: 'months', expr: 'max(f.minProjectMonths, monthsBetween(p.startDate, p.completionDate))' },
    { set: 'si', expr: 'p.contractValue + (p.ownerMaterials || 0)' },
    { set: 'zone', expr: "context.natcatZone || 'low'" },
    { set: 'maintMonths', expr: "p.maintenance == 'extended24' ? 24 : 12" },
    { set: 'period', expr: '{inception: p.startDate, expiry: addMonths(p.completionDate, maintMonths), constructionEnd: p.completionDate, maintenanceMonths: maintMonths}' },
    { when: 'p.contractValue > settings.online.maxContractValue', return: { ...prBase, quotable: 'false', notQuotableReason: "'ABOVE_ONLINE_LIMIT'" } },
    { set: 'works0', expr: 'si * type.rate12 * (months / 12) * f.complexity[type.complexity] * f.natcat[zone]' },
    { set: 'works1', expr: "product == 'EAR' && p.hotTesting ? works0 * (1 + f.hotTestingLoading) : works0" },
    { set: 'works', expr: "product == 'EAR' && p.secondHand ? works1 * (1 + f.secondHandLoading) : works1" },
    { set: 'tpl', expr: 'p.contractValue * f.tpl[tplLimit]' },
    { set: 'maintenance', expr: 'works * f.maintenance[p.maintenance]' },
    ...addOnSteps('works', 'tpl'),
    { set: 'extraLines', expr: 'tpl + maintenance' },
    ...finishSteps('works', 'extraLines', 'product'),
    { set: 'inst', expr: 'settings.instant' },
    { set: 'maxCv', expr: "product == 'EAR' ? authority.earMaxContractValue : authority.maxContractValue" },
  ],
  output: {
    ...prBase, quotable: 'true',
    'breakdown.worksPremium': 'round(works, dec)', 'breakdown.locationsPremium': 'round(works, dec)', 'breakdown.tplPremium': 'round(tpl, dec)', 'breakdown.tplLimit': 'tplLimit',
    'breakdown.maintenancePremium': 'round(maintenance, dec)', 'breakdown.months': 'months', 'breakdown.rate12': 'type.rate12', 'breakdown.complexity': 'type.complexity',
    'breakdown.natcatZone': 'zone', 'breakdown.worksPerMonth': 'round(works / months, dec)', 'breakdown.deductibles': 'tables.deductibles[product]', ...finishOut,
    'facts.sumInsured': 'si', 'facts.contractValue': 'p.contractValue', 'facts.months': 'months',
    'facts.exceedsAutoLimit': '(maxCv != null && p.contractValue > maxCv) || (authority.maxMonths != null && months > authority.maxMonths)',
    'facts.complexProject': 'type.complexity > inst.maxComplexity',
    'facts.groundRisk': 'p.basements > inst.maxBasements || p.excavationDepth > inst.maxExcavation || p.dewatering || p.blasting || p.pilingNearBuildings || p.overWater',
    'facts.worksStarted': 'risk.worksStarted == true || p.startDate < (context.asOf || today())',
    'facts.oldOrSecondHand': "product == 'EAR' && p.secondHand",
    'facts.referralItem': "product == 'EAR' && p.hotTesting && p.testingWeeks > inst.earMaxHotTestingWeeks",
    'facts.highNatcat': "zone == 'high'",
    'facts.permitUnverified': 'context.permitVerified == false',
    'facts.adverseClaims': '(risk.claims3y || 0) >= 2 || risk.largeLoss == true',
    ...commonFacts,
  },
};

const anBase = { valid: 'true', productType: "'CAR_ANNUAL'", tier: "'annual'", currency: 'country.currency', sumInsured: 'round(a.estimatedTurnover, dec)', maxLocationSI: 'a.maxContractValue', period: 'period' };
const annual = {
  steps: [
    { set: 'dec', expr: 'country.currency_decimals' },
    { set: 'a', expr: 'risk.annual' },
    { each: 'a.projectTypes', as: 'c', collect: 'pts', steps: [{ set: 't', expr: "find(tables.projectTypes, item.code == c && item.product == 'CAR')" }] },
    { when: 'any(pts, item.t == null)', return: { valid: 'false', errors: "[{code: 'PROJECT_TYPE_INVALID'}]" } },
    { set: 'period', expr: 'risk.inceptionDate ? {inception: risk.inceptionDate, expiry: annualExpiry(risk.inceptionDate)} : undefined' },
    { when: "channel == 'b2c'", return: { ...anBase, quotable: 'false', notQuotableReason: "'ANNUAL_CAR_VIA_BROKER'" } },
    { set: 'addOns', expr: '[]' },
    ...finishSteps('0', '0', "'CAR_ANNUAL'"),
    { set: 'agreedFactor', expr: '(1 + num(uwTerms.loadingPct || 0)) * (1 - (uwTerms.discountPct != null ? num(uwTerms.discountPct) : num(risk.discountPct || 0)))' },
  ],
  output: {
    ...anBase, quotable: 'true',
    'breakdown.annualMinimum': 'premium', 'breakdown.locationsPremium': 'premium', ...finishOut, 'breakdown.agreedFactor': 'agreedFactor',
    'facts.sumInsured': 'a.estimatedTurnover',
    'facts.annualNeedsApproval': '!authority.canBindAnnual || a.maxContractValue > (authority.maxAnnualProjectValue ?? 0)',
    'facts.complexProject': 'any(pts, item.t.complexity > 2)',
    ...commonFacts,
  },
};

module.exports = {
  name: 'Engineering',
  requiredTables: ['equipmentTypes', 'projectTypes', 'factors', 'addOns', 'deductibles', 'charges'],
  prepare: [
    { as: 'natcatZone', provider: 'natcatZone', when: 'risk.project != null', arg: '{area: risk.project.area, city: risk.project.city}' },
    { as: 'permitVerified', provider: 'permitVerified', when: 'risk.project != null', arg: '{permitNo: risk.project.permitNo, city: risk.project.city}' },
  ],
  entries: {
    rate: { steps: [{ call: 'annual', when: "risk.productType == 'CAR_ANNUAL'" }, { call: 'project', when: "includes(['CAR', 'EAR'], risk.productType)" }, { call: 'equipment' }] },
    equipment,
    project,
    annual,
  },
};
