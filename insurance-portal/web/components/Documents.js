'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { ErrorNotice, Field } from '@/components/ui';

const kb = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Documents for a quote, policy, claim, referral or survey: checklist, uploads, downloads and review. */
export default function Documents({ entity, entityId, title }) {
  const { t, pick, locale } = useI18n();
  const { user } = useSession();
  const [data, setData] = useState(null);
  const [docType, setDocType] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const load = useCallback(() => api(`/documents?entity=${entity}&entityId=${entityId}`).then((d) => { setData(d); setDocType((x) => x || d.checklist.find((c) => !c.provided)?.docType || d.types[0]?.code || ''); }).catch(setError), [entity, entityId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return error ? <ErrorNotice error={error} /> : null;
  const reviewer = user?.permissions?.includes('documents.review');

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const form = new FormData();
      form.append('entity', entity);
      form.append('entityId', String(entityId));
      form.append('docType', docType);
      form.append('file', file);
      const res = await fetch('/api/documents', { method: 'POST', body: form, credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.error?.message || 'Upload failed'), { code: body.error?.code });
      fileRef.current.value = '';
      setMessage(t('docs.uploaded'));
      setDocType('');
      await load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const act = async (fn) => { setError(null); try { await fn(); await load(); } catch (e) { setError(e); } };

  return (
    <section className="card stack-sm">
      <h2>{title || t('docs.title')}</h2>
      {data.checklist.length ? (
        <div className="stack-sm">
          <strong className="small">{t('docs.required')}</strong>
          <ul style={{ margin: 0, paddingInlineStart: 0, listStyle: 'none' }} className="stack-sm">
            {data.checklist.map((c) => (
              <li key={c.docType} className="row small" style={{ gap: 8 }}>
                <span aria-hidden="true" className={`badge ${c.verified ? 'ok' : c.provided ? 'ok' : c.mandatory ? 'warn' : ''}`}>{c.provided ? '✓' : '•'}</span>
                <span><strong>{pick(c.name)}</strong>{c.note?.en ? ` – ${pick(c.note)}` : ''}{!c.mandatory ? ` (${t('docs.optional')})` : ''}</span>
                <span className="hint">{c.verified ? t('docs.verified') : c.provided ? t('docs.provided') : t('docs.missing')}</span>
              </li>
            ))}
          </ul>
          {data.complete ? <div className="notice ok small">{t('docs.complete')}</div> : null}
        </div>
      ) : null}
      {data.documents.length ? (
        <div className="table-wrap"><table className="data small"><tbody>{data.documents.map((d) => (
          <tr key={d.id}>
            <td><a href={`/api/documents/${d.id}/download`}>{d.fileName}</a><div className="hint">{pick(d.docTypeName)} · {kb(d.size)} · {date(d.createdAt, locale)}</div></td>
            <td><span className={`badge ${d.status === 'verified' ? 'ok' : d.status === 'rejected' ? 'bad' : ''}`}>{t(`docs.status.${d.status}`)}</span>{d.reviewNote ? <div className="hint">{d.reviewNote}</div> : null}</td>
            <td className="row" style={{ flexWrap: 'nowrap' }}>
              {reviewer && d.status === 'uploaded' ? (
                <>
                  <button type="button" className="btn-link" onClick={() => act(() => api(`/documents/${d.id}/review`, { method: 'POST', body: { status: 'verified' } }))}>{t('docs.verify')}</button>
                  <button type="button" className="btn-link" onClick={() => act(() => api(`/documents/${d.id}/review`, { method: 'POST', body: { status: 'rejected' } }))}>{t('docs.reject')}</button>
                </>
              ) : null}
              {(reviewer || (d.uploadedBy === user?.id && d.status === 'uploaded')) ? <button type="button" className="btn-link" onClick={() => act(() => api(`/documents/${d.id}`, { method: 'DELETE' }))}>{t('docs.remove')}</button> : null}
            </td>
          </tr>
        ))}</tbody></table></div>
      ) : null}
      {message ? <div className="notice ok small">{message}</div> : null}
      <ErrorNotice error={error} />
      <div className="grid-2">
        <Field id={`dt-${entity}-${entityId}`} label={t('docs.type')}>
          <select id={`dt-${entity}-${entityId}`} className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {data.types.map((ty) => <option key={ty.code} value={ty.code}>{pick(ty.name)}</option>)}
          </select>
        </Field>
        <Field id={`df-${entity}-${entityId}`} label={t('docs.file')}>
          <input id={`df-${entity}-${entityId}`} ref={fileRef} type="file" className="input" accept="application/pdf,image/jpeg,image/png" />
        </Field>
      </div>
      <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} disabled={busy || !docType} onClick={upload}>{t('docs.upload')}</button>
    </section>
  );
}
