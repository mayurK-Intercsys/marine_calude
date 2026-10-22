'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import AdminShell from '@/components/admin/AdminShell';
import { ErrorNotice, Money, StatusBadge } from '@/components/ui';

function Overview({ code }) {
  const { t, pick, locale } = useI18n();
  const [o, setO] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api(`/platform/products/${code}/overview`).then(setO).catch(setError); }, [code]);
  if (error) return <ErrorNotice error={error} />;
  if (!o) return null;
  const link = (entity, label, n) => <Link href={`/${locale}/admin/${entity}?filter=${code}`}>{label} ({n})</Link>;
  return (
    <section className="card stack-sm">
      <div className="spread">
        <div className="stack-sm"><h2>{pick(o.product.name)} <span className="hint">{o.product.code}</span></h2><span className="muted small">{o.product.lob ? pick(o.product.lob.name) : ''} · {pick(o.product.description)}</span></div>
        <StatusBadge status={o.product.status === 'active' ? 'active' : o.product.status} />
      </div>
      <div className="row small">{o.countries.map((c) => <span key={c.country_code} className={`badge ${c.enabled_b2c || c.enabled_b2b ? 'ok' : ''}`}>{c.country_code} {c.enabled_b2c ? 'B2C' : ''} {c.enabled_b2b ? 'B2B' : ''}</span>)}</div>
      <div className="grid-3 small">
        <div className="stack-sm">
          <strong>{link('productCovers', t('catalogue.covers'), o.covers.length)}</strong>
          {['basic', 'clause', 'optional'].map((k) => { const n = o.covers.filter((c) => c.cover_type === k); return n.length ? <span key={k}>{k}: {n.filter((c) => c.active).length}/{n.length}</span> : null; })}
        </div>
        <div className="stack-sm">
          <strong>{link('productDeductibles', t('catalogue.deductibles'), o.deductibles.length)}</strong>
          <strong>{link('premiumAdjustments', t('catalogue.adjustments'), o.adjustments.length)}</strong>
          <span>{o.adjustments.filter((a) => a.active).map((a) => a.code).join(', ') || '—'}</span>
        </div>
        <div className="stack-sm">
          <strong>{link('charges', t('catalogue.charges'), o.charges.length)}</strong>
          {o.charges.filter((c) => c.active).map((c) => <span key={c.id}>{c.code}: {c.charge_type === 'fixed' ? <Money value={c.amount} currency="AED" /> : `${c.percent * 100}%`}</span>)}
          <strong><Link href={`/${locale}/admin/taxes`}>{t('catalogue.taxes')} ({o.taxes.length})</Link></strong>
        </div>
      </div>
      <div className="row small">
        <Link href={`/${locale}/backoffice/rates`}>{t('catalogue.rates')} ({o.rateTables.length})</Link>
        <span>{t('catalogue.rules')}: {o.referralRules}</span>
        <Link href={`/${locale}/admin/products`}>{t('catalogue.manage')}</Link>
      </div>
    </section>
  );
}

export default function Catalogue() {
  const { t } = useI18n();
  const [codes, setCodes] = useState(null);
  useEffect(() => { api('/platform/entities/products').then((r) => setCodes(r.rows.map((p) => p.code))).catch(() => setCodes([])); }, []);
  return (
    <AdminShell>
      <div className="stack">
        <div className="stack-sm"><h1>{t('catalogue.title')}</h1><p className="muted">{t('catalogue.lead')}</p></div>
        {(codes || []).map((c) => <Overview key={c} code={c} />)}
      </div>
    </AdminShell>
  );
}
