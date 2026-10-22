'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { date, isoToday } from '@/lib/format';
import { ErrorNotice, Field, Money } from '@/components/ui';
import PaymentFields, { paymentBody } from '@/components/policy/PaymentFields';

/** Invoices for changes billed monthly or quarterly. */
export function InvoicesPanel({ policy, onDone }) {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const [payFor, setPayFor] = useState(null);
  const [payment, setPayment] = useState({});
  const [error, setError] = useState(null);
  if (!policy.invoices?.length) return null;
  return (
    <section className="card stack-sm">
      <h2>{t('more.invoices')}</h2>
      <div className="table-wrap"><table className="data"><tbody>{policy.invoices.map((i) => (
        <tr key={i.id}>
          <td>{i.invoiceNo}<div className="hint">{t('more.period')} {i.period}</div></td>
          <td className="num"><Money value={i.total} currency={policy.currency} /></td>
          <td>{t('more.due')} {date(i.dueDate, locale)}</td>
          <td><span className={`badge ${i.status === 'paid' ? 'ok' : i.status === 'due' ? 'warn' : ''}`}>{i.status}</span></td>
          <td>{i.status === 'due' ? <button type="button" className="btn-link" onClick={() => setPayFor(i)}>{t('more.pay')}</button> : null}</td>
        </tr>
      ))}</tbody></table></div>
      {payFor ? (
        <div className="stack-sm">
          <PaymentFields value={payment} onChange={setPayment} hasSavedCard={policy.hasSavedCard} />
          <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={async () => {
            setError(null);
            try { await api(`/policies/${policy.id}/invoices/${payFor.id}/pay`, { method: 'POST', body: { payment: paymentBody(payment, policy.hasSavedCard, user?.isBroker) } }); setPayFor(null); onDone(t('more.paid')); } catch (e) { setError(e); }
          }}>{t('more.pay')} · <Money value={payFor.total} currency={policy.currency} /></button>
        </div>
      ) : null}
      <ErrorNotice error={error} />
    </section>
  );
}

/** WC: sick-leave periods and statutory wages payable on a claim. */
export function SickLeavePanel({ claimId, currency, named }) {
  const { t, locale } = useI18n();
  const [claim, setClaim] = useState(null);
  const [form, setForm] = useState({ from: isoToday(), to: isoToday(), monthlyWage: '' });
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/claims/${claimId}`).then((r) => setClaim(r.claim)).catch(setError), [claimId]);
  useEffect(() => { load(); }, [load]);
  if (!claim) return null;
  const periods = claim.data?.sickLeave || [];
  return (
    <div className="stack-sm" style={{ padding: 12, background: 'var(--bg)', borderRadius: 10 }}>
      <strong>{t('more.sickLeave')}</strong>
      {periods.length ? (
        <table className="data"><tbody>{periods.map((p) => (
          <tr key={p.from}><td>{date(p.from, locale)} – {date(p.to, locale)}</td><td className="num">{p.days} {t('more.days')}</td><td className="small">{p.parts.map((x) => `${x.days}d × ${Math.round(x.pct * 100)}%`).join(', ')}</td><td className="num"><Money value={p.amount} currency={currency} /></td></tr>
        ))}</tbody></table>
      ) : null}
      {claim.data?.sickLeaveTotal ? <div className="price-line total"><span>{t('more.payable')}</span><Money value={claim.data.sickLeaveTotal} currency={currency} /></div> : null}
      <div className="grid-3">
        <Field id={`sf${claimId}`} label={t('more.sickFrom')}><input id={`sf${claimId}`} type="date" className="input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field>
        <Field id={`st${claimId}`} label={t('more.sickTo')}><input id={`st${claimId}`} type="date" className="input" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
        {!named ? <Field id={`sw${claimId}`} label={t('more.monthlyWage')}><input id={`sw${claimId}`} className="input num-input" value={form.monthlyWage} onChange={(e) => setForm({ ...form, monthlyWage: e.target.value.replace(/[^\d.]/g, '') })} /></Field> : null}
      </div>
      <ErrorNotice error={error} />
      <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={async () => {
        setError(null);
        try { await api(`/claims/${claimId}/sick-leave`, { method: 'POST', body: { from: form.from, to: form.to, ...(form.monthlyWage ? { monthlyWage: Number(form.monthlyWage) } : {}) } }); load(); } catch (e) { setError(e); }
      }}>{t('more.addPeriod')}</button>
    </div>
  );
}

/** Marine open cover: API keys for the customer's ERP or forwarder (FR-OC-04). */
export function ApiKeysPanel({ ocId }) {
  const { t, locale } = useI18n();
  const [keys, setKeys] = useState(null);
  const [label, setLabel] = useState('');
  const [limit, setLimit] = useState('');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/open-covers/${ocId}/api-keys`).then((r) => setKeys(r.keys)).catch(() => setKeys(null)), [ocId]);
  useEffect(() => { load(); }, [load]);
  if (!keys) return null;
  return (
    <section className="card stack-sm">
      <h2>{t('more.apiKeys')}</h2>
      <p className="muted">{t('more.apiLead')}</p>
      {created ? <div className="notice warn" style={{ wordBreak: 'break-all' }}>{t('more.keyOnce')} <code dir="ltr">{created}</code></div> : null}
      {keys.length ? <table className="data"><tbody>{keys.map((k) => (
        <tr key={k.id}><td>{k.label}<div className="hint" dir="ltr">oc_{k.prefix}_…</div></td><td className="small">{t('more.lastUsed')}: {k.lastUsedAt ? date(k.lastUsedAt, locale) : '—'}</td>
          <td>{k.revokedAt ? <span className="badge bad">{t('more.revoked')}</span> : <button type="button" className="btn-link" onClick={async () => { await api(`/open-covers/${ocId}/api-keys/${k.id}/revoke`, { method: 'POST' }); load(); }}>{t('more.revoke')}</button>}</td></tr>
      ))}</tbody></table> : null}
      <div className="grid-2">
        <Field id="kl" label={t('more.keyLabel')}><input id="kl" className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Field id="kx" label={t('more.limit')}><input id="kx" className="input num-input" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
      </div>
      <ErrorNotice error={error} />
      <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={label.trim().length < 2} onClick={async () => {
        setError(null);
        try { const r = await api(`/open-covers/${ocId}/api-keys`, { method: 'POST', body: { label, certificateLimit: limit ? Number(limit) : null } }); setCreated(r.key); setLabel(''); setLimit(''); load(); } catch (e) { setError(e); }
      }}>{t('more.createKey')}</button>
    </section>
  );
}

/** Underwriter: surveys for a referral, and a form to request one. */
export function ReferralSurveys({ referralId }) {
  const { t, locale } = useI18n();
  const [surveys, setSurveys] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [form, setForm] = useState({ site: '', instructions: '', assignedTo: '' });
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/surveys?referralId=${referralId}`).then((r) => setSurveys(r.surveys)).catch(setError), [referralId]);
  useEffect(() => { load(); api('/surveys/engineers').then((r) => setEngineers(r.engineers)).catch(() => {}); }, [load]);
  return (
    <section className="card stack-sm">
      <h2>{t('more.surveys')}</h2>
      {surveys.map((s) => (
        <div key={s.id} className="msg">
          <div className="spread"><strong>{s.site}</strong><span className="badge">{t(`more.surveyStatus.${s.status}`)}</span></div>
          {s.assignee ? <div className="hint">{s.assignee}{s.scheduledFor ? ` · ${date(s.scheduledFor, locale)}` : ''}</div> : null}
          {s.status === 'completed' ? (
            <>
              <p><span className={`badge ${s.riskGrade === 'good' ? 'ok' : s.riskGrade === 'poor' ? 'bad' : 'warn'}`}>{t(`more.grades.${s.riskGrade}`)}</span> {s.findings}</p>
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>{s.recommendations.map((r, i) => <li key={i}>{r.text} <span className="hint">({r.priority}, {r.dueDays}d)</span></li>)}</ul>
            </>
          ) : null}
        </div>
      ))}
      <h3>{t('more.surveyRequest')}</h3>
      <div className="grid-2">
        <Field id="ss" label={t('more.site')}><input id="ss" className="input" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} /></Field>
        <Field id="se" label={t('more.engineer')}><select id="se" className="input" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}><option value="">{t('more.anyEngineer')}</option>{engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
      </div>
      <Field id="si" label={t('more.instructions')}><textarea id="si" className="input" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></Field>
      <ErrorNotice error={error} />
      <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={form.site.trim().length < 2} onClick={async () => {
        setError(null);
        try { await api('/surveys', { method: 'POST', body: { referralId: Number(referralId), site: form.site, instructions: form.instructions, ...(form.assignedTo ? { assignedTo: Number(form.assignedTo) } : {}) } }); setForm({ site: '', instructions: '', assignedTo: '' }); load(); } catch (e) { setError(e); }
      }}>{t('more.surveyRequest')}</button>
    </section>
  );
}

/** CAR / EAR: EAR testing start and partial handovers. */
export function ProjectEvents({ policy, onDone }) {
  const { t, locale } = useI18n();
  const [p, setP] = useState(null);
  const [testing, setTesting] = useState({ date: isoToday(), hot: false, weeks: 2 });
  const [ho, setHo] = useState({ part: '', value: '', date: isoToday() });
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/engineering/${policy.id}/project`).then((r) => setP(r.project)).catch(() => {}), [policy.id]);
  useEffect(() => { load(); }, [load]);
  if (!p || policy.status !== 'active' || p.completedOn) return null;
  const run = async (fn) => { setError(null); try { await fn(); load(); } catch (e) { setError(e); } };
  return (
    <section className="card stack-sm">
      {p.handovers.length ? (
        <>
          <h3>{t('more.handedOver')}: <Money value={p.handedOverValue} currency={p.currency} /></h3>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>{p.handovers.map((h) => <li key={h.part + h.date}>{h.part} · <Money value={h.value} currency={p.currency} /> · {date(h.date, locale)}</li>)}</ul>
        </>
      ) : null}
      {p.productType === 'EAR' && !p.testingStartedOn ? (
        <div className="stack-sm">
          <h2>{t('more.testingStart')}</h2>
          <div className="grid-3">
            <Field id="td" label={t('more.sickFrom')}><input id="td" type="date" className="input" value={testing.date} onChange={(e) => setTesting({ ...testing, date: e.target.value })} /></Field>
            <Field id="tw" label={t('more.weeks')}><input id="tw" className="input num-input" value={testing.weeks} onChange={(e) => setTesting({ ...testing, weeks: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
            <label className="choice" style={{ alignSelf: 'end' }}><input type="checkbox" checked={testing.hot} onChange={(e) => setTesting({ ...testing, hot: e.target.checked })} />{t('more.hot')}</label>
          </div>
          <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => run(async () => {
            const r = await api(`/engineering/${policy.id}/project/testing-start`, { method: 'POST', body: testing });
            onDone(r.status === 'referred' ? t('more.referredChange') : `${t('endorse.applied')} ${r.endorsementNo}`);
          })}>{t('more.testingStart')}</button>
        </div>
      ) : null}
      {p.testingStartedOn ? <p className="small">{t('more.testingStart')}: {date(p.testingStartedOn, locale)}</p> : null}
      <h2>{t('more.handover')}</h2>
      <div className="grid-3">
        <Field id="hp" label={t('more.part')}><input id="hp" className="input" value={ho.part} onChange={(e) => setHo({ ...ho, part: e.target.value })} /></Field>
        <Field id="hv" label={t('eng.value')}><input id="hv" className="input num-input" value={ho.value} onChange={(e) => setHo({ ...ho, value: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
        <Field id="hd" label={t('more.sickFrom')}><input id="hd" type="date" className="input" value={ho.date} onChange={(e) => setHo({ ...ho, date: e.target.value })} /></Field>
      </div>
      <ErrorNotice error={error} />
      <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={ho.part.trim().length < 2 || !ho.value} onClick={() => run(async () => {
        const r = await api(`/engineering/${policy.id}/project/handover`, { method: 'POST', body: { part: ho.part, value: Number(ho.value), date: ho.date } });
        setHo({ part: '', value: '', date: isoToday() });
        onDone(`${t('endorse.applied')} ${r.endorsementNo}`);
      })}>{t('more.handover')}</button>
    </section>
  );
}
