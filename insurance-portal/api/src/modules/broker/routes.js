const express = require('express');
const { db } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireRole } = require('../../middleware/auth');
const { addDays, today } = require('../../lib/dates');

const router = express.Router();
router.use(requireRole('broker_admin', 'broker_user'));

router.get('/dashboard', asyncHandler(async (req, res) => {
  const brokerId = req.user.brokerId;
  const monthStart = `${today().slice(0, 7)}-01`;
  const [broker, openQuotes, referrals, renewals, gwp, commission, recentQuotes] = await Promise.all([
    db('brokers').where({ id: brokerId }).first(),
    db('quotes').where({ broker_id: brokerId }).whereIn('status', ['draft', 'quoted', 'approved']).count({ n: '*' }).first(),
    db('quotes').where({ broker_id: brokerId }).whereIn('status', ['referred', 'info_requested']).select('id', 'ref', 'product_code', 'status', 'total', 'currency', 'proposer', 'risk_data', 'referral_reasons', 'updated_at'),
    db('policies').join('customers', 'customers.id', 'policies.customer_id').where({ 'policies.broker_id': brokerId, 'policies.status': 'active' })
      .whereBetween('expiry_date', [today(), addDays(today(), 60)]).select('policies.id', 'policy_no', 'expiry_date', 'total', 'currency', 'customers.company_name'),
    db('policies').where({ broker_id: brokerId }).andWhere('created_at', '>=', monthStart).sum({ s: 'premium' }).first(),
    db('commissions').where({ broker_id: brokerId }).andWhere('created_at', '>=', monthStart).sum({ s: 'amount' }).first(),
    db('quotes').where({ broker_id: brokerId }).orderBy('updated_at', 'desc').limit(10).select('id', 'ref', 'product_code', 'status', 'total', 'currency', 'proposer', 'risk_data', 'updated_at'),
  ]);
  const name = (q) => q.proposer?.companyName || q.risk_data?.business?.name || null;
  res.json({
    broker: { id: broker.id, name: broker.name, tier: broker.tier, licenceExpiry: broker.licence_expiry, commissionRate: Number(broker.commission_rate) },
    kpis: { openQuotes: Number(openQuotes.n), referralsPending: referrals.length, renewalsDue60: renewals.length, gwpMonth: Number(gwp.s || 0), commissionMonth: Number(commission.s || 0) },
    referrals: referrals.map((q) => ({ id: q.id, ref: q.ref, productCode: q.product_code, status: q.status, insured: name(q), total: q.total, currency: q.currency, reasons: q.referral_reasons, updatedAt: q.updated_at })),
    renewals: renewals.map((p) => ({ id: p.id, policyNo: p.policy_no, insured: p.company_name, expiryDate: p.expiry_date, total: p.total, currency: p.currency })),
    recentQuotes: recentQuotes.map((q) => ({ id: q.id, ref: q.ref, productCode: q.product_code, status: q.status, insured: name(q), total: q.total, currency: q.currency, updatedAt: q.updated_at })),
  });
}));

router.get('/commissions', asyncHandler(async (req, res) => {
  const from = String(req.query.from || `${today().slice(0, 7)}-01`);
  const to = String(req.query.to || today());
  const rows = await db('commissions').join('policies', 'policies.id', 'commissions.policy_id').join('customers', 'customers.id', 'policies.customer_id')
    .where('commissions.broker_id', req.user.brokerId)
    .andWhere('commissions.created_at', '>=', from).andWhere('commissions.created_at', '<', addDays(to, 1))
    .orderBy('commissions.id', 'desc')
    .select('commissions.*', 'policies.policy_no', 'policies.currency', 'customers.company_name');
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  res.json({
    from, to, total,
    lines: rows.map((r) => ({ id: r.id, policyNo: r.policy_no, insured: r.company_name, transaction: r.transaction, base: r.base_amount, rate: Number(r.rate), amount: r.amount, status: r.status, currency: r.currency, at: r.created_at })),
  });
}));

router.get('/clients', asyncHandler(async (req, res) => {
  const rows = await db('customers').where({ broker_id: req.user.brokerId }).orderBy('company_name');
  res.json({ clients: rows.map((c) => ({ id: c.id, companyName: c.company_name, tradeLicence: c.trade_licence, contactName: c.contact_name, email: c.email, mobile: c.mobile })) });
}));

module.exports = router;
