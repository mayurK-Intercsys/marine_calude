'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CustomerDashboard } from '@/components/dashboard/Dashboards';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Money, StatusBadge } from '@/components/ui';

function Account() {
  const { t, locale } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api('/policies'), api('/quotes')])
      .then(([p, q]) => setData({ policies: p.policies, quotes: q.quotes.filter((x) => !['bound', 'expired'].includes(x.status)) }))
      .catch(setError);
  }, []);

  if (error) return <div className="container page"><ErrorNotice error={error} /></div>;
  if (!data) return <div className="container page">{t('common.loading')}</div>;

  return (
    <div className="container page stack">
      <div className="spread"><h1>{t('account.title')}</h1><Link className="btn btn-primary" href={`/${locale}/fire`}>{t('account.startQuote')}</Link></div>
      <CustomerDashboard />
      <section className="card">
        {data.policies.length === 0 ? <p className="muted">{t('account.noPolicies')}</p> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>{t('account.policy')}</th><th>{t('broker.insured')}</th><th>{t('account.period')}</th><th className="num">{t('common.sumInsured')}</th><th>{t('common.status')}</th></tr></thead>
            <tbody>{data.policies.map((p) => (
              <tr key={p.id}>
                <td><Link href={p.productType === 'open_cover' ? `/${locale}/open-covers/${p.id}` : `/${locale}/account/policies/${p.id}`}>{p.policyNo}</Link></td>
                <td>{p.insured}</td>
                <td>{date(p.inceptionDate, locale)} – {date(p.expiryDate, locale)}</td>
                <td className="num"><Money value={p.sumInsured} currency={p.currency} /></td>
                <td><StatusBadge status={p.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {data.quotes.length ? (
        <section className="card stack-sm">
          <h2>{t('account.quotesInProgress')}</h2>
          <div className="table-wrap"><table className="data"><tbody>{data.quotes.map((q) => (
            <tr key={q.id}><td>{q.ref}{q.renewalOfPolicyId ? <> <span className="badge">{t('renewal.badge')}</span></> : null}</td><td><StatusBadge status={q.status} /></td><td className="num">{q.total ? <Money value={q.total} currency={q.currency} /> : '—'}</td>
              <td><Link href={`/${locale}/${({ MARINE: 'marine', WC: 'wc', ENG: 'engineering' })[q.productCode] || 'fire'}?q=${q.id}`}>{t('account.resume')}</Link></td></tr>
          ))}</tbody></table></div>
        </section>
      ) : null}
    </div>
  );
}

export default function AccountPage() {
  return <RequireRole roles={['customer']}><Account /></RequireRole>;
}
