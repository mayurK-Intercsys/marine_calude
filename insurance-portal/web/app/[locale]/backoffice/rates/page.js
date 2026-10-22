'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, StatusBadge } from '@/components/ui';

function Rates() {
  const { t, locale } = useI18n();
  const [tables, setTables] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/admin/rate-tables?product=FIRE&country=AE').then((r) => setTables(r.tables)).catch(setError); }, []);

  return (
    <div className="container page stack">
      <div className="stack-sm"><h1>{t('rates.title')} · Fire · UAE</h1><p className="muted">{t('rates.lead')}</p></div>
      <ErrorNotice error={error} />
      {tables ? (
        <section className="card"><div className="table-wrap"><table className="data">
          <thead><tr><th>{t('rates.table')}</th><th>{t('rates.version')}</th><th>{t('common.status')}</th><th>{t('rates.changeNote')}</th><th /></tr></thead>
          <tbody>{tables.map((r) => (
            <tr key={r.id}><td>{r.key}</td><td className="num">{r.version}</td><td><StatusBadge status={r.status} /></td><td className="small">{r.changeNote || '—'}</td>
              <td><Link href={`/${locale}/backoffice/rates/${r.id}`}>{t('common.view')}</Link> <span className="hint">{date(r.updatedAt, locale)}</span></td></tr>
          ))}</tbody>
        </table></div></section>
      ) : null}
    </div>
  );
}

export default function RatesPage() {
  return <RequireRole roles={['config_admin', 'uw_manager', 'underwriter']}><Rates /></RequireRole>;
}
