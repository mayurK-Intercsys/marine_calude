'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Documents from '@/components/Documents';
import { FieldScreen } from '@/lib/fieldConfig';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { date, isoToday } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Field, Money, StatusBadge } from '@/components/ui';
import { SumInsuredChange, EndorsementRequests, RenewalBox } from '@/components/policy/ChangePanels';
import { WorkforceChange, WageDeclaration } from '@/components/wc/WcPanels';
import { ProjectPanel, EquipmentChange, AnnualProjects } from '@/components/engineering/EngWizard';
import { InvoicesPanel, SickLeavePanel, ProjectEvents } from '@/components/more/Panels';

function ClaimForm({ policy, causes, onDone }) {
  const { t, pick } = useI18n();
  const [form, setForm] = useState({ lossDate: isoToday(), cause: causes[0]?.code || 'fire', description: '', estimate: '', authorityReportNo: '', locationIndex: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const body = { policyId: policy.id, lossDate: form.lossDate, cause: form.cause, description: form.description, locationIndex: Number(form.locationIndex), estimate: form.estimate ? Number(form.estimate) : undefined, authorityReportNo: form.authorityReportNo || undefined };
      setResult(await api('/claims', { method: 'POST', body }));
      onDone();
    } catch (err) { setError(err); }
  };

  if (result) return <div className="notice ok">{t('account.claimSubmitted')} <strong>{result.claimNo}</strong></div>;
  return (
    <form className="stack-sm" onSubmit={submit}>
      <p className="muted">{t('account.claimLead')}</p>
      <div className="grid-2">
        <Field id="lossDate" label={t('account.lossDate')}><input id="lossDate" type="date" className="input" value={form.lossDate} max={isoToday()} onChange={set('lossDate')} required /></Field>
        <Field id="cause" label={t('account.cause')}><select id="cause" className="input" value={form.cause} onChange={set('cause')}>{causes.map((c) => <option key={c.code} value={c.code}>{pick(c.name)}</option>)}</select></Field>
        <Field id="estimate" label={`${t('account.estimate')} (${policy.currency})`}><input id="estimate" className="input num-input" inputMode="decimal" value={form.estimate} onChange={set('estimate')} /></Field>
        <Field id="reportNo" label={`${t('account.reportNo')} (${t('common.optional')})`}><input id="reportNo" className="input" value={form.authorityReportNo} onChange={set('authorityReportNo')} /></Field>
      </div>
      <Field id="description" label={t('account.description')}><textarea id="description" className="input" value={form.description} onChange={set('description')} required minLength={5} /></Field>
      <ErrorNotice error={error} />
      <button className="btn btn-primary" style={{ justifySelf: 'start' }}>{t('common.submit')}</button>
    </form>
  );
}

function PolicyDetail({ id }) {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const [policy, setPolicy] = useState(null);
  const [causes, setCauses] = useState([]);
  const [productConfig, setProductConfig] = useState(null);
  const [fullConfig, setFullConfig] = useState(null);
  const [panel, setPanel] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [contact, setContact] = useState({});
  const [reason, setReason] = useState('');

  const load = useCallback(() => api(`/policies/${id}`).then(({ policy: p }) => { setPolicy(p); setContact({ contactName: p.proposer.contactName, email: p.proposer.email, mobile: p.proposer.mobile }); }).catch(setError), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!policy?.productCode) return;
    api(`/ref/products/${policy.productCode}/config?country=${policy.countryCode}`).then((c) => { setCauses(c.config.claimCauses); setProductConfig(c.config); setFullConfig(c); }).catch(() => {});
  }, [policy?.productCode, policy?.countryCode]);

  if (error && !policy) return <div className="container page"><ErrorNotice error={error} /></div>;
  if (!policy) return <div className="container page">{t('common.loading')}</div>;

  const changeDone = (text) => { setMessage(text); setPanel(null); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const changeOpen = policy.endorsementRequests.some((r) => ['referred', 'info_requested', 'approved'].includes(r.status));
  const isWc = policy.productCode === 'WC';
  const isEng = policy.productCode === 'ENG';
  const docTypes = policy.productCode === 'MARINE' ? ['certificate', 'invoice'] : isWc && policy.risk.policyType === 'named' ? ['schedule', 'certificate', 'annex', 'invoice'] : ['schedule', 'certificate', 'invoice'];
  const doc = (type) => `/api/policies/${policy.id}/documents/${type}?lang=${locale}`;
  const active = policy.status === 'active';

  const saveContact = async (e) => {
    e.preventDefault();
    setError(null);
    try { await api(`/policies/${policy.id}/endorsements`, { method: 'POST', body: { type: 'contact', data: contact } }); setMessage(t('account.contactSaved')); setPanel(null); load(); } catch (err) { setError(err); }
  };
  const cancel = async (e) => {
    e.preventDefault();
    setError(null);
    try { const r = await api(`/policies/${policy.id}/cancel`, { method: 'POST', body: { reason } }); setMessage(`${t('account.cancelled')} ${policy.currency} ${r.refundTotal}`); setPanel(null); load(); } catch (err) { setError(err); }
  };

  return (
    <div className="container page stack">
      <div className="spread">
        <div className="stack-sm"><h1>{policy.policyNo}</h1><span className="muted">{policy.proposer.companyName}{policy.broker ? ` · ${policy.broker.name}` : ''}</span></div>
        <StatusBadge status={policy.status} />
      </div>
      {message ? <div className="notice ok">{message}</div> : null}
      <section className="card">
        <div className="grid-3">
          <div className="stack-sm"><span className="hint">{t('account.period')}</span><span>{date(policy.inceptionDate, locale)} – {date(policy.expiryDate, locale)}</span></div>
          <div className="stack-sm"><span className="hint">{t('common.sumInsured')}</span><Money value={policy.sumInsured} currency={policy.currency} /></div>
          <div className="stack-sm"><span className="hint">{t('common.total')}</span><Money value={policy.total} currency={policy.currency} /></div>
        </div>
      </section>
      <section className="card stack-sm">
        <h2>{t('account.documents')}</h2>
        <div className="row">{docTypes.map((d) => <a key={d} className="btn btn-secondary" href={doc(d)} target="_blank" rel="noreferrer">{t(`fire.documents.${d}`)}</a>)}</div>
      </section>
      {active ? (
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => setPanel('claim')}>{t('account.reportClaim')}</button>
          {!changeOpen && isEng && !policy.risk.project && policy.risk.items?.length && fullConfig ? <button type="button" className="btn btn-secondary" onClick={() => setPanel('equipment')}>{t('eng.equipmentChange')}</button> : null}
          {!changeOpen && isWc && fullConfig ? <button type="button" className="btn btn-secondary" onClick={() => setPanel('workforce')}>{t('wc.workforceChange')}</button> : null}
          {!changeOpen && productConfig?.assetGroups ? <button type="button" className="btn btn-secondary" onClick={() => setPanel('si')}>{t('endorse.title')}</button> : null}
          <button type="button" className="btn btn-secondary" onClick={() => setPanel('contact')}>{t('account.changeContact')}</button>
          {user?.role !== 'broker_user' ? <button type="button" className="btn btn-secondary" onClick={() => setPanel('cancel')}>{t('account.cancelPolicy')}</button> : null}
        </div>
      ) : null}
      <RenewalBox policy={policy} />
      <EndorsementRequests policy={policy} onDone={changeDone} />
      <InvoicesPanel policy={policy} onDone={changeDone} />
      {isEng && policy.risk.productType === 'CAR_ANNUAL' && fullConfig ? <AnnualProjects policy={policy} config={fullConfig} onDone={changeDone} /> : null}
      {isEng && policy.risk.project ? <ProjectPanel policy={policy} onDone={changeDone} /> : null}
      {isEng && policy.risk.project ? <ProjectEvents policy={policy} onDone={changeDone} /> : null}
      {panel === 'equipment' && fullConfig ? <EquipmentChange policy={policy} config={fullConfig} onDone={changeDone} /> : null}
      {isWc && fullConfig ? <WageDeclaration policy={policy} config={fullConfig} onDone={changeDone} /> : null}
      {panel === 'workforce' && fullConfig ? <WorkforceChange policy={policy} config={fullConfig} onDone={changeDone} /> : null}
      {panel === 'si' && productConfig?.assetGroups ? <SumInsuredChange policy={policy} config={productConfig} onDone={changeDone} /> : null}
      {panel === 'claim' ? <section className="card stack"><h2>{t('account.claimTitle')}</h2><ClaimForm policy={policy} causes={causes} onDone={load} /></section> : null}
      {panel === 'contact' ? (
        <form className="card stack-sm" onSubmit={saveContact}>
          <h2>{t('account.changeContact')}</h2>
          <div className="grid-3">
            <Field id="contactName" label={t('fire.contactName')}><input id="contactName" className="input" value={contact.contactName || ''} onChange={(e) => setContact({ ...contact, contactName: e.target.value })} /></Field>
            <Field id="email" label={t('fire.email')}><input id="email" type="email" className="input" value={contact.email || ''} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
            <Field id="mobile" label={t('fire.mobile')}><input id="mobile" className="input" value={contact.mobile || ''} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} /></Field>
          </div>
          <ErrorNotice error={error} />
          <button className="btn btn-primary" style={{ justifySelf: 'start' }}>{t('common.save')}</button>
        </form>
      ) : null}
      {panel === 'cancel' ? (
        <form className="card stack-sm" onSubmit={cancel}>
          <h2>{t('account.cancelPolicy')}</h2>
          <Field id="cancelReason" label={t('account.cancelReason')}><input id="cancelReason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} /></Field>
          <ErrorNotice error={error} />
          <button className="btn btn-primary" style={{ justifySelf: 'start' }}>{t('account.cancelConfirm')}</button>
        </form>
      ) : null}
      {policy.claims.length ? (
        <section className="card stack-sm"><h2>{t('account.claims')}</h2>
          <table className="data"><tbody>{policy.claims.map((c) => <tr key={c.id}><td>{c.claimNo}</td><td>{date(c.lossDate, locale)}</td><td><StatusBadge status={c.status} /></td></tr>)}</tbody></table>
          {policy.claims.map((c) => <Documents key={`doc${c.id}`} entity="claim" entityId={c.id} title={`${t('docs.title')} – ${c.claimNo}`} />)}
          {isWc ? policy.claims.map((c) => <div key={`sl${c.id}`}><strong className="small">{c.claimNo}</strong><SickLeavePanel claimId={c.id} currency={policy.currency} named={policy.risk.policyType === 'named'} /></div>) : null}
        </section>
      ) : null}
      {policy.endorsements.length ? (
        <section className="card stack-sm"><h2>{t('account.endorsements')}</h2>
          <table className="data"><tbody>{policy.endorsements.map((e) => <tr key={e.no}><td>{e.no}</td><td>{e.type}</td><td className="num"><Money value={e.premiumDelta} currency={policy.currency} /></td><td>{date(e.createdAt, locale)}</td></tr>)}</tbody></table>
        </section>
      ) : null}
    </div>
  );
}

export default function PolicyPage({ params }) {
  const { id } = use(params);
  return <RequireRole roles={['customer', 'broker_admin', 'broker_user', 'ops', 'underwriter', 'uw_manager']}><FieldScreen name="policy.servicing"><PolicyDetail id={id} /></FieldScreen></RequireRole>;
}
