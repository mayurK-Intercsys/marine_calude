'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrokerDashboard } from '@/components/dashboard/Dashboards';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Money, StatusBadge } from '@/components/ui';

const BROKER_ROLES = ['broker_admin', 'broker_user'];

function Dashboard() {
  const { t, pick, locale } = useI18n();
  const [data, setData] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/broker/dashboard').then(setData).catch(setError);
    api('/policies').then((r) => setPolicies(r.policies)).catch(() => {});
  }, []);

  if (error) return <div className="container page"><ErrorNotice error={error} /></div>;
  if (!data) return <div className="container page">{t('common.loading')}</div>;
  const k = data.kpis;
  const cur = 'AED';

  return (
    <div className="container page stack">
      <div className="spread">
        <div className="stack-sm"><h1>{t('broker.title')}</h1><span className="muted">{data.broker.name} · {data.broker.tier}</span></div>
        <Link className="btn btn-primary" href={`/${locale}/fire`}>{t('broker.newFireQuote')}</Link>
      </div>
      <BrokerDashboard />
      <div className="kpis">
        <div className="card kpi tight"><span className="label">{t('broker.openQuotes')}</span><span className="value">{k.openQuotes}</span></div>
        <div className="card kpi tight"><span className="label">{t('broker.referrals')}</span><span className="value" style={{ color: k.referralsPending ? 'var(--action)' : undefined }}>{k.referralsPending}</span></div>
        <div className="card kpi tight"><span className="label">{t('broker.renewals')}</span><span className="value">{k.renewalsDue60}</span></div>
        <div className="card kpi tight"><span className="label">{t('broker.gwp')}</span><span className="value"><Money value={k.gwpMonth} currency={cur} /></span></div>
        <div className="card kpi tight"><span className="label">{t('broker.commission')}</span><span className="value"><Money value={k.commissionMonth} currency={cur} /></span></div>
      </div>
      {data.referrals.length ? (
        <section className="card stack-sm">
          <h2>{t('broker.referrals')}</h2>
          <div className="table-wrap"><table className="data"><tbody>{data.referrals.map((q) => (
            <tr key={q.id}><td><Link href={`/${locale}/${({ MARINE: 'marine', WC: 'wc', ENG: 'engineering' })[q.productCode] || 'fire'}?q=${q.id}`}>{q.ref}</Link></td><td>{q.insured || '—'}</td>
              <td>{(q.reasons || []).map((r) => pick(r.description)).join('; ')}</td><td><StatusBadge status={q.status} /></td></tr>
          ))}</tbody></table></div>
        </section>
      ) : null}
      {data.renewals.length ? (
        <section className="card stack-sm">
          <h2>{t('broker.renewals')}</h2>
          <div className="table-wrap"><table className="data"><tbody>{data.renewals.map((p) => (
            <tr key={p.id}><td><Link href={p.productType === 'open_cover' ? `/${locale}/open-covers/${p.id}` : `/${locale}/account/policies/${p.id}`}>{p.policyNo}</Link></td><td>{p.insured}</td><td>{date(p.expiryDate, locale)}</td>
              <td className="num"><Money value={p.total} currency={p.currency} /></td></tr>
          ))}</tbody></table></div>
        </section>
      ) : null}
      <section className="card stack-sm">
        <h2>{t('broker.recentQuotes')}</h2>
        <div className="table-wrap"><table className="data">
          <tbody>{data.recentQuotes.map((q) => (
            <tr key={q.id}><td><Link href={`/${locale}/${({ MARINE: 'marine', WC: 'wc', ENG: 'engineering' })[q.productCode] || 'fire'}?q=${q.id}`}>{q.ref}</Link></td><td>{q.insured || '—'}</td><td><StatusBadge status={q.status} /></td>
              <td className="num">{q.total ? <Money value={q.total} currency={q.currency} /> : '—'}</td><td>{date(q.updatedAt, locale)}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
      {policies.length ? (
        <section className="card stack-sm">
          <h2>{t('nav.myPolicies')}</h2>
          <div className="table-wrap"><table className="data"><tbody>{policies.map((p) => (
            <tr key={p.id}><td><Link href={p.productType === 'open_cover' ? `/${locale}/open-covers/${p.id}` : `/${locale}/account/policies/${p.id}`}>{p.policyNo}</Link></td><td>{p.insured}</td><td>{date(p.expiryDate, locale)}</td><td><StatusBadge status={p.status} /></td></tr>
          ))}</tbody></table></div>
        </section>
      ) : null}
    </div>
  );
}

export default function BrokerPage() {
  return <RequireRole roles={BROKER_ROLES}><Dashboard /></RequireRole>;
}
