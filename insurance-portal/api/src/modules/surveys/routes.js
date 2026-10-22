/**
 * Risk-engineering surveys (Engineering BRD section 8): an underwriter requests a survey from a
 * referral; a risk engineer schedules it and records the grade, findings and recommendations,
 * which the underwriter sees before deciding.
 */
const express = require('express');
const { emit } = require('../../lib/messaging');
const { z } = require('zod');
const { db, json } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireRole } = require('../../middleware/auth');
const { audit } = require('../../lib/audit');
const integrations = require('../../integrations');
const { conflict, notFound, forbidden } = require('../../lib/errors');

const router = express.Router();

const view = (s) => ({
  id: s.id, status: s.status, quoteId: s.quote_id, policyId: s.policy_id, referralId: s.referral_id, site: s.site, instructions: s.instructions,
  assignedTo: s.assigned_to, assignee: s.assignee || null, scheduledFor: s.scheduled_for, riskGrade: s.risk_grade, findings: s.findings,
  recommendations: s.recommendations || [], completedAt: s.completed_at, createdAt: s.created_at, reference: s.reference || null,
});

const base = () => db('surveys as s').leftJoin('users as u', 'u.id', 's.assigned_to').leftJoin('quotes as q', 'q.id', 's.quote_id').leftJoin('policies as p', 'p.id', 's.policy_id')
  .select('s.*', 'u.full_name as assignee', db.raw('COALESCE(q.ref, p.policy_no) AS reference'));

router.get('/engineers', requireRole('underwriter', 'uw_manager'), asyncHandler(async (_req, res) => {
  const rows = await db('users').where({ role: 'risk_engineer', active: true }).select('id', 'full_name');
  res.json({ engineers: rows.map((r) => ({ id: r.id, name: r.full_name })) });
}));

router.post('/', requireRole('underwriter', 'uw_manager'), asyncHandler(async (req, res) => {
  const b = z.object({ referralId: z.number().int().positive(), site: z.string().min(2).max(300), instructions: z.string().max(2000).default(''), assignedTo: z.number().int().positive().optional() }).parse(req.body);
  const referral = await db('referrals').where({ id: b.referralId }).first();
  if (!referral) throw notFound('REFERRAL_NOT_FOUND');
  let policyId = null;
  if (referral.endorsement_request_id) policyId = (await db('endorsement_requests').where({ id: referral.endorsement_request_id }).first()).policy_id;
  if (referral.certificate_id) policyId = (await db('oc_certificates').where({ id: referral.certificate_id }).first()).policy_id;
  if (b.assignedTo) {
    const eng = await db('users').where({ id: b.assignedTo, role: 'risk_engineer' }).first();
    if (!eng) throw notFound('ENGINEER_NOT_FOUND');
  }
  const [id] = await db('surveys').insert({ referral_id: referral.id, quote_id: referral.quote_id, policy_id: policyId, site: b.site, instructions: b.instructions, assigned_to: b.assignedTo || null, requested_by: req.user.id, status: 'requested' });
  await db('referral_messages').insert({ referral_id: referral.id, author_id: req.user.id, body: `Risk survey requested: ${b.site}` });
  await audit(db, { userId: req.user.id, action: 'survey.request', entity: 'survey', entityId: id, data: b });
  res.status(201).json({ survey: view(await base().where('s.id', id).first()) });
}));

router.get('/', requireRole('risk_engineer', 'underwriter', 'uw_manager'), asyncHandler(async (req, res) => {
  const q = base().orderBy('s.id', 'desc').limit(200);
  if (req.query.referralId) q.where('s.referral_id', Number(req.query.referralId));
  if (req.user.role === 'risk_engineer') q.where((w) => w.where('s.assigned_to', req.user.id).orWhereNull('s.assigned_to'));
  if (req.query.status) q.whereIn('s.status', String(req.query.status).split(','));
  res.json({ surveys: (await q).map(view) });
}));

async function mine(req) {
  const s = await db('surveys').where({ id: Number(req.params.id) }).first();
  if (!s) throw notFound('SURVEY_NOT_FOUND');
  if (s.assigned_to && s.assigned_to !== req.user.id) throw forbidden('SURVEY_ASSIGNED_ELSEWHERE');
  if (['completed', 'cancelled'].includes(s.status)) throw conflict('SURVEY_CLOSED');
  return s;
}

router.post('/:id/schedule', requireRole('risk_engineer'), asyncHandler(async (req, res) => {
  const s = await mine(req);
  const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
  await db('surveys').where({ id: s.id }).update({ status: 'scheduled', scheduled_for: date, assigned_to: req.user.id, updated_at: db.fn.now() });
  res.json({ survey: view(await base().where('s.id', s.id).first()) });
}));

router.post('/:id/complete', requireRole('risk_engineer'), asyncHandler(async (req, res) => {
  const s = await mine(req);
  const b = z.object({
    riskGrade: z.enum(['good', 'acceptable', 'poor']),
    findings: z.string().min(5).max(8000),
    recommendations: z.array(z.object({ text: z.string().min(3).max(500), priority: z.enum(['high', 'medium', 'low']).default('medium'), dueDays: z.number().int().min(0).max(365).default(30) })).max(30).default([]),
  }).parse(req.body);
  await db('surveys').where({ id: s.id }).update({ status: 'completed', risk_grade: b.riskGrade, findings: b.findings, recommendations: json(b.recommendations), completed_by: req.user.id, completed_at: new Date(), assigned_to: s.assigned_to || req.user.id, updated_at: db.fn.now() });
  if (s.referral_id) await db('referral_messages').insert({ referral_id: s.referral_id, author_id: req.user.id, body: `Survey completed: ${b.riskGrade}. ${b.recommendations.length} recommendation(s).` });
  const requester = await db('users').where({ id: s.requested_by }).first();
  await emit('survey.completed', { entity: 'survey', entityId: s.id, data: { reference: s.site, grade: b.riskGrade } });
  if (requester?.email) await integrations.notifications.send({ to: requester.email, channel: 'email', template: 'survey_completed', data: { reference: s.site, grade: b.riskGrade } });
  await audit(db, { userId: req.user.id, action: 'survey.complete', entity: 'survey', entityId: s.id, data: { riskGrade: b.riskGrade } });
  res.json({ survey: view(await base().where('s.id', s.id).first()) });
}));

module.exports = router;
