/**
 * CAR / EAR project lifecycle (Engineering BRD section 6):
 * period extension (instant within 25% of the original period and no claims), contract value
 * variations (pro rata), and completion (final value, minimum retained 80%, maintenance starts).
 * Every change is priced at the original rate and paid before it applies (refunds go back).
 */
const express = require('express');
const { raterFor } = require('../../products/dynamic');
const { z } = require('zod');
const { db } = require('../../db');
const catalog = require('../../lib/catalog');
const policies = require('../policies/service');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth } = require('../../middleware/auth');
const { assertPolicyAccess } = require('../../lib/access');
const { round } = require('../../lib/money');
const { today, isISODate, daysInclusive } = require('../../lib/dates');
const { monthsBetween, addMonths } = require('../../products/engineering/rater');
const { AppError, badRequest, conflict } = require('../../lib/errors');

const router = express.Router();
router.use(requireAuth);

async function loadProject(req) {
  const policy = await policies.getPolicy(Number(req.params.id));
  if (policy.product_code !== 'ENG' || !policy.risk_data.project) throw new AppError(404, 'PROJECT_NOT_FOUND');
  assertPolicyAccess(req.user, policy);
  if (policy.status !== 'active') throw conflict('POLICY_NOT_ACTIVE');
  return policy;
}

function phase(policy) {
  const p = policy.risk_data.project;
  const now = today();
  if (policy.risk_data.completedOn) return now > policy.expiry_date ? 'ended' : 'maintenance';
  if (now < p.startDate) return 'not_started';
  if (now <= p.completionDate) return 'construction';
  return 'overdue_completion';
}

function view(policy) {
  const p = policy.risk_data.project;
  return {
    policyId: policy.id, policyNo: policy.policy_no, productType: policy.risk_data.productType, phase: phase(policy), currency: policy.currency,
    startDate: p.startDate, completionDate: p.completionDate, completedOn: policy.risk_data.completedOn || null, maintenanceEnd: policy.expiry_date,
    contractValue: p.contractValue, months: policy.rating.months, worksPremium: policy.rating.breakdown.worksPremium, worksPerMonth: policy.rating.breakdown.worksPerMonth,
    testingStartedOn: p.testingStartedOn || null, testingWeeks: p.testingWeeks, hotTesting: p.hotTesting,
    handovers: p.handovers || [], handedOverValue: (p.handovers || []).reduce((s, h) => s + Number(h.value || 0), 0),
  };
}

const { apply, referProjectChange, record } = require('./projectChanges');

router.get('/:id/project', asyncHandler(async (req, res) => {
  const policy = await policies.getPolicy(Number(req.params.id));
  if (policy.product_code !== 'ENG' || !policy.risk_data.project) throw new AppError(404, 'PROJECT_NOT_FOUND');
  assertPolicyAccess(req.user, policy);
  res.json({ project: view(policy) });
}));

/** FR-LC-01: extension at the original monthly rate; over 25% of the period or after a claim needs an underwriter. */
router.post('/:id/project/extension', asyncHandler(async (req, res) => {
  const policy = await loadProject(req);
  const { newCompletionDate, reason, payment, preview } = z.object({ newCompletionDate: z.string().refine(isISODate), reason: z.string().min(2).max(300), payment: z.any().optional(), preview: z.boolean().default(false) }).parse(req.body);
  const p = policy.risk_data.project;
  if (policy.risk_data.completedOn) throw conflict('PROJECT_COMPLETED');
  if (newCompletionDate <= p.completionDate) throw badRequest('EXTENSION_NOT_LATER');
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  const addedMonths = monthsBetween(p.completionDate, newCompletionDate);
  const pct = addedMonths / policy.rating.months;
  const claims = await db('claims').where({ policy_id: policy.id }).count({ n: '*' }).first();
  const premiumDelta = policy.rating.breakdown.worksPerMonth * addedMonths;
  const needsUw = pct > pc.settings.project.extensionInstantPct || Number(claims.n) > 0;
  if (preview) return res.json({ addedMonths, pct: Math.round(pct * 100), premiumDelta: round(premiumDelta, 2), referralRequired: needsUw });
  const maint = policy.rating.period.maintenanceMonths;
  const change = {
    data: { from: p.completionDate, to: newCompletionDate, addedMonths, reason }, riskPatch: { project: { completionDate: newCompletionDate } },
    expiry: addMonths(newCompletionDate, maint), ratingPatch: { months: policy.rating.months + addedMonths }, facts: { addedMonths, pctOfPeriod: Math.round(pct * 100), claims: Number(claims.n) },
  };
  if (needsUw) {
    const reasons = [{ code: 'UW-E12', description: { en: Number(claims.n) > 0 ? 'Extension requested after a claim' : `Extension of ${Math.round(pct * 100)}% of the original period (instant limit 25%)`, ar: Number(claims.n) > 0 ? 'طلب تمديد بعد مطالبة' : `تمديد بنسبة ${Math.round(pct * 100)}% من المدة الأصلية (الحد الفوري 25%)` } }];
    return res.status(202).json(await referProjectChange(policy, { type: 'period_extension', premiumDelta, change, reasons, note: reason, user: req.user }));
  }
  const result = await apply(policy, { type: 'period_extension', premiumDelta, ...change, payment, user: req.user });
  return res.status(201).json({ ...result, addedMonths });
}));

/** FR-LC-02: contract value variation, pro rata for the construction time left. */
router.post('/:id/project/contract-value', asyncHandler(async (req, res) => {
  const policy = await loadProject(req);
  const { newContractValue, payment, preview } = z.object({ newContractValue: z.number().positive(), payment: z.any().optional(), preview: z.boolean().default(false) }).parse(req.body);
  const p = policy.risk_data.project;
  if (policy.risk_data.completedOn) throw conflict('PROJECT_COMPLETED');
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  const authority = req.user.isBroker ? pc.settings.authority[(await db('brokers').where({ id: req.user.brokerId }).first()).tier] : pc.settings.authority.b2c;
  const maxCv = policy.risk_data.productType === 'EAR' ? authority?.earMaxContractValue : authority?.maxContractValue;
  const aboveLimit = maxCv != null && newContractValue > maxCv && !req.user.isStaff;
  const start = today() > p.startDate ? today() : p.startDate;
  const remaining = Math.max(0, daysInclusive(start, p.completionDate)) / daysInclusive(p.startDate, p.completionDate);
  const premiumDelta = policy.rating.breakdown.worksPremium * (newContractValue / p.contractValue - 1) * remaining;
  if (preview) return res.json({ premiumDelta: round(premiumDelta, 2), remainingPct: Math.round(remaining * 100), referralRequired: aboveLimit });
  const change = { data: { from: p.contractValue, to: newContractValue }, riskPatch: { project: { contractValue: newContractValue } }, ratingPatch: { sumInsured: newContractValue + (p.ownerMaterials || 0), maxLocationSI: newContractValue + (p.ownerMaterials || 0) }, facts: { from: p.contractValue, to: newContractValue } };
  if (aboveLimit) {
    const reasons = [{ code: 'UW-E01', description: { en: 'Contract value above the instant-issue limit', ar: 'قيمة العقد تتجاوز حد الإصدار الفوري' } }];
    return res.status(202).json(await referProjectChange(policy, { type: 'contract_value', premiumDelta, change, reasons, user: req.user }));
  }
  const result = await apply(policy, { type: 'contract_value', premiumDelta, ...change, payment, user: req.user });
  return res.status(201).json(result);
}));

/** FR-LC-04: completion with final contract value; minimum retained premium; maintenance period starts. */
router.post('/:id/project/completion', asyncHandler(async (req, res) => {
  const policy = await loadProject(req);
  const { completionDate, finalContractValue, payment, preview } = z.object({ completionDate: z.string().refine(isISODate), finalContractValue: z.number().positive(), payment: z.any().optional(), preview: z.boolean().default(false) }).parse(req.body);
  const p = policy.risk_data.project;
  if (policy.risk_data.completedOn) throw conflict('PROJECT_COMPLETED');
  if (completionDate < p.startDate || completionDate > today()) throw badRequest('COMPLETION_DATE_INVALID');
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  const works = policy.rating.breakdown.worksPremium;
  const finalWorks = Math.max(works * (finalContractValue / p.contractValue), works * pc.settings.project.minRetainedPct);
  const premiumDelta = finalWorks - works;
  if (preview) return res.json({ premiumDelta: round(premiumDelta, 2) });
  const maint = policy.rating.period.maintenanceMonths;
  const result = await apply(policy, {
    type: 'completion', premiumDelta, data: { completionDate, finalContractValue, originalContractValue: p.contractValue },
    riskPatch: { completedOn: completionDate, project: { contractValue: finalContractValue } }, expiry: addMonths(completionDate, maint), payment, user: req.user,
  });
  return res.status(201).json({ ...result, maintenanceEnd: addMonths(completionDate, maint) });
}));

/** FR-LC-05: EAR testing starts; hot testing longer than agreed (or the instant maximum) goes to the underwriter. */
router.post('/:id/project/testing-start', asyncHandler(async (req, res) => {
  const policy = await loadProject(req);
  if (policy.risk_data.productType !== 'EAR') throw badRequest('EAR_ONLY');
  const { date, hot, weeks, note } = z.object({ date: z.string().refine(isISODate), hot: z.boolean().default(false), weeks: z.number().int().min(1).max(52), note: z.string().max(1000).optional() }).parse(req.body);
  const p = policy.risk_data.project;
  if (p.testingStartedOn) throw conflict('TESTING_ALREADY_STARTED');
  if (date < p.startDate || date > today()) throw badRequest('TESTING_DATE_INVALID');
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  const agreed = p.hotTesting ? p.testingWeeks : 0;
  const extraWeeks = hot ? Math.max(0, weeks - Math.max(agreed, pc.settings.instant.earMaxHotTestingWeeks)) : 0;
  const riskPatch = { project: { testingStartedOn: date, testingHot: hot, testingWeeksDeclared: weeks } };
  if (extraWeeks > 0) {
    const premiumDelta = policy.rating.breakdown.worksPerMonth * (extraWeeks / 4.33) * 1.25;
    const reasons = [{ code: 'UW-E06', description: { en: `Hot testing ${extraWeeks} week(s) beyond the agreed period`, ar: `اختبار ساخن لمدة ${extraWeeks} أسبوع بعد المدة المتفق عليها` } }];
    return res.status(202).json(await referProjectChange(policy, { type: 'testing_extension', premiumDelta, change: { data: { date, hot, weeks, extraWeeks }, riskPatch, facts: { extraWeeks } }, reasons, note, user: req.user }));
  }
  return res.status(201).json(await record(policy, { type: 'testing_start', data: { date, hot, weeks }, riskPatch, user: req.user }));
}));

/** FR-LC-03: parts handed over or taken into use; recorded for claims (cover on them moves to maintenance). */
router.post('/:id/project/handover', asyncHandler(async (req, res) => {
  const policy = await loadProject(req);
  const { part, value, date } = z.object({ part: z.string().min(2).max(200), value: z.number().positive(), date: z.string().refine(isISODate) }).parse(req.body);
  const p = policy.risk_data.project;
  if (date > today() || date < p.startDate) throw badRequest('HANDOVER_DATE_INVALID');
  const handovers = [...(p.handovers || []), { part, value, date }];
  if (handovers.reduce((s, h) => s + h.value, 0) > p.contractValue) throw badRequest('HANDOVER_ABOVE_CONTRACT_VALUE');
  return res.status(201).json(await record(policy, { type: 'partial_handover', data: { part, value, date }, riskPatch: { project: { handovers } }, user: req.user }));
}));

/** Annual CAR: declare a project; priced at agreed rates; instant within terms, otherwise referred (UW-E13). */
router.post('/:id/annual/projects', asyncHandler(async (req, res) => {
  const policy = await policies.getPolicy(Number(req.params.id));
  if (policy.product_code !== 'ENG' || policy.risk_data.productType !== 'CAR_ANNUAL') throw new AppError(404, 'ANNUAL_POLICY_NOT_FOUND');
  assertPolicyAccess(req.user, policy);
  if (policy.status !== 'active') throw conflict('POLICY_NOT_ACTIVE');
  const { projectSchema } = require('../../products/engineering/schema');
  const rater = await raterFor(await catalog.getProduct(policy.product_code), policy.country_code);
  const integrations = require('../../integrations');
  const { matchRules } = require('../../lib/rules');
  const { preview, note, payment, ...raw } = req.body || {};
  const project = projectSchema.parse(raw.project);
  if (project.startDate < today()) throw badRequest('INCEPTION_IN_PAST');
  if (project.startDate > policy.expiry_date) throw badRequest('OUTSIDE_COVER_PERIOD', 'Projects must start within the policy year');
  const a = policy.risk_data.annual;
  const country = await catalog.getCountry(policy.country_code);
  const pc = await catalog.getProductCountry(policy.product_code, policy.country_code);
  const { tables } = await catalog.getRateTables(policy.product_code, policy.country_code, {}, undefined, rater.REQUIRED_TABLES);
  const context = await rater.prepare({ project }, integrations);
  const terms = { maxContractValue: a.maxContractValue, earMaxContractValue: a.maxContractValue, maxMonths: a.maxMonths, maxDiscount: 1 };
  const factor = policy.rating.breakdown.agreedFactor ?? 1;
  const r = rater.rateProject({ risk: { productType: 'CAR', project, tplLimit: policy.risk_data.tplLimit || 1000000, addOns: [], addOnInputs: {}, discountPct: 0 }, tables, settings: pc.settings, country, authority: terms, uwTerms: { loadingPct: factor - 1, discountPct: 0 }, sanctionsHit: false, context });
  if (!r.valid) throw badRequest('PROJECT_INVALID', 'Project details are incomplete', r.errors);
  if (!r.quotable) throw unprocessableError(r.notQuotableReason);
  r.facts.outsideAnnualTerms = !a.projectTypes.includes(project.projectType) || r.facts.exceedsAutoLimit;
  r.facts.exceedsAutoLimit = false;
  const reasons = (await require('../../lib/ruleEngine').run({ productCode: policy.product_code, countryCode: policy.country_code, purpose: 'underwriting', facts: { ...project, ...r.facts } })).refer;
  const premiumDelta = r.breakdown.premium;
  const declared = policy.risk_data.declaredProjects || [];
  const entry = { ref: `${policy.policy_no}/P${String(declared.length + 1).padStart(3, '0')}`, ...project, premium: premiumDelta, months: r.breakdown.months, maintenanceEnd: r.period.expiry };
  if (preview) return res.json({ premium: premiumDelta, months: r.breakdown.months, referralRequired: reasons.length > 0, reasons });
  const change = { data: { project: entry }, riskPatch: { declaredProjects: [...declared, entry] }, facts: r.facts };
  if (reasons.length) return res.status(202).json(await referProjectChange(policy, { type: 'annual_project', premiumDelta, change, reasons, note, user: req.user }));
  const applied = await apply(policy, { type: 'annual_project', premiumDelta, ...change, payment, user: req.user });
  return res.status(201).json({ ...applied, projectRef: entry.ref });
}));

router.get('/:id/annual/projects', asyncHandler(async (req, res) => {
  const policy = await policies.getPolicy(Number(req.params.id));
  if (policy.risk_data.productType !== 'CAR_ANNUAL') throw new AppError(404, 'ANNUAL_POLICY_NOT_FOUND');
  assertPolicyAccess(req.user, policy);
  res.json({ terms: policy.risk_data.annual, projects: policy.risk_data.declaredProjects || [], currency: policy.currency });
}));

function unprocessableError(code) {
  return new AppError(422, code, 'Not available online');
}

function addDays1(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

module.exports = router;
