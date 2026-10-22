'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import AdminShell from '@/components/admin/AdminShell';
import { ErrorNotice, Field, Money, StatusBadge } from '@/components/ui';

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const SAMPLES = {
  MARINE: { productType: 'single', direction: 'import', commodity: 'GEN_PACKED', mode: 'sea', packing: 'cartons', container: 'fcl', origin: { country: 'CN', place: 'Ningbo (CNNGB)' }, destination: { country: 'AE', place: 'Jebel Ali (AEJEA)' }, sailingDate: inDays(10), incoterm: 'CIF', vessel: { name: 'MSC AURORA', imo: '9876543' }, invoice: { currency: 'USD', amount: 50000 }, clause: 'ICC-A', war: true, srcc: true },
  WC: { trade: 'RETAIL', policyType: 'unnamed', plan: 'standard', periodMonths: 12, categories: [{ category: 'OFFICE', headcount: 10, avgBasic: 6000, avgGross: 9000 }, { category: 'SALES', headcount: 6, avgBasic: 3500, avgGross: 5500 }] },
  ENG: { productType: 'CAR', tplLimit: 1000000, project: { projectType: 'LOWRISE', name: 'Tower B', area: 'JVC', city: 'Dubai', principal: 'Owner LLC', permitNo: 'BP-2026-5555', contractValue: 6400000, startDate: inDays(5), completionDate: inDays(400), maintenance: 'visits' } },
  FIRE: { occupancy: 'SHOP_GROCERY', locations: [{ address: { building: 'Shop 4', area: 'Al Qusais', city: 'Dubai' }, construction: 'concrete', buildingAge: '10to25', protection: { alarm: true, extinguishers: true }, civilDefence: true, sumsInsured: { IMP: 150000, PLM: 80000, FFF: 40000, STK: 600000 } }], extensions: ['X01', 'X02'] },
};

function Lines({ r }) {
  if (!r) return null;
  if (r.error) return <div className="notice bad small">{r.error}: {r.message}</div>;
  const b = r.breakdown || {};
  return (
    <div className="small stack-sm">
      {r.quotable === false ? <span className="badge warn">{r.notQuotableReason}</span> : null}
      {['technicalPremium', 'premium', 'policyFee', 'tax', 'total'].map((k) => b[k] != null ? <div className="price-line" key={k}><span className="label">{k}</span><Money value={b[k]} currency="AED" /></div> : null)}
      {r.referral?.reasons?.length ? <div>{r.referral.reasons.map((x) => <span key={x.code} className="badge warn">{x.code}</span>)}</div> : null}
    </div>
  );
}

function ModelDetail({ id, onChanged }) {
  const { t } = useI18n();
  const { user } = useSession();
  const [m, setM] = useState(null);
  const [text, setText] = useState('');
  const [risk, setRisk] = useState('');
  const [bench, setBench] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/engines/rating-models/${id}`).then((r) => { setM(r.model); setText(JSON.stringify(r.model.model, null, 2)); setRisk((x) => x || JSON.stringify(SAMPLES[r.model.productCode] || {}, null, 2)); }).catch(setError), [id]);
  useEffect(() => { load(); setBench(null); }, [load]);
  if (!m) return <ErrorNotice error={error} />;
  const draft = m.status === 'draft';
  const run = async (fn, ok) => { setError(null); setMessage(null); try { await fn(); if (ok) setMessage(ok); await load(); onChanged(); } catch (e) { setError(e); } };
  return (
    <div className="stack">
      <div className="spread"><h2>{m.productCode} · {t('engines.version')} {m.version}</h2><StatusBadge status={m.status === 'published' ? 'active' : m.status} /></div>
      {message ? <div className="notice ok">{message}</div> : null}
      {error ? <div className="notice bad">{error.message}{Array.isArray(error.details) ? <ul>{error.details.slice(0, 8).map((p) => <li key={p} dir="ltr">{p}</li>)}</ul> : null}</div> : null}
      {!draft ? <p className="notice info small">{t('engines.draftOnly')}</p> : null}
      <div className="row">
        {['published', 'superseded'].includes(m.status) ? <button type="button" className="btn btn-secondary" onClick={() => run(async () => { const r = await api(`/engines/rating-models/${id}/copy`, { method: 'POST' }); onChanged(r.model.id); })}>{t('engines.copy')}</button> : null}
        {draft ? <button type="button" className="btn btn-secondary" onClick={() => run(() => api(`/engines/rating-models/${id}`, { method: 'PUT', body: { model: JSON.parse(text) } }), t('admin.saved'))}>{t('engines.validateSave')}</button> : null}
        {draft ? <button type="button" className="btn btn-primary" onClick={() => run(() => api(`/engines/rating-models/${id}/submit`, { method: 'POST' }), t('admin.saved'))}>{t('engines.submit')}</button> : null}
        {m.status === 'pending' && user?.permissions?.includes('engines.approve') ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => run(() => api(`/engines/rating-models/${id}/approve`, { method: 'POST' }), t('admin.saved'))}>{t('engines.approve')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => run(() => api(`/engines/rating-models/${id}/reject`, { method: 'POST', body: {} }))}>{t('engines.reject')}</button>
          </>
        ) : null}
      </div>
      <section className="card stack-sm">
        <h3>{t('engines.model')}</h3>
        <textarea className="input json-editor" style={{ minHeight: 420 }} aria-label={t('engines.model')} value={text} readOnly={!draft} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </section>
      <section className="card stack-sm">
        <h3>{t('engines.bench')}</h3>
        <Field id="sr" label={t('engines.sampleRisk')}><textarea id="sr" className="input json-editor" style={{ minHeight: 160 }} value={risk} onChange={(e) => setRisk(e.target.value)} /></Field>
        <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => run(async () => setBench(await api(`/engines/rating-models/${id}/test`, { method: 'POST', body: { risk: JSON.parse(risk) } })))}>{t('engines.compare')}</button>
        {bench ? <div className="grid-2"><div><h3>{t('engines.candidate')}</h3><Lines r={bench.candidate} /></div><div><h3>{t('engines.live')}</h3><Lines r={bench.live} /></div></div> : null}
      </section>
    </div>
  );
}

export default function RatingPage() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/engines/rating-models').then(setData).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  return (
    <AdminShell>
      <div className="stack">
        <h1>{t('engines.rating')}</h1>
        <ErrorNotice error={error} />
        {data ? (
          <>
            <div className="row">{data.products.map((p) => <span key={p.code} className={`badge ${p.engine === 'dynamic' ? 'ok' : ''}`}>{p.code}: {p.engine}</span>)}</div>
            <section className="card"><div className="table-wrap"><table className="data"><tbody>{data.models.map((m) => (
              <tr key={m.id} style={{ background: selected === m.id ? 'var(--brand-tint)' : undefined }}>
                <td><button type="button" className="btn-link" onClick={() => setSelected(m.id)}>{m.productCode} v{m.version}</button><div className="hint">{m.notes}</div></td>
                <td className="small">{m.steps} steps</td><td><StatusBadge status={m.status === 'published' ? 'active' : m.status} /></td>
              </tr>
            ))}</tbody></table></div></section>
            <details className="card small"><summary>{t('engines.functions')}</summary><p dir="ltr">{[...data.functions.eager, ...data.functions.lazy].join(' · ')}</p></details>
          </>
        ) : null}
        {selected ? <ModelDetail id={selected} onChanged={(newId) => { load(); if (newId) setSelected(newId); }} /> : null}
      </div>
    </AdminShell>
  );
}
