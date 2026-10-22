'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import AdminShell from '@/components/admin/AdminShell';
import { ErrorNotice } from '@/components/ui';

export default function AuditPage() {
  const { t, locale } = useI18n();
  const [action, setAction] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api(`/platform/audit${action ? `?action=${encodeURIComponent(action)}` : ''}`).then((r) => setRows(r.entries)).catch(setError); }, [action]);
  return (
    <AdminShell>
      <div className="stack">
        <h1>{t('admin.audit')}</h1>
        <input className="input" style={{ maxWidth: 300 }} aria-label={t('admin.filter')} placeholder="config. / policy. / user." value={action} onChange={(e) => setAction(e.target.value)} />
        <ErrorNotice error={error} />
        {rows ? (
          <section className="card"><div className="table-wrap"><table className="data"><tbody>{rows.map((r) => (
            <tr key={r.id}><td className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-GB')}</td><td>{r.user || '—'}</td><td><code>{r.action}</code></td><td className="small">{r.entity} {r.entityId}</td><td className="small" dir="ltr">{r.data ? JSON.stringify(r.data).slice(0, 140) : ''}</td></tr>
          ))}</tbody></table></div></section>
        ) : null}
      </div>
    </AdminShell>
  );
}
