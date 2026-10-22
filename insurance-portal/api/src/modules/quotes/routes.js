const express = require('express');
const { z } = require('zod');
const { db } = require('../../db');
const service = require('./service');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth } = require('../../middleware/auth');
const { assertQuoteAccess } = require('../../lib/access');
const { AppError } = require('../../lib/errors');

const router = express.Router();
const tokenOf = (req) => req.headers['x-quote-token'] || null;

async function loadAccessible(req) {
  const quote = await service.getQuote(Number(req.params.id));
  assertQuoteAccess(req.user, quote, tokenOf(req));
  return quote;
}

const send = (req, res, quote, extra = {}) => res.json({ quote: service.quoteView(quote, { staff: req.user?.isStaff }), ...extra });

/** Anyone can start a quote (premium calculator needs no login). */
router.post('/', asyncHandler(async (req, res) => {
  const { productCode, countryCode } = z.object({ productCode: z.string().min(2), countryCode: z.string().length(2) }).parse(req.body);
  const { id, resumeToken } = await service.createQuote({ productCode, countryCode, user: req.user });
  const quote = await service.getQuote(id);
  res.status(201);
  send(req, res, quote, { resumeToken });
}));

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const q = db('quotes').orderBy('updated_at', 'desc').limit(100);
  if (req.user.role === 'customer') q.where((w) => w.where({ customer_id: req.user.customerId || -1 }).orWhere({ created_by: req.user.id }));
  else if (req.user.isBroker) q.where({ broker_id: req.user.brokerId });
  else if (!req.user.isStaff) q.whereRaw('1 = 0');
  if (req.query.status) q.andWhere({ status: String(req.query.status) });
  const rows = await q;
  res.json({ quotes: rows.map((r) => service.quoteView(r, { staff: req.user.isStaff })) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const quote = await loadAccessible(req);
  const referral = await db('referrals').where({ quote_id: quote.id }).orderBy('id', 'desc').first();
  let messages = [];
  if (referral) {
    messages = await db('referral_messages').leftJoin('users', 'users.id', 'referral_messages.author_id')
      .where({ referral_id: referral.id }).orderBy('referral_messages.id')
      .select('referral_messages.id', 'referral_messages.body', 'referral_messages.created_at', 'users.full_name', 'users.role');
  }
  send(req, res, quote, {
    referral: referral && { id: referral.id, status: referral.status, slaDue: referral.sla_due, decision: referral.decision },
    messages: messages.map((m) => ({ id: m.id, body: m.body, at: m.created_at, author: m.full_name, fromUnderwriter: ['underwriter', 'uw_manager'].includes(m.role) })),
  });
}));

router.put('/:id/risk', asyncHandler(async (req, res) => {
  const quote = await loadAccessible(req);
  const updated = await service.updateRisk(quote, req.body?.risk, req.user);
  send(req, res, updated);
}));

/** Prices a variation without saving it (e.g. comparing plans side by side). */
router.post('/:id/price', asyncHandler(async (req, res) => {
  const quote = await loadAccessible(req);
  const risk = await service.normaliseRisk(quote, req.body?.risk);
  const rating = await service.priceRisk({ quote, risk, proposer: quote.proposer });
  res.json({ quotable: rating.quotable, notQuotableReason: rating.notQuotableReason, breakdown: rating.breakdown, referral: { required: rating.referral.required, reasons: rating.referral.reasons }, sumInsured: rating.sumInsured });
}));

router.put('/:id/proposer', requireAuth, asyncHandler(async (req, res) => {
  const quote = await loadAccessible(req);
  const updated = await service.setProposer(quote, req.body, req.user);
  send(req, res, updated);
}));

router.post('/:id/referral', asyncHandler(async (req, res) => {
  const quote = await loadAccessible(req);
  const updated = await service.submitReferral(quote, req.body?.note, req.user);
  send(req, res, updated);
}));

/** Customer or broker reply in the referral thread; reopens an info request. */
router.post('/:id/referral/messages', requireAuth, asyncHandler(async (req, res) => {
  const quote = await loadAccessible(req);
  const body = z.object({ body: z.string().min(1).max(4000) }).parse(req.body).body;
  const referral = await db('referrals').where({ quote_id: quote.id }).orderBy('id', 'desc').first();
  if (!referral || ['approved', 'declined'].includes(referral.status)) throw new AppError(409, 'REFERRAL_CLOSED');
  await db.transaction(async (trx) => {
    await trx('referral_messages').insert({ referral_id: referral.id, author_id: req.user.id, body });
    if (referral.status === 'info_requested') {
      await trx('referrals').where({ id: referral.id }).update({ status: 'open', updated_at: trx.fn.now() });
      await trx('quotes').where({ id: quote.id }).update({ status: 'referred' });
    }
  });
  res.status(201).json({ ok: true });
}));

router.post('/:id/bind', requireAuth, asyncHandler(async (req, res) => {
  const quote = await loadAccessible(req);
  const result = await service.bindQuote(quote, req.body, req.user);
  res.status(result.status === 'issued' ? 201 : 202).json(result);
}));

module.exports = router;
