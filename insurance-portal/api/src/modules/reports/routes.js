/**
 * MIS reports (Fire BRD section 15). Each report returns { columns, rows, totals? }.
 * Add `format=csv` for a spreadsheet download. Period filters use from/to (inclusive dates).
 */
const express = require('express');
const { db } = require('../../db');
const { asyncHandler } = require('../../middleware/errors');
const { requireRole } = require('../../middleware/auth');
const { badRequest } = require('../../lib/errors');
const { today, addDays, isISODate } = require('../../lib/dates');
const { siteKey } = require('../../products/fire/rater');

const router = express.Router();
router.use(requireRole('uw_manager', 'ops', 'config_admin', 'underwriter'));

const occ = "JSON_UNQUOTE(JSON_EXTRACT(%s.risk_data, '$.occupancy'))";
const tierOf = "JSON_UNQUOTE(JSON_EXTRACT(%s.rating, '$.tier'))";
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const n = (v) => Number(v || 0);

const REPORTS = {
  /** Quotes started in the period by channel and where they ended up. */
  async funnel({ from, toEx }) {
    const rows = await db('quotes').where('created_at', '>=', from).andWhere('created_at', '<', toEx).whereNull('renewal_of_policy_id')
      .select('channel').count({ started: '*' })
      .select(db.raw("SUM(status <> 'draft') AS priced"), db.raw("SUM(status IN ('referred','info_requested','approved','declined')) AS referred"),
        db.raw("SUM(status = 'bound') AS bound"), db.raw("SUM(status = 'not_quotable') AS not_quotable"), db.raw("SUM(status IN ('draft','quoted','expired')) AS abandoned"))
      .groupBy('channel');
    return {
      columns: ['channel', 'started', 'priced', 'referred', 'bound', 'not_quotable', 'abandoned', 'conversion_pct'],
      rows: rows.map((r) => ({ channel: r.channel, started: n(r.started), priced: n(r.priced), referred: n(r.referred), bound: n(r.bound), not_quotable: n(r.not_quotable), abandoned: n(r.abandoned), conversion_pct: pct(n(r.bound), n(r.started)) })),
    };
  },

  /** Gross written premium by channel, broker, activity and tier. */
  async gwp({ from, toEx }) {
    const rows = await db('policies as p').leftJoin('brokers as b', 'b.id', 'p.broker_id')
      .where('p.created_at', '>=', from).andWhere('p.created_at', '<', toEx)
      .select('p.channel', db.raw("COALESCE(b.name, 'Direct') AS broker"), db.raw(`${occ.replace('%s', 'p')} AS occupancy`), db.raw(`${tierOf.replace('%s', 'p')} AS tier`), 'p.currency')
      .count({ policies: '*' }).sum({ sum_insured: 'p.sum_insured' }).sum({ premium: 'p.premium' })
      .groupBy('p.channel', db.raw("COALESCE(b.name, 'Direct')"), db.raw(occ.replace('%s', 'p')), db.raw(tierOf.replace('%s', 'p')), 'p.currency').orderBy('premium', 'desc');
    const mapped = rows.map((r) => ({ channel: r.channel, broker: r.broker, occupancy: r.occupancy, tier: r.tier, currency: r.currency, policies: n(r.policies), sum_insured: n(r.sum_insured), premium: n(r.premium) }));
    return {
      columns: ['channel', 'broker', 'occupancy', 'tier', 'currency', 'policies', 'sum_insured', 'premium'],
      rows: mapped,
      totals: { policies: mapped.reduce((s, r) => s + r.policies, 0), premium: mapped.reduce((s, r) => s + r.premium, 0) },
    };
  },

  /** Open referrals by age against SLA, plus average decision time in the period. */
  async referral_ageing({ from, toEx }) {
    const open = await db('referrals as r').leftJoin('quotes as q', 'q.id', 'r.quote_id')
      .leftJoin('endorsement_requests as e', 'e.id', 'r.endorsement_request_id').leftJoin('policies as p', 'p.id', 'e.policy_id')
      .whereIn('r.status', ['open', 'info_requested'])
      .select('r.id', 'r.status', 'r.created_at', 'r.sla_due', db.raw('COALESCE(q.ref, p.policy_no) AS reference'), db.raw("IF(r.endorsement_request_id IS NULL, 'quote', 'endorsement') AS kind"))
      .orderBy('r.sla_due');
    const decided = await db('referrals').whereNotNull('decided_at').andWhere('decided_at', '>=', from).andWhere('decided_at', '<', toEx)
      .select(db.raw('COUNT(*) AS n'), db.raw('AVG(TIMESTAMPDIFF(MINUTE, created_at, decided_at)) AS avg_minutes'), db.raw('SUM(decided_at > sla_due) AS breached')).first();
    const now = Date.now();
    return {
      columns: ['reference', 'kind', 'status', 'age_hours', 'sla_due', 'overdue'],
      rows: open.map((r) => ({ reference: r.reference, kind: r.kind, status: r.status, age_hours: Math.round((now - new Date(r.created_at)) / 36e5), sla_due: new Date(r.sla_due).toISOString(), overdue: new Date(r.sla_due) < now ? 'yes' : 'no' })),
      totals: { decided: n(decided.n), avg_decision_hours: Math.round(n(decided.avg_minutes) / 6) / 10, sla_breached: n(decided.breached) },
    };
  },

  /** Quotes, bound policies and hit ratio per broker. */
  async broker_hit_ratio({ from, toEx }) {
    const rows = await db('brokers as b').leftJoin('quotes as q', function j() {
      this.on('q.broker_id', 'b.id').andOn('q.created_at', '>=', db.raw('?', [from])).andOn('q.created_at', '<', db.raw('?', [toEx]));
    }).select('b.name as broker', 'b.tier')
      .select(db.raw("SUM(q.status IS NOT NULL AND q.status <> 'draft') AS quoted"), db.raw("SUM(q.status = 'bound') AS bound"), db.raw("AVG(CASE WHEN q.status = 'bound' THEN q.premium END) AS avg_premium"))
      .groupBy('b.id', 'b.name', 'b.tier').orderBy('broker');
    return {
      columns: ['broker', 'tier', 'quoted', 'bound', 'hit_ratio_pct', 'avg_premium'],
      rows: rows.map((r) => ({ broker: r.broker, tier: r.tier, quoted: n(r.quoted), bound: n(r.bound), hit_ratio_pct: pct(n(r.bound), n(r.quoted)), avg_premium: Math.round(n(r.avg_premium) * 100) / 100 })),
    };
  },

  /** Commission earned and clawed back per broker. */
  async commissions({ from, toEx }) {
    const rows = await db('commissions as c').join('brokers as b', 'b.id', 'c.broker_id')
      .where('c.created_at', '>=', from).andWhere('c.created_at', '<', toEx)
      .select('b.name as broker', db.raw("SUM(CASE WHEN c.amount > 0 THEN c.amount ELSE 0 END) AS earned"), db.raw("SUM(CASE WHEN c.amount < 0 THEN c.amount ELSE 0 END) AS clawback"), db.raw('SUM(c.amount) AS net'))
      .groupBy('b.id', 'b.name').orderBy('net', 'desc');
    return { columns: ['broker', 'earned', 'clawback', 'net'], rows: rows.map((r) => ({ broker: r.broker, earned: n(r.earned), clawback: n(r.clawback), net: n(r.net) })) };
  },

  /** Total insured per building / site on active policies, against the UW-11 limit. */
  async accumulation() {
    const pcs = await db('product_countries').where({ product_code: 'FIRE' });
    const limits = Object.fromEntries(pcs.map((p) => [p.country_code, p.settings.accumulationLimitPerSite]));
    const policies = await db('policies').where({ status: 'active', product_code: 'FIRE' }).select('policy_no', 'country_code', 'currency', 'risk_data', 'rating');
    const sites = {};
    for (const p of policies) {
      (p.risk_data.locations || []).forEach((loc, i) => {
        const key = `${p.country_code}|${siteKey(loc.address)}`;
        sites[key] = sites[key] || { site: [loc.address?.building, loc.address?.area, loc.address?.city].filter(Boolean).join(', '), country: p.country_code, currency: p.currency, policies: 0, sum_insured: 0 };
        sites[key].policies += 1;
        sites[key].sum_insured += n(p.rating.locations?.[i]?.sumInsured);
      });
    }
    const rows = Object.values(sites).map((s) => ({ ...s, limit: limits[s.country] ?? null, used_pct: limits[s.country] ? pct(s.sum_insured, limits[s.country]) : null }))
      .sort((a, b) => b.sum_insured - a.sum_insured).slice(0, 200);
    return { columns: ['site', 'country', 'currency', 'policies', 'sum_insured', 'limit', 'used_pct'], rows };
  },

  /** Policies due to expire in the period, and how many renewed. */
  async renewal_retention({ from, toIncl }) {
    const rows = await db('policies as p').leftJoin('policies as r', 'r.renewed_from_policy_id', 'p.id')
      .whereBetween('p.expiry_date', [from, toIncl]).whereNot('p.status', 'cancelled')
      .select('p.channel').count({ due: 'p.id' }).select(db.raw('COUNT(r.id) AS renewed'), db.raw('SUM(p.premium) AS expiring_premium'), db.raw('SUM(r.premium) AS renewed_premium'))
      .groupBy('p.channel');
    return {
      columns: ['channel', 'due', 'renewed', 'retention_pct', 'expiring_premium', 'renewed_premium'],
      rows: rows.map((r) => ({ channel: r.channel, due: n(r.due), renewed: n(r.renewed), retention_pct: pct(n(r.renewed), n(r.due)), expiring_premium: n(r.expiring_premium), renewed_premium: n(r.renewed_premium) })),
    };
  },

  /** Claims notified by cause and activity, with an indicative loss ratio on estimates. */
  async claims({ from, toEx }) {
    const rows = await db('claims as c').join('policies as p', 'p.id', 'c.policy_id')
      .where('c.created_at', '>=', from).andWhere('c.created_at', '<', toEx)
      .select('c.cause', db.raw(`${occ.replace('%s', 'p')} AS occupancy`)).count({ claims: 'c.id' }).sum({ estimates: 'c.estimate' })
      .groupBy('c.cause', db.raw(occ.replace('%s', 'p')));
    const premium = await db('policies').whereIn('status', ['active', 'expired']).sum({ s: 'premium' }).first();
    const estimates = rows.reduce((s, r) => s + n(r.estimates), 0);
    return {
      columns: ['cause', 'occupancy', 'claims', 'estimates'],
      rows: rows.map((r) => ({ cause: r.cause, occupancy: r.occupancy, claims: n(r.claims), estimates: n(r.estimates) })),
      totals: { estimates, earned_premium_basis: n(premium.s), indicative_loss_ratio_pct: pct(estimates, n(premium.s)) },
    };
  },
};

function toCsv({ columns, rows }) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n');
}

router.get('/', (_req, res) => res.json({ reports: Object.keys(REPORTS) }));

router.get('/:name', asyncHandler(async (req, res) => {
  const report = REPORTS[req.params.name];
  if (!report) throw badRequest('REPORT_UNKNOWN');
  const from = isISODate(req.query.from) ? req.query.from : `${today().slice(0, 7)}-01`;
  const toIncl = isISODate(req.query.to) ? req.query.to : today();
  const result = await report({ from, toIncl, toEx: addDays(toIncl, 1) });
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}_${from}_${toIncl}.csv"`);
    return res.send(`\uFEFF${toCsv(result)}`);
  }
  return res.json({ name: req.params.name, from, to: toIncl, ...result });
}));

module.exports = router;
