'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import AdminShell from '@/components/admin/AdminShell';
import { ErrorNotice, Field, StatusBadge } from '@/components/ui';

const pretty = (v) => JSON.stringify(v, null, 2);
const parse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };

function SetDetail({ id, onChanged }) {
  const { t } = useI18n();
  const { user } = useSession();
  const [d, setD] = useState(null);
  const [rule, setRule] = useState({ code: '', nameEn: '', nameAr: '', condition: '', action: 'refer', priority: 100 });
  const [facts, setFacts] = useState('{\n  "maxLocationSI": 6000000,\n  "hazard": "medium"\n}');
  const [bench, setBench] = useState(null);
  const [test, setTest] = useState({ name: '', expected: '{ "refer": [] }' });
  const [tests, setTests] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/engines/rule-sets/${id}`).then(setD).catch(setError), [id]);
  useEffect(() => { load(); setBench(null); setTests(null); }, [load]);
  if (!d) return <ErrorNotice error={error} />;
  const draft = d.set.status === 'draft';
  const run = async (fn, okText) => { setError(null); setMessage(null); try { await fn(); if (okText) setMessage(okText); await load(); onChanged(); } catch (e) { setError(e); } };
  const cond = (c) => (typeof c === 'string' ? c : JSON.stringify(c));
  return (
    <div className="stack">
      <div className="spread">
        <div className="stack-sm"><h2>{d.set.name} · {t('engines.version')} {d.set.version}</h2><span className="hint">{d.set.productCode} · {d.set.purpose} · {d.set.code}</span></div>
        <StatusBadge status={d.set.status === 'published' ? 'active' : d.set.status} />
      </div>
      {message ? <div className="notice ok">{message}</div> : null}
      <ErrorNotice error={error} />
      {!draft ? <p className="notice info small">{t('engines.draftOnly')}</p> : null}
      <div className="row">
        {['published', 'superseded'].includes(d.set.status) ? <button type="button" className="btn btn-secondary" onClick={() => run(async () => { const r = await api(`/engines/rule-sets/${id}/copy`, { method: 'POST' }); onChanged(r.set.id); })}>{t('engines.copy')}</button> : null}
        {draft ? <button type="button" className="btn btn-primary" onClick={() => run(() => api(`/engines/rule-sets/${id}/submit`, { method: 'POST' }), t('admin.saved'))}>{t('engines.submit')}</button> : null}
        {d.set.status === 'pending' && user?.permissions?.includes('engines.approve') ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => run(() => api(`/engines/rule-sets/${id}/approve`, { method: 'POST' }), t('admin.saved'))}>{t('engines.approve')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => run(() => api(`/engines/rule-sets/${id}/reject`, { method: 'POST', body: {} }))}>{t('engines.reject')}</button>
          </>
        ) : null}
        {d.set.status === 'published' && user?.permissions?.includes('engines.approve') ? <button type="button" className="btn btn-secondary" onClick={() => run(() => api(`/engines/rule-sets/${id}/retire`, { method: 'POST' }))}>{t('engines.retire')}</button> : null}
      </div>

      <section className="card stack-sm">
        <h3>{t('engines.rulesTitle')} ({d.rules.length})</h3>
        <div className="table-wrap"><table className="data"><tbody>{d.rules.map((r) => (
          <tr key={r.id}><td className="num">{r.priority}</td><td><strong>{r.code}</strong><div className="small">{r.name_en}</div></td><td className="small" dir="ltr"><code>{cond(r.condition)}</code></td><td><span className={`badge ${r.action === 'decline' ? 'bad' : r.action === 'refer' ? 'warn' : ''}`}>{r.action}</span></td>
            <td>{draft ? <button type="button" className="btn-link" onClick={() => run(() => api(`/engines/rules/${r.id}`, { method: 'DELETE' }))}>{t('admin.delete')}</button> : null}</td></tr>
        ))}</tbody></table></div>
        {draft ? (
          <div className="stack-sm">
            <h3>{t('engines.addRule')}</h3>
            <div className="grid-3">
              <Field id="rc" label="Code"><input id="rc" className="input" value={rule.code} onChange={(e) => setRule({ ...rule, code: e.target.value })} /></Field>
              <Field id="ra" label={t('engines.action')}><select id="ra" className="input" value={rule.action} onChange={(e) => setRule({ ...rule, action: e.target.value })}>{['refer', 'decline', 'message', 'set'].map((a) => <option key={a}>{a}</option>)}</select></Field>
              <Field id="rp" label="Priority"><input id="rp" className="input num-input" value={rule.priority} onChange={(e) => setRule({ ...rule, priority: Number(e.target.value) || 0 })} /></Field>
              <Field id="re" label="Name (English)"><input id="re" className="input" value={rule.nameEn} onChange={(e) => setRule({ ...rule, nameEn: e.target.value })} /></Field>
              <Field id="rr" label="Name (Arabic)"><input id="rr" className="input" value={rule.nameAr} onChange={(e) => setRule({ ...rule, nameAr: e.target.value })} /></Field>
            </div>
            <Field id="rcond" label={t('engines.condition')} hint="e.g. maxLocationSI > 2000000 && hazard == 'high'"><textarea id="rcond" className="input json-editor" style={{ minHeight: 60 }} value={rule.condition} onChange={(e) => setRule({ ...rule, condition: e.target.value })} /></Field>
            <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => run(() => api(`/engines/rule-sets/${id}/rules`, { method: 'POST', body: rule }), t('admin.saved'))}>{t('engines.addRule')}</button>
          </div>
        ) : null}
      </section>

      {d.tables.length ? (
        <section className="card stack-sm">
          <h3>{t('engines.tables')}</h3>
          {d.tables.map((tb) => (
            <div key={tb.id} className="stack-sm">
              <strong>{tb.code} · {tb.name} <span className="hint">({tb.hit_policy})</span></strong>
              <div className="table-wrap"><table className="data">
                <thead><tr>{tb.inputs.map((i) => <th key={i.name}>{i.name}<div className="hint" dir="ltr">{i.expr}</div></th>)}<th>{t('engines.action')}</th></tr></thead>
                <tbody>{tb.rows.map((r, n) => <tr key={n}>{r.when.map((c, k) => <td key={k} dir="ltr"><code>{c}</code></td>)}<td><span className="badge">{r.then.action}</span> {r.then.code} <span className="small">{r.then.name_en}</span></td></tr>)}</tbody>
              </table></div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="card stack-sm">
        <h3>{t('engines.bench')}</h3>
        <Field id="bf" label={t('engines.facts')}><textarea id="bf" className="input json-editor" style={{ minHeight: 120 }} value={facts} onChange={(e) => setFacts(e.target.value)} /></Field>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => run(async () => setBench((await api(`/engines/rule-sets/${id}/evaluate`, { method: 'POST', body: { facts: parse(facts) || {} } })).result))}>{t('engines.evaluate')}</button>
          <button type="button" className="btn btn-secondary" onClick={() => run(async () => setTests(await api(`/engines/rule-sets/${id}/run-tests`, { method: 'POST' })))}>{t('engines.runTests')} ({d.tests.length})</button>
        </div>
        {bench ? <pre className="json-editor card" style={{ minHeight: 0 }}>{pretty({ refer: bench.refer.map((r) => r.code), decline: bench.decline.map((r) => r.code), values: bench.values, fired: bench.fired })}</pre> : null}
        {tests ? (
          <table className="data"><tbody>{tests.results.map((r) => <tr key={r.id}><td>{r.pass ? <span className="badge ok">✓</span> : <span className="badge bad">✗</span>}</td><td>{r.name}</td><td className="small" dir="ltr">{r.pass ? '' : `${JSON.stringify(r.got)} ≠ ${JSON.stringify(r.expected)}`}</td></tr>)}</tbody></table>
        ) : null}
        {draft ? (
          <div className="stack-sm">
            <h3>{t('engines.addTest')}</h3>
            <Field id="tn" label="Name"><input id="tn" className="input" value={test.name} onChange={(e) => setTest({ ...test, name: e.target.value })} /></Field>
            <Field id="te" label={t('engines.expected')} hint='{ "refer": ["UW-01"], "decline": [] }'><textarea id="te" className="input json-editor" style={{ minHeight: 60 }} value={test.expected} onChange={(e) => setTest({ ...test, expected: e.target.value })} /></Field>
            <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => run(() => api(`/engines/rule-sets/${id}/tests`, { method: 'POST', body: { name: test.name, facts: parse(facts) || {}, expected: parse(test.expected) || {} } }), t('admin.saved'))}>{t('engines.addTest')}</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function RulesPage() {
  const { t } = useI18n();
  const [sets, setSets] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/engines/rule-sets').then((r) => setSets(r.sets)).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  return (
    <AdminShell>
      <div className="stack">
        <h1>{t('engines.rules')}</h1>
        <ErrorNotice error={error} />
        {sets ? (
          <section className="card"><div className="table-wrap"><table className="data"><tbody>{sets.map((s) => (
            <tr key={s.id} style={{ background: selected === s.id ? 'var(--brand-tint)' : undefined }}>
              <td><button type="button" className="btn-link" onClick={() => setSelected(s.id)}>{s.name}</button><div className="hint">{s.productCode} · {s.code} · {s.purpose}</div></td>
              <td className="num">v{s.version}</td><td className="small">{s.rules} rules · {s.tables} tables</td><td><StatusBadge status={s.status === 'published' ? 'active' : s.status} /></td>
            </tr>
          ))}</tbody></table></div></section>
        ) : null}
        {selected ? <SetDetail id={selected} onChanged={(newId) => { load(); if (newId) setSelected(newId); }} /> : null}
      </div>
    </AdminShell>
  );
}
