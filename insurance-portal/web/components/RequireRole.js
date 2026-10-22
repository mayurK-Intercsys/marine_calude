'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';

/** Client-side gate for signed-in areas. The API enforces the same rules on every call. */
export default function RequireRole({ roles, children }) {
  const { user } = useSession();
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (user === null) router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}${roles.includes('customer') ? '' : '&tab=staff'}`);
  }, [user, router, locale, pathname, roles]);

  if (user === undefined || user === null) return <div className="container page">{t('common.loading')}</div>;
  if (!roles.includes(user.role)) return <div className="container page"><div className="notice bad">{t('errors.FORBIDDEN')}</div></div>;
  return children;
}
