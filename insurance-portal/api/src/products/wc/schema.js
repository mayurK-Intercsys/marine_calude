const { z } = require('zod');
const { isISODate } = require('../../lib/dates');

const money = z.number().min(0).max(1e10);
const date = z.string().refine(isISODate, 'Use YYYY-MM-DD');

const employee = z.object({
  name: z.string().min(2).max(160),
  idNo: z.string().min(5).max(40),
  nationality: z.string().max(60).default(''),
  jobTitle: z.string().max(120).default(''),
  category: z.string().min(2).max(20),
  basic: money,
  gross: money,
  startDate: date.optional(),
});

const categoryRow = z.object({
  category: z.string().min(2).max(20),
  headcount: z.number().int().min(0).max(100000),
  avgBasic: money.default(0),
  avgGross: money.default(0),
  annualWages: money.optional(),
});

const riskSchema = z.object({
  trade: z.string().min(2).max(30),
  policyType: z.enum(['unnamed', 'named']).default('unnamed'),
  plan: z.enum(['essential', 'standard', 'complete']).default('standard'),
  elLimit: z.number().int().optional(),
  categories: z.array(categoryRow).max(30).default([]),
  employees: z.array(employee).max(5000).default([]),
  periodMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(12),
  extensions: z.array(z.string().max(5)).max(10).default([]),
  claims3y: z.number().int().min(0).max(50).default(0),
  fatalClaim3y: z.boolean().default(false),
  workLocation: z.string().max(200).default(''),
  business: z.object({ name: z.string().max(200).optional(), tradeLicence: z.string().max(60).optional(), establishmentNo: z.string().max(60).optional() }).default({}),
  discountPct: z.number().min(0).max(0.5).default(0),
  previouslyDeclined: z.boolean().default(false),
  backdatedJoiner: z.boolean().optional(),
  inceptionDate: date.optional(),
}).superRefine((r, ctx) => {
  if (r.policyType === 'named' && r.employees.length === 0) ctx.addIssue({ code: 'custom', path: ['employees'], message: 'Add at least one employee' });
  if (r.policyType === 'unnamed' && !r.categories.some((c) => c.headcount > 0)) ctx.addIssue({ code: 'custom', path: ['categories'], message: 'Add at least one job type' });
  const ids = r.employees.map((e) => e.idNo.replace(/\W/g, ''));
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['employees'], message: 'Duplicate employee ID' });
});

module.exports = { riskSchema };
