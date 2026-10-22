'use client';

import { Suspense, useState } from 'react';
import { FieldScreen } from '@/lib/fieldConfig';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession, homeFor } from '@/lib/session';
import OtpSignIn from '@/components/OtpSignIn';
import { api } from '@/lib/api';
import { ErrorNotice, Field } from '@/components/ui';

function LoginInner() {
  const { t, locale } = useI18n();
  const { refresh } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'staff' ? 'staff' : 'customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');

  const done = async () => {
    const user = await refresh();
    router.push(next && next.startsWith(`/${locale}`) ? next : homeFor(user, locale));
  };

  const staffLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (r.user.mustChangePassword) { await refresh(); router.push(`/${locale}/account/password`); return; }
      await done();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 560 }}>
      <div className="card stack">
        <h1>{t('auth.title')}</h1>
        <div className="choices" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'customer'} className={`btn ${tab === 'customer' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('customer')}>{t('auth.customerTab')}</button>
          <button type="button" role="tab" aria-selected={tab === 'staff'} className={`btn ${tab === 'staff' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('staff')}>{t('auth.staffTab')}</button>
        </div>
        {tab === 'customer' ? (
          <OtpSignIn onSignedIn={done} />
        ) : (
          <form className="stack-sm" onSubmit={staffLogin}>
            <Field id="email" label={t('auth.email')}><input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field id="password" label={t('auth.password')}><input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <ErrorNotice error={error} />
            <button className="btn btn-primary" disabled={busy}>{t('auth.signIn')}</button>
            <p className="hint">{t('auth.demo')}</p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><FieldScreen name="auth.login"><LoginInner /></FieldScreen></Suspense>;
}
