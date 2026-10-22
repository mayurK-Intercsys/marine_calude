'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';

const ROUTES = { fire: '/fire', marine: '/marine', wc: '/wc', engineering: '/engineering' };

export default function HomePage() {
  const { t, locale } = useI18n();
  const [products, setProducts] = useState(null);

  useEffect(() => {
    api('/ref/products?country=AE').then(setProducts).catch(() => setProducts([]));
  }, []);

  const lines = ['fire', 'marine', 'wc', 'engineering'];
  const available = (line) => products?.find((p) => p.line === line)?.available && ROUTES[line];

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>{t('home.title')}</h1>
          <p>{t('home.lead')}</p>
        </div>
      </section>
      <section className="container page stack">
        <h2>{t('home.pick')}</h2>
        <div className="lines">
          {lines.map((line) => (
            <article key={line} className="card line-card">
              <h3>{t(`home.lines.${line}.title`)}</h3>
              <p className="muted">{t(`home.lines.${line}.body`)}</p>
              {available(line)
                ? <Link className="btn btn-primary" href={`/${locale}${ROUTES[line]}`}>{t('home.getQuote')}</Link>
                : <span className="badge">{t('home.comingSoon')}</span>}
            </article>
          ))}
        </div>
        <p><Link href={`/${locale}/login?tab=staff`}>{t('home.brokerCta')}</Link></p>
      </section>
    </>
  );
}
