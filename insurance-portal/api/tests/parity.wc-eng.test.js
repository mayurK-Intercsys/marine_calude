/**
 * Parity: the WC and Engineering rating models give exactly the same results as the coded raters
 * (including validation errors, not-quotable reasons and the pre-rating lookups) on random inputs.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const { db } = require('../src/db');
const wcCoded = require('../src/products/wc/rater');
const engCoded = require('../src/products/engineering/rater');
const { fromModel } = require('../src/products/dynamic');
const engine = require('../src/lib/ratingEngine');
const wcModel = require('../src/products/models/wc');
const engModel = require('../src/products/models/engineering');

const load = async (product) => ({
  tables: Object.fromEntries((await db('rate_tables').where({ product_code: product, country_code: 'AE', status: 'approved' })).map((r) => [r.table_key, r.data])),
  settings: (await db('product_countries').where({ product_code: product, country_code: 'AE' }).first()).settings,
});
let wc;
let eng;
let country;
let seed = 777;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const TERMS = [null, { loadingPct: 0.2 }, { discountPct: 0.05 }, { loadingPct: -0.1, discountPct: 0 }];

function same(a, b, label) {
  const run = (fn) => { try { return { r: fn() }; } catch (e) { return { e: e.code || e.message }; } };
  expect({ label, ...run(b) }).toEqual({ label, ...run(a) });
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
  wc = await load('WC');
  eng = await load('ENG');
  country = await db('countries').where({ code: 'AE' }).first();
});
afterAll(async () => { await db.destroy(); });

test('models are valid', () => {
  expect(engine.validate(wcModel)).toEqual([]);
  expect(engine.validate(engModel)).toEqual([]);
});

test('WC: 800 random workforces price identically', () => {
  const cats = wc.tables.categories.map((c) => c.code).concat(['NOPE']);
  for (let n = 0; n < 800; n += 1) {
    const named = rnd() < 0.4;
    const risk = {
      trade: pick(wc.tables.trades.map((t) => t.code).concat(['NOPE'])), policyType: named ? 'named' : 'unnamed', plan: pick(['essential', 'standard', 'complete', 'gold']),
      elLimit: pick([undefined, 1000000, 5000000, 3000000]), periodMonths: pick([1, 3, 6, 12, 12]), claims3y: pick([0, 1, 2, 4]), fatalClaim3y: rnd() < 0.1,
      extensions: pick([[], ['X05'], ['X01', 'X06'], ['X07'], ['X03', 'X04', 'X05'], ['NOPE'], ['X02']]), discountPct: pick([0, 0.05, 0.15]),
      inceptionDate: pick([undefined, '2026-11-01', '2027-01-31']), backdatedJoiner: rnd() < 0.05,
      categories: named ? [] : Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ category: pick(cats), headcount: pick([0, 3, 12, 60, 400]), avgBasic: pick([0, 900, 3000]), avgGross: pick([0, 600, 2000, 8000]), annualWages: pick([undefined, undefined, 500000]) })),
      employees: named ? Array.from({ length: Math.floor(rnd() * 8) }, (_, i) => ({ name: `E${i}`, idNo: `784-${i}`, category: pick(cats), basic: pick([1200, 4000]), gross: pick([2000, 6500, 700]) })) : [],
    };
    const params = { risk, tables: wc.tables, settings: wc.settings, country, authority: pick([{ maxEmployees: 50, maxWages: 5000000, hazardClasses: [1, 2], maxEL: 2000000, maxDiscount: 0 }, { maxEmployees: 250, maxWages: 25000000, hazardClasses: [1, 2, 3], maxEL: 5000000, maxDiscount: 0.2 }, {}]), uwTerms: pick(TERMS), sanctionsHit: rnd() < 0.05 };
    same(() => wcCoded.rate(params), () => fromModel(wcModel).rate(params), `wc ${n}`);
  }
});

test('Engineering: 600 random equipment, project and annual risks price identically', () => {
  const eqTypes = eng.tables.equipmentTypes.map((t) => t.code).concat(['NOPE']);
  const prTypes = eng.tables.projectTypes.map((t) => t.code).concat(['NOPE']);
  for (let n = 0; n < 600; n += 1) {
    const productType = pick(['CPM', 'MB', 'EEI', 'CAR', 'EAR', 'CAR_ANNUAL']);
    const risk = {
      productType, territory: pick(['single', 'named', 'floater']), claims3y: pick([0, 1, 3]), largeLoss: rnd() < 0.1, worksStarted: rnd() < 0.1,
      discountPct: pick([0, 0.05, 0.2]), inceptionDate: pick([undefined, '2026-11-01']), tplLimit: pick([undefined, 1000000, 2000000, 3000000]),
      addOns: pick([[], ['SURROUNDING', 'CROSS'], ['ESCALATION'], ['DATA', 'ICOW'], ['EXPRESS', 'CPM_TPL'], ['NOPE']]), addOnInputs: { surroundingSI: 1000000, dataSI: 50000 },
      items: Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({ type: pick(eqTypes), make: 'M', model: 'X', year: pick([2024, 2019, 2013, 2003]), serial: 'S', value: pick([150000, 900000, 2500000, 30000000]), capacityMW: pick([undefined, 2, 10]) })),
      project: { projectType: pick(prTypes), contractValue: pick([2000000, 6400000, 12000000, 150000000]), ownerMaterials: pick([0, 300000, undefined]), startDate: pick(['2026-11-01', '2026-01-01']), completionDate: pick(['2027-12-31', '2026-12-01', '2029-06-30']), maintenance: pick(['visits', 'extended', 'extended24']), basements: pick([0, 1, 2]), excavationDepth: pick([3, 8]), dewatering: rnd() < 0.2, blasting: false, pilingNearBuildings: rnd() < 0.1, overWater: false, testingWeeks: pick([2, 5]), hotTesting: rnd() < 0.3, secondHand: rnd() < 0.2 },
      annual: { estimatedTurnover: 30000000, maxContractValue: pick([5000000, 15000000]), maxMonths: 18, projectTypes: pick([['VILLA', 'LOWRISE'], ['HIGHRISE'], ['MEP_HVAC']]) },
    };
    const params = { risk, tables: eng.tables, settings: eng.settings, country, authority: pick([eng.settings.authority.b2c, eng.settings.authority.preferred, {}]), uwTerms: pick(TERMS), sanctionsHit: false, channel: pick(['b2c', 'b2b']), context: { natcatZone: pick([undefined, 'low', 'high']), permitVerified: pick([undefined, true, false]) } };
    same(() => engCoded.rate(params), () => fromModel(engModel).rate(params), `eng ${n}`);
    if (['CAR', 'EAR'].includes(productType)) same(() => engCoded.rateProject(params), () => fromModel(engModel).rateProject(params), `project ${n}`);
  }
});

test('Engineering: the flood-zone and permit lookups are requested in the same cases', async () => {
  const integrations = { geo: { zoneFor: async (a) => (/wadi/i.test(a.area) ? 'high' : 'low') }, permits: { verify: async (p) => ({ verified: /^BP-/.test(p.permitNo || '') }) } };
  for (const risk of [{ productType: 'CPM', items: [] }, { productType: 'CAR', project: { area: 'Wadi Al Safa', city: 'Dubai', permitNo: 'BP-2026-1' } }, { productType: 'EAR', project: { area: 'JVC', permitNo: 'x' } }]) {
    // eslint-disable-next-line no-await-in-loop
    expect(await fromModel(engModel).prepare(risk, integrations)).toEqual(await engCoded.prepare(risk, integrations));
  }
});
