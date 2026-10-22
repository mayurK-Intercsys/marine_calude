const { z } = require('zod');
const { isISODate } = require('../../lib/dates');

const money = z.number().min(0).max(1e12);

const location = z.object({
  address: z.object({
    building: z.string().max(200).default(''),
    area: z.string().max(120).default(''),
    city: z.string().max(80).default(''),
    makani: z.string().max(20).optional(),
  }).default({}),
  construction: z.enum(['concrete', 'mixed', 'light']).default('concrete'),
  buildingAge: z.enum(['lt10', '10to25', 'gt25']).default('lt10'),
  floors: z.number().int().min(1).max(200).optional(),
  floorLevel: z.enum(['ground', 'upper', 'basement']).default('ground'),
  protection: z.object({
    sprinklers: z.boolean().default(false),
    alarm: z.boolean().default(false),
    extinguishers: z.boolean().default(false),
    hoseReels: z.boolean().default(false),
  }).default({}),
  civilDefence: z.boolean().default(true),
  natcatZone: z.enum(['low', 'medium', 'high']).optional(),
  sumsInsured: z.object({
    BLD: money.optional(), IMP: money.optional(), PLM: money.optional(),
    FFF: money.optional(), STK: money.optional(), OTH: money.optional(),
  }).default({}),
});

const riskSchema = z.object({
  occupancy: z.string().min(1).max(40),
  interest: z.enum(['owner', 'tenant', 'lessee']).optional(),
  business: z.object({
    name: z.string().max(200).optional(),
    tradeLicence: z.string().max(60).optional(),
    licenceExpiry: z.string().refine(isISODate, 'Use YYYY-MM-DD').optional(),
    authority: z.string().max(80).optional(),
  }).default({}),
  locations: z.array(location).min(1).max(200),
  claims3y: z.number().int().min(0).max(20).default(0),
  previouslyDeclined: z.boolean().default(false),
  extensions: z.array(z.string().max(5)).max(20).default([]),
  extensionInputs: z.object({ rentSI: money.optional() }).default({}),
  deductible: z.enum(['standard', 'high']).default('standard'),
  discountPct: z.number().min(0).max(0.5).default(0),
  inceptionDate: z.string().refine(isISODate, 'Use YYYY-MM-DD').optional(),
});

module.exports = { riskSchema };
