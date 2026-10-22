/**
 * Dashboards (/api/dashboard): figures and chart series for the customer (B2C) and broker (B2B)
 * portals, always limited to the signed-in customer's or broker's own business.
 */
const express = require('express');
const { db } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;

/** The last 12 calendar months as YYYY-MM, oldest first. */
function months() {
  const out = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 11; i >= 0; i -= 1) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}
const series = (rows, key = 'm', value = 'v') => {
  const map = Object.fromEntries(rows.map((r) => [r[key], Number(r[value])]));
  return months().map((m) => ({ month: m, value: r2(map[m] || 0) }));
};
const since12 = () => `${months()[0]}-01`;

async function productNames() {
  return Object.fromEntries((await db('products')).map((p) => [p.code, { en: p.name_en, ar: p.name_ar }]));
}

router.get('/customer', requireRole('customer'), asyncHandler(async (req, res) => {
  const cid = req.user.customerId;
  if (!cid) return res.json({ empty: true });
  const names = await productNames();
  const year = `${today().slice(0, 4)}-01-01`;
  const policies = await db('policies').where({ customer_id: cid });
  const active = policies.filter((p) => p.status === 'active');
  const ids = policies.map((p) => p.id);
  const quoteIds = await db('quotes').where({ customer_id: cid }).pluck('id');
  const payQ = () => db('payments').where({ status: 'succeeded' }).andWhere((q) => q.whereIn('policy_id', ids.length ? ids : [0]).orWhereIn('quote_id', quoteIds.length ? quoteIds : [0]));
  const paidYtd = await payQ().andWhere('created_at', '>=', year).sum({ s: 'amount' }).first();
  const byMonth = await payQ().andWhere('created_at', '>=', since12()).select(db.raw("DATE_FORMAT(created_at, '%Y-%m') AS m"), db.raw('SUM(amount) AS v')).groupBy('m');
  const claims = ids.length ? await db('claims').whereIn('policy_id', ids).select('status').count({ n: '*' }).groupBy('status') : [];
  const horizon = addDays(today(), 60);
  const renewals = active.filter((p) => String(p.expiry_date).slice(0, 10) <= horizon).sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)))
    .map((p) => ({ id: p.id, policyNo: p.policy_no, product: names[p.product_code], expiryDate: String(p.expiry_date).slice(0, 10), daysLeft: Math.round((Date.parse(String(p.expiry_date).slice(0, 10)) - Date.parse(today())) / 86400000), autoRenew: Boolean(p.risk_data?.autoRenew), renewalQuoteId: p.renewal_quote_id }));
  const mix = {};
  for (const p of active) mix[p.product_code] = (mix[p.product_code] || 0) + Number(p.premium);
  const pendingReferrals = await db('quotes').where({ customer_id: cid }).whereIn('status', ['referred', 'info_requested']).count({ n: '*' }).first();
  res.json({
    kpis: {
      activePolicies: active.length, sumInsured: r2(active.reduce((s, p) => s + Number(p.sum_insured), 0)), premiumPaidYtd: r2(paidYtd.s),
      openClaims: claims.filter((c) => !['settled', 'rejected'].includes(c.status)).reduce((s, c) => s + Number(c.n), 0), renewalsDue: renewals.length, pendingReferrals: Number(pendingReferrals.n),
      currency: policies[0]?.currency || 'AED',
    },
    premiumByProduct: Object.entries(mix).map(([code, v]) => ({ code, name: names[code], value: r2(v) })),
    paymentsByMonth: series(byMonth),
    claimsByStatus: claims.map((c) => ({ status: c.status, value: Number(c.n) })),
    renewals,
  });
}));

router.get('/broker', requireRole('broker_admin', 'broker_user'), asyncHandler(async (req, res) => {
  const bid = req.user.brokerId;
  const names = await productNames();
  const year = `${today().slice(0, 4)}-01-01`;
  const d90 = addDays(today(), -90);
  const pol = () => db('policies').where({ broker_id: bid });
  const gwpYtd = await pol().andWhere('created_at', '>=', year).sum({ s: 'premium' }).count({ n: '*' }).first();
  const gwpByMonth = await pol().andWhere('created_at', '>=', since12()).select(db.raw("DATE_FORMAT(created_at, '%Y-%m') AS m"), db.raw('SUM(premium) AS v')).groupBy('m');
  const mix = await pol().andWhere('created_at', '>=', year).select('product_code').sum({ v: 'premium' }).groupBy('product_code');
  const quotes = await db('quotes').where({ broker_id: bid }).andWhere('created_at', '>=', d90).select('id', 'status', 'total');
  const referred = await db('referrals').join('quotes', 'quotes.id', 'referrals.quote_id').where('quotes.broker_id', bid).andWhere('referrals.created_at', '>=', d90).countDistinct({ n: 'quotes.id' }).first();
  const funnel = [
    { stage: 'created', value: quotes.length },
    { stage: 'quoted', value: quotes.filter((q) => !['draft', 'not_quotable'].includes(q.status)).length },
    { stage: 'referred', value: Number(referred.n) },
    { stage: 'bound', value: quotes.filter((q) => q.status === 'bound').length },
  ];
  const com = () => db('commissions').where({ broker_id: bid });
  const earnedYtd = await com().andWhere('created_at', '>=', year).sum({ s: 'amount' }).first();
  const paidYtd = await com().where({ status: 'paid' }).andWhere('paid_at', '>=', year).sum({ s: 'amount' }).first();
  const earnedByMonth = await com().andWhere('created_at', '>=', since12()).select(db.raw("DATE_FORMAT(created_at, '%Y-%m') AS m"), db.raw('SUM(amount) AS v')).groupBy('m');
  const paidByMonth = await com().where({ status: 'paid' }).andWhere('paid_at', '>=', since12()).select(db.raw("DATE_FORMAT(paid_at, '%Y-%m') AS m"), db.raw('SUM(amount) AS v')).groupBy('m');
  const refStatus = await db('referrals').join('quotes', 'quotes.id', 'referrals.quote_id').where('quotes.broker_id', bid).select('referrals.status').count({ n: '*' }).groupBy('referrals.status');
  const topClients = await pol().where({ status: 'active' }).select(db.raw("JSON_UNQUOTE(JSON_EXTRACT(proposer, '$.companyName')) AS client")).sum({ v: 'premium' }).count({ n: '*' }).groupBy('client').orderBy('v', 'desc').limit(5);
  const horizon = addDays(today(), 60);
  const renewals = await pol().where({ status: 'active' }).andWhere('expiry_date', '<=', horizon).orderBy('expiry_date').limit(20);
  const bound = funnel[3].value;
  res.json({
    kpis: {
      gwpYtd: r2(gwpYtd.s), policiesYtd: Number(gwpYtd.n), hitRatio: quotes.length ? r2((bound / quotes.length) * 100) : 0,
      commissionEarnedYtd: r2(earnedYtd.s), commissionPaidYtd: r2(paidYtd.s), openReferrals: refStatus.filter((r) => ['open', 'info_requested'].includes(r.status)).reduce((s, r) => s + Number(r.n), 0),
      renewalsDue: renewals.length, currency: 'AED',
    },
    gwpByMonth: series(gwpByMonth),
    productMix: mix.map((m) => ({ code: m.product_code, name: names[m.product_code], value: r2(m.v) })),
    funnel,
    commissionByMonth: months().map((m, i) => ({ month: m, earned: series(earnedByMonth)[i].value, paid: series(paidByMonth)[i].value })),
    referralsByStatus: refStatus.map((r) => ({ status: r.status, value: Number(r.n) })),
    topClients: topClients.map((c) => ({ client: c.client, premium: r2(c.v), policies: Number(c.n) })),
    renewals: renewals.map((p) => ({ id: p.id, policyNo: p.policy_no, client: p.proposer?.companyName, product: names[p.product_code], expiryDate: String(p.expiry_date).slice(0, 10), premium: r2(p.premium), renewalQuoteId: p.renewal_quote_id })),
  });
}));

module.exports = router;
