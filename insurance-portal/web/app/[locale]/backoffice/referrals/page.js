'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Money, StatusBadge } from '@/components/ui';

function Queue() {
  const { t, pick, locale } = useI18n();
  const [status, setStatus] = useState('open,info_requested');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { api(`/uw/referrals?status=${status}`).then((r) => setRows(r.referrals)).catch(setError); }, [status]);

  return (
    <div className="container page stack">
      <div className="spread">
        <h1>{t('uw.queue')}</h1>
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}>
          <option value="open,info_requested">{t('status.open')}</option>
          <option value="approved">{t('status.approved')}</option>
          <option value="declined">{t('status.declined')}</option>
          <option value="all">—</option>
        </select>
      </div>
      <ErrorNotice error={error} />
      {rows && rows.length === 0 ? <p className="muted">{t('uw.empty')}</p> : null}
      {rows?.length ? (
        <section className="card"><div className="table-wrap"><table className="data">
          <thead><tr><th>{t('uw.sla')}</th><th>Ref</th><th>{t('broker.insured')}</th><th>{t('uw.reasons')}</th><th className="num">{t('common.sumInsured')}</th><th>{t('common.status')}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{r.overdue && ['open', 'info_requested'].includes(r.status) ? <span className="badge bad">{t('uw.overdue')}</span> : date(r.slaDue, locale)}</td>
              <td>
                <Link href={`/${locale}/backoffice/referrals/${r.id}`}>{r.quoteRef}</Link>
                {r.kind !== 'new_business' ? <> <span className="badge">{r.kind === 'endorsement' ? t('endorse.title') : r.kind === 'certificate' ? t('marine.dashboard.document') : t('renewal.badge')}</span></> : null}
                <div className="hint">{(r.channel || '').toUpperCase()}{r.broker ? ` · ${r.broker}` : ''}</div>
              </td>
              <td>{r.insured || '—'}</td>
              <td className="small">{r.reasons.map((x) => <div key={x.code}>{x.code} · {pick(x.description)}</div>)}</td>
              <td className="num"><Money value={r.sumInsured} currency={r.currency} /></td>
              <td><StatusBadge status={r.status} /></td>
            </tr>
          ))}</tbody>
        </table></div></section>
      ) : null}
    </div>
  );
}

export default function ReferralsPage() {
  return <RequireRole roles={['underwriter', 'uw_manager']}><Queue /></RequireRole>;
}
