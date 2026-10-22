/**
 * Marine Cargo rater (Marine BRD sections 4 and 9).
 *
 * Single / inland transit:
 *   SI = (invoice + freight if the Incoterm excludes it) x (1 + uplift) + duty, converted to policy currency.
 *   Premium = SI x commodity/clause rate x mode x route region x packing x container x vessel age
 *             + war + SRCC + extensions, then deductible, underwriter loading, discount, minimum premium.
 * Open cover: estimated premium on annual turnover from the commodity schedule; agreed rates
 *   are stored on the policy and replace the rate table for every certificate.
 */
const { round } = require('../../lib/money');
const { addDays, daysInclusive, annualExpiry, today } = require('../../lib/dates');

const REQUIRED_TABLES = ['commodities', 'countries', 'factors', 'extensions', 'deductibles', 'fx', 'charges'];
const PACKED_EXEMPT = ['bulk', 'unpacked'];
const FREIGHT_EXCLUDED = ['EXW', 'FCA', 'FOB'];

/** Clauses the portal offers for a commodity, product type and mode (FR-B2C-M04). */
function allowedClauses(commodity, productType, mode) {
  const byMode = productType === 'inland' ? ['ITC-A', 'ITC-B'] : mode === 'air' ? ['ICC-AIR'] : ['ICC-A', 'ICC-B', 'ICC-C'];
  return byMode.filter((c) => commodity && commodity.rates[c] != null);
}

function countryInfo(tables, code) {
  return tables.countries[code] || { region: 'other' };
}

/** Sum insured by Incoterm with uplift, then FX (FR-B2C-M03). Shown to the customer as a formula. */
function sumInsured(shipment, tables, country) {
  const fxRate = tables.fx[shipment.invoice.currency];
  if (!fxRate) {
    const err = new Error(`No FX rate for ${shipment.invoice.currency}`);
    err.code = 'RATING_FACTOR_MISSING';
    throw err;
  }
  const invoice = Number(shipment.invoice.amount) || 0;
  const freight = FREIGHT_EXCLUDED.includes(shipment.incoterm) ? Number(shipment.freight || 0) : 0;
  const uplift = shipment.upliftPct ?? 0.1;
  const duty = Number(shipment.duty || 0);
  const siForeign = (invoice + freight) * (1 + uplift) + duty;
  const local = round(siForeign * fxRate, country.currency_decimals);
  return { invoice, freight, upliftPct: uplift, duty, currency: shipment.invoice.currency, fxRate, siForeign: round(siForeign, 2), siLocal: local };
}

function vesselFactor(vessel, factors) {
  if (!vessel?.found || vessel.age == null) return 1;
  const band = factors.vesselAge.find((b) => vessel.age <= b.maxAge);
  return band ? band.factor : factors.vesselAge[factors.vesselAge.length - 1].factor;
}

function routeFacts(shipment, tables) {
  const origin = countryInfo(tables, shipment.origin.country);
  const dest = countryInfo(tables, shipment.destination.country);
  const statuses = [origin.status, dest.status];
  return {
    declinedCountry: statuses.includes('decline'),
    highRiskRoute: statuses.includes('war_listed') || statuses.includes('refer'),
    regionFactor: Math.max(tables.factors.region[origin.region] ?? tables.factors.region.other, tables.factors.region[dest.region] ?? tables.factors.region.other),
  };
}

function vesselIssue(shipment, vessel) {
  if (shipment.mode !== 'sea') return false;
  return !vessel?.found || vessel.age > 25 || vessel.iacs === false;
}

function priceLines({ si, rate, shipment, tables, factorsApplied, uwTerms, discountPct, country, minPremium, vatRate, policyFee = 0 }) {
  const dec = country.currency_decimals;
  const f = tables.factors;
  const base = si * rate * Object.values(factorsApplied).reduce((p, x) => p * x, 1);
  const war = shipment.war && f.war[shipment.mode] ? si * f.war[shipment.mode] : 0;
  const srcc = shipment.srcc ? si * f.srcc : 0;

  const extensions = [];
  let referralExtension = false;
  for (const code of shipment.extensions || []) {
    const ext = tables.extensions[code];
    if (!ext) continue;
    let amount = 0;
    if (ext.method === 'rate_on_si') amount = si * ext.rate;
    else if (ext.method === 'loading') amount = base * ext.pct;
    else if (ext.method === 'referral_only') referralExtension = true;
    extensions.push({ code, amount: round(amount, dec) });
  }
  const extTotal = extensions.reduce((s, e) => s + e.amount, 0);
  const technical = base + war + srcc + extTotal;
  const loaded = technical * (1 + Number(uwTerms?.loadingPct || 0));
  const dPct = uwTerms?.discountPct != null ? Number(uwTerms.discountPct) : discountPct;
  const discount = loaded * dPct;
  const premium = round(Math.max(minPremium, loaded - discount), dec);
  const fee = round(policyFee, dec);
  const tax = round((premium + fee) * vatRate, dec);
  return {
    breakdown: {
      basePremium: round(base, dec), warPremium: round(war, dec), srccPremium: round(srcc, dec),
      extensions, extensionsTotal: round(extTotal, dec), technicalPremium: round(technical, dec),
      uwLoadingPct: Number(uwTerms?.loadingPct || 0), uwLoading: round(loaded - technical, dec),
      discountPct: dPct, discount: round(discount, dec), minimumPremiumApplied: loaded - discount < minPremium,
      premium, policyFee: fee, vatRate, tax, total: round(premium + fee + tax, dec),
      // Shared views read these two names.
      locationsPremium: round(base, dec),
    },
    referralExtension,
  };
}

function vatRateFor(settings, country, kind) {
  return (settings.vat?.[kind] || 'standard') === 'zero' ? 0 : Number(country.vat_rate);
}

function rateShipment({ risk, tables, settings, country, authority, uwTerms, sanctionsHit, context }) {
  const errors = [];
  const commodity = tables.commodities.find((c) => c.code === risk.commodity);
  if (!commodity) errors.push({ code: 'COMMODITY_UNKNOWN' });
  if (risk.productType === 'inland' && (risk.war || risk.mode === 'sea' || risk.mode === 'air')) errors.push({ code: 'INLAND_MODE_INVALID' });
  if (commodity && !commodity.prohibited && !allowedClauses(commodity, risk.productType, risk.mode).includes(risk.clause)) errors.push({ code: 'CLAUSE_NOT_ALLOWED', field: 'clause' });
  if (!(Number(risk.invoice?.amount) > 0)) errors.push({ code: 'INVOICE_VALUE_REQUIRED' });
  if (errors.length) return { valid: false, errors };

  const calc = sumInsured(risk, tables, country);
  const si = calc.siLocal;
  const route = routeFacts(risk, tables);
  const period = { inception: risk.sailingDate, expiry: addDays(risk.sailingDate, settings.transitValidityDays || 90) };
  const base = { valid: true, productType: risk.productType, tier: risk.productType, currency: country.currency, sumInsured: si, maxLocationSI: si, sumInsuredCalc: calc, period };

  if (commodity.prohibited) return { ...base, quotable: false, notQuotableReason: 'COMMODITY_PROHIBITED' };
  if (route.declinedCountry) return { ...base, quotable: false, notQuotableReason: 'COUNTRY_DECLINED' };
  if (si > settings.maxOnlineSI) return { ...base, quotable: false, notQuotableReason: 'ABOVE_ONLINE_LIMIT' };

  const f = tables.factors;
  const factorsApplied = {
    mode: f.mode[risk.mode], region: route.regionFactor, packing: f.packing[risk.packing] ?? 1,
    container: f.container[risk.container] ?? 1, vessel: risk.mode === 'sea' ? vesselFactor(context.vessel, f) : 1,
  };
  const kind = risk.productType === 'inland' ? 'domestic' : risk.direction;
  const { breakdown, referralExtension } = priceLines({
    si, rate: commodity.rates[risk.clause], shipment: risk, tables, factorsApplied, uwTerms, discountPct: Number(risk.discountPct || 0),
    country, minPremium: tables.charges.minPremium, vatRate: vatRateFor(settings, country, kind), policyFee: tables.charges.policyFee,
  });
  const ded = tables.deductibles[commodity.group] || tables.deductibles.general;
  breakdown.deductible = { pct: ded.pct, min: ded.min, amount: round(Math.max(ded.min, si * ded.pct), country.currency_decimals) };
  breakdown.factors = factorsApplied;
  breakdown.rate = commodity.rates[risk.clause];

  const asOf = context.asOf || today();
  const facts = {
    sumInsured: si,
    exceedsAutoLimit: authority.maxSI != null && si > authority.maxSI,
    referralCommodity: Boolean(commodity.referral || (commodity.referralAboveSI && si > commodity.referralAboveSI)),
    highRiskRoute: route.highRiskRoute,
    vesselIssue: vesselIssue(risk, context.vessel),
    vesselAge: context.vessel?.age ?? null,
    unpackedAllRisks: PACKED_EXEMPT.includes(risk.packing) && ['ICC-A', 'ICC-AIR', 'ITC-A'].includes(risk.clause),
    departureSoon: daysInclusive(asOf, risk.sailingDate) <= 1,
    sanctionsHit: Boolean(sanctionsHit),
    discountPct: Number(risk.discountPct || 0),
    discountExceedsBand: Number(risk.discountPct || 0) > (authority.maxDiscount ?? 0),
    hasReferralExtension: referralExtension,
    previouslyDeclined: risk.previouslyDeclined === true,
  };
  return { ...base, quotable: true, breakdown, facts, commodityGroup: commodity.group };
}

function rateOpenCover({ risk, tables, settings, country, authority, uwTerms, sanctionsHit, channel }) {
  const errors = [];
  const lines = risk.commodities || [];
  const share = lines.reduce((s, l) => s + Number(l.share || 0), 0);
  if (!lines.length) errors.push({ code: 'COMMODITY_SCHEDULE_REQUIRED' });
  if (Math.abs(share - 1) > 0.001) errors.push({ code: 'SHARES_MUST_TOTAL_100' });
  const resolved = lines.map((l) => ({ ...l, commodity: tables.commodities.find((c) => c.code === l.commodity) }));
  resolved.forEach((l, i) => {
    if (!l.commodity) errors.push({ code: 'COMMODITY_UNKNOWN', field: `commodities.${i}` });
    else if (l.commodity.rates[l.clause] == null) errors.push({ code: 'CLAUSE_NOT_ALLOWED', field: `commodities.${i}` });
  });
  if (errors.length) return { valid: false, errors };

  const dec = country.currency_decimals;
  const turnover = Number(risk.estimatedTurnover);
  const inception = risk.inceptionDate || today();
  const base = { valid: true, productType: 'open_cover', tier: 'open_cover', currency: country.currency, sumInsured: round(turnover, dec), maxLocationSI: Number(risk.perSendingLimit), period: { inception, expiry: annualExpiry(inception) } };
  if (channel === 'b2c') return { ...base, quotable: false, notQuotableReason: 'OPEN_COVER_VIA_BROKER' };
  if (resolved.some((l) => l.commodity.prohibited)) return { ...base, quotable: false, notQuotableReason: 'COMMODITY_PROHIBITED' };

  const f = tables.factors;
  const regionFactor = Math.max(...(risk.regions?.length ? risk.regions : ['other']).map((r) => f.region[r] ?? f.region.other));
  const loading = 1 + Number(uwTerms?.loadingPct || 0);
  const discountPct = uwTerms?.discountPct != null ? Number(uwTerms.discountPct) : Number(risk.discountPct || 0);
  const adjust = loading * (1 - discountPct);
  const agreedRates = resolved.map((l) => ({
    commodity: l.commodity.code, clause: l.clause, share: Number(l.share),
    rate: Number((l.commodity.rates[l.clause] * regionFactor * adjust).toFixed(6)),
    group: l.commodity.group,
  }));
  const weighted = agreedRates.reduce((s, r) => s + r.rate * r.share, 0);
  const warRate = risk.war ? f.war.sea * adjust : 0;
  const srccRate = risk.srcc ? f.srcc * adjust : 0;
  const estimatedPremium = round(turnover * (weighted + warRate + srccRate), dec);
  const deposit = risk.premiumBasis === 'deposit' ? round(estimatedPremium * (risk.depositPct ?? settings.depositPct), dec) : 0;
  const fee = round(tables.charges.openCoverFee, dec);
  const vatRate = vatRateFor(settings, country, 'open_cover');
  const tax = round((deposit + fee) * vatRate, dec);

  const facts = {
    sumInsured: turnover,
    openCoverNeedsApproval: !authority.canBindOpenCover || turnover > (authority.maxOpenCoverTurnover ?? 0),
    referralCommodity: resolved.some((l) => l.commodity.referral),
    highRiskRoute: false,
    discountPct: Number(risk.discountPct || 0),
    discountExceedsBand: Number(risk.discountPct || 0) > (authority.maxDiscount ?? 0),
    sanctionsHit: Boolean(sanctionsHit),
    previouslyDeclined: risk.previouslyDeclined === true,
  };
  return {
    ...base,
    quotable: true,
    agreedRates,
    agreedWarRate: Number(warRate.toFixed(6)),
    agreedSrccRate: Number(srccRate.toFixed(6)),
    breakdown: {
      weightedRate: Number(weighted.toFixed(6)), estimatedPremium, depositPct: risk.premiumBasis === 'deposit' ? (risk.depositPct ?? settings.depositPct) : 0,
      uwLoadingPct: Number(uwTerms?.loadingPct || 0), discountPct, uwLoading: 0, discount: 0, minimumPremiumApplied: false,
      locationsPremium: estimatedPremium, extensionsTotal: 0,
      premium: deposit, policyFee: fee, vatRate, tax, total: round(deposit + fee + tax, dec),
    },
    facts,
  };
}

/** Quote rating entry point used by the shared quote service. */
function rate(params) {
  if (params.risk.productType === 'open_cover') return rateOpenCover(params);
  return rateShipment(params);
}

/**
 * A certificate under an open cover: agreed rates from the policy replace the rate table;
 * vessel and route checks still run (Marine BRD section 9).
 */
function rateCertificate({ shipment, policy, tables, settings, country, sanctionsHit, context, turnoverUsed, uwTerms = null }) {
  const terms = policy.risk_data;
  const agreed = policy.rating.agreedRates.find((r) => r.commodity === shipment.commodity);
  const commodity = tables.commodities.find((c) => c.code === shipment.commodity);
  if (!commodity) return { valid: false, errors: [{ code: 'COMMODITY_UNKNOWN' }] };
  if (!(Number(shipment.invoice?.amount) > 0)) return { valid: false, errors: [{ code: 'INVOICE_VALUE_REQUIRED' }] };

  const calc = sumInsured(shipment, tables, country);
  const si = calc.siLocal;
  const route = routeFacts(shipment, tables);
  if (commodity.prohibited) return { valid: true, quotable: false, notQuotableReason: 'COMMODITY_PROHIBITED', sumInsured: si };
  if (route.declinedCountry) return { valid: true, quotable: false, notQuotableReason: 'COUNTRY_DECLINED', sumInsured: si };
  const clause = agreed?.clause || shipment.clause;
  const rateValue = agreed ? agreed.rate : (commodity.rates[clause] ?? 0);
  const vesselF = shipment.mode === 'sea' ? vesselFactor(context.vessel, tables.factors) : 1;
  const dec = country.currency_decimals;

  const base = si * rateValue * vesselF;
  const war = terms.war && ['sea', 'air'].includes(shipment.mode) ? si * policy.rating.agreedWarRate : 0;
  const srcc = terms.srcc ? si * policy.rating.agreedSrccRate : 0;
  const loaded = (base + war + srcc) * (1 + Number(uwTerms?.loadingPct || 0));
  const premium = round(Math.max(tables.charges.minCertificatePremium, loaded), dec);
  const kind = shipment.productType === 'inland' ? 'domestic' : shipment.direction;
  const vatRate = vatRateFor(settings, country, kind);
  const tax = round(premium * vatRate, dec);
  const ded = tables.deductibles[commodity.group] || tables.deductibles.general;
  const asOf = context.asOf || today();

  const facts = {
    sumInsured: si,
    outsideTerms: !agreed || (shipment.clause && shipment.clause !== agreed.clause) || (terms.interest !== 'all' && terms.interest !== (shipment.productType === 'inland' ? 'inland' : shipment.direction)),
    exceedsSendingLimit: si > Number(terms.perSendingLimit),
    turnoverExceeded: turnoverUsed + si > Number(terms.estimatedTurnover),
    highRiskRoute: route.highRiskRoute,
    vesselIssue: vesselIssue(shipment, context.vessel),
    vesselAge: context.vessel?.age ?? null,
    departureSoon: daysInclusive(asOf, shipment.sailingDate) <= 1,
    sanctionsHit: Boolean(sanctionsHit),
  };
  return {
    valid: true,
    quotable: true,
    sumInsured: si,
    sumInsuredCalc: calc,
    clause,
    breakdown: {
      rate: rateValue, vesselFactor: vesselF, basePremium: round(base, dec), warPremium: round(war, dec), srccPremium: round(srcc, dec),
      uwLoadingPct: Number(uwTerms?.loadingPct || 0), premium, vatRate, tax, total: round(premium + tax, dec),
      deductible: { pct: ded.pct, min: ded.min, amount: round(Math.max(ded.min, si * ded.pct), dec) },
    },
    facts,
  };
}

/** Async lookups the rater needs (vessel register). Called by the quote service before rating. */
async function prepare(risk, integrations) {
  if (risk.productType === 'open_cover' || risk.mode !== 'sea') return {};
  return { vessel: await integrations.vessels.lookup(risk.vessel || {}) };
}

module.exports = { rate, rateCertificate, prepare, allowedClauses, sumInsured, REQUIRED_TABLES };
