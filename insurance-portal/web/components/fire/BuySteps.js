'use client';

import Link from 'next/link';
import { useState } from 'react';
import Documents from '@/components/Documents';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { isoInDays } from '@/lib/format';
import OtpSignIn from '@/components/OtpSignIn';
import { ErrorNotice, Field, Money, StatusBadge, Legend, PricingExtras } from '@/components/ui';

export function PricePanel({ quote, pricing }) {
  const { t, pick } = useI18n();
  const b = quote?.rating?.breakdown;
  const ref = quote?.rating?.referral;
  return (
    <aside className="aside" aria-live="polite">
      <div className="card">
        <div className="spread" style={{ marginBottom: 10 }}>
          <h2>{t('fire.breakdown')}</h2>
          {quote ? <StatusBadge status={quote.status} /> : null}
        </div>
        {!b ? <p className="muted">{pricing ? t('fire.pricing') : t('errors.RISK_INCOMPLETE')}</p> : (
          <>
            <div className="price-line"><span className="label">{t('common.sumInsured')}</span><Money value={quote.rating.sumInsured} currency={quote.currency} /></div>
            <div className="price-line"><span className="label">{t('fire.locationsPremium')}</span><Money value={b.locationsPremium} currency={quote.currency} /></div>
            {b.extensionsTotal > 0 ? <div className="price-line"><span className="label">{t('fire.extensions')}</span><Money value={b.extensionsTotal} currency={quote.currency} /></div> : null}
            {b.uwLoading ? <div className="price-line"><span className="label">{t('fire.uwLoading')}</span><Money value={b.uwLoading} currency={quote.currency} /></div> : null}
            {b.discount > 0 ? <div className="price-line"><span className="label">{t('fire.discountLine')}</span><span>− <Money value={b.discount} currency={quote.currency} /></span></div> : null}
            <div className="price-line" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 10 }}><span className="label">{t('common.premium')}</span><Money value={b.premium} currency={quote.currency} /></div>
            <div className="price-line"><span className="label">{t('common.policyFee')}</span><Money value={b.policyFee} currency={quote.currency} /></div>
            <div className="price-line"><span className="label">{t('common.vat')} {Math.round(b.vatRate * 100)}%</span><Money value={b.tax} currency={quote.currency} /></div>
            <PricingExtras breakdown={b} currency={quote.currency} />
            <div className="price-line total"><span>{t('common.total')}</span><Money value={b.total} currency={quote.currency} /></div>
            {b.minimumPremiumApplied ? <p className="hint">{t('fire.minimumApplied')}</p> : null}
            {pricing ? <p className="hint">{t('fire.pricing')}</p> : null}
          </>
        )}
      </div>
      {ref?.required ? (
        <div className="notice warn stack-sm">
          <strong>{t('fire.referralTitle')}</strong>
          <span>{t('fire.referralLead')}</span>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>{ref.reasons.map((r) => <li key={r.code}>{pick(r.description)}</li>)}</ul>
        </div>
      ) : null}
      {quote?.status === 'approved' ? <div className="notice ok"><strong>{t('fire.approvedTitle')}</strong>{quote.uwTerms?.warranty ? <p className="small">{quote.uwTerms.warranty}</p> : null}</div> : null}
    </aside>
  );
}

export function StepDetails({ quote, quoteToken, onSaved, fixedInception = null }) {
  const { t } = useI18n();
  const { user, refresh } = useSession();
  const risk = quote.risk || {};
  const saved = quote.proposer || {};
  const [form, setForm] = useState({
    companyName: saved.companyName || risk.business?.name || '',
    tradeLicence: saved.tradeLicence || risk.business?.tradeLicence || '',
    licenceExpiry: saved.licenceExpiry || '',
    taxNo: saved.taxNo || '',
    contactName: saved.contactName || '',
    contactIdNo: saved.contactIdNo || '',
    email: saved.email || user?.email || '',
    mobile: saved.mobile || user?.mobile || '',
    lossPayee: saved.lossPayee || '',
    inceptionDate: fixedInception || saved.inceptionDate || risk.inceptionDate || isoInDays(1),
    marketingConsent: Boolean(saved.marketingConsent),
  });
  const [decl, setDecl] = useState(saved.declarations || { truthful: false, noPreviousDecline: false, noOtherInsurance: false, screeningConsent: false, keyFactsRead: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user === undefined) return <p>{t('common.loading')}</p>;
  if (!user) {
    return (
      <section className="card stack">
        <h1>{t('fire.detailsTitle')}</h1>
        <p className="muted">{t('fire.signInToContinue')}</p>
        <OtpSignIn onSignedIn={refresh} />
      </section>
    );
  }
  if (user.isStaff) return <div className="notice warn">{t('errors.ROLE_NOT_ALLOWED')}</div>;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const allDeclared = decl.truthful && decl.screeningConsent && decl.keyFactsRead;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, taxNo: form.taxNo || undefined, lossPayee: form.lossPayee || undefined, declarations: decl };
      const { quote: updated } = await api(`/quotes/${quote.id}/proposer`, { method: 'PUT', body, quoteToken });
      onSaved(updated);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const text = (k, label, props = {}) => (
    <Field id={k} label={label}><input id={k} className="input" value={form[k]} onChange={set(k)} {...props} /></Field>
  );

  return (
    <form className="stack" onSubmit={submit}>
      <section className="card stack">
        <h1>{t('fire.detailsTitle')}</h1>
        <div className="grid-2">
          {text('companyName', t('fire.businessName'), { required: true })}
          {text('tradeLicence', t('fire.tradeLicence'), { required: true })}
          {text('licenceExpiry', t('fire.licenceExpiry'), { type: 'date', required: true })}
          {text('taxNo', `${t('fire.taxNo')} (${t('common.optional')})`)}
          {text('contactName', t('fire.contactName'), { required: true })}
          {text('contactIdNo', t('fire.contactIdNo'), { required: true })}
          {text('email', t('fire.email'), { type: 'email', required: true })}
          {text('mobile', t('fire.mobile'), { type: 'tel', required: true })}
          {fixedInception ? null : text('inceptionDate', t('fire.inceptionDate'), { type: 'date', required: true, min: isoInDays(0), max: isoInDays(60) })}
          {text('lossPayee', `${t('fire.lossPayee')} (${t('common.optional')})`)}
        </div>
      </section>
      <section className="card stack-sm">
        <h2>{t('fire.declarationsTitle')}</h2>
        {[['truthful', 'declTruthful'], ['noPreviousDecline', 'declNoDecline'], ['noOtherInsurance', 'declNoOther'], ['screeningConsent', 'declScreening'], ['keyFactsRead', 'declKeyFacts']].map(([k, label]) => (
          <label className="check" key={k}><input type="checkbox" checked={Boolean(decl[k])} onChange={(e) => setDecl({ ...decl, [k]: e.target.checked })} />{t(`fire.${label}`)}</label>
        ))}
        <label className="check"><input type="checkbox" checked={form.marketingConsent} onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })} />{t('fire.marketing')}</label>
      </section>
      <ErrorNotice error={error} />
      <button className="btn btn-primary" style={{ justifySelf: 'end' }} disabled={busy || !allDeclared}>{t('fire.saveDetails')}</button>
    </form>
  );
}

function ReferralBox({ quote, quoteToken, messages, onChanged }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const waiting = ['referred', 'info_requested'].includes(quote.status);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (waiting) await api(`/quotes/${quote.id}/referral/messages`, { method: 'POST', body: { body: note }, quoteToken });
      else await api(`/quotes/${quote.id}/referral`, { method: 'POST', body: { note }, quoteToken });
      setNote('');
      await onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <h1>{t('fire.referralTitle')}</h1>
      {waiting && quote.id ? <Documents entity="quote" entityId={quote.id} /> : null}
      {waiting ? <div className="notice info">{t('fire.referralSent')}</div> : <p className="muted">{t('fire.referralLead')}</p>}
      {messages?.length ? (
        <div className="thread">{messages.map((m) => <div key={m.id} className={`msg ${m.fromUnderwriter ? 'uw' : ''}`}><div className="hint">{m.author}</div>{m.body}</div>)}</div>
      ) : null}
      <Field id="referralNote" label={t('fire.referralNote')}><textarea id="referralNote" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorNotice error={error} />
      <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy || (waiting && !note.trim())} onClick={send}>{waiting ? t('common.submit') : t('fire.sendReferral')}</button>
    </section>
  );
}

export function StepPayment({ quote, quoteToken, messages, onChanged, onIssued }) {
  const { t } = useI18n();
  const { user } = useSession();
  const isBroker = user?.isBroker;
  const methods = isBroker ? ['broker_credit', 'card'] : ['card', 'wallet', 'bank_transfer'];
  const [method, setMethod] = useState(methods[0]);
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '' });
  const [autoRenew, setAutoRenew] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const needsReferral = (quote.status === 'quoted' && quote.rating?.referral?.required) || ['referred', 'info_requested'].includes(quote.status);
  if (needsReferral) return <ReferralBox quote={quote} quoteToken={quoteToken} messages={messages} onChanged={onChanged} />;
  if (quote.status === 'declined') return <div className="notice bad">{t('status.declined')}</div>;

  const pay = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { method, autoRenew, ...(method === 'card' ? { card } : {}) };
      const result = await api(`/quotes/${quote.id}/bind`, { method: 'POST', body, quoteToken });
      onIssued(result);
    } catch (err) {
      setError(err);
      if (['PRICE_CHANGED', 'REFERRAL_REQUIRED'].includes(err.code)) await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={pay}>
      <h1>{t('fire.payTitle')}: <Money value={quote.total} currency={quote.currency} /></h1>
      <fieldset>
        <Legend id="method">{t('fire.method')}</Legend>
        <div className="stack-sm">
          {methods.map((m) => <label className="choice" key={m}><input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />{t(`fire.methods.${m}`)}</label>)}
        </div>
      </fieldset>
      {method === 'card' ? (
        <>
          <div className="grid-3">
            <Field id="cardNumber" label={t('fire.cardNumber')}><input id="cardNumber" className="input num" inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} required /></Field>
            <Field id="cardExpiry" label={t('fire.cardExpiry')}><input id="cardExpiry" className="input num" autoComplete="cc-exp" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} required /></Field>
            <Field id="cardCvc" label={t('fire.cardCvc')}><input id="cardCvc" className="input num" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} required /></Field>
          </div>
          <p className="hint">{t('fire.testCards')}</p>
          {!isBroker ? <label className="check"><input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />{t('fire.autoRenew')}</label> : null}
        </>
      ) : null}
      <ErrorNotice error={error} />
      <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy}>{t('fire.payNow')}</button>
    </form>
  );
}

export function Issued({ result }) {
  const { t, locale } = useI18n();
  const { user } = useSession();
  if (result.status === 'payment_pending') {
    return <div className="card"><div className="notice info">{t('fire.pendingPayment')} <strong>{result.reference}</strong></div></div>;
  }
  const doc = (type) => `/api/policies/${result.policyId}/documents/${type}?lang=${locale}`;
  return (
    <section className="card stack" style={{ borderWidth: 2, borderColor: 'var(--ok)' }}>
      <h1>{t('fire.issuedTitle')}</h1>
      <p><strong className="num">{result.policyNo}</strong></p>
      <p className="muted">{t('fire.issuedLead')}</p>
      <div className="row">
        {['schedule', 'certificate', 'invoice'].map((d) => <a key={d} className="btn btn-secondary" href={doc(d)} target="_blank" rel="noreferrer">{t(`fire.documents.${d}`)}</a>)}
      </div>
      <Link className="btn btn-primary" style={{ justifySelf: 'start' }} href={result.openCover ? `/${locale}/open-covers/${result.policyId}` : user?.isBroker ? `/${locale}/broker` : `/${locale}/account/policies/${result.policyId}`}>{t('fire.goToPolicies')}</Link>
    </section>
  );
}
