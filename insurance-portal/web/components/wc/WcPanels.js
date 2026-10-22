'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { date, isoToday } from '@/lib/format';
import { ErrorNotice, Field, Money } from '@/components/ui';
import PaymentFields, { paymentBody } from '@/components/policy/PaymentFields';

const num = (v) => { const s = String(v).replace(/[^\d.]/g, ''); return s === '' ? 0 : Number(s); };

/** Mid-term workforce change: named list (joiners/leavers) or headcount table; priced pro rata. */
export function WorkforceChange({ policy, config, onDone }) {
  const { t, pick } = useI18n();
  const { user } = useSession();
  const named = policy.risk.policyType === 'named';
  const [employees, setEmployees] = useState(() => policy.risk.employees || []);
  const [categories, setCategories] = useState(() => policy.risk.categories || []);
  const [joiner, setJoiner] = useState({ name: '', idNo: '', jobTitle: '', category: config.categories[0].code, basic: 0, gross: 0, startDate: isoToday() });
  const [preview, setPreview] = useState(null);
  const [payment, setPayment] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const patch = () => (named ? { employees } : { categories });
  const run = async (fn) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e); } finally { setBusy(false); } };
  const catName = (c) => pick(config.categories.find((x) => x.code === c)?.name) || c;

  return (
    <section className="card stack">
      <h2>{t('wc.workforceChange')}</h2>
      {named ? (
        <>
          <div className="table-wrap"><table className="data"><tbody>{employees.map((e) => (
            <tr key={e.idNo}><td>{e.name}</td><td>{catName(e.category)}</td><td className="num"><Money value={e.gross} currency={policy.currency} /></td>
              <td><button type="button" className="btn-link" onClick={() => { setEmployees(employees.filter((x) => x.idNo !== e.idNo)); setPreview(null); }}>{t('wc.leaver')}</button></td></tr>
          ))}</tbody></table></div>
          <h3>{t('wc.joiners')}</h3>
          <div className="grid-3">
            <Field id="jn" label={t('wc.name')}><input id="jn" className="input" value={joiner.name} onChange={(e) => setJoiner({ ...joiner, name: e.target.value })} /></Field>
            <Field id="ji" label={t('wc.idNo')}><input id="ji" className="input" value={joiner.idNo} onChange={(e) => setJoiner({ ...joiner, idNo: e.target.value })} /></Field>
            <Field id="jc" label={t('wc.jobType')}><select id="jc" className="input" value={joiner.category} onChange={(e) => setJoiner({ ...joiner, category: e.target.value })}>{config.categories.map((c) => <option key={c.code} value={c.code}>{pick(c.name)}</option>)}</select></Field>
            <Field id="jb" label={t('wc.basic')}><input id="jb" className="input num-input" value={joiner.basic || ''} onChange={(e) => setJoiner({ ...joiner, basic: num(e.target.value) })} /></Field>
            <Field id="jg" label={t('wc.gross')}><input id="jg" className="input num-input" value={joiner.gross || ''} onChange={(e) => setJoiner({ ...joiner, gross: num(e.target.value) })} /></Field>
            <Field id="js" label={t('wc.startDate')}><input id="js" type="date" className="input" value={joiner.startDate} onChange={(e) => setJoiner({ ...joiner, startDate: e.target.value })} /></Field>
          </div>
          <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={!joiner.name || !joiner.idNo || !joiner.gross}
            onClick={() => { setEmployees([...employees, joiner]); setJoiner({ ...joiner, name: '', idNo: '' }); setPreview(null); }}>{t('wc.joiners')}</button>
        </>
      ) : (
        <div className="table-wrap"><table className="data"><tbody>{categories.map((c, i) => (
          <tr key={c.category}><td>{catName(c.category)}</td>
            <td><input aria-label={t('wc.headcount')} className="input num-input" value={c.headcount} onChange={(e) => { setCategories(categories.map((x, j) => (j === i ? { ...x, headcount: Math.round(num(e.target.value)) } : x))); setPreview(null); }} /></td>
            <td><input aria-label={t('wc.avgGross')} className="input num-input" value={c.avgGross} onChange={(e) => { setCategories(categories.map((x, j) => (j === i ? { ...x, avgGross: num(e.target.value) } : x))); setPreview(null); }} /></td></tr>
        ))}</tbody></table></div>
      )}
      {!preview ? <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => run(async () => setPreview(await api(`/policies/${policy.id}/endorsements/preview`, { method: 'POST', body: patch() })))}>{t('endorse.preview')}</button> : (
        <div className="stack-sm">
          <div className="price-line total"><span>{t('endorse.difference')}</span><Money value={preview.totalDelta} currency={preview.currency} /></div>
          {preview.referralRequired ? <div className="notice warn">{t('endorse.needsReview')}<ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{preview.reasons.map((r) => <li key={r.code}>{pick(r.description)}</li>)}</ul></div> : null}
          {!preview.referralRequired && preview.totalDelta > 0 ? <PaymentFields value={payment} onChange={setPayment} hasSavedCard={policy.hasSavedCard} /> : null}
          <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => run(async () => {
            const body = { type: 'workforce', ...patch(), ...(!preview.referralRequired && preview.totalDelta > 0 ? { payment: paymentBody(payment, policy.hasSavedCard, user?.isBroker) } : {}) };
            const r = await api(`/policies/${policy.id}/endorsements`, { method: 'POST', body });
            onDone(r.status === 'referred' ? t('endorse.sent') : `${t('endorse.applied')} ${r.endorsementNo}`);
          })}>{preview.referralRequired ? t('endorse.send') : preview.totalDelta > 0 ? t('endorse.apply') : t('endorse.applyRefund')}</button>
        </div>
      )}
      <ErrorNotice error={error} />
    </section>
  );
}

/** Wage declaration after expiry and the premium adjustment (min retained premium applies). */
export function WageDeclaration({ policy, config, onDone }) {
  const { t, pick, locale } = useI18n();
  const { user } = useSession();
  const [d, setD] = useState(null);
  const [actual, setActual] = useState({});
  const [preview, setPreview] = useState(null);
  const [payment, setPayment] = useState({});
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/wc/${policy.id}/declaration`).then((r) => { setD(r); setActual(Object.fromEntries(r.estimated.map((l) => [l.category, Math.round(l.annualWages)]))); }).catch(setError), [policy.id]);
  useEffect(() => { load(); }, [load]);
  if (!d || (!d.open && !d.declared)) return null;
  const cats = () => Object.entries(actual).map(([category, v]) => ({ category, actualWages: Number(v) || 0 }));
  const catName = (c) => pick(config.categories.find((x) => x.code === c)?.name) || c;

  return (
    <section className="card stack-sm">
      <h2>{t('wc.declarationTitle')}</h2>
      {d.declared ? <div className="notice ok">{t('wc.declared')} {d.declared.endorsementNo} · <Money value={Number(d.declared.premiumDelta) + Number(d.declared.taxDelta)} currency={d.currency} /></div> : (
        <>
          <p className="muted">{t('wc.declarationLead')} {t('wc.declarationDue')} {date(d.due, locale)}.</p>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>{t('wc.jobType')}</th><th className="num">{t('wc.estimated')}</th><th className="num">{t('wc.actual')}</th></tr></thead>
            <tbody>{d.estimated.map((l) => (
              <tr key={l.category}><td>{catName(l.category)}</td><td className="num"><Money value={l.annualWages} currency={d.currency} /></td>
                <td><input aria-label={t('wc.actual')} className="input num-input" value={actual[l.category] ?? ''} onChange={(e) => { setActual({ ...actual, [l.category]: num(e.target.value) }); setPreview(null); }} /></td></tr>
            ))}</tbody>
          </table></div>
          {!preview ? <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={async () => { setError(null); try { setPreview(await api(`/wc/${policy.id}/declaration/preview`, { method: 'POST', body: { categories: cats() } })); } catch (e) { setError(e); } }}>{t('endorse.preview')}</button> : (
            <>
              <div className="price-line"><span className="label">{t('wc.recalculated')}</span><Money value={preview.recalculatedPremium} currency={preview.currency} /></div>
              <div className="price-line"><span className="label">{t('wc.minimumRetained')}</span><Money value={preview.minimumRetained} currency={preview.currency} /></div>
              <div className="price-line total"><span>{t('wc.adjustment')}</span><Money value={preview.totalDelta} currency={preview.currency} /></div>
              {preview.totalDelta > 0 ? <PaymentFields value={payment} onChange={setPayment} hasSavedCard={policy.hasSavedCard} /> : null}
              <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={async () => {
                setError(null);
                try {
                  const r = await api(`/wc/${policy.id}/declaration`, { method: 'POST', body: { categories: cats(), ...(preview.totalDelta > 0 ? { payment: paymentBody(payment, policy.hasSavedCard, user?.isBroker) } : {}) } });
                  onDone(`${t('wc.declared')} ${r.endorsementNo}`);
                  load();
                } catch (e) { setError(e); }
              }}>{t('wc.declare')}</button>
            </>
          )}
        </>
      )}
      <ErrorNotice error={error} />
    </section>
  );
}
