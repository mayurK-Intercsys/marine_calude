'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import Markdown from '@/components/Markdown';

export default function HelpArticle({ params }) {
  const { slug } = use(params);
  const { t, pick, locale } = useI18n();
  const [a, setA] = useState(undefined);
  useEffect(() => { api(`/ui/help/${slug}`).then((r) => setA(r.article)).catch(() => setA(null)); }, [slug]);
  return (
    <div className="container page stack" style={{ maxWidth: 860 }}>
      <Link href={`/${locale}/help`}>← {t('help.back')}</Link>
      {a === undefined ? <p>{t('common.loading')}</p> : a === null ? <div className="notice bad">{t('errors.FORBIDDEN')}</div> : (
        <article className="card stack"><span className="badge" style={{ justifySelf: 'start' }}>{a.category}</span><h1>{pick(a.title)}</h1><Markdown text={pick(a.body)} /></article>
      )}
    </div>
  );
}
