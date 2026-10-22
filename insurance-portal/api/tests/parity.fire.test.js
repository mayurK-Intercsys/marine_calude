/**
 * Parity: the Fire rating model on the dynamic engine gives exactly the same result as the coded
 * Fire rater (breakdown, per-location factors, facts, validation errors, not-quotable reasons)
 * across hundreds of random risks, using the real UAE rate tables and settings.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const { db } = require('../src/db');
const coded = require('../src/products/fire/rater');
const { fromModel } = require('../src/products/dynamic');
const model = require('../src/products/models/fire');

let tables;
let settings;
let country;

// Deterministic pseudo-random generator so failures are reproducible.
let seed = 20261026;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const maybe = (p, v) => (rnd() < p ? v : undefined);

function randomRisk() {
  const location = () => ({
    address: { building: pick(['Tower 1', 'Shop 4', '']), area: pick(['Deira', 'Al Qusais', 'Marina']), city: 'Dubai' },
    construction: pick(['concrete', 'mixed', 'light']),
    buildingAge: pick(['lt10', '10to25', 'gt25']),
    floorLevel: pick(['ground', 'upper', 'basement']),
    protection: { sprinklers: rnd() < 0.2, alarm: rnd() < 0.5, extinguishers: rnd() < 0.7 },
    civilDefence: rnd() < 0.85,
    natcatZone: pick(['low', 'low', 'medium', 'high']),
    sumsInsured: Object.fromEntries(['BLD', 'IMP', 'PLM', 'FFF', 'STK', 'OTH'].map((k) => [k, maybe(0.6, Math.round(rnd() * (k === 'OTH' ? 60000 : k === 'BLD' ? 30000000 : 3000000)))]).filter(([, v]) => v !== undefined)),
  });
  return {
    occupancy: pick(tables.occupancies.map((o) => o.code).concat(['NOPE'])),
    locations: Array.from({ length: 1 + Math.floor(rnd() * 3) }, location),
    claims3y: pick([0, 0, 1, 2, 5]),
    extensions: pick([[], ['X01'], ['X01', 'X02'], ['X03', 'X05'], ['X06', 'X07'], ['X08'], ['X02', 'X03', 'X07'], ['BAD']]),
    extensionInputs: maybe(0.5, { rentSI: Math.round(rnd() * 500000) }) || {},
    deductible: pick(['standard', 'high', undefined]),
    discountPct: pick([0, 0, 0.05, 0.1, 0.25]),
    previouslyDeclined: rnd() < 0.1,
  };
}

const AUTH = [{ maxLocationSI: 5000000, maxDiscount: 0, hazards: ['low'] }, { maxLocationSI: 20000000, maxDiscount: 0.2, hazards: ['low', 'medium'] }, { maxLocationSI: null, maxDiscount: null }];
const TERMS = [null, { loadingPct: 0.1 }, { loadingPct: -0.05, discountPct: 0.02, deductible: 'high' }];

function both(params) {
  const out = {};
  for (const [name, fn] of [['coded', () => coded.rate(params)], ['dynamic', () => fromModel(model).rate(params)]]) {
    try { out[name] = { result: fn() }; } catch (e) { out[name] = { error: e.code || e.message }; }
  }
  return out;
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
  const rows = await db('rate_tables').where({ product_code: 'FIRE', country_code: 'AE', status: 'approved' });
  tables = Object.fromEntries(rows.map((r) => [r.table_key, r.data]));
  settings = (await db('product_countries').where({ product_code: 'FIRE', country_code: 'AE' }).first()).settings;
  country = await db('countries').where({ code: 'AE' }).first();
});
afterAll(async () => { await db.destroy(); });

test('600 random risks price identically on the coded rater and the Fire rating model', () => {
  let quotable = 0;
  let errors = 0;
  for (let n = 0; n < 600; n += 1) {
    const risk = randomRisk();
    const params = {
      risk, tables, settings, country, authority: pick(AUTH), uwTerms: pick(TERMS), sanctionsHit: rnd() < 0.05,
      existingExposure: rnd() < 0.3 ? { 'tower 1|deira|dubai': 95000000 } : {},
    };
    const { coded: c, dynamic: d } = both(params);
    expect({ n, ...d }).toEqual({ n, ...c });
    if (c.result?.quotable) quotable += 1;
    if (c.error || c.result?.valid === false) errors += 1;
  }
  expect(quotable).toBeGreaterThan(150);
  expect(errors).toBeGreaterThan(30);
});

test('a missing factor is reported the same way', () => {
  const risk = { occupancy: 'SHOP_GROCERY', locations: [{ construction: 'straw', buildingAge: 'lt10', sumsInsured: { STK: 1000 } }] };
  const { coded: c, dynamic: d } = both({ risk, tables, settings, country, authority: AUTH[0] });
  expect(c.error).toBe('RATING_FACTOR_MISSING');
  expect(d.error).toBe('RATING_FACTOR_MISSING');
});
