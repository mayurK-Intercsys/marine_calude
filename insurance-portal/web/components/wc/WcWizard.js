'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FieldScreen } from '@/lib/fieldConfig';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { ErrorNotice, Field, Money, StatusBadge, Stepper, Legend, PricingExtras } from '@/components/ui';
import { StepDetails, StepPayment, Issued } from '@/components/fire/BuySteps';

const COUNTRY = 'AE';
const num = (v) => { const s = String(v).replace(/[^\d.]/g, ''); return s === '' ? 0 : Number(s); };

export const EMPLOYEE_COLUMNS = ['name', 'idNo', 'jobTitle', 'category', 'basic', 'gross', 'startDate'];

/** Parses a simple CSV (comma separated, optional quotes) into employee rows. */
export function parseEmployees(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
  const head = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const v = (k) => cells[head.indexOf(k)] || '';
    return { name: v('name'), idNo: v('idNo'), jobTitle: v('jobTitle'), category: v('category'), basic: Number(v('basic')) || 0, gross: Number(v('gross')) || 0, ...(v('startDate') ? { startDate: v('startDate') } : {}) };
  }).filter((e) => e.name);
}

const initialRisk = () => ({
  trade: '', policyType: 'unnamed', plan: 'standard', periodMonths: 12,
  categories: [{ category: 'OFFICE', headcount: 0, avgBasic: 0, avgGross: 0 }],
  employees: [], extensions: [], claims3y: 0, fatalClaim3y: false, business: {}, workLocation: '', discountPct: 0,
});

function Workforce({ config, risk, setRisk }) {
  const { t, pick, locale } = useI18n();
  const [csv, setCsv] = useState('');
  const cfg = config.config;
  const set = (patch) => setRisk({ ...risk, ...patch });
  const setRow = (i, patch) => set({ categories: risk.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(`${EMPLOYEE_COLUMNS.join(',')}\nFatima A.,784-1990-1111111-1,Accountant,OFFICE,6000,9500,\n`)}`;
  const statutory = config.statutory;
  const example = risk.categories.find((c) => c.avgBasic > 0);
  const death = example ? Math.min(statutory.deathMax, Math.max(statutory.deathMin, example.avgBasic * statutory.deathMonths)) : null;

  return (
    <div className="with-aside">
      <div className="main">
        <section className="card stack">
          <h1>{t('wc.title')}</h1>
          <div className="grid-2">
            <Field id="trade" label={t('wc.trade')}>
              <select id="trade" className="input" value={risk.trade} onChange={(e) => set({ trade: e.target.value })}>
                <option value="" disabled>{t('wc.chooseTrade')}</option>
                {config.trades.map((x) => <option key={x.code} value={x.code}>{pick(x.name)}</option>)}
              </select>
            </Field>
            <Field id="businessName" label={t('fire.businessName')}><input id="businessName" className="input" value={risk.business.name || ''} onChange={(e) => set({ business: { ...risk.business, name: e.target.value } })} /></Field>
            <Field id="establishmentNo" label={`${t('wc.establishmentNo')} (${t('common.optional')})`}><input id="establishmentNo" className="input" value={risk.business.establishmentNo || ''} onChange={(e) => set({ business: { ...risk.business, establishmentNo: e.target.value } })} /></Field>
            <Field id="workLocation" label={t('wc.workLocation')}><input id="workLocation" className="input" value={risk.workLocation} onChange={(e) => set({ workLocation: e.target.value })} /></Field>
          </div>
          {config.trades.find((x) => x.code === risk.trade)?.status === 'decline' ? <div className="notice bad">{t('wc.notQuotable.TRADE_DECLINED')}</div> : null}
          <fieldset><Legend id="claims">{t('wc.claims')}</Legend>
            <div className="choices">
              {[0, 1, 2].map((n) => <label className="choice" key={n}><input type="radio" name="cl" checked={risk.claims3y === n} onChange={() => set({ claims3y: n })} />{t('wc.claimsOptions')[n]}</label>)}
              {risk.claims3y > 0 ? <label className="choice"><input type="checkbox" checked={risk.fatalClaim3y} onChange={(e) => set({ fatalClaim3y: e.target.checked })} />{t('wc.fatal')}</label> : null}
            </div>
          </fieldset>
        </section>
        <section className="card stack">
          <h2>{t('wc.policyType')}</h2>
          <div className="grid-2">
            {cfg.policyTypes.map((p) => (
              <label key={p.code} className="check" style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 10, background: risk.policyType === p.code ? 'var(--brand-tint)' : undefined }}>
                <input type="radio" name="pt" checked={risk.policyType === p.code} onChange={() => set({ policyType: p.code })} />
                <span><strong>{pick(p.name)}</strong><br /><span className="hint">{pick(p.description)}</span></span>
              </label>
            ))}
          </div>
          {risk.policyType === 'unnamed' ? (
            <>
              <div className="table-wrap"><table className="data">
                <thead><tr><th>{t('wc.jobType')}</th><th className="num">{t('wc.headcount')}</th><th className="num">{t('wc.avgBasic')}</th><th className="num">{t('wc.avgGross')}</th><th className="num">{t('wc.annualWages')}</th><th /></tr></thead>
                <tbody>{risk.categories.map((c, i) => (
                  <tr key={i}>
                    <td><select aria-label={t('wc.jobType')} className="input" value={c.category} onChange={(e) => setRow(i, { category: e.target.value })}>{config.categories.map((x) => <option key={x.code} value={x.code}>{pick(x.name)}</option>)}</select></td>
                    <td><input aria-label={t('wc.headcount')} className="input num-input" inputMode="numeric" value={c.headcount || ''} onChange={(e) => setRow(i, { headcount: Math.round(num(e.target.value)) })} /></td>
                    <td><input aria-label={t('wc.avgBasic')} className="input num-input" inputMode="decimal" value={c.avgBasic || ''} onChange={(e) => setRow(i, { avgBasic: num(e.target.value) })} /></td>
                    <td><input aria-label={t('wc.avgGross')} className="input num-input" inputMode="decimal" value={c.avgGross || ''} onChange={(e) => setRow(i, { avgGross: num(e.target.value) })} /></td>
                    <td className="num"><Money value={c.headcount * c.avgGross * 12} currency="AED" /></td>
                    <td>{risk.categories.length > 1 ? <button type="button" className="btn-link" onClick={() => set({ categories: risk.categories.filter((_, j) => j !== i) })}>{t('common.cancel')}</button> : null}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => set({ categories: [...risk.categories, { category: config.categories[0].code, headcount: 0, avgBasic: 0, avgGross: 0 }] })}>{t('wc.addJobType')}</button>
            </>
          ) : (
            <div className="stack-sm">
              <p className="muted">{t('wc.employeesLead')}</p>
              <div className="row">
                <a className="btn btn-secondary" href={template} download="employees_template.csv">{t('wc.template')}</a>
                <label className="btn btn-secondary">{t('wc.upload')}<input type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const txt = await f.text(); setCsv(txt); set({ employees: parseEmployees(txt) }); } }} /></label>
              </div>
              <textarea className="input json-editor" style={{ minHeight: 140 }} aria-label="CSV" value={csv} onChange={(e) => { setCsv(e.target.value); set({ employees: parseEmployees(e.target.value) }); }} placeholder={EMPLOYEE_COLUMNS.join(',')} />
              <span className="badge">{t('wc.employeeCount')}: {risk.employees.length}</span>
            </div>
          )}
        </section>
      </div>
      <aside className="aside">
        <div className="card stack-sm">
          <h2>{t('wc.lawTitle')}</h2>
          {death ? <p className="small">{t('wc.lawDeath')} <strong><Money value={death} currency="AED" /></strong>.</p> : null}
          <p className="small">{t('wc.lawTemp')}</p>
          <p className="small">{t('wc.lawReport')}</p>
          <p className="hint">{locale === 'ar' ? 'للإرشاد فقط' : 'For guidance only'}</p>
        </div>
      </aside>
    </div>
  );
}

function PlanStep({ config, risk, setRisk, quote, quoteRef, isBroker, keyFacts, setKeyFacts }) {
  const { t, pick } = useI18n();
  const [prices, setPrices] = useState({});
  const cfg = config.config;
  const set = (patch) => setRisk({ ...risk, ...patch });

  useEffect(() => {
    if (!quoteRef.id) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = {};
      for (const plan of ['essential', 'standard', 'complete']) {
        try {
          const extensions = risk.extensions.filter((c) => !cfg.extensions.find((x) => x.code === c)?.plans || cfg.extensions.find((x) => x.code === c).plans.includes(plan));
          // eslint-disable-next-line no-await-in-loop
          const r = await api(`/quotes/${quoteRef.id}/price`, { method: 'POST', body: { risk: { ...risk, plan, elLimit: undefined, extensions } }, quoteToken: quoteRef.token });
          next[plan] = r.breakdown?.premium;
        } catch { next[plan] = null; }
      }
      if (!cancelled) setPrices(next);
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteRef.id, risk.categories, risk.employees, risk.trade, risk.periodMonths, risk.extensions, risk.claims3y]);

  return (
    <>
      <section className="card stack">
        <h1>{t('wc.planTitle')}</h1>
        {quote?.rating && !quote.rating.quotable ? <div className="notice bad">{t(`wc.notQuotable.${quote.rating.notQuotableReason}`)}</div> : null}
        <div className="grid-3">
          {cfg.plans.map((p) => (
            <button key={p.code} type="button" className="tile" style={{ alignItems: 'flex-start', textAlign: 'start', padding: 16 }} aria-pressed={risk.plan === p.code}
              onClick={() => set({ plan: p.code, elLimit: undefined, extensions: risk.extensions.filter((c) => !cfg.extensions.find((x) => x.code === c)?.plans || cfg.extensions.find((x) => x.code === c).plans.includes(p.code)) })}>
              <strong>{pick(p.name)}</strong>
              <span className="hint">{pick(p.description)}</span>
              <strong style={{ fontSize: 18 }}>{prices[p.code] != null ? <Money value={prices[p.code]} currency="AED" /> : '—'}</strong>
            </button>
          ))}
        </div>
        <div className="grid-2">
          <Field id="period" label={t('wc.period')}><select id="period" className="input" value={risk.periodMonths} onChange={(e) => set({ periodMonths: Number(e.target.value) })}>{cfg.periods.map((m) => <option key={m} value={m}>{m} {t('wc.months')}</option>)}</select></Field>
          {risk.plan !== 'essential' ? (
            <Field id="elLimit" label={t('wc.elLimit')}><select id="elLimit" className="input" value={risk.elLimit || (risk.plan === 'complete' ? 2000000 : 1000000)} onChange={(e) => set({ elLimit: Number(e.target.value) })}>{cfg.elLimits.map((l) => <option key={l} value={l}>AED {l.toLocaleString('en')}</option>)}</select></Field>
          ) : null}
          {isBroker ? <Field id="discount" label={t('fire.discount')} hint={t('fire.discountHint')}><select id="discount" className="input" value={risk.discountPct} onChange={(e) => set({ discountPct: Number(e.target.value) })}>{[0, 0.05, 0.1, 0.15, 0.2].map((d) => <option key={d} value={d}>{Math.round(d * 100)}%</option>)}</select></Field> : null}
        </div>
      </section>
      <section className="card stack-sm">
        <h2>{t('wc.extensions')}</h2>
        {cfg.extensions.filter((x) => !x.plans || x.plans.includes(risk.plan)).map((x) => (
          <label className="check" key={x.code}>
            <input type="checkbox" checked={risk.extensions.includes(x.code)} onChange={(e) => set({ extensions: e.target.checked ? [...risk.extensions, x.code] : risk.extensions.filter((c) => c !== x.code) })} />
            <span><strong>{pick(x.name)}</strong> <span className="hint">{pick(x.description)}</span></span>
          </label>
        ))}
      </section>
      <section className="card stack-sm">
        <h2>{t('fire.notIncluded')}</h2>
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>{cfg.exclusions.map((x) => <li key={x.en}>{pick(x)}</li>)}</ul>
        <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={keyFacts} onChange={(e) => setKeyFacts(e.target.checked)} />{t('fire.keyFacts')}</label>
      </section>
    </>
  );
}

function PricePanel({ quote, pricing }) {
  const { t, pick } = useI18n();
  const b = quote?.rating?.breakdown;
  const line = (label, v) => (v ? <div className="price-line"><span className="label">{label}</span><Money value={v} currency={quote.currency} /></div> : null);
  return (
    <aside className="aside" aria-live="polite">
      <div className="card">
        <div className="spread" style={{ marginBottom: 10 }}><h2>{t('fire.breakdown')}</h2>{quote ? <StatusBadge status={quote.status} /> : null}</div>
        {!b ? <p className="muted">{pricing ? t('fire.pricing') : '—'}</p> : (
          <>
            {line(t('wc.annualWages'), quote.rating.sumInsured)}
            {line(t('wc.sectionA'), b.sectionA)}
            {line(t('wc.sectionB'), b.sectionB)}
            {line(t('wc.sectionC'), b.sectionC)}
            {line(t('fire.extensions'), b.extensionsTotal)}
            {b.periodFactor !== 1 ? <div className="price-line"><span className="label">{t('wc.period6')}</span><span className="num">{b.periodMonths} {t('wc.months')} · {Math.round(b.periodFactor * 100)}%</span></div> : null}
            {line(t('fire.uwLoading'), b.uwLoading)}
            {b.discount > 0 ? <div className="price-line"><span className="label">{t('fire.discountLine')}</span><span>− <Money value={b.discount} currency={quote.currency} /></span></div> : null}
            <div className="price-line" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 10 }}><span className="label">{t('common.premium')}</span><Money value={b.premium} currency={quote.currency} /></div>
            {line(t('common.policyFee'), b.policyFee)}
            <div className="price-line"><span className="label">{t('common.vat')}</span><Money value={b.tax} currency={quote.currency} /></div>
            <PricingExtras breakdown={b} currency={quote.currency} />
            <div className="price-line total"><span>{t('common.total')}</span><Money value={b.total} currency={quote.currency} /></div>
          </>
        )}
      </div>
      {quote?.rating?.referral?.required ? (
        <div className="notice warn stack-sm"><strong>{t('fire.referralTitle')}</strong>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>{quote.rating.referral.reasons.map((x) => <li key={x.code}>{pick(x.description)}</li>)}</ul>
        </div>
      ) : null}
      {quote?.status === 'approved' ? <div className="notice ok"><strong>{t('fire.approvedTitle')}</strong></div> : null}
    </aside>
  );
}

const ready = (r) => Boolean(r.trade) && (r.policyType === 'named' ? r.employees.length > 0 : r.categories.some((c) => c.headcount > 0 && c.avgGross > 0));

export default function WcWizard() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [config, setConfig] = useState(null);
  const [step, setStep] = useState(0);
  const [risk, setRisk] = useState(initialRisk);
  const [quoteRef, setQuoteRef] = useState({ id: Number(params.get('q')) || null, token: params.get('t') || null });
  const [quote, setQuote] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState(null);
  const [keyFacts, setKeyFacts] = useState(false);
  const [issued, setIssued] = useState(null);
  const loaded = useRef(false);
  const steps = t('wc.steps');

  useEffect(() => { api(`/ref/products/WC/config?country=${COUNTRY}`).then(setConfig).catch(setError); }, []);
  const loadQuote = useCallback(async (id, token) => {
    const data = await api(`/quotes/${id}`, { quoteToken: token });
    setQuote(data.quote);
    setMessages(data.messages || []);
    return data.quote;
  }, []);
  useEffect(() => {
    if (!config || loaded.current || !quoteRef.id) return;
    loaded.current = true;
    loadQuote(quoteRef.id, quoteRef.token).then((q) => {
      if (q.risk) setRisk({ ...initialRisk(), ...q.risk });
      if (q.proposer || ['referred', 'info_requested', 'approved', 'bound'].includes(q.status)) setStep(3);
      else if (q.rating) setStep(1);
    }).catch(setError);
  }, [config, quoteRef, loadQuote]);

  const ensureQuote = useCallback(async () => {
    if (quoteRef.id) return quoteRef;
    const created = await api('/quotes', { method: 'POST', body: { productCode: 'WC', countryCode: COUNTRY } });
    const ref = { id: created.quote.id, token: created.resumeToken };
    setQuoteRef(ref);
    loaded.current = true;
    router.replace(`/${locale}/wc?q=${ref.id}&t=${ref.token}`, { scroll: false });
    return ref;
  }, [quoteRef, router, locale]);

  useEffect(() => {
    if (step > 1 || !config || !ready(risk)) return undefined;
    if (quote && ['referred', 'info_requested', 'bound', 'declined'].includes(quote.status)) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPricing(true);
      setError(null);
      try {
        const ref = await ensureQuote();
        const body = { ...risk, categories: risk.policyType === 'unnamed' ? risk.categories : [], employees: risk.policyType === 'named' ? risk.employees : [] };
        const { quote: q } = await api(`/quotes/${ref.id}/risk`, { method: 'PUT', body: { risk: body }, quoteToken: ref.token, signal: controller.signal });
        setQuote(q);
      } catch (e) { if (e.name !== 'AbortError') setError(e); } finally { setPricing(false); }
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risk, step, config]);

  if (!config) return <div className="container page">{error ? <ErrorNotice error={error} /> : t('common.loading')}</div>;
  const goTo = (n) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const canContinue = [ready(risk) && !pricing && quote?.rating?.quotable !== false, Boolean(quote?.rating?.quotable) && keyFacts && !pricing][step];

  return (
    <FieldScreen name={['wc.workforce', 'wc.plan', 'common.details', 'common.payment'][step]}>
      <Stepper steps={steps} current={issued ? steps.length : step} onSelect={issued || (quote && ['referred', 'info_requested', 'bound'].includes(quote.status)) ? null : goTo} />
      <div className="container page stack">
        {issued ? <Issued result={issued} /> : null}
        {!issued && step === 0 ? <Workforce config={config} risk={risk} setRisk={setRisk} /> : null}
        {!issued && step === 1 ? (
          <div className="with-aside">
            <div className="main"><PlanStep config={config} risk={risk} setRisk={setRisk} quote={quote} quoteRef={quoteRef} isBroker={Boolean(user?.isBroker)} keyFacts={keyFacts} setKeyFacts={setKeyFacts} /></div>
            <PricePanel quote={quote} pricing={pricing} />
          </div>
        ) : null}
        {!issued && step === 2 && quote ? <StepDetails quote={quote} quoteToken={quoteRef.token} onSaved={(q) => { setQuote(q); goTo(3); }} /> : null}
        {!issued && step === 3 && quote ? <StepPayment quote={quote} quoteToken={quoteRef.token} messages={messages} onChanged={() => loadQuote(quoteRef.id, quoteRef.token)} onIssued={setIssued} /> : null}
        <ErrorNotice error={error} />
        {!issued && step < 2 ? (
          <div className="spread">
            {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => goTo(step - 1)}>{t('common.back')}</button> : <span />}
            <button type="button" className="btn btn-primary" disabled={!canContinue} onClick={() => goTo(step + 1)}>{t('common.continue')}</button>
          </div>
        ) : null}
      </div>
    </FieldScreen>
  );
}
