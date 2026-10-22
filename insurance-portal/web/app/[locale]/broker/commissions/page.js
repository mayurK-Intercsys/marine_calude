'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date, isoToday } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Field, Money, StatusBadge } from '@/components/ui';

function Commissions() {
  const { t, locale } = useI18n();
  const [range, setRange] = useState({ from: `${isoToday().slice(0, 7)}-01`, to: isoToday() });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/broker/commissions?from=${range.from}&to=${range.to}`).then(setData).catch(setError);
  }, [range]);

  return (
    <div className="container page stack">
      <h1>{t('broker.commissionsTitle')}</h1>
      <div className="row">
        <Field id="from" label={t('common.from')}><input id="from" type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field id="to" label={t('common.to')}><input id="to" type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
      </div>
      <ErrorNotice error={error} />
      {data ? (
        <section className="card">
          <div className="table-wrap"><table className="data">
            <thead><tr><th>{t('account.policy')}</th><th>{t('broker.insured')}</th><th>{t('broker.transaction')}</th><th className="num">{t('common.premium')}</th><th className="num">{t('broker.rate')}</th><th className="num">{t('broker.amount')}</th><th>{t('common.status')}</th><th /></tr></thead>
            <tbody>{data.lines.map((l) => (
              <tr key={l.id}><td>{l.policyNo}</td><td>{l.insured}</td><td>{l.transaction}</td><td className="num"><Money value={l.base} currency={l.currency} /></td>
                <td className="num">{(l.rate * 100).toFixed(1)}%</td><td className="num"><Money value={l.amount} currency={l.currency} /></td><td><StatusBadge status={l.status} /></td><td>{date(l.at, locale)}</td></tr>
            ))}</tbody>
            <tfoot><tr><th colSpan={5}>{t('common.total')}</th><th className="num"><Money value={data.total} currency="AED" /></th><th colSpan={2} /></tr></tfoot>
          </table></div>
        </section>
      ) : null}
    </div>
  );
}

export default function CommissionsPage() {
  return <RequireRole roles={['broker_admin', 'broker_user']}><Commissions /></RequireRole>;
}
