'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Field } from '@/components/ui';

function Team() {
  const { t } = useI18n();
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ target: '', name: '', role: 'user', limit: '', canSeePremium: false });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/customers/users').then((r) => setUsers(r.users)).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  const update = async (id, patch) => { setError(null); try { await api(`/customers/users/${id}`, { method: 'PATCH', body: patch }); setMessage(t('more.saved')); load(); } catch (e) { setError(e); } };

  return (
    <div className="container page stack">
      <div className="stack-sm"><h1>{t('more.team')}</h1><p className="muted">{t('more.teamLead')}</p></div>
      {message ? <div className="notice ok">{message}</div> : null}
      <ErrorNotice error={error} />
      {users?.length ? (
        <section className="card"><div className="table-wrap"><table className="data">
          <thead><tr><th>{t('more.memberName')}</th><th>{t('more.target')}</th><th>{t('common.status')}</th><th className="num">{t('more.limit')}</th><th>{t('more.seePremium')}</th><th>{t('more.active')}</th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td dir="ltr">{u.mobile || u.email}</td>
              <td><select aria-label="role" className="input" value={u.role} onChange={(e) => update(u.id, { role: e.target.value })}><option value="user">{t('more.roleUser')}</option><option value="admin">{t('more.roleAdmin')}</option></select></td>
              <td><input aria-label={t('more.limit')} className="input num-input" defaultValue={u.certificateLimit ?? ''} onBlur={(e) => update(u.id, { certificateLimit: e.target.value ? Number(e.target.value) : null })} /></td>
              <td><input type="checkbox" aria-label={t('more.seePremium')} checked={u.canSeePremium} onChange={(e) => update(u.id, { canSeePremium: e.target.checked })} /></td>
              <td><input type="checkbox" aria-label={t('more.active')} checked={u.active} onChange={(e) => update(u.id, { active: e.target.checked })} /></td>
            </tr>
          ))}</tbody>
        </table></div></section>
      ) : null}
      <section className="card stack-sm">
        <h2>{t('more.addMember')}</h2>
        <div className="grid-3">
          <Field id="tt" label={t('more.target')}><input id="tt" className="input" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></Field>
          <Field id="tn" label={t('more.memberName')}><input id="tn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field id="tl" label={t('more.limit')}><input id="tl" className="input num-input" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
        </div>
        <div className="choices">
          <label className="choice"><input type="radio" name="r" checked={form.role === 'user'} onChange={() => setForm({ ...form, role: 'user' })} />{t('more.roleUser')}</label>
          <label className="choice"><input type="radio" name="r" checked={form.role === 'admin'} onChange={() => setForm({ ...form, role: 'admin' })} />{t('more.roleAdmin')}</label>
          <label className="choice"><input type="checkbox" checked={form.canSeePremium} onChange={(e) => setForm({ ...form, canSeePremium: e.target.checked })} />{t('more.seePremium')}</label>
        </div>
        <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={!form.target || form.name.length < 2} onClick={async () => {
          setError(null);
          try { await api('/customers/users', { method: 'POST', body: { target: form.target, name: form.name, role: form.role, certificateLimit: form.limit ? Number(form.limit) : null, canSeePremium: form.canSeePremium } }); setForm({ target: '', name: '', role: 'user', limit: '', canSeePremium: false }); setMessage(t('more.saved')); load(); } catch (e) { setError(e); }
        }}>{t('more.addMember')}</button>
      </section>
    </div>
  );
}

export default function TeamPage() {
  return <RequireRole roles={['customer']}><Team /></RequireRole>;
}
