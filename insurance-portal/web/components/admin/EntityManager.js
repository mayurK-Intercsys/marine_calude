'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { ErrorNotice, Field } from '@/components/ui';

const show = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
  return String(v).slice(0, 120);
};

function Input({ c, value, onChange }) {
  const id = `f-${c.name}`;
  const label = `${c.label}${c.required ? ' *' : ''}`;
  if (c.type === 'boolean') return <label className="check"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />{c.label}</label>;
  if (c.type === 'select') {
    const options = (c.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o || '—' }));
    return <Field id={id} label={label}><select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>;
  }
  if (c.type === 'textarea' || c.type === 'json') {
    const v = c.type === 'json' && value != null && typeof value !== 'string' ? JSON.stringify(value, null, 2) : (value ?? '');
    return <Field id={id} label={label} hint={c.hint}><textarea id={id} className={`input ${c.type === 'json' ? 'json-editor' : ''}`} style={c.type === 'json' ? { minHeight: 90 } : undefined} value={v} onChange={(e) => onChange(e.target.value)} /></Field>;
  }
  const type = c.type === 'number' ? 'text' : c.type === 'date' ? 'date' : 'text';
  const v = c.type === 'date' && value ? String(value).slice(0, 10) : (value ?? '');
  return <Field id={id} label={label} hint={c.hint}><input id={id} type={type} className={`input ${c.type === 'number' ? 'num-input' : ''}`} value={v} onChange={(e) => onChange(e.target.value)} /></Field>;
}

/** Generic list + form for any admin entity described by /api/platform/meta. */
export default function EntityManager({ name, meta, extraActions = null, initialFilter = '' }) {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const listCols = meta.columns.filter((c) => !['textarea', 'json'].includes(c.type) && !/_ar$/.test(c.name)).slice(0, 7);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(filter ? { filter } : {}) }).toString();
    api(`/platform/entities/${name}${qs ? `?${qs}` : ''}`).then((r) => setRows(r.rows)).catch(setError);
  }, [name, q, filter]);
  useEffect(() => { load(); }, [load]);

  const open = (row) => {
    setEditing(row ? row[meta.key] : 'new');
    setForm(row ? { ...row } : Object.fromEntries(meta.columns.filter((c) => c.type === 'boolean').map((c) => [c.name, true])));
    setMessage(null);
  };
  const save = async () => {
    setError(null);
    const body = Object.fromEntries(meta.columns.filter((c) => !c.readonly && !(editing !== 'new' && c.createOnly) && c.name in form).map((c) => [c.name, form[c.name]]));
    try {
      const r = editing === 'new'
        ? await api(`/platform/entities/${name}`, { method: 'POST', body })
        : await api(`/platform/entities/${name}/${encodeURIComponent(editing)}`, { method: 'PUT', body });
      setMessage(r?.status === 'pending_approval' ? t('changes.sent') : t('admin.saved'));
      setEditing(null);
      load();
    } catch (e) { setError(e); }
  };
  const remove = async (row) => {
    if (!window.confirm(t('admin.confirmDelete'))) return;
    setError(null);
    try { const r = await api(`/platform/entities/${name}/${encodeURIComponent(row[meta.key])}`, { method: 'DELETE' }); setMessage(r?.status === 'pending_approval' ? t('changes.sent') : t('admin.deleted')); load(); } catch (e) { setError(e); }
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>{meta.label}</h1>
        {!meta.readOnly && !meta.noCreate ? <button type="button" className="btn btn-primary" onClick={() => open(null)}>{t('admin.add')}</button> : meta.readOnly ? <span className="badge">{t('admin.readOnly')}</span> : null}
      </div>
      {message ? <div className="notice ok">{message}</div> : null}
      <ErrorNotice error={error} />
      <div className="row">
        <input className="input" style={{ maxWidth: 260 }} aria-label={t('admin.search')} placeholder={t('admin.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {meta.filter ? <input className="input" style={{ maxWidth: 260 }} aria-label={t('admin.filter')} placeholder={`${t('admin.filter')}: ${meta.filter}`} value={filter} onChange={(e) => setFilter(e.target.value)} /> : null}
      </div>
      {editing ? (
        <section className="card stack-sm">
          <h2>{editing === 'new' ? t('admin.add') : `${t('admin.edit')} ${editing}`}</h2>
          <div className="grid-2">
            {meta.columns.filter((c) => !c.readonly && !(editing !== 'new' && c.createOnly)).map((c) => (
              <div key={c.name} style={['textarea', 'json'].includes(c.type) ? { gridColumn: '1 / -1' } : undefined}><Input c={c} value={form[c.name]} onChange={(v) => setForm({ ...form, [c.name]: v })} /></div>
            ))}
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={save}>{t('admin.save')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>{t('admin.cancel')}</button>
          </div>
        </section>
      ) : null}
      {rows && !rows.length ? <p className="muted">{t('admin.empty')}</p> : null}
      {rows?.length ? (
        <section className="card"><div className="table-wrap"><table className="data">
          <thead><tr>{listCols.map((c) => <th key={c.name}>{c.label}</th>)}<th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r[meta.key]}>
              {listCols.map((c) => <td key={c.name} className="small">{show(r[c.name])}</td>)}
              <td className="row" style={{ flexWrap: 'nowrap' }}>
                {!meta.readOnly ? <button type="button" className="btn-link" onClick={() => open(r)}>{t('admin.edit')}</button> : null}
                {extraActions ? extraActions(r) : null}
                {!meta.readOnly && !meta.noDelete && !r.system ? <button type="button" className="btn-link" onClick={() => remove(r)}>{t('admin.delete')}</button> : null}
              </td>
            </tr>
          ))}</tbody>
        </table></div></section>
      ) : null}
    </div>
  );
}
