'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FieldScreen } from '@/lib/fieldConfig';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { date, isoInDays } from '@/lib/format';
import { ErrorNotice, Field, Money, StatusBadge, Stepper, Legend, PricingExtras } from '@/components/ui';
import { StepDetails, StepPayment, Issued } from '@/components/fire/BuySteps';
import PaymentFields, { paymentBody } from '@/components/policy/PaymentFields';

const COUNTRY = 'AE';
const PROJECT = ['CAR', 'EAR'];
const num = (v) => { const s = String(v).replace(/[^\d.]/g, ''); return s === '' ? 0 : Number(s); };
const plusMonths = (iso, m) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const emptyItem = (type) => ({ type, make: '', model: '', year: new Date().getUTCFullYear(), serial: '', ownership: 'owned', value: 0 });

function initialRisk(productType = 'CPM', config = null) {
  if (productType === 'CAR_ANNUAL') return { productType, tplLimit: 1000000, addOns: [], addOnInputs: {}, business: {}, discountPct: 0, annual: { estimatedTurnover: 0, maxContractValue: 0, maxMonths: 24, projectTypes: ['VILLA', 'LOWRISE', 'FITOUT'] } };
  if (PROJECT.includes(productType)) {
    const start = isoInDays(7);
    const first = config?.projectTypes.find((p) => p.product === productType)?.code || '';
    return { productType, tplLimit: 1000000, addOns: [], addOnInputs: {}, project: { projectType: first, name: '', area: '', city: 'Dubai', principal: '', permitNo: '', contractValue: 0, ownerMaterials: 0, startDate: start, completionDate: plusMonths(start, 12), maintenance: 'visits', storeysAbove: 0, basements: 0, excavationDepth: 0, foundation: 'raft', nearestBuildingM: 50, dewatering: false, blasting: false, pilingNearBuildings: false, overWater: false, hotWorks: false, testingWeeks: productType === 'EAR' ? 2 : 0, hotTesting: false, secondHand: false }, business: {}, discountPct: 0 };
  }
  const firstType = config?.equipmentTypes.find((x) => x.product === productType)?.code || '';
  return { productType, territory: 'single', items: [emptyItem(firstType)], addOns: [], addOnInputs: {}, business: {}, discountPct: 0 };
}

export function ItemsTable({ config, productType, items, onChange }) {
  const { t, pick } = useI18n();
  const types = config.equipmentTypes.filter((x) => x.product === productType);
  const setItem = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t('eng.type')}</th><th>{t('eng.make')}</th><th>{t('eng.model')}</th><th>{t('eng.year')}</th><th>{t('eng.serial')}</th><th>{t('eng.ownership')}</th><th className="num">{t('eng.value')}</th>{productType === 'MB' ? <th>{t('eng.capacity')}</th> : null}<th /></tr></thead>
        <tbody>{items.map((it, i) => (
          <tr key={i}>
            <td><select aria-label={t('eng.type')} className="input" value={it.type} onChange={(e) => setItem(i, { type: e.target.value })}>{types.map((x) => <option key={x.code} value={x.code}>{pick(x.name)}</option>)}</select></td>
            <td><input aria-label={t('eng.make')} className="input" value={it.make} onChange={(e) => setItem(i, { make: e.target.value })} /></td>
            <td><input aria-label={t('eng.model')} className="input" value={it.model} onChange={(e) => setItem(i, { model: e.target.value })} /></td>
            <td><input aria-label={t('eng.year')} className="input num-input" style={{ maxWidth: 90 }} value={it.year} onChange={(e) => setItem(i, { year: Math.round(num(e.target.value)) })} /></td>
            <td><input aria-label={t('eng.serial')} className="input" value={it.serial} onChange={(e) => setItem(i, { serial: e.target.value })} /></td>
            <td><select aria-label={t('eng.ownership')} className="input" value={it.ownership} onChange={(e) => setItem(i, { ownership: e.target.value })}>{config.config.ownership.map((o) => <option key={o.code} value={o.code}>{pick(o.name)}</option>)}</select></td>
            <td><input aria-label={t('eng.value')} className="input num-input" value={it.value || ''} onChange={(e) => setItem(i, { value: num(e.target.value) })} /></td>
            {productType === 'MB' ? <td><input aria-label={t('eng.capacity')} className="input num-input" style={{ maxWidth: 90 }} value={it.capacityMW || ''} onChange={(e) => setItem(i, { capacityMW: num(e.target.value) })} /></td> : null}
            <td>{items.length > 1 ? <button type="button" className="btn-link" onClick={() => onChange(items.filter((_, j) => j !== i))}>{t('common.cancel')}</button> : null}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => onChange([...items, emptyItem(types[0]?.code)])}>{t('eng.addItem')}</button>
    </>
  );
}

function ProjectForm({ config, risk, setRisk }) {
  const { t, pick } = useI18n();
  const p = risk.project;
  const set = (patch) => setRisk({ ...risk, project: { ...p, ...patch } });
  const text = (k, label, props = {}) => <Field id={k} label={label}><input id={k} className="input" value={p[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} {...props} /></Field>;
  const numf = (k, label) => <Field id={k} label={label}><input id={k} className="input num-input" inputMode="decimal" value={p[k] || ''} onChange={(e) => set({ [k]: num(e.target.value) })} /></Field>;
  const ear = risk.productType === 'EAR';
  return (
    <section className="card stack">
      <h1>{t('eng.projectTitle')}</h1>
      <div className="grid-2">
        <Field id="projectType" label={t('eng.projectType')}><select id="projectType" className="input" value={p.projectType} onChange={(e) => set({ projectType: e.target.value })}>{config.projectTypes.filter((x) => x.product === risk.productType).map((x) => <option key={x.code} value={x.code}>{pick(x.name)}</option>)}</select></Field>
        {text('name', t('eng.projectName'))}
        {text('principal', t('eng.principal'))}
        {text('permitNo', t('eng.permit'))}
        {text('area', t('eng.area'))}
        {text('city', t('eng.city'))}
        {numf('contractValue', `${t('eng.contractValue')} (AED)`)}
        {numf('ownerMaterials', `${t('eng.ownerMaterials')} (AED)`)}
        {text('startDate', t('eng.start'), { type: 'date', min: isoInDays(0), max: isoInDays(60) })}
        {text('completionDate', t('eng.completion'), { type: 'date' })}
        <Field id="maintenance" label={t('eng.maintenance')}><select id="maintenance" className="input" value={p.maintenance} onChange={(e) => set({ maintenance: e.target.value })}>{config.config.maintenance.map((m) => <option key={m.code} value={m.code}>{pick(m.name)}</option>)}</select></Field>
        <Field id="foundation" label={t('eng.foundation')}><select id="foundation" className="input" value={p.foundation} onChange={(e) => set({ foundation: e.target.value })}>{config.config.foundations.map((m) => <option key={m.code} value={m.code}>{pick(m.name)}</option>)}</select></Field>
        {numf('storeysAbove', t('eng.storeys'))}
        {numf('basements', t('eng.basements'))}
        {numf('excavationDepth', t('eng.excavation'))}
        {numf('nearestBuildingM', t('eng.nearest'))}
        {ear ? numf('testingWeeks', t('eng.testingWeeks')) : null}
      </div>
      <fieldset><Legend id="methods">{t('eng.methods')}</Legend>
        <div className="choices">
          {['dewatering', 'blasting', 'pilingNearBuildings', 'overWater', 'hotWorks', ...(ear ? ['hotTesting', 'secondHand'] : [])].map((k) => (
            <label className="choice" key={k}><input type="checkbox" checked={Boolean(p[k])} onChange={(e) => set({ [k]: e.target.checked })} />{t(`eng.${k === 'pilingNearBuildings' ? 'piling' : k}`)}</label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}

function CoverStep({ config, risk, setRisk, isBroker, keyFacts, setKeyFacts, quote }) {
  const { t, pick } = useI18n();
  const cfg = config.config;
  const project = PROJECT.includes(risk.productType);
  const addOns = cfg.addOns.filter((a) => a.products.includes(risk.productType));
  return (
    <>
      <section className="card stack">
        <h1>{t('eng.coverTitle')}</h1>
        {quote?.rating && !quote.rating.quotable ? <div className="notice bad">{t(`eng.notQuotable.${quote.rating.notQuotableReason}`)}</div> : null}
        {risk.productType === 'CPM' ? (
          <fieldset><Legend id="territory">{t('eng.territory')}</Legend>
            <div className="choices">{cfg.territories.map((x) => <label className="choice" key={x.code}><input type="radio" name="ter" checked={risk.territory === x.code} onChange={() => setRisk({ ...risk, territory: x.code })} />{pick(x.name)}</label>)}</div>
          </fieldset>
        ) : null}
        {project ? <Field id="tplLimit" label={t('eng.tplLimit')}><select id="tplLimit" className="input" value={risk.tplLimit} onChange={(e) => setRisk({ ...risk, tplLimit: Number(e.target.value) })}>{cfg.tplLimits.map((l) => <option key={l} value={l}>AED {l.toLocaleString('en')}</option>)}</select></Field> : null}
        {isBroker ? <Field id="discount" label={t('fire.discount')} hint={t('fire.discountHint')}><select id="discount" className="input" value={risk.discountPct} onChange={(e) => setRisk({ ...risk, discountPct: Number(e.target.value) })}>{[0, 0.05, 0.1, 0.15, 0.2].map((d) => <option key={d} value={d}>{Math.round(d * 100)}%</option>)}</select></Field> : null}
        <h2>{t('eng.addOns')}</h2>
        {addOns.map((a) => (
          <div className="asset" key={a.code}>
            <label className="check"><input type="checkbox" checked={risk.addOns.includes(a.code)} onChange={(e) => setRisk({ ...risk, addOns: e.target.checked ? [...risk.addOns, a.code] : risk.addOns.filter((c) => c !== a.code) })} /><span><strong>{pick(a.name)}</strong><br /><span className="hint">{pick(a.description)}</span></span></label>
            {a.input && risk.addOns.includes(a.code) ? <input aria-label={pick(a.name)} className="input num-input" placeholder="AED" value={risk.addOnInputs[a.input] || ''} onChange={(e) => setRisk({ ...risk, addOnInputs: { ...risk.addOnInputs, [a.input]: num(e.target.value) } })} /> : <span />}
          </div>
        ))}
      </section>
      <section className="card stack-sm">
        <h2>{t('fire.notIncluded')}</h2>
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>{(cfg.exclusions[risk.productType] || []).map((x) => <li key={x.en}>{pick(x)}</li>)}</ul>
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
            {line(t('common.sumInsured'), quote.rating.sumInsured)}
            {line(t('eng.itemsPremium'), b.itemsPremium)}
            {b.worksPremium ? <div className="price-line"><span className="label">{t('eng.worksPremium')} · {b.months} {t('eng.months')}</span><Money value={b.worksPremium} currency={quote.currency} /></div> : null}
            {line(t('eng.tplPremium'), b.tplPremium)}
            {line(t('eng.maintenancePremium'), b.maintenancePremium)}
            {line(t('eng.addOns'), b.extensionsTotal)}
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

function AnnualTerms({ config, risk, setRisk }) {
  const { t, pick } = useI18n();
  const a = risk.annual;
  const set = (patch) => setRisk({ ...risk, annual: { ...a, ...patch } });
  return (
    <section className="card stack">
      <h1>{t('annual.terms')}</h1>
      <div className="grid-3">
        <Field id="annualTurnover" label={`${t('annual.turnover')} (AED)`}><input id="annualTurnover" className="input num-input" value={a.estimatedTurnover || ''} onChange={(e) => set({ estimatedTurnover: num(e.target.value) })} /></Field>
        <Field id="maxContractValue" label={`${t('annual.maxValue')} (AED)`}><input id="maxContractValue" className="input num-input" value={a.maxContractValue || ''} onChange={(e) => set({ maxContractValue: num(e.target.value) })} /></Field>
        <Field id="maxMonths" label={t('annual.maxMonths')}><input id="maxMonths" className="input num-input" value={a.maxMonths} onChange={(e) => set({ maxMonths: Math.round(num(e.target.value)) || 6 })} /></Field>
      </div>
      <fieldset><Legend id="types">{t('annual.types')}</Legend>
        <div className="choices">{config.projectTypes.filter((x) => x.product === 'CAR').map((x) => (
          <label className="choice" key={x.code}><input type="checkbox" checked={a.projectTypes.includes(x.code)} onChange={(e) => set({ projectTypes: e.target.checked ? [...a.projectTypes, x.code] : a.projectTypes.filter((c) => c !== x.code) })} />{pick(x.name)}</label>
        ))}</div>
      </fieldset>
    </section>
  );
}

const ready = (r) => (r.productType === 'CAR_ANNUAL' ? r.annual.estimatedTurnover > 0 && r.annual.maxContractValue > 0 && r.annual.projectTypes.length > 0 : PROJECT.includes(r.productType) ? Boolean(r.project?.projectType && r.project.contractValue > 0 && r.project.completionDate > r.project.startDate) : r.items.length > 0 && r.items.every((i) => i.type && i.value > 0 && i.year > 1950));

export default function EngWizard() {
  const { t, pick, locale } = useI18n();
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [config, setConfig] = useState(null);
  const [step, setStep] = useState(0);
  const [risk, setRisk] = useState(null);
  const [quoteRef, setQuoteRef] = useState({ id: Number(params.get('q')) || null, token: params.get('t') || null });
  const [quote, setQuote] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState(null);
  const [keyFacts, setKeyFacts] = useState(false);
  const [issued, setIssued] = useState(null);
  const loaded = useRef(false);
  const steps = t('eng.steps');

  useEffect(() => { api(`/ref/products/ENG/config?country=${COUNTRY}`).then((c) => { setConfig(c); setRisk((r) => r || initialRisk('CPM', c)); }).catch(setError); }, []);
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
      if (q.risk) setRisk(q.risk);
      if (q.proposer || ['referred', 'info_requested', 'approved', 'bound'].includes(q.status)) setStep(4);
      else if (q.rating) setStep(2);
    }).catch(setError);
  }, [config, quoteRef, loadQuote]);

  const ensureQuote = useCallback(async () => {
    if (quoteRef.id) return quoteRef;
    const created = await api('/quotes', { method: 'POST', body: { productCode: 'ENG', countryCode: COUNTRY } });
    const ref = { id: created.quote.id, token: created.resumeToken };
    setQuoteRef(ref);
    loaded.current = true;
    router.replace(`/${locale}/engineering?q=${ref.id}&t=${ref.token}`, { scroll: false });
    return ref;
  }, [quoteRef, router, locale]);

  useEffect(() => {
    if (step < 1 || step > 2 || !config || !risk || !ready(risk)) return undefined;
    if (quote && ['referred', 'info_requested', 'bound', 'declined'].includes(quote.status)) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPricing(true);
      setError(null);
      try {
        const ref = await ensureQuote();
        const { quote: q } = await api(`/quotes/${ref.id}/risk`, { method: 'PUT', body: { risk }, quoteToken: ref.token, signal: controller.signal });
        setQuote(q);
      } catch (e) { if (e.name !== 'AbortError') setError(e); } finally { setPricing(false); }
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risk, step, config]);

  if (!config || !risk) return <div className="container page">{error ? <ErrorNotice error={error} /> : t('common.loading')}</div>;
  const goTo = (n) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const canContinue = [true, ready(risk) && !pricing && quote?.rating?.quotable !== false, Boolean(quote?.rating?.quotable) && keyFacts && !pricing][step];
  const project = PROJECT.includes(risk.productType);

  return (
    <FieldScreen name={['engineering.type', project ? 'engineering.project' : risk.productType === 'CAR_ANNUAL' ? 'engineering.annual' : 'engineering.items', 'engineering.cover', 'common.details', 'common.payment'][step]}>
      <Stepper steps={steps} current={issued ? steps.length : step} onSelect={issued || (quote && ['referred', 'info_requested', 'bound'].includes(quote.status)) ? null : goTo} />
      <div className="container page">
        <div className="with-aside">
          <div className="main">
            {issued ? <Issued result={issued} /> : null}
            {!issued && step === 0 ? (
              <section className="card stack">
                <h1>{t('eng.typeTitle')}</h1>
                <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  {config.config.productTypes.map((p) => (
                    <button key={p.code} type="button" className="tile" aria-pressed={risk.productType === p.code} onClick={() => setRisk(initialRisk(p.code, config))}>
                      <strong>{pick(p.name)}</strong><span className="hint">{pick(p.description)}</span><span className="badge">{pick(p.product)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {!issued && step === 1 && project ? <ProjectForm config={config} risk={risk} setRisk={setRisk} /> : null}
            {!issued && step === 1 && risk.productType === 'CAR_ANNUAL' ? (user?.isBroker ? <AnnualTerms config={config} risk={risk} setRisk={setRisk} /> : <div className="notice info">{t('annual.viaBroker')}</div>) : null}
            {!issued && step === 1 && !project && risk.productType !== 'CAR_ANNUAL' ? (
              <section className="card stack"><h1>{t('eng.itemsTitle')}</h1><ItemsTable config={config} productType={risk.productType} items={risk.items} onChange={(items) => setRisk({ ...risk, items })} /></section>
            ) : null}
            {!issued && step === 2 ? <CoverStep config={config} risk={risk} setRisk={setRisk} isBroker={Boolean(user?.isBroker)} keyFacts={keyFacts} setKeyFacts={setKeyFacts} quote={quote} /> : null}
            {!issued && step === 3 && quote ? <StepDetails quote={quote} quoteToken={quoteRef.token} fixedInception={project ? risk.project.startDate : null} onSaved={(q) => { setQuote(q); goTo(4); }} /> : null}
            {!issued && step === 4 && quote ? <StepPayment quote={quote} quoteToken={quoteRef.token} messages={messages} onChanged={() => loadQuote(quoteRef.id, quoteRef.token)} onIssued={setIssued} /> : null}
            <ErrorNotice error={error} />
            {!issued && step < 3 ? (
              <div className="spread">
                {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => goTo(step - 1)}>{t('common.back')}</button> : <span />}
                <button type="button" className="btn btn-primary" disabled={!canContinue} onClick={() => goTo(step + 1)}>{t('common.continue')}</button>
              </div>
            ) : null}
          </div>
          {step >= 1 && step <= 2 && !issued ? <PricePanel quote={quote} pricing={pricing} /> : null}
        </div>
      </div>
    </FieldScreen>
  );
}

/** CAR / EAR policy page panel: phase, extension, contract value change, completion. */
export function ProjectPanel({ policy, onDone }) {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const [p, setP] = useState(null);
  const [action, setAction] = useState(null);
  const [form, setForm] = useState({});
  const [preview, setPreview] = useState(null);
  const [payment, setPayment] = useState({});
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/engineering/${policy.id}/project`).then((r) => setP(r.project)).catch(setError), [policy.id]);
  useEffect(() => { load(); }, [load]);
  if (!p) return null;
  const path = { extend: 'extension', cv: 'contract-value', complete: 'completion' }[action];
  const body = () => (action === 'extend' ? { newCompletionDate: form.date, reason: form.reason || 'Programme change' } : action === 'cv' ? { newContractValue: Number(form.value) } : { completionDate: form.date, finalContractValue: Number(form.value) });
  const run = async (fn) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  const total = preview ? preview.premiumDelta : 0;

  return (
    <section className="card stack-sm">
      <div className="spread"><h2>{t('eng.project.title')}</h2><span className="badge">{t(`eng.project.phases.${p.phase}`)}</span></div>
      <div className="grid-3 small">
        <div>{t('eng.start')}: {date(p.startDate, locale)}</div>
        <div>{t('eng.completion')}: {date(p.completionDate, locale)}</div>
        <div>{t('eng.project.maintenanceEnd')}: {date(p.maintenanceEnd, locale)}</div>
        <div>{t('eng.contractValue')}: <Money value={p.contractValue} currency={p.currency} /></div>
      </div>
      {policy.status === 'active' && !p.completedOn ? (
        <div className="row">
          {['extend', 'cv', 'complete'].map((a) => <button key={a} type="button" className={`btn ${action === a ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setAction(a); setForm({}); setPreview(null); }}>{t(`eng.project.${a === 'extend' ? 'extend' : a === 'cv' ? 'cvChange' : 'complete'}`)}</button>)}
        </div>
      ) : null}
      {action ? (
        <div className="stack-sm">
          <div className="grid-2">
            {action !== 'cv' ? <Field id="newDate" label={action === 'extend' ? t('eng.project.newCompletion') : t('eng.project.completedOn')}><input id="newDate" type="date" className="input" value={form.date || ''} onChange={(e) => { setForm({ ...form, date: e.target.value }); setPreview(null); }} /></Field> : null}
            {action !== 'extend' ? <Field id="newValue" label={action === 'cv' ? t('eng.project.newCv') : t('eng.project.finalCv')}><input id="newValue" className="input num-input" value={form.value || ''} onChange={(e) => { setForm({ ...form, value: num(e.target.value) }); setPreview(null); }} /></Field> : null}
            {action === 'extend' ? <Field id="reason" label={t('eng.project.reason')}><input id="reason" className="input" value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field> : null}
          </div>
          {!preview ? <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => run(async () => setPreview(await api(`/engineering/${policy.id}/project/${path}`, { method: 'POST', body: { ...body(), preview: true } })))}>{t('eng.project.check')}</button> : (
            <>
              <div className="price-line total"><span>{t('endorse.difference')}</span><Money value={total} currency={p.currency} /></div>
              {preview.referralRequired ? <div className="notice warn">{t('endorse.needsReview')}</div> : null}
              {total > 0 && !preview.referralRequired ? <PaymentFields value={payment} onChange={setPayment} hasSavedCard={policy.hasSavedCard} /> : null}
              <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={() => run(async () => {
                const r = await api(`/engineering/${policy.id}/project/${path}`, { method: 'POST', body: { ...body(), ...(total > 0 && !preview.referralRequired ? { payment: paymentBody(payment, policy.hasSavedCard, user?.isBroker) } : {}) } });
                onDone(r.status === 'referred' ? t('more.referredChange') : `${t('endorse.applied')} ${r.endorsementNo}`);
                setAction(null);
                load();
              })}>{t('eng.project.apply')}</button>
            </>
          )}
        </div>
      ) : null}
      <ErrorNotice error={error} />
    </section>
  );
}

/** CPM / MB / EEI: add or remove items mid-term (priced pro rata, referral rules re-run). */
export function EquipmentChange({ policy, config, onDone }) {
  const { t, pick } = useI18n();
  const { user } = useSession();
  const [items, setItems] = useState(() => policy.risk.items);
  const [preview, setPreview] = useState(null);
  const [payment, setPayment] = useState({});
  const [error, setError] = useState(null);
  const run = async (fn) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  return (
    <section className="card stack">
      <h2>{t('eng.equipmentChange')}</h2>
      <ItemsTable config={config} productType={policy.risk.productType} items={items} onChange={(v) => { setItems(v); setPreview(null); }} />
      {!preview ? <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={() => run(async () => setPreview(await api(`/policies/${policy.id}/endorsements/preview`, { method: 'POST', body: { items } })))}>{t('endorse.preview')}</button> : (
        <div className="stack-sm">
          <div className="price-line total"><span>{t('endorse.difference')}</span><Money value={preview.totalDelta} currency={preview.currency} /></div>
          {preview.referralRequired ? <div className="notice warn">{t('endorse.needsReview')}<ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{preview.reasons.map((r) => <li key={r.code}>{pick(r.description)}</li>)}</ul></div> : null}
          {!preview.referralRequired && preview.totalDelta > 0 ? <PaymentFields value={payment} onChange={setPayment} hasSavedCard={policy.hasSavedCard} /> : null}
          <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={() => run(async () => {
            const r = await api(`/policies/${policy.id}/endorsements`, { method: 'POST', body: { type: 'sum_insured', items, ...(!preview.referralRequired && preview.totalDelta > 0 ? { payment: paymentBody(payment, policy.hasSavedCard, user?.isBroker) } : {}) } });
            onDone(r.status === 'referred' ? t('endorse.sent') : `${t('endorse.applied')} ${r.endorsementNo}`);
          })}>{preview.referralRequired ? t('endorse.send') : preview.totalDelta > 0 ? t('endorse.apply') : t('endorse.applyRefund')}</button>
        </div>
      )}
      <ErrorNotice error={error} />
    </section>
  );
}

/** Annual CAR policy page: declared projects and a form to declare the next one. */
export function AnnualProjects({ policy, config, onDone }) {
  const { t, pick, locale } = useI18n();
  const { user } = useSession();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(() => initialRisk('CAR', config));
  const [preview, setPreview] = useState(null);
  const [payment, setPayment] = useState({});
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/engineering/${policy.id}/annual/projects`).then(setData).catch(setError), [policy.id]);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const run = async (fn) => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  const body = () => ({ project: draft.project });
  return (
    <section className="card stack">
      <h2>{t('annual.projects')}</h2>
      {data.projects.length ? (
        <div className="table-wrap"><table className="data"><tbody>{data.projects.map((p) => (
          <tr key={p.ref}><td>{p.ref}<div className="hint">{p.name} · {pick(config.projectTypes.find((x) => x.code === p.projectType)?.name)}</div></td>
            <td>{date(p.startDate, locale)} – {date(p.completionDate, locale)}</td><td className="num"><Money value={p.contractValue} currency={data.currency} /></td><td className="num"><Money value={p.premium} currency={data.currency} /></td></tr>
        ))}</tbody></table></div>
      ) : null}
      {policy.status === 'active' ? (
        <>
          <h3>{t('annual.declare')}</h3>
          <ProjectForm config={config} risk={draft} setRisk={(r) => { setDraft(r); setPreview(null); }} />
          {preview ? (
            <div className="stack-sm">
              <div className="price-line total"><span>{t('annual.premium')}</span><Money value={preview.premium} currency={data.currency} /></div>
              {preview.referralRequired ? <div className="notice warn">{t('endorse.needsReview')}<ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{preview.reasons.map((r) => <li key={r.code}>{pick(r.description)}</li>)}</ul></div> : <PaymentFields value={payment} onChange={setPayment} hasSavedCard={policy.hasSavedCard} />}
            </div>
          ) : null}
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={() => run(async () => setPreview(await api(`/engineering/${policy.id}/annual/projects`, { method: 'POST', body: { ...body(), preview: true } })))}>{t('eng.project.check')}</button>
            <button type="button" className="btn btn-primary" disabled={!preview} onClick={() => run(async () => {
              const r = await api(`/engineering/${policy.id}/annual/projects`, { method: 'POST', body: { ...body(), ...(preview.referralRequired ? {} : { payment: paymentBody(payment, policy.hasSavedCard, user?.isBroker) }) } });
              onDone(r.status === 'referred' ? t('more.referredChange') : `${t('annual.declared')} ${r.projectRef}`);
              setPreview(null);
              load();
            })}>{t('annual.declare')}</button>
          </div>
        </>
      ) : null}
      <ErrorNotice error={error} />
    </section>
  );
}
