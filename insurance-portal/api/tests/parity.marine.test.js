/**
 * Parity: the Marine rating model (shipments, open cover set-up, certificates and the vessel
 * lookup) gives exactly the same results as the coded Marine rater on random inputs.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'insurance_portal_test';
const { db } = require('../src/db');
const coded = require('../src/products/marine/rater');
const { fromModel } = require('../src/products/dynamic');
const model = require('../src/products/models/marine');
const engine = require('../src/lib/ratingEngine');

let tables;
let settings;
let country;
let seed = 4242;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const dyn = () => fromModel(model);
const COUNTRIES = ['CN', 'AE', 'IN', 'DE', 'SD', 'IR', 'KE', 'US', 'ZZ'];
const VESSELS = [undefined, { found: false }, { found: true, age: 4, iacs: true }, { found: true, age: 18, iacs: true }, { found: true, age: 31, iacs: false }, { found: true, age: null }];
const AUTH = [{ maxSI: 2000000, maxDiscount: 0.1, canBindOpenCover: false, maxOpenCoverTurnover: 0 }, { maxSI: 5000000, maxDiscount: 0.2, canBindOpenCover: true, maxOpenCoverTurnover: 25000000 }, {}];
const TERMS = [null, { loadingPct: 0.15 }, { discountPct: 0.05, loadingPct: -0.1 }];

function shipment() {
  const productType = pick(['single', 'single', 'inland']);
  return {
    productType, direction: pick(['import', 'export']), commodity: pick(tables.commodities.map((c) => c.code).concat(['NOPE'])),
    packing: pick(['cartons', 'bulk', 'unpacked', 'drums', 'odd']), container: pick(['fcl', 'lcl', 'reefer', 'none', 'x']),
    mode: pick(['sea', 'sea', 'air', 'road', 'rail', 'multimodal']), origin: { country: pick(COUNTRIES) }, destination: { country: pick(COUNTRIES) },
    sailingDate: pick(['2026-11-01', '2026-12-15', new Date().toISOString().slice(0, 10)]), incoterm: pick(['FOB', 'CIF', 'EXW', 'DDP', 'CFR']),
    invoice: { currency: pick(['USD', 'EUR', 'AED', 'CNY', 'XXX', 'USD']), amount: pick([0, 15000, 85000, 420000, 2500000, 9000000]) },
    freight: pick([0, 3200, undefined]), upliftPct: pick([0.1, 0, 0.2, undefined]), duty: pick([0, 5000, undefined]),
    clause: pick(['ICC-A', 'ICC-B', 'ICC-C', 'ICC-AIR', 'ITC-A', 'ITC-B']), war: rnd() < 0.5, srcc: rnd() < 0.5,
    extensions: pick([[], ['X02'], ['X09'], ['X08', 'X02'], ['NOPE']]), discountPct: pick([0, 0.05, 0.15]), previouslyDeclined: rnd() < 0.1,
  };
}
function openCover() {
  const lines = pick([[], [{ commodity: 'GEN_PACKED', clause: 'ICC-A', share: 1 }], [{ commodity: 'ELEC_APPLIANCES', clause: 'ICC-A', share: 0.7 }, { commodity: 'FOOD_PACKED', clause: 'ICC-B', share: 0.3 }], [{ commodity: 'BULK_GRAIN', clause: 'ICC-A', share: 1 }], [{ commodity: 'EXPLOSIVES', clause: 'ICC-A', share: 1 }], [{ commodity: 'FROZEN', clause: 'ICC-A', share: 0.5 }]]);
  return { productType: 'open_cover', estimatedTurnover: pick([5000000, 24000000]), perSendingLimit: pick([500000, 3000000]), commodities: lines, regions: pick([[], ['asia', 'gcc'], ['africa'], ['nowhere']]), war: rnd() < 0.7, srcc: rnd() < 0.7, premiumBasis: pick(['deposit', 'per_certificate']), depositPct: pick([undefined, 0.5]), inceptionDate: pick([undefined, '2026-11-01']), discountPct: pick([0, 0.1]) };
}

function compare(fnA, fnB) {
  const out = [];
  for (const fn of [fnA, fnB]) {
    try { out.push({ r: fn() }); } catch (e) { out.push({ e: e.code || e.message }); }
  }
  return out;
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
  tables = Object.fromEntries((await db('rate_tables').where({ product_code: 'MARINE', country_code: 'AE', status: 'approved' })).map((r) => [r.table_key, r.data]));
  settings = (await db('product_countries').where({ product_code: 'MARINE', country_code: 'AE' }).first()).settings;
  country = await db('countries').where({ code: 'AE' }).first();
});
afterAll(async () => { await db.destroy(); });

test('the model is valid', () => { expect(engine.validate(model)).toEqual([]); });

test('1,000 random shipments price identically', () => {
  let quotable = 0;
  for (let n = 0; n < 1000; n += 1) {
    const params = { risk: shipment(), tables, settings, country, authority: pick(AUTH), uwTerms: pick(TERMS), sanctionsHit: rnd() < 0.05, context: { vessel: pick(VESSELS) }, channel: pick(['b2c', 'b2b']) };
    const [c, d] = compare(() => coded.rate(params), () => dyn().rate(params));
    expect({ n, ...d }).toEqual({ n, ...c });
    if (c.r?.quotable) quotable += 1;
  }
  expect(quotable).toBeGreaterThan(50);
});

test('400 random open covers and 800 certificates under them price identically', () => {
  let certs = 0;
  for (let n = 0; n < 400; n += 1) {
    const params = { risk: openCover(), tables, settings, country, authority: pick(AUTH), uwTerms: pick(TERMS), sanctionsHit: false, context: {}, channel: pick(['b2b', 'b2b', 'b2c']) };
    const [c, d] = compare(() => coded.rate(params), () => dyn().rate(params));
    expect({ n, ...d }).toEqual({ n, ...c });
    if (!c.r?.quotable) continue;
    const policy = { risk_data: { ...params.risk, interest: pick(['import', 'export', 'inland', 'all']) }, rating: c.r };
    for (let k = 0; k < 2; k += 1) {
      const s = shipment();
      if (rnd() < 0.5 && policy.rating.agreedRates[0]) s.commodity = policy.rating.agreedRates[0].commodity;
      const cp = { shipment: s, policy, tables, settings, country, sanctionsHit: rnd() < 0.05, context: { vessel: pick(VESSELS) }, turnoverUsed: pick([0, 4000000, 23000000]), uwTerms: pick(TERMS) };
      const [cc, dd] = compare(() => coded.rateCertificate(cp), () => dyn().rateCertificate(cp));
      expect({ n, k, ...dd }).toEqual({ n, k, ...cc });
      certs += 1;
    }
  }
  expect(certs).toBeGreaterThan(150);
});

test('the vessel lookup is requested in the same cases', async () => {
  const integrations = { vessels: { lookup: async (v) => ({ found: true, name: v.name || null, age: 9 }) } };
  for (let n = 0; n < 50; n += 1) {
    const risk = n % 5 === 0 ? openCover() : { ...shipment(), vessel: pick([undefined, { name: 'MSC AURORA' }]) };
    // eslint-disable-next-line no-await-in-loop
    expect(await dyn().prepare(risk, integrations)).toEqual(await coded.prepare(risk, integrations));
  }
});
