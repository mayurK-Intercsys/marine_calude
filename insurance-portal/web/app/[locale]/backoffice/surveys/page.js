'use client';

import { useCallback, useEffect, useState } from 'react';
import Documents from '@/components/Documents';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date, isoInDays } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Field, Legend } from '@/components/ui';

function SurveyCard({ s, onDone }) {
  const { t, locale } = useI18n();
  const [when, setWhen] = useState(isoInDays(2));
  const [form, setForm] = useState({ riskGrade: 'acceptable', findings: '', recommendations: '' });
  const [error, setError] = useState(null);
  const run = async (fn) => { setError(null); try { await fn(); onDone(); } catch (e) { setError(e); } };
  const open = ['requested', 'scheduled'].includes(s.status);
  return (
    <section className="card stack-sm">
      <div className="spread"><h2>{s.reference} · {s.site}</h2><span className="badge">{t(`more.surveyStatus.${s.status}`)}</span></div>
      {s.instructions ? <p>{s.instructions}</p> : null}
      {s.scheduledFor ? <p className="hint">{t('more.scheduledFor')} {date(s.scheduledFor, locale)}</p> : null}
      {open ? (
        <>
          <div className="row">
            <input type="date" aria-label={t('more.scheduledFor')} className="input" style={{ maxWidth: 200 }} value={when} onChange={(e) => setWhen(e.target.value)} />
            <button type="button" className="btn btn-secondary" onClick={() => run(() => api(`/surveys/${s.id}/schedule`, { method: 'POST', body: { date: when } }))}>{t('more.schedule')}</button>
          </div>
          <fieldset><Legend id="grade">{t('more.grade')}</Legend>
            <div className="choices">{['good', 'acceptable', 'poor'].map((g) => <label className="choice" key={g}><input type="radio" name={`g${s.id}`} checked={form.riskGrade === g} onChange={() => setForm({ ...form, riskGrade: g })} />{t(`more.grades.${g}`)}</label>)}</div>
          </fieldset>
          <Field id={`f${s.id}`} label={t('more.findings')}><textarea id={`f${s.id}`} className="input" value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} /></Field>
          <Field id={`r${s.id}`} label={t('more.recommendations')}><textarea id={`r${s.id}`} className="input" value={form.recommendations} onChange={(e) => setForm({ ...form, recommendations: e.target.value })} /></Field>
          <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={form.findings.trim().length < 5} onClick={() => run(() => api(`/surveys/${s.id}/complete`, {
            method: 'POST', body: { riskGrade: form.riskGrade, findings: form.findings, recommendations: form.recommendations.split('\n').map((x) => x.trim()).filter((x) => x.length >= 3).map((text) => ({ text, priority: 'medium', dueDays: 30 })) },
          }))}>{t('more.complete')}</button>
        </>
      ) : s.status === 'completed' ? <p><span className="badge">{t(`more.grades.${s.riskGrade}`)}</span> {s.findings}</p> : null}
      <ErrorNotice error={error} />
      <Documents entity="survey" entityId={s.id} />
    </section>
  );
}

function Surveys() {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/surveys').then((r) => setRows(r.surveys)).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="container page stack">
      <h1>{t('more.surveys')}</h1>
      <ErrorNotice error={error} />
      {rows && !rows.length ? <p className="muted">{t('more.noSurveys')}</p> : null}
      {(rows || []).map((s) => <SurveyCard key={s.id} s={s} onDone={load} />)}
    </div>
  );
}

export default function SurveysPage() {
  return <RequireRole roles={['risk_engineer', 'underwriter', 'uw_manager']}><Surveys /></RequireRole>;
}
