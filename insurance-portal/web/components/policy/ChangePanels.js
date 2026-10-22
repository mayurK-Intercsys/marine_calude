'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { ErrorNotice, Field, Money } from '@/components/ui';
import PaymentFields, { paymentBody } from './PaymentFields';

/** Sum-insured change: preview the pro-rata price, then pay and apply, or send for review. */
export function SumInsuredChange({ policy, config, onDone }) {
  const { t, pick } = useI18n();
  const { user } = useSession();
  const [locations, setLocations] = useState(() => JSON.parse(JSON.stringify(policy.risk.locations)));
  const [preview, setPreview] = useState(null);
  const [payment, setPayment] = useState({});
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const groups = config.assetGroups;

  const setSI = (i, code, raw) => {
    const v = raw.replace(/[^\d.]/g, '');
    setLocations(locations.map((l, j) => (j === i ? { ...l, sumsInsured: { ...l.sumsInsured, [code]: v === '' ? undefined : Number(v) } } : l)));
    setPreview(null);
  };
  const clean = () => locations.map((l) => ({ ...l, sumsInsured: Object.fromEntries(Object.entries(l.sumsInsured || {}).filter(([, v]) => Number(v) > 0)) }));

  const run = async (fn) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e); } finally { setBusy(false); } };
  const doPreview = () => run(async () => setPreview(await api(`/policies/${policy.id}/endorsements/preview`, { method: 'POST', body: { locations: clean() } })));
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { type: 'sum_insured', locations: clean() };
      if (preview.referralRequired) body.note = note || undefined;
      else if (preview.totalDelta > 0) body.payment = paymentBody(payment, policy.hasSavedCard, user?.isBroker);
      const r = await api(`/policies/${policy.id}/endorsements`, { method: 'POST', body });
      onDone(r.status === 'referred' ? t('endorse.sent') : `${t('endorse.applied')} ${r.endorsementNo}`);
    });
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="stack-sm"><h2>{t('endorse.title')}</h2><p className="muted">{t('endorse.lead')}</p></div>
      {locations.map((loc, i) => (
        <div key={i}>
          <h3>{t('fire.location')} {i + 1}: {loc.address?.building}</h3>
          {groups.map((g) => (
            <div className="asset" key={g.code}>
              <div>{pick(g.name)}</div>
              <input aria-label={pick(g.name)} className="input num-input" inputMode="decimal" value={loc.sumsInsured?.[g.code] ?? ''} onChange={(e) => setSI(i, g.code, e.target.value)} />
            </div>
          ))}
        </div>
      ))}
      {!preview ? <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={busy} onClick={doPreview}>{t('endorse.preview')}</button> : (
        <div className="stack-sm">
          <div className="price-line"><span className="label">{t('endorse.newTotalSI')}</span><Money value={preview.newSumInsured} currency={preview.currency} /></div>
          <div className="price-line total"><span>{t('endorse.difference')}</span><Money value={preview.totalDelta} currency={preview.currency} /></div>
          {preview.referralRequired ? (
            <>
              <div className="notice warn">{t('endorse.needsReview')}<ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{preview.reasons.map((r) => <li key={r.code}>{pick(r.description)}</li>)}</ul></div>
              <Field id="enote" label={t('endorse.note')}><textarea id="enote" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy}>{t('endorse.send')}</button>
            </>
          ) : (
            <>
              {preview.totalDelta > 0 ? <PaymentFields value={payment} onChange={setPayment} hasSavedCard={policy.hasSavedCard} /> : null}
              <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy}>{preview.totalDelta > 0 ? t('endorse.apply') : t('endorse.applyRefund')}</button>
            </>
          )}
        </div>
      )}
      <ErrorNotice error={error} />
    </form>
  );
}

/** Policy changes waiting on the underwriter or on the customer. */
export function EndorsementRequests({ policy, onDone }) {
  const { t, pick, locale } = useI18n();
  const { user } = useSession();
  const [payment, setPayment] = useState({});
  const [reply, setReply] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const open = policy.endorsementRequests.filter((r) => ['referred', 'info_requested', 'approved'].includes(r.status));
  if (!open.length) return null;

  const run = async (fn) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e); } finally { setBusy(false); } };
  const accept = (r) => run(async () => {
    const res = await api(`/policies/${policy.id}/endorsement-requests/${r.id}/accept`, { method: 'POST', body: { payment: paymentBody(payment, policy.hasSavedCard, user?.isBroker) } });
    onDone(`${t('endorse.applied')} ${res.endorsementNo}`);
  });
  const send = (r) => run(async () => {
    await api(`/policies/${policy.id}/endorsement-requests/${r.id}/messages`, { method: 'POST', body: { body: reply } });
    setReply('');
    onDone(t('endorse.sent'));
  });

  return (
    <section className="card stack">
      <h2>{t('endorse.requests')}</h2>
      {open.map((r) => (
        <div key={r.id} className="stack-sm">
          <div className="spread"><strong>{t('endorse.title')} · {date(r.createdAt, locale)}</strong><span className={`badge ${r.status === 'approved' ? 'ok' : 'warn'}`}>{t(`endorse.statuses.${r.status}`)}</span></div>
          <div className="small muted">{(r.reasons || []).map((x) => pick(x.description)).join(' · ')}</div>
          {r.status === 'approved' ? (
            <>
              <div className="price-line"><span className="label">{t('endorse.newTotalSI')}</span><Money value={r.newSumInsured} currency={policy.currency} /></div>
              <div className="price-line total"><span>{t('endorse.difference')}</span><Money value={Number(r.premiumDelta) + Number(r.taxDelta)} currency={policy.currency} /></div>
              {r.warranty ? <div className="notice info">{t('endorse.approvedTerms')} {r.warranty}</div> : null}
              <PaymentFields value={payment} onChange={setPayment} hasSavedCard={policy.hasSavedCard} />
              <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => accept(r)}>{t('endorse.accept')}</button>
            </>
          ) : (
            <>
              <Field id={`rep${r.id}`} label={t('endorse.reply')}><textarea id={`rep${r.id}`} className="input" value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
              <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={busy || !reply.trim()} onClick={() => send(r)}>{t('common.submit')}</button>
            </>
          )}
        </div>
      ))}
      <ErrorNotice error={error} />
    </section>
  );
}

export function RenewalBox({ policy }) {
  const { t, locale } = useI18n();
  if (policy.renewedFromPolicyId) return null;
  const r = policy.renewal;
  if (!r && !policy.autoRenew) return null;
  return (
    <section className="card stack-sm">
      <h2>{t('renewal.title')}</h2>
      {policy.autoRenew && (!r || r.status !== 'bound') ? <p>{t('renewal.autoOn')}</p> : null}
      {r && r.status === 'bound' ? <div className="notice ok">{t('renewal.done')}</div> : null}
      {r && ['referred', 'info_requested'].includes(r.status) ? <div className="notice warn">{t('renewal.referred')}</div> : null}
      {r && ['quoted', 'approved'].includes(r.status) ? (
        <div className="spread">
          <span>{t('renewal.ready')} {t('renewal.from')} {date(r.inceptionDate, locale)} · <Money value={r.total} currency={policy.currency} /></span>
          <Link className="btn btn-primary" href={`/${locale}/fire?q=${r.quoteId}`}>{t('renewal.renewNow')}</Link>
        </div>
      ) : null}
    </section>
  );
}
