'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import AdminShell from '@/components/admin/AdminShell';
import { ErrorNotice, Field } from '@/components/ui';

export default function UsersPage() {
  const { t, locale } = useI18n();
  const [data, setData] = useState(null);
  const [roles, setRoles] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [type, setType] = useState('staff');
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ email: '', name: '', roleId: '', brokerId: '' });
  const [secret, setSecret] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/platform/users?type=${type}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then(setData).catch(setError), [type, q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api('/platform/entities/roles').then((r) => setRoles(r.rows.filter((x) => x.active && x.base_role !== 'customer'))).catch(() => {});
    api('/platform/meta').then((m) => setBrokers(m.entities.commissionSchemes?.columns.find((c) => c.name === 'broker_id')?.options || [])).catch(() => {});
  }, []);
  const run = async (fn) => { setError(null); try { await fn(); load(); } catch (e) { setError(e); } };
  const selectedRole = roles.find((r) => String(r.id) === String(form.roleId));

  return (
    <AdminShell>
      <div className="stack">
        <div className="spread"><h1>{t('admin.users')}</h1>{data ? <span className="badge">{t('admin.seats')}: {data.seats.used} / {data.seats.max}</span> : null}</div>
        {secret ? <div className="notice warn">{t('admin.tempPassword')} <code dir="ltr">{secret}</code></div> : null}
        <ErrorNotice error={error} />
        <section className="card stack-sm">
          <h2>{t('admin.newUser')}</h2>
          <div className="grid-2">
            <Field id="ue" label={t('admin.email')}><input id="ue" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field id="un" label={t('admin.name')}><input id="un" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field id="ur" label={t('admin.role')}><select id="ur" className="input" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}><option value="">—</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name_en}</option>)}</select></Field>
            {selectedRole && selectedRole.base_role.startsWith('broker') ? <Field id="ub" label={t('admin.broker')}><select id="ub" className="input" value={form.brokerId} onChange={(e) => setForm({ ...form, brokerId: e.target.value })}><option value="">—</option>{brokers.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</select></Field> : null}
          </div>
          <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={!form.email || !form.name || !form.roleId} onClick={() => run(async () => {
            const r = await api('/platform/users', { method: 'POST', body: { email: form.email, name: form.name, roleId: Number(form.roleId), brokerId: form.brokerId ? Number(form.brokerId) : null } });
            setSecret(r.temporaryPassword);
            setForm({ email: '', name: '', roleId: '', brokerId: '' });
          })}>{t('admin.add')}</button>
        </section>
        <div className="row">
          <select className="input" style={{ maxWidth: 200 }} aria-label="type" value={type} onChange={(e) => setType(e.target.value)}><option value="staff">Staff and brokers</option><option value="customer">Customers</option></select>
          <input className="input" style={{ maxWidth: 260 }} aria-label={t('admin.search')} placeholder={t('admin.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {data ? (
          <section className="card"><div className="table-wrap"><table className="data">
            <thead><tr><th>{t('admin.name')}</th><th>{t('admin.email')}</th><th>{t('admin.role')}</th><th>{t('admin.broker')}</th><th /><th /></tr></thead>
            <tbody>{data.users.map((u) => (
              <tr key={u.id}>
                <td>{u.name || '—'}{u.lastLoginAt ? <div className="hint">{date(u.lastLoginAt, locale)}</div> : null}</td>
                <td dir="ltr">{u.email || u.mobile}</td>
                <td>{type === 'staff' ? (
                  <select aria-label={t('admin.role')} className="input" value={u.roleId || ''} onChange={(e) => run(() => api(`/platform/users/${u.id}`, { method: 'PUT', body: { roleId: Number(e.target.value) } }))}>
                    {roles.filter((r) => r.base_role.startsWith('broker') === u.role.startsWith('broker')).map((r) => <option key={r.id} value={r.id}>{r.name_en}</option>)}
                  </select>
                ) : u.roleName}</td>
                <td className="small">{u.broker || '—'}</td>
                <td><button type="button" className="btn-link" onClick={() => run(() => api(`/platform/users/${u.id}`, { method: 'PUT', body: { active: !u.active } }))}>{u.active ? t('admin.deactivate') : t('admin.activate')}</button></td>
                <td>{type === 'staff' ? <button type="button" className="btn-link" onClick={() => run(async () => setSecret((await api(`/platform/users/${u.id}/reset-password`, { method: 'POST' })).temporaryPassword))}>{t('admin.resetPassword')}</button> : null}</td>
              </tr>
            ))}</tbody>
          </table></div></section>
        ) : null}
      </div>
    </AdminShell>
  );
}
