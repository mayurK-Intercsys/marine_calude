'use client';

import { use, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import AdminShell, { useAdminMeta } from '@/components/admin/AdminShell';
import EntityManager from '@/components/admin/EntityManager';
import { Field } from '@/components/ui';

function TestEmail() {
  const { t } = useI18n();
  const [to, setTo] = useState('');
  const [result, setResult] = useState(null);
  return (
    <section className="card stack-sm">
      <h2>{t('admin.testEmail')}</h2>
      <div className="row">
        <Field id="te" label={t('admin.email')}><input id="te" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <button type="button" className="btn btn-secondary" style={{ alignSelf: 'end' }} onClick={async () => { try { setResult(await api('/platform/email/test', { method: 'POST', body: { to } })); } catch (e) { setResult({ status: 'failed', error: e.message }); } }}>{t('admin.send')}</button>
      </div>
      {result ? <p>{t('admin.testResult')} <strong>{result.status}</strong> {result.error || ''}</p> : null}
    </section>
  );
}

export default function EntityPage({ params }) {
  const { entity } = use(params);
  const meta = useAdminMeta();
  const search = useSearchParams();
  return (
    <AdminShell>
      {meta?.entities?.[entity] ? <EntityManager key={`${entity}-${search.get('filter') || ''}`} name={entity} meta={meta.entities[entity]} initialFilter={search.get('filter') || ''} /> : null}
      {entity === 'templates' ? <TestEmail /> : null}
    </AdminShell>
  );
}
