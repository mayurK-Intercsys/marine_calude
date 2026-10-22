const { z } = require('zod');
const { isISODate } = require('../../lib/dates');

const money = z.number().min(0).max(1e11);
const date = z.string().refine(isISODate, 'Use YYYY-MM-DD');

const item = z.object({
  type: z.string().min(2).max(30),
  make: z.string().max(80).default(''),
  model: z.string().max(80).default(''),
  year: z.number().int().min(1950).max(2100),
  serial: z.string().max(60).default(''),
  ownership: z.enum(['owned', 'financed', 'hired_in']).default('owned'),
  value: money.refine((v) => v > 0, 'Required'),
  capacityMW: z.number().min(0).max(5000).optional(),
  lossPayee: z.string().max(160).optional(),
});

const project = z.object({
  projectType: z.string().min(2).max(30),
  name: z.string().max(200).default(''),
  area: z.string().max(120).default(''),
  city: z.string().max(80).default(''),
  principal: z.string().max(200).default(''),
  permitNo: z.string().max(60).default(''),
  contractValue: money.refine((v) => v > 0, 'Required'),
  ownerMaterials: money.default(0),
  startDate: date,
  completionDate: date,
  maintenance: z.enum(['visits', 'extended', 'extended24']).default('visits'),
  storeysAbove: z.number().int().min(0).max(200).default(0),
  basements: z.number().int().min(0).max(10).default(0),
  excavationDepth: z.number().min(0).max(100).default(0),
  foundation: z.enum(['raft', 'piles', 'footings']).default('raft'),
  nearestBuildingM: z.number().min(0).max(10000).default(50),
  dewatering: z.boolean().default(false),
  blasting: z.boolean().default(false),
  pilingNearBuildings: z.boolean().default(false),
  overWater: z.boolean().default(false),
  hotWorks: z.boolean().default(false),
  testingWeeks: z.number().int().min(0).max(52).default(0),
  hotTesting: z.boolean().default(false),
  secondHand: z.boolean().default(false),
});

const riskSchema = z.object({
  productType: z.enum(['CPM', 'CAR', 'EAR', 'MB', 'EEI', 'CAR_ANNUAL']),
  annual: z.object({
    estimatedTurnover: money.refine((v) => v > 0, 'Required'),
    maxContractValue: money.refine((v) => v > 0, 'Required'),
    maxMonths: z.number().int().min(6).max(36).default(24),
    projectTypes: z.array(z.string().max(30)).min(1).max(20),
  }).optional(),
  items: z.array(item).max(500).default([]),
  territory: z.enum(['single', 'named', 'floater']).default('single'),
  sites: z.array(z.string().max(200)).max(10).default([]),
  project: project.optional(),
  tplLimit: z.number().int().optional(),
  addOns: z.array(z.string().max(20)).max(10).default([]),
  addOnInputs: z.object({ surroundingSI: money.optional(), dataSI: money.optional(), icowSI: money.optional() }).default({}),
  claims3y: z.number().int().min(0).max(50).default(0),
  largeLoss: z.boolean().default(false),
  worksStarted: z.boolean().default(false),
  business: z.object({ name: z.string().max(200).optional(), tradeLicence: z.string().max(60).optional() }).default({}),
  discountPct: z.number().min(0).max(0.5).default(0),
  previouslyDeclined: z.boolean().default(false),
  inceptionDate: date.optional(),
}).superRefine((r, ctx) => {
  const projectType = ['CAR', 'EAR'].includes(r.productType);
  if (projectType && !r.project) ctx.addIssue({ code: 'custom', path: ['project'], message: 'Project details required' });
  if (r.productType === 'CAR_ANNUAL') { if (!r.annual) ctx.addIssue({ code: 'custom', path: ['annual'], message: 'Annual terms required' }); return; }
  if (!projectType && r.items.length === 0) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Add at least one item' });
  if (r.project && r.project.completionDate <= r.project.startDate) ctx.addIssue({ code: 'custom', path: ['project', 'completionDate'], message: 'Completion must be after start' });
}).transform((r) => (r.project ? { ...r, inceptionDate: r.project.startDate } : r));

module.exports = { riskSchema, projectSchema: project };

