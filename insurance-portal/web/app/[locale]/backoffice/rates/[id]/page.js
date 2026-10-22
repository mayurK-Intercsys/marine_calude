'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Field, Money, StatusBadge } from '@/components/ui';

const SAMPLE_RISK = {
  occupancy: 'SHOP_GROCERY',
  locations: [{ address: { building: 'Sample', area: 'Al Qusais', city: 'Dubai' }, construction: 'concrete', buildingAge: '10to25', protection: { alarm: true, extinguishers: true }, civilDefence: true, sumsInsured: { IMP: 150000, PLM: 80000, FFF: 40000, STK: 600000 } }],
  extensions: ['X01', 'X02'],
};

function Editor({ id }) {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const router = useRouter();
  const [table, setTable] = useState(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => api(`/admin/rate-tables/${id}`).then(({ table: tb }) => { setTable(tb); setText(JSON.stringify(tb.data, null, 2)); setNote(tb.changeNote || ''); }).catch(setError), [id]);
  useEffect(() => { load(); }, [load]);
  if (!table) return <div className="container page">{error ? <ErrorNotice error={error} /> : t('common.loading')}</div>;

  const run = async (fn) => { setError(null); setMessage(null); try { await fn(); } catch (err) { setError(err); } };
  const parse = () => { try { return JSON.parse(text); } catch { throw Object.assign(new Error('json'), { code: 'INVALID_JSON' }); } };
  const isConfig = user?.role === 'config_admin';
  const canApprove = ['config_admin', 'uw_manager'].includes(user?.role);

  return (
    <div className="container page stack">
      <div className="spread">
        <h1>{table.key} · v{table.version}</h1>
        <StatusBadge status={table.status} />
      </div>
      {message ? <div className="notice ok">{message}</div> : null}
      {error ? <div className="notice bad">{error.code === 'INVALID_JSON' ? t('rates.invalidJson') : (t(`errors.${error.code}`, error.message))}</div> : null}
      <section className="card stack-sm">
        <textarea className="input json-editor" aria-label={table.key} value={text} onChange={(e) => setText(e.target.value)} readOnly={table.status !== 'draft' || !isConfig} spellCheck={false} />
        {table.status === 'draft' && isConfig ? <Field id="note" label={t('rates.changeNote')}><input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field> : null}
      </section>
      <div className="row">
        {table.status === 'approved' && isConfig ? (
          <button type="button" className="btn btn-primary" onClick={() => run(async () => { const { table: d } = await api(`/admin/rate-tables/${id}/drafts`, { method: 'POST' }); router.push(`/${locale}/backoffice/rates/${d.id}`); })}>{t('rates.newDraft')}</button>
        ) : null}
        {table.status === 'draft' && isConfig ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => run(async () => { await api(`/admin/rate-tables/${id}`, { method: 'PUT', body: { data: parse(), changeNote: note } }); setMessage(t('rates.saved')); load(); })}>{t('common.save')}</button>
            <button type="button" className="btn btn-primary" onClick={() => run(async () => { await api(`/admin/rate-tables/${id}`, { method: 'PUT', body: { data: parse(), changeNote: note } }); await api(`/admin/rate-tables/${id}/submit`, { method: 'POST' }); load(); })}>{t('rates.submitForApproval')}</button>
          </>
        ) : null}
        {['draft', 'pending'].includes(table.status) && canApprove ? (
          <button type="button" className="btn btn-secondary" onClick={() => run(async () => { setTestResult(await api(`/admin/rate-tables/${id}/test`, { method: 'POST', body: { risk: SAMPLE_RISK } })); })}>{t('rates.test')}</button>
        ) : null}
        {table.status === 'pending' && canApprove ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => run(async () => { await api(`/admin/rate-tables/${id}/approve`, { method: 'POST' }); load(); })}>{t('rates.approve')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => run(async () => { await api(`/admin/rate-tables/${id}/reject`, { method: 'POST', body: { reason: note } }); load(); })}>{t('rates.reject')}</button>
          </>
        ) : null}
      </div>
      {testResult ? (
        <section className="card grid-2">
          <div><h3>{t('rates.live')}</h3><div className="price-big"><Money value={testResult.live.breakdown.total} currency="AED" /></div></div>
          <div><h3>{t('rates.draft')}</h3><div className="price-big"><Money value={testResult.draft.breakdown.total} currency="AED" /></div></div>
        </section>
      ) : null}
    </div>
  );
}

export default function RateTablePage({ params }) {
  const { id } = use(params);
  return <RequireRole roles={['config_admin', 'uw_manager', 'underwriter']}><Editor id={id} /></RequireRole>;
}
