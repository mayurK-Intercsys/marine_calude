/**
 * Fire & Allied Perils rater (Fire BRD section 8).
 *
 * Premium per location = SI x base rate (by occupancy) x construction x protection
 *   x civil defence x nat-cat x claims x building age x SI band.
 * Then extensions, deductible, underwriter loading, discount, minimum premium,
 * policy fee and tax. Every factor comes from approved rate tables, never code.
 *
 * Returns the price breakdown and the "facts" that referral rules are evaluated on.
 */
const { round } = require('../../lib/money');

const ASSET_CODES = ['BLD', 'IMP', 'PLM', 'FFF', 'STK', 'OTH'];

const num = (v) => Math.max(0, Number(v) || 0);

function locationSumInsured(loc) {
  return ASSET_CODES.reduce((sum, code) => sum + num(loc.sumsInsured?.[code]), 0);
}

function protectionFactor(protection = {}, f) {
  if (protection.sprinklers) return { key: 'sprinklers', value: f.sprinklers };
  if (protection.alarm) return { key: 'alarm', value: f.alarm };
  if (protection.extinguishers) return { key: 'extinguishers', value: f.extinguishers };
  return { key: 'none', value: f.none };
}

function siBandFactor(si, bands) {
  const band = bands.find((b) => b.upTo == null || si <= b.upTo);
  return band ? band.factor : 1;
}

function tierFor(maxLocationSI, tiers) {
  if (maxLocationSI <= tiers.tier1) return 'tier1';
  if (maxLocationSI <= tiers.tier2) return 'tier2';
  return 'above';
}

function lookup(table, key, name) {
  if (!(key in table)) {
    const err = new Error(`Missing ${name} factor for "${key}"`);
    err.code = 'RATING_FACTOR_MISSING';
    throw err;
  }
  return table[key];
}

/**
 * @param {object} p
 * @param {object} p.risk           risk_data captured by the journey
 * @param {object} p.tables         approved rate tables (occupancies, factors, extensions, charges)
 * @param {object} p.settings       product_countries.settings
 * @param {object} p.country        countries row (currency, decimals, vat)
 * @param {object} p.authority      limits for the channel / broker tier
 * @param {object} [p.uwTerms]      underwriter terms: loadingPct, discountPct, deductible
 * @param {boolean} [p.sanctionsHit]
 */
/** Normalised site key used for accumulation (UW-11). Production: replace with a geocoded site ID. */
function siteKey(address = {}) {
  return [address.building, address.area, address.city].map((p) => String(p || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
}

function rate({ risk, tables, settings, country, authority, uwTerms = null, sanctionsHit = false, existingExposure = {} }) {
  const dec = country.currency_decimals;
  const { factors, charges } = tables;
  const occupancy = tables.occupancies.find((o) => o.code === risk.occupancy);
  const errors = [];

  if (!occupancy) errors.push({ code: 'OCCUPANCY_UNKNOWN' });
  const locations = Array.isArray(risk.locations) ? risk.locations : [];
  if (locations.length === 0) errors.push({ code: 'LOCATION_REQUIRED' });

  const selectedExt = Array.isArray(risk.extensions) ? risk.extensions : [];
  for (const code of selectedExt) {
    if (!tables.extensions[code]) errors.push({ code: 'EXTENSION_UNKNOWN', field: code });
  }

  locations.forEach((loc, i) => {
    if (locationSumInsured(loc) <= 0) errors.push({ code: 'SUM_INSURED_REQUIRED', field: `locations.${i}` });
    if (num(loc.sumsInsured?.OTH) > charges.othSubLimit) errors.push({ code: 'OTH_ABOVE_SUBLIMIT', field: `locations.${i}.OTH` });
  });

  if (errors.length) return { valid: false, errors };

  const totalSI = locations.reduce((s, l) => s + locationSumInsured(l), 0);
  const maxLocationSI = Math.max(...locations.map(locationSumInsured));
  const tier = tierFor(maxLocationSI, settings.tiers);

  const base = {
    valid: true,
    currency: country.currency,
    sumInsured: round(totalSI, dec),
    maxLocationSI: round(maxLocationSI, dec),
    tier,
  };

  if (occupancy.status === 'decline') return { ...base, quotable: false, notQuotableReason: 'OCCUPANCY_DECLINED' };
  if (tier === 'above') return { ...base, quotable: false, notQuotableReason: 'ABOVE_ONLINE_LIMIT' };

  const claims3y = Math.min(2, Math.max(0, Number(risk.claims3y) || 0));
  const claimsFactor = lookup(factors.claims, String(claims3y), 'claims');

  const locationResults = locations.map((loc, index) => {
    const si = locationSumInsured(loc);
    const prot = protectionFactor(loc.protection, factors.protection);
    const applied = {
      construction: lookup(factors.construction, loc.construction, 'construction'),
      protection: prot.value,
      civilDefence: factors.civilDefence[loc.civilDefence === false ? 'no' : 'yes'],
      natcat: lookup(factors.natcat, loc.natcatZone || 'low', 'natcat'),
      claims: claimsFactor,
      buildingAge: lookup(factors.buildingAge, loc.buildingAge, 'buildingAge'),
      siBand: siBandFactor(si, factors.siBands),
    };
    const basePremium = (si * occupancy.ratePermille) / 1000;
    const premium = Object.values(applied).reduce((p, f) => p * f, basePremium);
    return { index, sumInsured: round(si, dec), basePremium: round(basePremium, dec), factors: applied, protection: prot.key, premium: round(premium, dec) };
  });

  const locationsPremium = locationResults.reduce((s, l) => s + l.premium, 0);

  const extensionLines = [];
  let referralExtension = false;
  for (const code of selectedExt) {
    const ext = tables.extensions[code];
    let amount = 0;
    switch (ext.method) {
      case 'loading':
        if (ext.tier1Only && tier !== 'tier1') {
          extensionLines.push({ code, amount: 0, available: false });
          continue;
        }
        amount = locationsPremium * ext.pct;
        break;
      case 'rate_on_groups':
        amount = locations.reduce((s, l) => s + ext.groups.reduce((g, c) => g + num(l.sumsInsured?.[c]), 0), 0) * (ext.permille / 1000);
        break;
      case 'rate_on_total':
        amount = totalSI * (ext.permille / 1000);
        break;
      case 'rate_on_input':
        amount = num(risk.extensionInputs?.[ext.input]) * (ext.permille / 1000);
        break;
      case 'referral_only':
        referralExtension = true;
        break;
      default:
        throw new Error(`Unknown extension method ${ext.method}`);
    }
    extensionLines.push({ code, amount: round(amount, dec), available: true });
  }
  const extensionsTotal = extensionLines.reduce((s, e) => s + e.amount, 0);

  const deductibleCode = uwTerms?.deductible || risk.deductible || 'standard';
  const deductibleFactor = lookup(factors.deductible, deductibleCode, 'deductible');
  const technical = (locationsPremium + extensionsTotal) * deductibleFactor;

  const uwLoadingPct = Number(uwTerms?.loadingPct || 0);
  const loaded = technical * (1 + uwLoadingPct);

  const requestedDiscount = Math.max(0, Number(risk.discountPct) || 0);
  const discountPct = uwTerms?.discountPct != null ? Number(uwTerms.discountPct) : requestedDiscount;
  const discount = loaded * discountPct;

  const minPremium = charges.minPremium;
  // Round each printed line first so the invoice always adds up.
  const netPremium = round(Math.max(minPremium, loaded - discount), dec);
  const policyFee = round(charges.policyFee, dec);
  const tax = round((netPremium + policyFee) * Number(country.vat_rate), dec);

  const breakdown = {
    locationsPremium: round(locationsPremium, dec),
    extensions: extensionLines,
    extensionsTotal: round(extensionsTotal, dec),
    deductible: deductibleCode,
    deductibleFactor,
    technicalPremium: round(technical, dec),
    uwLoadingPct,
    uwLoading: round(loaded - technical, dec),
    discountPct,
    discount: round(discount, dec),
    minimumPremiumApplied: loaded - discount < minPremium,
    premium: round(netPremium, dec),
    policyFee: round(policyFee, dec),
    vatRate: Number(country.vat_rate),
    tax: round(tax, dec),
    total: round(netPremium + policyFee + tax, dec),
  };

  const facts = {
    totalSI,
    maxLocationSI,
    tier,
    hazard: occupancy.hazard,
    occupancyStatus: occupancy.status,
    exceedsAutoLimit: authority.maxLocationSI != null && maxLocationSI > authority.maxLocationSI,
    hazardOutsideAuthority: occupancy.status === 'refer' || !(authority.hazards || ['low']).includes(occupancy.hazard),
    lightConstructionOver1m: locations.some((l) => l.construction === 'light' && locationSumInsured(l) > 1000000),
    noCivilDefence: locations.some((l) => l.civilDefence === false),
    claims3y,
    highNatcat: locations.some((l) => l.natcatZone === 'high'),
    basementStock: locations.some((l) => l.floorLevel === 'basement' && num(l.sumsInsured?.STK) > 0),
    discountPct: requestedDiscount,
    discountExceedsBand: requestedDiscount > (authority.maxDiscount ?? 0),
    hasReferralExtension: referralExtension,
    sanctionsHit: Boolean(sanctionsHit),
    previouslyDeclined: risk.previouslyDeclined === true,
    accumulationExceeded: settings.accumulationLimitPerSite != null && locations.some((l) => {
      const key = siteKey(l.address);
      return key !== '||' && (existingExposure[key] || 0) + locationSumInsured(l) > settings.accumulationLimitPerSite;
    }),
  };

  return { ...base, quotable: true, locations: locationResults, breakdown, facts };
}

/** Approved tables this rater needs before it can price. */
const REQUIRED_TABLES = ['occupancies', 'factors', 'extensions', 'charges'];

module.exports = { rate, locationSumInsured, siteKey, ASSET_CODES, REQUIRED_TABLES };
