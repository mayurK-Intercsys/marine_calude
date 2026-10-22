'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession, homeFor } from '@/lib/session';
import { api } from '@/lib/api';
import { ErrorNotice, Field } from '@/components/ui';

export default function ChangePassword() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const router = useRouter();
  const [form, setForm] = useState({ current: '', next: '' });
  const [error, setError] = useState(null);
  return (
    <div className="container page" style={{ maxWidth: 520 }}>
      <form className="card stack-sm" onSubmit={async (e) => { e.preventDefault(); setError(null); try { await api('/auth/change-password', { method: 'POST', body: form }); router.push(homeFor(user, locale)); } catch (err) { setError(err); } }}>
        <h1>{t('account2.changePassword')}</h1>
        <p className="muted">{t('account2.changeLead')}</p>
        <Field id="pc" label={t('account2.current')}><input id="pc" type="password" autoComplete="current-password" className="input" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required /></Field>
        <Field id="pn" label={t('account2.next')}><input id="pn" type="password" autoComplete="new-password" className="input" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required minLength={10} /></Field>
        <ErrorNotice error={error} />
        <button className="btn btn-primary">{t('account2.change')}</button>
      </form>
    </div>
  );
}
