'use client';

import { useCallback, useEffect, useState } from 'react';
import { FieldScreen } from '@/lib/fieldConfig';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { date, isoToday } from '@/lib/format';
import { ErrorNotice, Field, Money, StatusBadge } from '@/components/ui';
import { ShipmentFields, ValueFields, MarinePriceLines, emptyShipment } from './ShipmentForm';
import { ApiKeysPanel } from '@/components/more/Panels';

const CSV_COLUMNS = ['productType', 'direction', 'commodity', 'description', 'packing', 'container', 'mode', 'originCountry', 'originPlace', 'destinationCountry', 'destinationPlace', 'sailingDate', 'incoterm', 'vesselName', 'vesselImo', 'invoiceCurrency', 'invoiceAmount', 'freight', 'invoiceNo', 'blNo'];

/** Minimal CSV parser (quoted fields, commas, newlines in quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function rowsToShipments(text) {
  const [header, ...data] = parseCsv(text.replace(/^\uFEFF/, ''));
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  return data.map((r) => {
    const v = (k) => (idx[k] != null ? (r[idx[k]] || '').trim() : '');
    return {
      productType: v('productType') || 'single', direction: v('direction') || 'import', commodity: v('commodity'), description: v('description'),
      packing: v('packing') || 'cartons', container: v('container') || 'fcl', mode: v('mode') || 'sea',
      origin: { country: v('originCountry'), place: v('originPlace') }, destination: { country: v('destinationCountry'), place: v('destinationPlace') },
      sailingDate: v('sailingDate'), incoterm: v('incoterm') || 'CIF', vessel: { name: v('vesselName'), imo: v('vesselImo') },
      invoice: { currency: v('invoiceCurrency') || 'USD', amount: Number(v('invoiceAmount')) || 0 }, freight: Number(v('freight')) || 0,
      invoiceNo: v('invoiceNo'), blNo: v('blNo'),
    };
  });
}

function IssueCertificate({ id, oc, config, onIssued }) {
  const { t } = useI18n();
  const first = oc.schedule[0];
  const [s, setS] = useState(() => ({ ...emptyShipment(oc.interest === 'inland' ? 'inland' : 'single'), commodity: first.commodity, clause: first.clause, direction: oc.interest === 'export' ? 'export' : 'import' }));
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const agreed = oc.schedule.find((r) => r.commodity === s.commodity);
  const shipment = () => { const { war, srcc, extensions, upliftPct, duty, ...rest } = s; return { ...rest, upliftPct, duty, clause: agreed?.clause }; };
  const run = async (fn) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e); } finally { setBusy(false); } };

  return (
    <FieldScreen name="marine.certificate">
    <section className="stack">
      <h2>{t('marine.dashboard.issueTitle')}</h2>
      <ShipmentFields config={config} value={s} onChange={(v) => { setS(v); setPreview(null); }} allowedCommodities={oc.schedule.map((r) => r.commodity)} />
      <ValueFields config={config} value={s} onChange={(v) => { setS(v); setPreview(null); }} fixedClause={agreed?.clause || null} warLocked />
      {preview ? (
        <div className="card">
          <MarinePriceLines breakdown={{ ...preview.breakdown, policyFee: 0 }} currency={preview.currency} sumInsured={preview.sumInsured} />
          {preview.referralRequired ? <div className="notice warn" style={{ marginTop: 10 }}>{t('fire.referralTitle')}</div> : null}
        </div>
      ) : null}
      <ErrorNotice error={error} />
      <div className="row">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(async () => setPreview(await api(`/open-covers/${id}/certificates/preview`, { method: 'POST', body: { shipment: shipment() } })))}>{t('marine.dashboard.preview')}</button>
        <button type="button" className="btn btn-primary" disabled={busy || !preview} onClick={() => run(async () => { const r = await api(`/open-covers/${id}/certificates`, { method: 'POST', body: { shipment: shipment() } }); onIssued(r); setPreview(null); })}>{t('marine.dashboard.issue')}</button>
      </div>
    </section>
    </FieldScreen>
  );
}

function BulkUpload({ id, onDone }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(`${CSV_COLUMNS.join(',')}\nsingle,import,ELEC_APPLIANCES,Kettles 500 cartons,pallets,fcl,sea,CN,Ningbo,AE,Jebel Ali,${isoToday()},CIF,MSC AURORA,9876543,USD,40000,0,INV-1,\n`)}`;
  const run = async () => {
    setError(null);
    try { const r = await api(`/open-covers/${id}/certificates/bulk`, { method: 'POST', body: { rows: rowsToShipments(text) } }); setResult(r); onDone(); } catch (e) { setError(e); }
  };
  return (
    <section className="card stack-sm">
      <h2>{t('marine.dashboard.bulkTitle')}</h2>
      <p className="muted">{t('marine.dashboard.bulkLead')}</p>
      <div className="row">
        <a className="btn btn-secondary" href={template} download="certificates_template.csv">{t('marine.dashboard.template')}</a>
        <label className="btn btn-secondary">{t('marine.dashboard.upload')}<input type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} /></label>
      </div>
      <textarea className="input json-editor" style={{ minHeight: 140 }} aria-label="CSV" value={text} onChange={(e) => setText(e.target.value)} placeholder={CSV_COLUMNS.join(',')} />
      <ErrorNotice error={error} />
      <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={!text.trim()} onClick={run}>{t('marine.dashboard.run')}</button>
      {result ? (
        <div className="stack-sm">
          <div className="row">{Object.entries(result.summary).map(([k, v]) => <span key={k} className="badge">{k}: {v}</span>)}</div>
          <div className="table-wrap"><table className="data"><tbody>{result.results.map((r) => (
            <tr key={r.row}><td className="num">{r.row}</td><td><StatusBadge status={r.status === 'error' ? 'rejected' : r.status === 'issued' ? 'active' : 'referred'} /></td><td>{r.certNo || r.code}</td><td className="small">{(r.reasons || []).map((x) => x.code).join(', ')}{Array.isArray(r.details) ? r.details.join('; ') : ''}</td></tr>
          ))}</tbody></table></div>
        </div>
      ) : null}
    </section>
  );
}

function Declarations({ id, oc, onDone }) {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [extra, setExtra] = useState('');
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/open-covers/${id}/declarations`).then((r) => setRows(r.declarations)).catch(setError), [id]);
  useEffect(() => { load(); }, [load]);
  const submit = async (period) => {
    setError(null);
    const extraShipments = extra.split('\n').map((l) => l.split(',')).filter((p) => p[0]?.trim()).map(([d, v]) => ({ description: d.trim(), sumInsured: Number(v) || 0 }));
    try { await api(`/open-covers/${id}/declarations`, { method: 'POST', body: { period, extraShipments } }); setExtra(''); load(); onDone(); } catch (e) { setError(e); }
  };
  const current = isoToday().slice(0, 7);
  return (
    <section className="card stack-sm">
      <h2>{t('marine.dashboard.declarations')}</h2>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t('marine.dashboard.period')}</th><th className="num">{t('marine.dashboard.certificates')}</th><th className="num">{t('common.sumInsured')}</th><th className="num">{t('common.premium')}</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.period}><td>{r.period}</td><td className="num">{r.certificates}</td><td className="num"><Money value={r.sumInsured} currency={oc.currency} /></td><td className="num"><Money value={r.premium} currency={oc.currency} /></td>
            <td>{r.submitted ? <span className="badge ok">{t('marine.dashboard.declared')}</span> : r.period < current ? <button type="button" className="btn btn-secondary" style={{ minHeight: 36 }} onClick={() => submit(r.period)}>{t('marine.dashboard.declare')}</button> : null}</td></tr>
        ))}</tbody>
      </table></div>
      <Field id="extra" label={t('marine.dashboard.extra')}><textarea id="extra" className="input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Courier samples, 12000" /></Field>
      <ErrorNotice error={error} />
    </section>
  );
}

function CertificateClaim({ id, cert, causes, onDone }) {
  const { t, pick } = useI18n();
  const [form, setForm] = useState({ lossDate: isoToday(), cause: 'damage', description: '', estimate: '', carrierReceipt: 'claused' });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api('/claims', { method: 'POST', body: { policyId: Number(id), certificateId: cert.id, lossDate: form.lossDate, cause: form.cause, description: form.description, estimate: form.estimate ? Number(form.estimate) : undefined, carrierReceipt: form.carrierReceipt } });
      onDone(`${t('account.claimSubmitted')} ${r.claimNo}`);
    } catch (err) { setError(err); }
  };
  return (
    <form className="card stack-sm" onSubmit={submit}>
      <h3>{t('marine.dashboard.claim')} · {cert.certNo}</h3>
      <div className="notice warn">{t('marine.dashboard.claimTip')}</div>
      <div className="grid-3">
        <Field id="cl" label={t('account.lossDate')}><input id="cl" type="date" className="input" max={isoToday()} value={form.lossDate} onChange={(e) => setForm({ ...form, lossDate: e.target.value })} /></Field>
        <Field id="cc" label={t('account.cause')}><select id="cc" className="input" value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })}>{causes.map((c) => <option key={c.code} value={c.code}>{pick(c.name)}</option>)}</select></Field>
        <Field id="cr" label={t('marine.dashboard.receipt')}><select id="cr" className="input" value={form.carrierReceipt} onChange={(e) => setForm({ ...form, carrierReceipt: e.target.value })}>{Object.entries(t('marine.dashboard.receipts')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field id="ce" label={`${t('account.estimate')} (${cert.currency})`}><input id="ce" className="input num-input" value={form.estimate} onChange={(e) => setForm({ ...form, estimate: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
      </div>
      <Field id="cd" label={t('account.description')}><textarea id="cd" className="input" required minLength={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <ErrorNotice error={error} />
      <button className="btn btn-primary" style={{ justifySelf: 'start' }}>{t('common.submit')}</button>
    </form>
  );
}

export default function OpenCoverDashboard({ id }) {
  const { t, pick, locale } = useI18n();
  const { user } = useSession();
  const [oc, setOc] = useState(null);
  const [certs, setCerts] = useState([]);
  const [config, setConfig] = useState(null);
  const [message, setMessage] = useState(null);
  const [claimFor, setClaimFor] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => Promise.all([api(`/open-covers/${id}`), api(`/open-covers/${id}/certificates`)])
    .then(([a, b]) => { setOc(a.openCover); setCerts(b.certificates); }).catch(setError), [id]);
  useEffect(() => { load(); api('/ref/products/MARINE/config?country=AE').then(setConfig).catch(setError); }, [load]);

  if (!oc || !config) return <div className="container page">{error ? <ErrorNotice error={error} /> : t('common.loading')}</div>;
  const name = (code) => pick(config.commodities.find((c) => c.code === code)?.name) || code;
  const done = (text) => { setMessage(text); setClaimFor(null); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const canAdjust = oc.adjustment.available && !oc.adjustment.done && (user?.isBroker || ['ops', 'uw_manager'].includes(user?.role));

  return (
    <div className="container page stack">
      <div className="spread">
        <div className="stack-sm"><h1>{t('marine.dashboard.title')} {oc.policyNo}</h1><span className="muted">{date(oc.inceptionDate, locale)} – {date(oc.expiryDate, locale)}</span></div>
        <div className="row"><StatusBadge status={oc.status} /><a className="btn btn-secondary" href={`/api/policies/${oc.policyId}/documents/schedule?lang=${locale}`} target="_blank" rel="noreferrer">{t('marine.dashboard.schedule')}</a></div>
      </div>
      {message ? <div className="notice ok">{message}</div> : null}
      <section className="card">
        <div className="grid-3">
          <div className="stack-sm">
            <span className="hint">{t('marine.dashboard.used')}</span>
            <strong><Money value={oc.turnoverUsed} currency={oc.currency} /> / <Money value={oc.estimatedTurnover} currency={oc.currency} /> · {oc.turnoverUsedPct}%</strong>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--line)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, oc.turnoverUsedPct)}%`, height: 10, background: oc.turnoverUsedPct >= 80 ? 'var(--action)' : 'var(--brand)' }} /></div>
          </div>
          <div className="stack-sm"><span className="hint">{t('marine.dashboard.perSending')}</span><strong><Money value={oc.perSendingLimit} currency={oc.currency} /></strong></div>
          <div className="stack-sm"><span className="hint">{t('marine.dashboard.basis')}</span><strong>{t(`marine.oc.bases.${oc.premiumBasis}`)}{oc.deposit ? <> · <Money value={oc.deposit} currency={oc.currency} /></> : null}</strong></div>
        </div>
        <div className="row small" style={{ marginTop: 12 }}>{oc.schedule.map((r) => <span key={r.commodity} className="badge">{name(r.commodity)} · {r.clause} · {(r.rate * 100).toFixed(3)}%</span>)}</div>
      </section>
      {oc.canIssue ? <IssueCertificate id={id} oc={oc} config={config} onIssued={(r) => done(r.status === 'issued' ? `${t('marine.dashboard.issued')} ${r.certNo}` : `${t('marine.dashboard.referredMsg')} ${r.certNo}`)} /> : null}
      {oc.canIssue ? <BulkUpload id={id} onDone={load} /> : null}
      <section className="card stack-sm">
        <h2>{t('marine.dashboard.certificates')} ({oc.certificatesIssued} · {t('marine.dashboard.referred')} {oc.certificatesReferred})</h2>
        <div className="table-wrap"><table className="data">
          <tbody>{certs.map((c) => (
            <tr key={c.id}>
              <td>{c.certNo}<div className="hint">{name(c.commodity)} · {c.origin.place} → {c.destination.place}</div></td>
              <td>{date(c.sailingDate, locale)}</td>
              <td className="num"><Money value={c.sumInsured} currency={c.currency} /></td>
              <td className="num"><Money value={c.total} currency={c.currency} /></td>
              <td><StatusBadge status={c.status === 'issued' ? 'active' : c.status} /></td>
              <td className="row">
                {c.status === 'issued' ? <a href={`/api/open-covers/${id}/certificates/${c.id}/document?lang=${locale}`} target="_blank" rel="noreferrer">{t('marine.dashboard.document')}</a> : null}
                {['issued', 'referred'].includes(c.status) && !c.declared && c.sailingDate > isoToday() ? <button type="button" className="btn-link" onClick={async () => { try { await api(`/open-covers/${id}/certificates/${c.id}/cancel`, { method: 'POST', body: {} }); done(t('marine.dashboard.cancelled')); } catch (e) { setError(e); } }}>{t('marine.dashboard.cancel')}</button> : null}
                {c.status === 'issued' ? <button type="button" className="btn-link" onClick={() => setClaimFor(c)}>{t('marine.dashboard.claim')}</button> : null}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      {claimFor ? <CertificateClaim id={id} cert={claimFor} causes={config.config.claimCauses} onDone={done} /> : null}
      <Declarations id={id} oc={oc} onDone={load} />
      {user && (user.isBroker || ['owner', 'admin'].includes(user.customerRole) || user.isStaff) ? <ApiKeysPanel ocId={id} /> : null}
      {oc.premiumBasis === 'deposit' ? (
        <section className="card stack-sm">
          <h2>{t('marine.dashboard.adjustment')}</h2>
          <div className="price-line"><span className="label">{t('marine.oc.depositDue')}</span><Money value={oc.deposit} currency={oc.currency} /></div>
          <div className="price-line"><span className="label">{t('marine.dashboard.certificates')}</span><Money value={oc.certificatePremium} currency={oc.currency} /></div>
          <div className="price-line total"><span>{t('marine.dashboard.adjustment')}</span><Money value={oc.adjustment.premiumDelta} currency={oc.currency} /></div>
          {canAdjust ? <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={async () => { try { const r = await api(`/open-covers/${id}/adjustment`, { method: 'POST' }); done(`${t('marine.dashboard.adjustmentDone')} ${r.endorsementNo}`); } catch (e) { setError(e); } }}>{t('marine.dashboard.adjust')}</button> : null}
        </section>
      ) : null}
      <ErrorNotice error={error} />
    </div>
  );
}
