'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import AdminShell from '@/components/admin/AdminShell';
import { ErrorNotice } from '@/components/ui';

export default function LicencePage() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const [l, setL] = useState(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/platform/licence').then((r) => setL(r.licence)).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  return (
    <AdminShell>
      <div className="stack">
        <h1>{t('admin.licence')}</h1>
        <ErrorNotice error={error} />
        {l ? (
          <section className="card stack-sm">
            <div className="spread"><h2>{l.licensee || '—'}</h2><span className={`badge ${l.active ? (l.inGrace || l.warning ? 'warn' : 'ok') : 'bad'}`}>{l.active ? (l.inGrace ? t('admin.grace') : `${l.daysLeft} ${t('admin.daysLeft')}`) : t('admin.inactive')}</span></div>
            <table className="data"><tbody>
              <tr><th>ID</th><td>{l.licenceId}</td></tr>
              <tr><th>{t('admin.validTo')}</th><td>{date(l.validFrom, locale)} – {date(l.validTo, locale)} (+{l.graceDays})</td></tr>
              <tr><th>{t('admin.seats')}</th><td className="num">{l.seatsUsed} / {l.maxUsers}</td></tr>
              <tr><th>{t('admin.modules')}</th><td><div className="row">{(l.modules || []).map((m) => <span key={m} className="badge">{m}</span>)}</div></td></tr>
            </tbody></table>
          </section>
        ) : null}
        {user?.permissions?.includes('admin.licence') ? (
          <section className="card stack-sm">
            <h2>{t('admin.installKey')}</h2>
            <textarea className="input json-editor" style={{ minHeight: 100 }} aria-label={t('admin.installKey')} value={key} onChange={(e) => setKey(e.target.value)} />
            <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={key.trim().length < 20} onClick={async () => { setError(null); try { await api('/platform/licence', { method: 'POST', body: { key: key.trim() } }); setKey(''); load(); } catch (e) { setError(e); } }}>{t('admin.install')}</button>
          </section>
        ) : null}
      </div>
    </AdminShell>
  );
}
