'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { ErrorNotice, Field } from '@/components/ui';

/** One-time code sign-in for customers (mobile or email). Used on the login page and inside the quote journey. */
export default function OtpSignIn({ onSignedIn, initialTarget = '' }) {
  const { t, locale } = useI18n();
  const [target, setTarget] = useState(initialTarget);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const request = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await api('/auth/otp/request', { method: 'POST', body: { target } }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/otp/verify', { method: 'POST', body: { target, code, locale } });
      await onSignedIn?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return sent ? (
    <form className="stack-sm" onSubmit={verify}>
      <p className="muted">{t('auth.codeSent')}</p>
      {sent.devCode ? <p className="notice info">{t('auth.devCode')} <strong className="num">{sent.devCode}</strong></p> : null}
      <Field id="otp" label={t('auth.code')}><input id="otp" className="input num" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required /></Field>
      <ErrorNotice error={error} />
      <div className="row">
        <button className="btn btn-primary" disabled={busy || code.length !== 6}>{t('auth.verify')}</button>
        <button type="button" className="btn-link" onClick={() => { setSent(null); setCode(''); }}>{t('common.back')}</button>
      </div>
    </form>
  ) : (
    <form className="stack-sm" onSubmit={request}>
      <Field id="target" label={t('auth.mobileOrEmail')}><input id="target" className="input" autoComplete="tel" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="+971 50 123 4567" required /></Field>
      <ErrorNotice error={error} />
      <button className="btn btn-primary" disabled={busy}>{t('auth.sendCode')}</button>
    </form>
  );
}
