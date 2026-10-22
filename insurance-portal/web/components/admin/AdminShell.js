'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { ErrorNotice } from '@/components/ui';

/** Admin layout: sections shown according to the user's privileges. */
export default function AdminShell({ children }) {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const pathname = usePathname();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { if (user) api('/platform/meta').then(setMeta).catch(setError); }, [user]);

  if (user === undefined) return <div className="container page">{t('common.loading')}</div>;
  if (!user?.permissions?.includes('admin.access')) return <div className="container page"><div className="notice bad">{t('errors.FORBIDDEN')}</div></div>;
  const has = (p) => user.permissions.includes(p);
  const links = [
    ...(has('admin.products') ? [['catalogue', t('catalogue.title')]] : []),
    ...(has('admin.products') ? [['changes', t('changes.title')]] : []),
    ...(has('admin.rules') ? [['rules', t('engines.rules')]] : []),
    ...(has('admin.rating') ? [['rating', t('engines.rating')]] : []),
    ...(has('admin.users') ? [['users', t('admin.users')]] : []),
    ...(has('admin.roles') ? [['roles', t('admin.roles')]] : []),
    ...Object.entries(meta?.entities || {}).filter(([k]) => k !== 'roles').map(([k, e]) => [k, e.label]),
    ...(has('admin.commission') ? [['commissions', t('admin.commissions')]] : []),
    ['licence', t('admin.licence')],
    ...(has('admin.audit') ? [['audit', t('admin.audit')]] : []),
  ];
  return (
    <div className="container page">
      <div className="with-aside" style={{ flexDirection: 'row-reverse' }}>
        <div className="main">{error ? <ErrorNotice error={error} /> : children}</div>
        <aside className="aside" style={{ position: 'static' }}>
          <nav className="card stack-sm" aria-label={t('admin.sections')}>
            <h2>{t('admin.title')}</h2>
            {links.map(([k, label]) => {
              const href = `/${locale}/admin/${k}`;
              return <Link key={k} href={href} aria-current={pathname === href ? 'page' : undefined} style={{ fontWeight: pathname === href ? 700 : 400 }}>{label}</Link>;
            })}
          </nav>
        </aside>
      </div>
    </div>
  );
}

export const useAdminMeta = () => {
  const [meta, setMeta] = useState(null);
  useEffect(() => { api('/platform/meta').then(setMeta).catch(() => setMeta({ entities: {} })); }, []);
  return meta;
};
