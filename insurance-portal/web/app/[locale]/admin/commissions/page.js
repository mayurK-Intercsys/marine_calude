'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import AdminShell from '@/components/admin/AdminShell';
import { ErrorNotice, Field, Money, StatusBadge } from '@/components/ui';

export default function CommissionPayouts() {
  const { t, locale } = useI18n();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('earned,clawback');
  const [selected, setSelected] = useState([]);
  const [ref, setRef] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/platform/commissions?status=${status}`).then((r) => { setData(r); setSelected([]); }).catch(setError), [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <AdminShell>
      <div className="stack">
        <h1>{t('admin.commissions')}</h1>
        {message ? <div className="notice ok">{message}</div> : null}
        <ErrorNotice error={error} />
        <div className="row">
          <select className="input" style={{ maxWidth: 220 }} aria-label="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="earned,clawback">{t('status.earned')} / {t('status.clawback')}</option><option value="paid">{t('status.paid')}</option>
          </select>
          {data ? Object.entries(data.totals).map(([b, v]) => <span key={b} className="badge">{b}: <Money value={v} currency="AED" /></span>) : null}
        </div>
        {data?.lines.length ? (
          <section className="card stack-sm">
            <div className="table-wrap"><table className="data">
              <thead><tr><th><input type="checkbox" aria-label={t('admin.selectAll')} checked={selected.length === data.lines.length} onChange={(e) => setSelected(e.target.checked ? data.lines.map((l) => l.id) : [])} /></th><th>{t('admin.broker')}</th><th>{t('account.policy')}</th><th>{t('broker.transaction')}</th><th className="num">{t('broker.rate')}</th><th className="num">{t('broker.amount')}</th><th>{t('common.status')}</th><th /></tr></thead>
              <tbody>{data.lines.map((l) => (
                <tr key={l.id}>
                  <td><input type="checkbox" aria-label={l.policyNo} checked={selected.includes(l.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, l.id] : selected.filter((x) => x !== l.id))} /></td>
                  <td>{l.broker}</td><td>{l.policyNo}</td><td>{l.transaction}</td><td className="num">{(l.rate * 100).toFixed(1)}%</td><td className="num"><Money value={l.amount} currency={l.currency} /></td>
                  <td><StatusBadge status={l.status} />{l.payoutRef ? <div className="hint">{l.payoutRef}</div> : null}</td><td className="small">{date(l.paidAt || l.createdAt, locale)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {status !== 'paid' ? (
              <div className="row">
                <Field id="pr" label={t('admin.payoutRef')}><input id="pr" className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
                <button type="button" className="btn btn-primary" style={{ alignSelf: 'end' }} disabled={!selected.length || ref.trim().length < 2} onClick={async () => {
                  setError(null);
                  try { const r = await api('/platform/commissions/pay', { method: 'POST', body: { ids: selected, reference: ref.trim() } }); setMessage(`${r.paid} ✓`); setRef(''); load(); } catch (e) { setError(e); }
                }}>{t('admin.markPaid')}</button>
              </div>
            ) : null}
          </section>
        ) : <p className="muted">{t('admin.empty')}</p>}
      </div>
    </AdminShell>
  );
}
