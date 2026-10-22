'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FieldScreen } from '@/lib/fieldConfig';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { ErrorNotice, Stepper } from '@/components/ui';
import { StepPremise, StepBusiness, StepCover, StepQuote, emptyLocation } from './RiskSteps';
import { StepDetails, StepPayment, PricePanel, Issued } from './BuySteps';

const COUNTRY = 'AE';

const initialRisk = () => ({
  occupancy: '',
  interest: 'tenant',
  business: {},
  locations: [emptyLocation()],
  claims3y: 0,
  extensions: [],
  extensionInputs: {},
  deductible: 'standard',
  discountPct: 0,
});

/** Strips UI-only blanks so the API receives clean risk data. */
function cleanRisk(risk) {
  return {
    ...risk,
    business: Object.fromEntries(Object.entries(risk.business || {}).filter(([, v]) => v)),
    locations: risk.locations.map((l) => ({
      ...l,
      sumsInsured: Object.fromEntries(Object.entries(l.sumsInsured || {}).filter(([, v]) => Number(v) > 0)),
    })),
  };
}

const hasCover = (risk) => risk.locations.some((l) => Object.values(l.sumsInsured || {}).some((v) => Number(v) > 0));

export default function FireWizard() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();

  const [config, setConfig] = useState(null);
  const [step, setStep] = useState(0);
  const [group, setGroup] = useState('');
  const [risk, setRisk] = useState(initialRisk);
  const [quoteRef, setQuoteRef] = useState({ id: Number(params.get('q')) || null, token: params.get('t') || null });
  const [quote, setQuote] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState(null);
  const [keyFactsRead, setKeyFactsRead] = useState(false);
  const [issued, setIssued] = useState(null);
  const loadedRef = useRef(false);
  const steps = t('fire.steps');

  useEffect(() => {
    api(`/ref/products/FIRE/config?country=${COUNTRY}`).then(setConfig).catch(setError);
  }, []);

  const loadQuote = useCallback(async (id, token) => {
    const data = await api(`/quotes/${id}`, { quoteToken: token });
    setQuote(data.quote);
    setMessages(data.messages || []);
    return data.quote;
  }, []);

  // Resume a saved quote from its link.
  useEffect(() => {
    if (!config || loadedRef.current || !quoteRef.id) return;
    loadedRef.current = true;
    loadQuote(quoteRef.id, quoteRef.token).then((q) => {
      if (q.risk) {
        setRisk({ ...initialRisk(), ...q.risk });
        setGroup(config.occupancies.find((o) => o.code === q.risk.occupancy)?.group || '');
      }
      if (q.status === 'bound') setStep(5);
      else if (q.proposer || ['referred', 'info_requested', 'approved'].includes(q.status)) setStep(5);
      else if (q.rating) setStep(3);
    }).catch(setError);
  }, [config, quoteRef, loadQuote]);

  const ensureQuote = useCallback(async () => {
    if (quoteRef.id) return quoteRef;
    const created = await api('/quotes', { method: 'POST', body: { productCode: 'FIRE', countryCode: COUNTRY } });
    const ref = { id: created.quote.id, token: created.resumeToken };
    setQuoteRef(ref);
    loadedRef.current = true;
    router.replace(`/${locale}/fire?q=${ref.id}&t=${ref.token}`, { scroll: false });
    return ref;
  }, [quoteRef, router, locale]);

  // Live pricing: re-rate shortly after the risk changes, from the cover step on.
  useEffect(() => {
    if (step < 2 || step > 3 || !config || !risk.occupancy || !hasCover(risk)) return undefined;
    if (quote && ['referred', 'info_requested', 'bound', 'declined'].includes(quote.status)) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPricing(true);
      setError(null);
      try {
        const ref = await ensureQuote();
        const { quote: q } = await api(`/quotes/${ref.id}/risk`, { method: 'PUT', body: { risk: cleanRisk(risk) }, quoteToken: ref.token, signal: controller.signal });
        setQuote(q);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err);
      } finally {
        setPricing(false);
      }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risk, step, config]);

  if (!config) return <div className="container page">{error ? <ErrorNotice error={error} /> : t('common.loading')}</div>;

  const occupancy = config.occupancies.find((o) => o.code === risk.occupancy);
  const canContinue = [
    Boolean(occupancy) && occupancy.status !== 'decline',
    risk.locations.every((l) => l.address.building.trim() && l.address.area.trim()),
    hasCover(risk) && !pricing && quote?.rating?.quotable !== false,
    Boolean(quote?.rating?.quotable) && keyFactsRead && !pricing,
  ][step];

  const goTo = (n) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const maxLocations = user?.isBroker ? 50 : (config.settings.maxLocationsB2C || 5);

  return (
    <FieldScreen name={['fire.premise', 'fire.business', 'fire.cover', 'fire.quote', 'common.details', 'common.payment'][issued ? 5 : step]}>
      <Stepper steps={steps} current={issued ? steps.length : step} onSelect={issued || (quote && ['referred', 'info_requested', 'bound'].includes(quote.status)) ? null : goTo} />
      <div className="container page">
        <div className="with-aside">
          <div className="main">
            {issued ? <Issued result={issued} /> : null}
            {!issued && step === 0 ? <StepPremise config={config} risk={risk} setRisk={setRisk} group={group} setGroup={setGroup} /> : null}
            {!issued && step === 1 ? <StepBusiness config={config} risk={risk} setRisk={setRisk} maxLocations={maxLocations} /> : null}
            {!issued && step === 2 ? <StepCover config={config} risk={risk} setRisk={setRisk} currency={config.country.currency} /> : null}
            {!issued && step === 3 ? <StepQuote config={config} risk={risk} setRisk={setRisk} quote={quote} isBroker={user?.isBroker} keyFactsRead={keyFactsRead} setKeyFactsRead={setKeyFactsRead} /> : null}
            {!issued && step === 4 && quote ? <StepDetails quote={quote} quoteToken={quoteRef.token} onSaved={(q) => { setQuote(q); goTo(5); }} /> : null}
            {!issued && step === 5 && quote ? (
              <StepPayment quote={quote} quoteToken={quoteRef.token} messages={messages} onChanged={() => loadQuote(quoteRef.id, quoteRef.token)} onIssued={setIssued} />
            ) : null}

            <ErrorNotice error={error} />

            {!issued && step < 4 ? (
              <div className="spread">
                {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => goTo(step - 1)}>{t('common.back')}</button> : <span />}
                <button type="button" className="btn btn-primary" disabled={!canContinue} onClick={() => goTo(step + 1)}>{t('common.continue')}</button>
              </div>
            ) : null}
            {!issued && step === 4 ? <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => goTo(3)}>{t('common.back')}</button> : null}
          </div>
          {step >= 2 && !issued ? <PricePanel quote={quote} pricing={pricing} /> : null}
        </div>
      </div>
    </FieldScreen>
  );
}
