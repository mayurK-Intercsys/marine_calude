'use client';

import { use, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

export default function VerifyPage({ params }) {
  const { policyNo } = use(params);
  const { t, pick, locale } = useI18n();
  const [result, setResult] = useState(undefined);

  useEffect(() => {
    api(`/verify/${encodeURIComponent(decodeURIComponent(policyNo))}`).then(setResult).catch(() => setResult(null));
  }, [policyNo]);

  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <div className="card stack">
        <h1>{t('verify.title')}</h1>
        {result === undefined ? <p>{t('common.loading')}</p> : result === null ? (
          <div className="notice bad">{t('verify.notFound')}</div>
        ) : (
          <>
            <div className={`notice ${result.valid ? 'ok' : 'bad'}`}>{result.valid ? t('verify.valid') : t('verify.invalid')}</div>
            <table className="data"><tbody>
              <tr><th>{t('account.policy')}</th><td>{result.policyNo}</td></tr>
              <tr><th>{t('broker.insured')}</th><td>{result.insured}</td></tr>
              <tr><th>{t('nav.home')}</th><td>{pick(result.product)}</td></tr>
              <tr><th>{t('account.period')}</th><td>{date(result.inceptionDate, locale)} – {date(result.expiryDate, locale)}</td></tr>
            </tbody></table>
          </>
        )}
      </div>
    </div>
  );
}
