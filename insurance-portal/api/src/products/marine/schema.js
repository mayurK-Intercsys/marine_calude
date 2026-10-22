const { z } = require('zod');
const { isISODate } = require('../../lib/dates');

const money = z.number().min(0).max(1e12);
const date = z.string().refine(isISODate, 'Use YYYY-MM-DD');
const place = z.object({ country: z.string().length(2).transform((s) => s.toUpperCase()), place: z.string().max(80).default('') });

const shipmentFields = {
  direction: z.enum(['import', 'export']).default('import'),
  commodity: z.string().min(2).max(40),
  description: z.string().max(300).default(''),
  packing: z.enum(['cartons', 'pallets', 'crates', 'bags', 'drums', 'bulk', 'unpacked']).default('cartons'),
  container: z.enum(['fcl', 'lcl', 'reefer', 'none']).default('fcl'),
  newGoods: z.boolean().default(true),
  mode: z.enum(['sea', 'air', 'road', 'rail', 'multimodal']).default('sea'),
  origin: place,
  destination: place,
  finalDestination: z.string().max(200).default(''),
  sailingDate: date,
  incoterm: z.enum(['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CIP', 'DAP', 'DDP']).default('CIF'),
  vessel: z.object({ name: z.string().max(120).default(''), imo: z.string().max(12).default('') }).default({}),
  conveyanceRef: z.string().max(60).default(''),
  invoice: z.object({ currency: z.string().length(3).transform((s) => s.toUpperCase()), amount: money }),
  invoiceNo: z.string().max(60).default(''),
  blNo: z.string().max(60).default(''),
  freight: money.default(0),
  upliftPct: z.number().min(0).max(0.2).default(0.1),
  duty: money.default(0),
  clause: z.enum(['ICC-A', 'ICC-B', 'ICC-C', 'ICC-AIR', 'ITC-A', 'ITC-B']),
  war: z.boolean().default(false),
  srcc: z.boolean().default(false),
  extensions: z.array(z.string().max(5)).max(10).default([]),
  lc: z.object({ bank: z.string().max(160), number: z.string().max(60), wording: z.string().max(1000).default('') }).optional(),
  marks: z.string().max(200).default(''),
};

const business = z.object({ name: z.string().max(200).optional(), tradeLicence: z.string().max(60).optional() }).default({});

/** One shipment (single or inland). Cover starts on the sailing / departure date. */
const shipmentSchema = z.object({
  productType: z.enum(['single', 'inland']),
  ...shipmentFields,
  business,
  discountPct: z.number().min(0).max(0.5).default(0),
  previouslyDeclined: z.boolean().default(false),
  inceptionDate: date.optional(),
}).transform((s) => ({ ...s, direction: s.productType === 'inland' ? 'import' : s.direction, inceptionDate: s.sailingDate }));

const openCoverSchema = z.object({
  productType: z.literal('open_cover'),
  interest: z.enum(['import', 'export', 'inland', 'all']).default('import'),
  estimatedTurnover: money.refine((v) => v > 0, 'Required'),
  perSendingLimit: money.refine((v) => v > 0, 'Required'),
  commodities: z.array(z.object({
    commodity: z.string().min(2).max(40),
    clause: z.enum(['ICC-A', 'ICC-B', 'ICC-C', 'ICC-AIR', 'ITC-A', 'ITC-B']),
    share: z.number().min(0).max(1),
  })).min(1).max(30),
  regions: z.array(z.enum(['gcc', 'asia', 'europe', 'americas', 'africa', 'other'])).min(1).default(['gcc']),
  war: z.boolean().default(true),
  srcc: z.boolean().default(true),
  premiumBasis: z.enum(['per_certificate', 'deposit']).default('per_certificate'),
  depositPct: z.number().min(0.25).max(1).optional(),
  certificateIssuers: z.object({ holder: z.boolean().default(true), broker: z.boolean().default(true) }).default({}),
  business,
  discountPct: z.number().min(0).max(0.5).default(0),
  previouslyDeclined: z.boolean().default(false),
  inceptionDate: date.optional(),
});

const riskSchema = {
  parse(input) {
    if (input?.productType === 'open_cover') return openCoverSchema.parse(input);
    return shipmentSchema.parse(input);
  },
};

/** A certificate's shipment under an open cover. */
const certificateSchema = z.object({ productType: z.enum(['single', 'inland']).default('single'), ...shipmentFields, clause: shipmentFields.clause.optional() });

module.exports = { riskSchema, certificateSchema };
