'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Documents from '@/components/Documents';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Field, Money, StatusBadge } from '@/components/ui';
import { MarinePriceLines } from '@/components/marine/ShipmentForm';
import { ReferralSurveys } from '@/components/more/Panels';

function DecisionForm({ id, onDone }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ outcome: 'approve', loadingPct: '0', discountPct: '', deductible: '', warranty: '', reasonCode: '', note: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const decide = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/uw/referrals/${id}/decision`, {
        method: 'POST',
        body: {
          outcome: form.outcome, reasonCode: form.reasonCode, note: form.note || undefined, warranty: form.warranty || undefined,
          loadingPct: Number(form.loadingPct || 0), discountPct: form.discountPct === '' ? undefined : Number(form.discountPct), deductible: form.deductible || undefined,
        },
      });
      onDone();
    } catch (err) { setError(err); }
  };

  return (
    <form className="card stack-sm" onSubmit={decide}>
      <h2>{t('uw.decision')}</h2>
      <div className="choices">
        <label className="choice"><input type="radio" name="o" checked={form.outcome === 'approve'} onChange={() => setForm({ ...form, outcome: 'approve' })} />{t('uw.approve')}</label>
        <label className="choice"><input type="radio" name="o" checked={form.outcome === 'decline'} onChange={() => setForm({ ...form, outcome: 'decline' })} />{t('uw.decline')}</label>
      </div>
      {form.outcome === 'approve' ? (
        <>
          <Field id="ld" label={t('uw.loading')}><input id="ld" className="input num-input" value={form.loadingPct} onChange={set('loadingPct')} /></Field>
          <Field id="dp" label={t('uw.discountPct')}><input id="dp" className="input num-input" value={form.discountPct} onChange={set('discountPct')} /></Field>
          <Field id="dd" label={t('uw.deductible')}><select id="dd" className="input" value={form.deductible} onChange={set('deductible')}><option value="">—</option><option value="standard">standard</option><option value="high">high</option></select></Field>
          <Field id="wr" label={t('uw.warranty')}><textarea id="wr" className="input" value={form.warranty} onChange={set('warranty')} /></Field>
        </>
      ) : null}
      <Field id="rc" label={t('uw.reasonCode')}><input id="rc" className="input" value={form.reasonCode} onChange={set('reasonCode')} required minLength={2} /></Field>
      <Field id="nt" label={t('uw.note')}><textarea id="nt" className="input" value={form.note} onChange={set('note')} /></Field>
      <ErrorNotice error={error} />
      <button className="btn btn-primary">{t('uw.send')}</button>
    </form>
  );
}

function FactsTable({ facts }) {
  const { t } = useI18n();
  if (!facts) return null;
  return (
    <section className="card stack-sm">
      <h2>{t('uw.facts')}</h2>
      <div className="table-wrap"><table className="data"><tbody>
        {Object.entries(facts).map(([k, v]) => <tr key={k}><th>{k}</th><td className="num">{String(v)}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}

const address = (l) => [l.address?.building, l.address?.area, l.address?.city].filter(Boolean).join(', ');

function Detail({ id }) {
  const { t, pick, locale } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api(`/uw/referrals/${id}`).then(setData).catch(setError), [id]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="container page">{error ? <ErrorNotice error={error} /> : t('common.loading')}</div>;

  const { referral } = data;
  const open = ['open', 'info_requested'].includes(referral.status);
  const isEndorsement = data.kind === 'endorsement';
  const isCert = data.kind === 'certificate';
  const onPolicy = isEndorsement || isCert;
  const currency = onPolicy ? data.policy.currency : data.quote.currency;
  const title = isCert ? `${data.certificate.certNo}` : isEndorsement ? `${data.policy.policyNo} · ${t('endorse.title')}` : `${data.quote.ref}${data.kind === 'renewal' ? ` · ${t('renewal.badge')}` : ''}`;
  const insured = onPolicy ? data.policy.insured : (data.quote.proposer?.companyName || data.quote.risk?.business?.name || '—');
  const locations = isEndorsement ? data.endorsement.locations : isCert ? [] : data.quote.risk?.locations;
  const b = isCert ? data.certificate.breakdown : isEndorsement ? data.endorsement.breakdown : data.quote.rating?.breakdown;
  const ship = isCert ? data.certificate.shipment : (data.quote?.productCode === 'MARINE' ? data.quote.risk : null);
  const marine = Boolean(ship) || data.quote?.productCode === 'MARINE';

  const ask = async () => {
    setError(null);
    try { await api(`/uw/referrals/${id}/messages`, { method: 'POST', body: { body: msg, requestInfo: true } }); setMsg(''); load(); } catch (err) { setError(err); }
  };

  return (
    <div className="container page">
      <div className="with-aside">
        <div className="main">
          <div className="spread"><h1>{title}</h1><StatusBadge status={referral.status} /></div>
          <section className="card stack-sm">
            <h2>{t('uw.reasons')}</h2>
            <div className="row">{referral.reasons.map((r) => <span className="badge warn" key={r.code}>{r.code} · {pick(r.description)}</span>)}</div>
            <p className="hint">{t('uw.sla')}: {date(referral.slaDue, locale)}</p>
          </section>
          <section className="card stack-sm">
            <h2>{insured}</h2>
            <div className="table-wrap"><table className="data"><tbody>
              {isEndorsement ? (
                <>
                  <tr><th>{t('account.period')}</th><td>{date(data.policy.inceptionDate, locale)} – {date(data.policy.expiryDate, locale)}</td></tr>
                  <tr><th>{t('common.sumInsured')}</th><td><Money value={data.endorsement.currentSumInsured} currency={currency} /> → <strong><Money value={data.endorsement.newSumInsured} currency={currency} /></strong></td></tr>
                  <tr><th>{t('endorse.difference')}</th><td><Money value={Number(data.endorsement.premiumDelta) + Number(data.endorsement.taxDelta)} currency={currency} /></td></tr>
                </>
              ) : ship && ship.productType !== 'open_cover' ? (
                <>
                  <tr><th>{t('marine.commodity')}</th><td>{ship.commodity} · {ship.clause} · {ship.packing}</td></tr>
                  <tr><th>{t('marine.journey')}</th><td>{ship.origin?.place} ({ship.origin?.country}) → {ship.destination?.place} ({ship.destination?.country}) · {ship.mode} · {date(ship.sailingDate, locale)}</td></tr>
                  <tr><th>{t('marine.vesselName')}</th><td>{ship.vessel?.name || ship.conveyanceRef || '—'}</td></tr>
                  <tr><th>{t('common.sumInsured')}</th><td><Money value={isCert ? data.certificate.sumInsured : data.quote.rating?.sumInsured} currency={currency} /></td></tr>
                  {isCert ? <tr><th>{t('marine.dashboard.title')}</th><td>{data.policy.policyNo} · {t('marine.oc.perSending')} <Money value={data.policy.terms.perSendingLimit} currency={currency} /></td></tr> : null}
                </>
              ) : data.quote?.risk?.productType === 'open_cover' ? (
                <>
                  <tr><th>{t('marine.oc.turnover')}</th><td><Money value={data.quote.risk.estimatedTurnover} currency={currency} /> · {t('marine.oc.perSending')} <Money value={data.quote.risk.perSendingLimit} currency={currency} /></td></tr>
                  <tr><th>{t('marine.oc.schedule')}</th><td>{data.quote.risk.commodities.map((l) => `${l.commodity} ${l.clause} ${Math.round(l.share * 100)}%`).join(' · ')}</td></tr>
                </>
              ) : (
                <>
                  <tr><th>{t('fire.activity')}</th><td>{data.quote.risk?.occupancy}</td></tr>
                  <tr><th>{t('common.sumInsured')}</th><td><Money value={data.quote.rating?.sumInsured} currency={currency} /> · {data.quote.rating?.tier}</td></tr>
                </>
              )}
              {(locations || []).map((l, i) => (
                <tr key={i}><th>{t('fire.location')} {i + 1}</th><td>{address(l)} · {l.construction} · {l.floorLevel} · CD {l.civilDefence ? '✓' : '✗'} · {l.natcatZone}</td></tr>
              ))}
            </tbody></table></div>
          </section>
          <FactsTable facts={isCert ? data.certificate.facts : isEndorsement ? data.endorsement.facts : data.quote.rating?.facts} />
          <Documents entity="referral" entityId={Number(id)} />
          <ReferralSurveys referralId={id} />
          <section className="card stack-sm">
            <h2>{t('uw.messages')}</h2>
            <div className="thread">{data.messages.map((m) => <div key={m.id} className={`msg ${['underwriter', 'uw_manager'].includes(m.role) ? 'uw' : ''}`}><div className="hint">{m.author || '—'} · {date(m.at, locale)}</div>{m.body}</div>)}</div>
            {open ? (
              <div className="stack-sm">
                <textarea className="input" aria-label={t('uw.note')} value={msg} onChange={(e) => setMsg(e.target.value)} />
                <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={!msg.trim()} onClick={ask}>{t('uw.requestInfo')}</button>
              </div>
            ) : null}
          </section>
        </div>
        <aside className="aside">
          {b && marine ? <div className="card"><MarinePriceLines breakdown={b} currency={currency} sumInsured={isCert ? data.certificate.sumInsured : data.quote.rating?.sumInsured} /></div> : null}
          {b && !marine ? (
            <div className="card">
              <div className="price-line"><span className="label">{t('fire.locationsPremium')}</span><Money value={b.locationsPremium} currency={currency} /></div>
              <div className="price-line"><span className="label">{t('fire.extensions')}</span><Money value={b.extensionsTotal} currency={currency} /></div>
              <div className="price-line"><span className="label">{t('fire.uwLoading')}</span><Money value={b.uwLoading} currency={currency} /></div>
              <div className="price-line total"><span>{t('common.premium')}</span><Money value={b.premium} currency={currency} /></div>
            </div>
          ) : null}
          <div className="card small"><strong>{t('uw.authority')}</strong><div className="muted">SI ≤ {data.myAuthority.maxLocationSI ?? '∞'} · {t('fire.discountLine')} ≤ {data.myAuthority.maxDiscount ?? '∞'}</div></div>
          {open && !done ? <DecisionForm id={id} onDone={() => { setDone(true); load(); }} /> : null}
          {done ? <div className="notice ok">{t('uw.decided')}</div> : null}
          <ErrorNotice error={error} />
        </aside>
      </div>
    </div>
  );
}

export default function ReferralPage({ params }) {
  const { id } = use(params);
  return <RequireRole roles={['underwriter', 'uw_manager']}><Detail id={id} /></RequireRole>;
}
