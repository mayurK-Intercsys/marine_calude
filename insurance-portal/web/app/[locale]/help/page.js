'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';

export default function HelpIndex() {
  const { t, pick, locale } = useI18n();
  const { user } = useSession();
  const [articles, setArticles] = useState(null);
  const audience = !user || user.role === 'customer' ? 'customer' : user.isBroker ? 'broker' : 'staff';
  useEffect(() => { if (user !== undefined) api(`/ui/help?audience=${audience}`).then((r) => setArticles(r.articles)).catch(() => setArticles([])); }, [user, audience]);
  const groups = [...new Set((articles || []).map((a) => a.category))];
  return (
    <div className="container page stack" style={{ maxWidth: 860 }}>
      <div className="stack-sm"><h1>{t('help.title')}</h1><p className="muted">{t('help.lead')}</p></div>
      {groups.map((g) => (
        <section key={g} className="card stack-sm">
          <h2>{g}</h2>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>{articles.filter((a) => a.category === g).map((a) => <li key={a.slug}><Link href={`/${locale}/help/${a.slug}`}>{pick(a.title)}</Link></li>)}</ul>
        </section>
      ))}
    </div>
  );
}
