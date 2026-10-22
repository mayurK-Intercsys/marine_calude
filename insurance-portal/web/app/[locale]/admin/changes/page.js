'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import AdminShell from '@/components/admin/AdminShell';
import { ErrorNotice } from '@/components/ui';

const diff = (before, payload) => Object.entries(payload || {}).filter(([k, v]) => JSON.stringify(before?.[k]) !== JSON.stringify(v));

export default function ChangesPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/platform/changes').then((r) => setRows(r.changes)).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  const act = async (id, action) => { setError(null); try { await api(`/platform/changes/${id}/${action}`, { method: 'POST', body: {} }); load(); } catch (e) { setError(e); } };
  return (
    <AdminShell>
      <div className="stack">
        <div className="stack-sm"><h1>{t('changes.title')}</h1><p className="muted">{t('changes.lead')}</p></div>
        <ErrorNotice error={error} />
        {rows && !rows.length ? <p className="muted">{t('changes.none')}</p> : null}
        {(rows || []).map((c) => (
          <section key={c.id} className="card stack-sm">
            <div className="spread"><strong>{c.label} · {c.operation}{c.key ? ` · ${c.key}` : ''}</strong><span className="hint">{t('changes.requestedBy')} {c.requester}</span></div>
            <div className="table-wrap"><table className="data small">
              <thead><tr><th /><th>{t('changes.before')}</th><th>{t('changes.after')}</th></tr></thead>
              <tbody>{(c.operation === 'delete' ? Object.entries(c.before || {}).slice(0, 8).map(([k, v]) => [k, null, v]) : diff(c.before, c.payload).map(([k, v]) => [k, v, c.before?.[k]])).map(([k, after, before]) => (
                <tr key={k}><th dir="ltr">{k}</th><td dir="ltr">{before == null ? '—' : JSON.stringify(before)}</td><td dir="ltr">{after == null ? '—' : JSON.stringify(after)}</td></tr>
              ))}</tbody>
            </table></div>
            {user?.permissions?.includes('engines.approve') && user.id !== c.requestedBy ? (
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => act(c.id, 'approve')}>{t('engines.approve')}</button>
                <button type="button" className="btn btn-secondary" onClick={() => act(c.id, 'reject')}>{t('engines.reject')}</button>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
