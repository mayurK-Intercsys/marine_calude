const express = require('express');
const { emit } = require('../../lib/messaging');
const numbering = require('../../lib/numbering');
const { z } = require('zod');
const { db, json } = require('../../db');
const catalog = require('../../lib/catalog');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth } = require('../../middleware/auth');
const { assertPolicyAccess } = require('../../lib/access');
const { nextValue, pad } = require('../../lib/sequence');
const { audit } = require('../../lib/audit');
const { notFound, badRequest, conflict } = require('../../lib/errors');

const router = express.Router();

const claimSchema = z.object({
  policyId: z.number().int().positive(),
  lossDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/)),
  cause: z.string().min(2).max(40),
  locationIndex: z.number().int().min(0).default(0),
  description: z.string().min(5).max(4000),
  estimate: z.number().min(0).max(1e12).optional(),
  assetGroups: z.array(z.string().max(5)).max(10).default([]),
  authorityReportNo: z.string().max(60).optional(),
  certificateId: z.number().int().positive().optional(),
  carrierReceipt: z.enum(['clean', 'claused', 'none']).optional(),
  discoveryPlace: z.string().max(200).optional(),
  employeeIdNo: z.string().max(40).optional(),
  employeeName: z.string().max(160).optional(),
  bodyPart: z.string().max(80).optional(),
  severity: z.enum(['minor', 'off_work', 'permanent', 'fatal']).optional(),
  hospital: z.string().max(160).optional(),
});

/**
 * FNOL (FR-CLM-01..08). The cover check only flags problems for the claims team;
 * it never rejects a notification.
 */
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const input = claimSchema.parse(req.body);
  const policy = await db('policies').where({ id: input.policyId }).first();
  if (!policy) throw notFound('POLICY_NOT_FOUND');
  assertPolicyAccess(req.user, policy);
  const product = await catalog.getProduct(policy.product_code);
  const lossDay = input.lossDate.slice(0, 10);

  const flags = [];
  if (policy.status !== 'active' && !(policy.status === 'cancelled' && policy.cancelled_at && lossDay < new Date(policy.cancelled_at).toISOString().slice(0, 10))) flags.push('POLICY_NOT_ACTIVE');
  if (lossDay < policy.inception_date || lossDay > policy.expiry_date) flags.push('OUTSIDE_PERIOD');
  if (!(product.config.coveredCauses || []).includes(input.cause)) flags.push('CAUSE_NEEDS_REVIEW');
  if (product.line === 'fire' && !policy.risk_data.locations?.[input.locationIndex]) flags.push('LOCATION_NOT_ON_POLICY');
  if (product.line === 'marine' && policy.risk_data.productType === 'open_cover') {
    const cert = input.certificateId ? await db('oc_certificates').where({ id: input.certificateId, policy_id: policy.id }).first() : null;
    if (!cert || cert.status !== 'issued') flags.push('CERTIFICATE_NOT_ISSUED');
  }
  if (product.line === 'marine' && input.carrierReceipt === 'clean') flags.push('CLEAN_RECEIPT_GIVEN');
  if (product.line === 'wc') {
    if (policy.risk_data.policyType === 'named' && !(policy.risk_data.employees || []).some((e) => e.idNo === input.employeeIdNo)) flags.push('EMPLOYEE_NOT_LISTED');
    if (input.severity === 'fatal') flags.push('FATAL');
  }
  if (lossDay > new Date().toISOString().slice(0, 10)) flags.push('LOSS_DATE_IN_FUTURE');
  const daysSinceLoss = Math.floor((Date.now() - Date.parse(`${lossDay}T00:00:00Z`)) / 86400000);
  if (daysSinceLoss > 7) flags.push('LATE_NOTIFICATION');

  const claim = await db.transaction(async (trx) => {
    const claimNo = await numbering.next(trx, 'claim', { productCode: policy.product_code, countryCode: policy.country_code, channel: policy.channel });
    const [id] = await trx('claims').insert({
      claim_no: claimNo, policy_id: policy.id, reported_by: req.user.id, loss_date: new Date(input.lossDate.length === 10 ? `${input.lossDate}T00:00:00Z` : input.lossDate),
      cause: input.cause, description: input.description, estimate: input.estimate ?? null,
      data: json({ locationIndex: input.locationIndex, assetGroups: input.assetGroups, authorityReportNo: input.authorityReportNo, certificateId: input.certificateId, carrierReceipt: input.carrierReceipt, discoveryPlace: input.discoveryPlace, employeeIdNo: input.employeeIdNo, employeeName: input.employeeName, bodyPart: input.bodyPart, severity: input.severity, hospital: input.hospital }),
      cover_check: json({ flags, checkedAt: new Date().toISOString() }), status: 'registered',
    });
    await audit(trx, { userId: req.user.id, action: 'claim.notify', entity: 'claim', entityId: id, data: { claimNo, flags } });
    return { id, claimNo };
  });

  const customer = await db('customers').where({ id: policy.customer_id }).first();
  await emit('claim.registered', { entity: 'claim', entityId: claim.id, brokerId: policy.broker_id, customer: { email: policy.proposer?.email, mobile: policy.proposer?.mobile, userId: customer?.user_id }, data: { claimNo: claim.claimNo, policyNo: policy.policy_no, customerName: policy.proposer?.companyName, cause: input.cause } });
  res.status(201).json({
    claimId: claim.id,
    claimNo: claim.claimNo,
    coverFlags: flags,
    nextSteps: product.line === 'engineering'
      ? ['MAKE_SAFE', 'KEEP_DAMAGED_PARTS', 'NO_REPAIRS_BEFORE_SURVEY', 'POLICE_REPORT_FOR_THEFT_24H']
      : product.line === 'wc'
      ? ['REPORT_TO_AUTHORITY_48H', 'PAY_WAGES_DURING_TREATMENT', 'UPLOAD_MEDICAL_REPORT']
      : product.line === 'marine'
      ? ['NO_CLEAN_RECEIPT', 'HOLD_CARRIER_LIABLE', 'CALL_SURVEYOR', 'KEEP_GOODS_AND_PACKING']
      : ['STOP_FURTHER_DAMAGE', 'KEEP_DAMAGED_ITEMS', 'UPLOAD_DOCUMENTS'],
    documentChecklist: product.line === 'engineering'
      ? ['photos', 'incident_report', 'operator_licence', 'repair_estimate', 'police_report', 'third_party_details']
      : product.line === 'wc'
      ? ['claim_form', 'medical_report', 'sick_leave_certificates', 'authority_report', 'labour_contract', 'wage_slips', 'id', 'disability_or_death_certificate']
      : product.line === 'marine'
      ? ['certificate', 'invoice', 'packing_list', 'bill_of_lading', 'delivery_receipt', 'survey_report', 'carrier_letter', 'carrier_reply', 'photos']
      : ['claim_form', 'photos', 'civil_defence_report', 'invoices', 'stock_records', 'repair_estimate', 'trade_licence', 'id'],
  });
}));

async function loadClaim(req) {
  const claim = await db('claims').where({ id: Number(req.params.id) }).first();
  if (!claim) throw notFound('CLAIM_NOT_FOUND');
  const policy = await db('policies').where({ id: claim.policy_id }).first();
  assertPolicyAccess(req.user, policy);
  return { claim, policy };
}

const claimView = (c, policy) => ({
  id: c.id, claimNo: c.claim_no, policyId: c.policy_id, policyNo: policy.policy_no, status: c.status, cause: c.cause, lossDate: c.loss_date,
  estimate: c.estimate, description: c.description, data: c.data, coverFlags: c.cover_check?.flags || [], currency: policy.currency,
});

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { claim, policy } = await loadClaim(req);
  res.json({ claim: claimView(claim, policy) });
}));

/**
 * WC FR-CLM-W06: employer records sick-leave periods; wages payable follow the statutory steps
 * (UAE: full wage for the first 6 months of treatment, then half wage for up to 6 more).
 */
router.post('/:id/sick-leave', requireAuth, asyncHandler(async (req, res) => {
  const { claim, policy } = await loadClaim(req);
  if (policy.product_code !== 'WC') throw badRequest('WC_ONLY');
  const b = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), monthlyWage: z.number().positive().optional() }).parse(req.body);
  if (b.to < b.from) throw badRequest('PERIOD_INVALID');
  const { tables } = await catalog.getRateTables(policy.product_code, policy.country_code);
  const country = await catalog.getCountry(policy.country_code);
  const employee = (policy.risk_data.employees || []).find((e) => e.idNo === claim.data?.employeeIdNo);
  const wage = b.monthlyWage || (employee ? Number(employee.gross) : null);
  if (!wage) throw badRequest('WAGE_REQUIRED', 'Enter the employee’s monthly wage');
  const periods = claim.data?.sickLeave || [];
  if (periods.some((p) => !(b.to < p.from || b.from > p.to))) throw conflict('PERIOD_OVERLAPS');
  const days = Math.round((Date.parse(b.to) - Date.parse(b.from)) / 86400000) + 1;
  let before = periods.reduce((s, p) => s + p.days, 0);
  let remaining = days;
  let amount = 0;
  const parts = [];
  let tierStart = 0;
  for (const tier of tables.statutory.temporaryDisability) {
    const tierDays = tier.months * 30;
    const tierEnd = tierStart + tierDays;
    const inTier = Math.max(0, Math.min(remaining, tierEnd - Math.max(before, tierStart)));
    if (before < tierEnd && inTier > 0) {
      const a = inTier * (wage / 30) * tier.pct;
      parts.push({ days: inTier, pct: tier.pct, amount: Number(a.toFixed(country.currency_decimals)) });
      amount += a;
      remaining -= inTier;
      before += inTier;
    }
    tierStart = tierEnd;
  }
  const entry = { from: b.from, to: b.to, days, monthlyWage: wage, parts, amount: Number(amount.toFixed(country.currency_decimals)), unpaidDays: remaining };
  const data = { ...claim.data, sickLeave: [...periods, entry] };
  data.sickLeaveTotal = Number(data.sickLeave.reduce((s, p) => s + p.amount, 0).toFixed(country.currency_decimals));
  await db('claims').where({ id: claim.id }).update({ data: json(data), updated_at: db.fn.now() });
  await audit(db, { userId: req.user.id, action: 'claim.sick_leave', entity: 'claim', entityId: claim.id, data: entry });
  res.status(201).json({ period: entry, totalDays: data.sickLeave.reduce((s, p) => s + p.days, 0), totalAmount: data.sickLeaveTotal });
}));

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const q = db('claims').join('policies', 'policies.id', 'claims.policy_id').select('claims.*', 'policies.policy_no', 'policies.customer_id', 'policies.broker_id').orderBy('claims.id', 'desc').limit(200);
  if (req.user.role === 'customer') q.where('policies.customer_id', req.user.customerId || -1);
  else if (req.user.isBroker) q.where('policies.broker_id', req.user.brokerId);
  else if (!req.user.isStaff) q.whereRaw('1 = 0');
  if (req.query.policyId) q.andWhere('claims.policy_id', Number(req.query.policyId));
  const rows = await q;
  res.json({ claims: rows.map((c) => ({ id: c.id, claimNo: c.claim_no, policyNo: c.policy_no, status: c.status, cause: c.cause, lossDate: c.loss_date, estimate: c.estimate, coverFlags: c.cover_check?.flags || [] })) });
}));

module.exports = router;
