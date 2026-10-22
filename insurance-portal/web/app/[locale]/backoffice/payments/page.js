'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Money } from '@/components/ui';

function TransferRow({ p, onDone, canAct }) {
  const { t, locale } = useI18n();
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const act = async (path, body, text) => {
    setBusy(true); setError(null);
    try { const r = await api(`/admin/payments/${p.id}/${path}`, { method: 'POST', body }); onDone(text(r)); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <tr>
      <td>{p.quoteRef}<div className="hint">{p.insured || '—'}{p.broker ? ` · ${p.broker}` : ''}</div></td>
      <td className="num"><Money value={p.amount} currency={p.currency} /></td>
      <td>{date(p.createdAt, locale)}</td>
      <td>
        {canAct ? (
          <div className="stack-sm" style={{ minWidth: 260 }}>
            <div className="row">
              <input className="input" style={{ maxWidth: 170 }} aria-label={t('ops.bankRef')} placeholder={t('ops.bankRef')} value={ref} onChange={(e) => setRef(e.target.value)} />
              <button type="button" className="btn btn-primary" disabled={busy || !ref.trim()} onClick={() => act('confirm', { bankReference: ref }, (r) => `${t('ops.issued')} ${r.policyNo}`)}>{t('ops.confirm')}</button>
            </div>
            <div className="row">
              <input className="input" style={{ maxWidth: 170 }} aria-label={t('ops.rejectReason')} placeholder={t('ops.rejectReason')} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act('reject', { reason }, () => t('status.rejected'))}>{t('ops.reject')}</button>
            </div>
            <ErrorNotice error={error} />
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function Payments() {
  const { t } = useI18n();
  const { user } = useSession();
  const [rows, setRows] = useState(null);
  const [message, setMessage] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);
  const canAct = user?.role === 'ops';

  const load = useCallback(() => api('/admin/payments').then((r) => setRows(r.payments)).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  const runJobs = async () => {
    setError(null);
    try { setJobs(await api('/admin/jobs/daily', { method: 'POST' })); } catch (e) { setError(e); }
  };

  return (
    <div className="container page stack">
      <div className="stack-sm"><h1>{t('ops.title')}</h1><p className="muted">{t('ops.lead')}</p></div>
      {message ? <div className="notice ok">{message}</div> : null}
      <ErrorNotice error={error} />
      {rows && rows.length === 0 ? <p className="muted">{t('ops.empty')}</p> : null}
      {rows?.length ? (
        <section className="card"><div className="table-wrap"><table className="data">
          <thead><tr><th>Ref</th><th className="num">{t('common.total')}</th><th>{t('common.from')}</th><th /></tr></thead>
          <tbody>{rows.map((p) => <TransferRow key={p.id} p={p} canAct={canAct} onDone={(text) => { setMessage(text); load(); }} />)}</tbody>
        </table></div></section>
      ) : null}
      {canAct ? (
        <section className="card stack-sm">
          <h2>{t('ops.jobsTitle')}</h2>
          <p className="muted">{t('ops.jobsLead')}</p>
          <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={runJobs}>{t('ops.runJobs')}</button>
          {jobs ? (
            <table className="data"><tbody>
              {Object.entries(t('ops.jobsResult')).map(([k, label]) => <tr key={k}><th>{label}</th><td className="num">{jobs[k]}</td></tr>)}
            </tbody></table>
          ) : null}
          {jobs?.errors?.length ? <div className="notice bad">{jobs.errors.map((e) => `${e.policyId}: ${e.code}`).join(', ')}</div> : null}
        </section>
      ) : null}
    </div>
  );
}

export default function PaymentsPage() {
  return <RequireRole roles={['ops', 'uw_manager']}><Payments /></RequireRole>;
}
