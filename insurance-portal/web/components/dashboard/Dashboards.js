'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { Money } from '@/components/ui';
import { KpiGrid, MonthBars, Donut, Funnel } from './Charts';

export function CustomerDashboard() {
  const { t, pick, locale } = useI18n();
  const [d, setD] = useState(null);
  useEffect(() => { api('/dashboard/customer').then(setD).catch(() => setD(null)); }, []);
  if (!d || d.empty || !d.kpis.activePolicies) return null;
  const k = d.kpis;
  return (
    <section className="stack" aria-label={t('dash.overview')}>
      <KpiGrid items={[
        { label: t('dash.activePolicies'), value: k.activePolicies },
        { label: t('dash.sumInsured'), value: k.sumInsured, money: true, currency: k.currency },
        { label: t('dash.paidYtd'), value: k.premiumPaidYtd, money: true, currency: k.currency },
        { label: t('dash.openClaims'), value: k.openClaims },
        { label: t('dash.renewalsDue'), value: k.renewalsDue },
        ...(k.pendingReferrals ? [{ label: t('dash.pendingReferrals'), value: k.pendingReferrals }] : []),
      ]} />
      <div className="chart-grid">
        <Donut title={t('dash.byProduct')} items={d.premiumByProduct.map((x) => ({ label: pick(x.name), value: x.value }))} currency={k.currency} />
        <MonthBars title={t('dash.payments')} series={d.paymentsByMonth.map((m) => ({ month: m.month, values: [m.value] }))} />
      </div>
      {d.renewals.length ? (
        <section className="card stack-sm">
          <h2>{t('dash.renewals')}</h2>
          <table className="data"><tbody>{d.renewals.map((r) => (
            <tr key={r.id}><td><Link href={`/${locale}/account/policies/${r.id}`}>{r.policyNo}</Link><div className="hint">{pick(r.product)}</div></td><td>{date(r.expiryDate, locale)}</td>
              <td><span className={`badge ${r.daysLeft <= 15 ? 'warn' : ''}`}>{r.daysLeft} {t('dash.daysLeft')}</span></td></tr>
          ))}</tbody></table>
        </section>
      ) : null}
    </section>
  );
}

export function BrokerDashboard() {
  const { t, pick, locale } = useI18n();
  const [d, setD] = useState(null);
  useEffect(() => { api('/dashboard/broker').then(setD).catch(() => setD(null)); }, []);
  if (!d) return null;
  const k = d.kpis;
  return (
    <section className="stack" aria-label={t('dash.overview')}>
      <KpiGrid items={[
        { label: t('dash.gwpYtd'), value: k.gwpYtd, money: true, currency: k.currency },
        { label: t('dash.policiesYtd'), value: k.policiesYtd },
        { label: t('dash.hitRatio'), value: k.hitRatio, suffix: '%' },
        { label: t('dash.commissionEarned'), value: k.commissionEarnedYtd, money: true, currency: k.currency },
        { label: t('dash.commissionPaid'), value: k.commissionPaidYtd, money: true, currency: k.currency },
        { label: t('dash.openReferrals'), value: k.openReferrals },
        { label: t('dash.renewalsDue'), value: k.renewalsDue },
      ]} />
      <div className="chart-grid">
        <MonthBars title={t('dash.gwpByMonth')} series={d.gwpByMonth.map((m) => ({ month: m.month, values: [m.value] }))} />
        <Donut title={t('dash.productMix')} items={d.productMix.map((x) => ({ label: pick(x.name), value: x.value }))} currency={k.currency} />
        <Funnel title={t('dash.funnel')} stages={d.funnel.map((f) => ({ label: t(`dash.stages.${f.stage}`), value: f.value }))} />
        <MonthBars title={t('dash.commission')} names={[t('dash.earned'), t('dash.paid')]} series={d.commissionByMonth.map((m) => ({ month: m.month, values: [m.earned, m.paid] }))} />
        <Funnel title={t('dash.referrals')} stages={d.referralsByStatus.map((r) => ({ label: t(`status.${r.status}`), value: r.value }))} />
        <section className="card stack-sm">
          <h3>{t('dash.topClients')}</h3>
          {d.topClients.length ? <table className="data small"><tbody>{d.topClients.map((c) => <tr key={c.client}><td>{c.client}</td><td className="num">{c.policies}</td><td className="num"><Money value={c.premium} currency={k.currency} /></td></tr>)}</tbody></table> : <p className="muted small">{t('dash.noData')}</p>}
        </section>
      </div>
      {d.renewals.length ? (
        <section className="card stack-sm">
          <h2>{t('dash.renewals')}</h2>
          <div className="table-wrap"><table className="data"><tbody>{d.renewals.map((r) => (
            <tr key={r.id}><td><Link href={`/${locale}/account/policies/${r.id}`}>{r.policyNo}</Link><div className="hint">{r.client} · {pick(r.product)}</div></td><td>{date(r.expiryDate, locale)}</td><td className="num"><Money value={r.premium} currency={k.currency} /></td></tr>
          ))}</tbody></table></div>
        </section>
      ) : null}
    </section>
  );
}
