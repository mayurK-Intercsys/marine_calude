'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FieldScreen } from '@/lib/fieldConfig';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { isoInDays } from '@/lib/format';
import { ErrorNotice, Field, Money, StatusBadge, Stepper, Legend } from '@/components/ui';
import { StepDetails, StepPayment, Issued } from '@/components/fire/BuySteps';
import { ShipmentFields, ValueFields, MarinePriceLines, emptyShipment } from './ShipmentForm';

const COUNTRY = 'AE';

const emptyOpenCover = () => ({
  productType: 'open_cover',
  interest: 'import',
  estimatedTurnover: 0,
  perSendingLimit: 0,
  commodities: [{ commodity: '', clause: 'ICC-A', share: 1 }],
  regions: ['gcc', 'asia'],
  war: true,
  srcc: true,
  premiumBasis: 'per_certificate',
  depositPct: 0.75,
  certificateIssuers: { holder: true, broker: true },
  inceptionDate: isoInDays(1),
  discountPct: 0,
  business: {},
});

const num = (v) => {
  const s = String(v).replace(/[^\d.]/g, '');
  return s === '' ? 0 : Number(s);
};

function OpenCoverTerms({ config, value, onChange, isBroker }) {
  const { t, pick } = useI18n();
  const set = (patch) => onChange({ ...value, ...patch });
  const setLine = (i, patch) => set({ commodities: value.commodities.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const total = Math.round(value.commodities.reduce((s, l) => s + Number(l.share || 0), 0) * 100);
  const regions = ['gcc', 'asia', 'europe', 'americas', 'africa', 'other'];
  return (
    <section className="card stack">
      <h1>{t('marine.oc.title')}</h1>
      <div className="grid-3">
        <Field id="businessName" label={t('fire.businessName')}><input id="businessName" className="input" value={value.business.name || ''} onChange={(e) => set({ business: { ...value.business, name: e.target.value } })} /></Field>
        <Field id="interest" label={t('marine.oc.interest')}>
          <select id="interest" className="input" value={value.interest} onChange={(e) => set({ interest: e.target.value })}>{Object.entries(t('marine.oc.interests')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field id="inception" label={t('marine.oc.inception')}><input id="inception" type="date" className="input" min={isoInDays(0)} max={isoInDays(60)} value={value.inceptionDate} onChange={(e) => set({ inceptionDate: e.target.value })} /></Field>
        <Field id="turnover" label={`${t('marine.oc.turnover')} (AED)`}><input id="turnover" className="input num-input" inputMode="decimal" value={value.estimatedTurnover || ''} onChange={(e) => set({ estimatedTurnover: num(e.target.value) })} /></Field>
        <Field id="perSendingLimit" label={`${t('marine.oc.perSending')} (AED)`}><input id="perSendingLimit" className="input num-input" inputMode="decimal" value={value.perSendingLimit || ''} onChange={(e) => set({ perSendingLimit: num(e.target.value) })} /></Field>
        {isBroker ? (
          <Field id="discount" label={t('fire.discount')}>
            <select id="discount" className="input" value={value.discountPct} onChange={(e) => set({ discountPct: Number(e.target.value) })}>{[0, 0.05, 0.1, 0.15, 0.2].map((d) => <option key={d} value={d}>{Math.round(d * 100)}%</option>)}</select>
          </Field>
        ) : null}
      </div>
      <div className="stack-sm">
        <h2>{t('marine.oc.schedule')}</h2>
        <div className="table-wrap"><table className="data">
          <thead><tr><th>{t('marine.commodity')}</th><th>{t('marine.clauseTitle')}</th><th className="num">{t('marine.oc.share')}</th><th /></tr></thead>
          <tbody>{value.commodities.map((l, i) => {
            const c = config.commodities.find((x) => x.code === l.commodity);
            return (
              <tr key={i}>
                <td><select aria-label={t('marine.commodity')} className="input" value={l.commodity} onChange={(e) => { const nc = config.commodities.find((x) => x.code === e.target.value); setLine(i, { commodity: e.target.value, clause: nc?.clauses.includes(l.clause) ? l.clause : nc?.clauses[0] }); }}>
                  <option value="" disabled>{t('marine.chooseCommodity')}</option>
                  {config.commodities.filter((x) => !x.prohibited).map((x) => <option key={x.code} value={x.code}>{pick(x.name)}</option>)}
                </select></td>
                <td><select aria-label={t('marine.clauseTitle')} className="input" value={l.clause} onChange={(e) => setLine(i, { clause: e.target.value })}>{(c?.clauses || []).map((cl) => <option key={cl}>{cl}</option>)}</select></td>
                <td><input aria-label={t('marine.oc.share')} className="input num-input" style={{ maxWidth: 110 }} inputMode="decimal" value={Math.round(l.share * 100)} onChange={(e) => setLine(i, { share: num(e.target.value) / 100 })} /></td>
                <td>{value.commodities.length > 1 ? <button type="button" className="btn-link" onClick={() => set({ commodities: value.commodities.filter((_, j) => j !== i) })}>{t('common.cancel')}</button> : null}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <div className="spread">
          <button type="button" className="btn btn-secondary" onClick={() => set({ commodities: [...value.commodities, { commodity: '', clause: 'ICC-A', share: 0 }] })}>{t('marine.oc.addCommodity')}</button>
          <span className={`badge ${total === 100 ? 'ok' : 'warn'}`}>{total}% · {t('marine.oc.sharesHint')}</span>
        </div>
      </div>
      <fieldset><Legend id="regions">{t('marine.oc.regions')}</Legend>
        <div className="choices">{regions.map((r) => <label className="choice" key={r}><input type="checkbox" checked={value.regions.includes(r)} onChange={(e) => set({ regions: e.target.checked ? [...value.regions, r] : value.regions.filter((x) => x !== r) })} />{t(`marine.oc.regionNames.${r}`)}</label>)}</div>
      </fieldset>
      <div className="choices">
        <label className="choice"><input type="checkbox" checked={value.war} onChange={(e) => set({ war: e.target.checked })} />{t('marine.war')}</label>
        <label className="choice"><input type="checkbox" checked={value.srcc} onChange={(e) => set({ srcc: e.target.checked })} />{t('marine.srcc')}</label>
      </div>
      <fieldset><Legend id="basis">{t('marine.oc.basis')}</Legend>
        <div className="choices">{['per_certificate', 'deposit'].map((b) => <label className="choice" key={b}><input type="radio" name="basis" checked={value.premiumBasis === b} onChange={() => set({ premiumBasis: b })} />{t(`marine.oc.bases.${b}`)}</label>)}</div>
      </fieldset>
      <fieldset><Legend id="issuers">{t('marine.oc.issuers')}</Legend>
        <div className="choices">
          <label className="choice"><input type="checkbox" checked={value.certificateIssuers.holder} onChange={(e) => set({ certificateIssuers: { ...value.certificateIssuers, holder: e.target.checked } })} />{t('marine.oc.issuerHolder')}</label>
          <label className="choice"><input type="checkbox" checked={value.certificateIssuers.broker} onChange={(e) => set({ certificateIssuers: { ...value.certificateIssuers, broker: e.target.checked } })} />{t('marine.oc.issuerBroker')}</label>
        </div>
      </fieldset>
    </section>
  );
}

function PricePanel({ quote, pricing }) {
  const { t, pick } = useI18n();
  const r = quote?.rating;
  const oc = quote?.risk?.productType === 'open_cover';
  return (
    <aside className="aside" aria-live="polite">
      <div className="card">
        <div className="spread" style={{ marginBottom: 10 }}><h2>{t('fire.breakdown')}</h2>{quote ? <StatusBadge status={quote.status} /> : null}</div>
        {!r?.breakdown ? <p className="muted">{pricing ? t('fire.pricing') : '—'}</p> : oc ? (
          <>
            <div className="price-line"><span className="label">{t('marine.oc.turnover')}</span><Money value={r.sumInsured} currency={quote.currency} /></div>
            <div className="price-line"><span className="label">{t('marine.oc.weightedRate')}</span><span className="num">{(r.breakdown.weightedRate * 100).toFixed(3)}%</span></div>
            <div className="price-line"><span className="label">{t('marine.oc.estimated')}</span><Money value={r.breakdown.estimatedPremium} currency={quote.currency} /></div>
            <div className="price-line" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 10 }}><span className="label">{t('marine.oc.depositDue')}</span><Money value={r.breakdown.premium} currency={quote.currency} /></div>
            <div className="price-line"><span className="label">{t('common.policyFee')}</span><Money value={r.breakdown.policyFee} currency={quote.currency} /></div>
            <div className="price-line"><span className="label">{t('common.vat')}</span><Money value={r.breakdown.tax} currency={quote.currency} /></div>
            <div className="price-line total"><span>{t('common.total')}</span><Money value={r.breakdown.total} currency={quote.currency} /></div>
            {!r.breakdown.premium ? <p className="hint">{t('marine.oc.perCertNote')}</p> : null}
          </>
        ) : <MarinePriceLines breakdown={r.breakdown} currency={quote.currency} sumInsured={r.sumInsured} />}
        {pricing ? <p className="hint">{t('fire.pricing')}</p> : null}
      </div>
      {r?.referral?.required ? (
        <div className="notice warn stack-sm"><strong>{t('fire.referralTitle')}</strong><span>{t('fire.referralLead')}</span>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>{r.referral.reasons.map((x) => <li key={x.code}>{pick(x.description)}</li>)}</ul>
        </div>
      ) : null}
      {quote?.status === 'approved' ? <div className="notice ok"><strong>{t('fire.approvedTitle')}</strong>{quote.uwTerms?.warranty ? <p className="small">{quote.uwTerms.warranty}</p> : null}</div> : null}
    </aside>
  );
}

const ready = (risk) => (risk.productType === 'open_cover'
  ? risk.estimatedTurnover > 0 && risk.perSendingLimit > 0 && risk.commodities.every((l) => l.commodity) && Math.abs(risk.commodities.reduce((s, l) => s + l.share, 0) - 1) < 0.001
  : Boolean(risk.commodity && risk.clause && risk.invoice.amount > 0 && risk.origin.place && risk.destination.place));

export default function MarineWizard() {
  const { t, pick, locale } = useI18n();
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [config, setConfig] = useState(null);
  const [step, setStep] = useState(0);
  const [risk, setRisk] = useState(() => emptyShipment('single'));
  const [quoteRef, setQuoteRef] = useState({ id: Number(params.get('q')) || null, token: params.get('t') || null });
  const [quote, setQuote] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState(null);
  const [keyFacts, setKeyFacts] = useState(false);
  const [issued, setIssued] = useState(null);
  const loaded = useRef(false);
  const oc = risk.productType === 'open_cover';
  const steps = t(oc ? 'marine.ocSteps' : 'marine.steps');

  useEffect(() => { api(`/ref/products/MARINE/config?country=${COUNTRY}`).then(setConfig).catch(setError); }, []);

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
      if (q.proposer || ['referred', 'info_requested', 'approved', 'bound'].includes(q.status)) setStep(5);
      else if (q.rating) setStep(3);
    }).catch(setError);
  }, [config, quoteRef, loadQuote]);

  const ensureQuote = useCallback(async () => {
    if (quoteRef.id) return quoteRef;
    const created = await api('/quotes', { method: 'POST', body: { productCode: 'MARINE', countryCode: COUNTRY } });
    const ref = { id: created.quote.id, token: created.resumeToken };
    setQuoteRef(ref);
    loaded.current = true;
    router.replace(`/${locale}/marine?q=${ref.id}&t=${ref.token}`, { scroll: false });
    return ref;
  }, [quoteRef, router, locale]);

  useEffect(() => {
    if (step < 2 || step > 3 || !config || !ready(risk)) return undefined;
    if (quote && ['referred', 'info_requested', 'bound', 'declined'].includes(quote.status)) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPricing(true);
      setError(null);
      try {
        const ref = await ensureQuote();
        const body = { ...risk, lc: risk.lc && risk.lc.bank ? risk.lc : undefined };
        const { quote: q } = await api(`/quotes/${ref.id}/risk`, { method: 'PUT', body: { risk: body }, quoteToken: ref.token, signal: controller.signal });
        setQuote(q);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e);
      } finally {
        setPricing(false);
      }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risk, step, config]);

  if (!config) return <div className="container page">{error ? <ErrorNotice error={error} /> : t('common.loading')}</div>;

  const isBroker = Boolean(user?.isBroker);
  const goTo = (n) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const canContinue = [
    !oc || isBroker,
    oc ? ready(risk) && step !== 1 ? true : ready(risk) : Boolean(risk.commodity && risk.origin.place && risk.destination.place && risk.sailingDate),
    ready(risk) && !pricing && quote?.rating?.quotable !== false,
    Boolean(quote?.rating?.quotable) && keyFacts && !pricing,
  ][step];

  return (
    <FieldScreen name={oc ? ['marine.type', 'marine.opencover', 'marine.opencover', 'marine.quote', 'common.details', 'common.payment'][step] : ['marine.type', 'marine.shipment', 'marine.value', 'marine.quote', 'common.details', 'common.payment'][step]}>
      <Stepper steps={steps} current={issued ? steps.length : step} onSelect={issued || (quote && ['referred', 'info_requested', 'bound'].includes(quote.status)) ? null : goTo} />
      <div className="container page">
        <div className="with-aside">
          <div className="main">
            {issued ? <Issued result={issued} /> : null}
            {!issued && step === 0 ? (
              <section className="card stack">
                <h1>{t('marine.typeTitle')}</h1>
                <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  {config.config.productTypes.map((p) => (
                    <button key={p.code} type="button" className="tile" aria-pressed={risk.productType === p.code}
                      onClick={() => setRisk(p.code === 'open_cover' ? emptyOpenCover() : { ...emptyShipment(p.code), business: risk.business || {} })}>
                      <strong>{pick(p.name)}</strong><span className="hint">{pick(p.description)}</span>
                    </button>
                  ))}
                </div>
                {oc && !isBroker ? <div className="notice info">{t('marine.ocViaBroker')}</div> : null}
              </section>
            ) : null}
            {!issued && step === 1 && !oc ? <ShipmentFields config={config} value={risk} onChange={setRisk} /> : null}
            {!issued && step === 1 && oc ? <OpenCoverTerms config={config} value={risk} onChange={setRisk} isBroker={isBroker} /> : null}
            {!issued && step === 2 && !oc ? <ValueFields config={config} value={risk} onChange={setRisk} /> : null}
            {!issued && step === 2 && oc ? <OpenCoverTerms config={config} value={risk} onChange={setRisk} isBroker={isBroker} /> : null}
            {!issued && step === 3 ? (
              <section className="card stack-sm">
                <h1>{t('marine.quoteTitle')}{quote?.total ? <>: <Money value={quote.total} currency={quote.currency} /></> : null}</h1>
                {quote?.rating && !quote.rating.quotable ? <div className="notice bad">{t(`marine.notQuotable.${quote.rating.notQuotableReason}`)}</div> : null}
                {!oc && isBroker ? (
                  <Field id="discount" label={t('fire.discount')} hint={t('fire.discountHint')}>
                    <select id="discount" className="input" value={risk.discountPct || 0} onChange={(e) => setRisk({ ...risk, discountPct: Number(e.target.value) })}>{[0, 0.05, 0.1, 0.15].map((d) => <option key={d} value={d}>{Math.round(d * 100)}%</option>)}</select>
                  </Field>
                ) : null}
                <h2>{t('fire.notIncluded')}</h2>
                <ul style={{ margin: 0, paddingInlineStart: 18 }}>{config.config.exclusions.map((x) => <li key={x.en}>{pick(x)}</li>)}</ul>
                <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={keyFacts} onChange={(e) => setKeyFacts(e.target.checked)} />{t('fire.keyFacts')}</label>
              </section>
            ) : null}
            {!issued && step === 4 && quote ? <StepDetails quote={quote} quoteToken={quoteRef.token} fixedInception={oc ? null : risk.sailingDate} onSaved={(q) => { setQuote(q); goTo(5); }} /> : null}
            {!issued && step === 5 && quote ? <StepPayment quote={quote} quoteToken={quoteRef.token} messages={messages} onChanged={() => loadQuote(quoteRef.id, quoteRef.token)} onIssued={(r) => setIssued({ ...r, openCover: oc })} /> : null}
            <ErrorNotice error={error} />
            {!issued && step < 4 ? (
              <div className="spread">
                {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => goTo(step === 3 && oc ? 1 : step - 1)}>{t('common.back')}</button> : <span />}
                <button type="button" className="btn btn-primary" disabled={!canContinue} onClick={() => goTo(oc && step === 1 ? 3 : step + 1)}>{t('common.continue')}</button>
              </div>
            ) : null}
          </div>
          {step >= 2 && !issued ? <PricePanel quote={quote} pricing={pricing} /> : null}
        </div>
      </div>
    </FieldScreen>
  );
}
