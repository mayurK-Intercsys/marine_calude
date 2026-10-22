'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import AdminShell from '@/components/admin/AdminShell';

export default function AdminHome() {
  const { t, locale } = useI18n();
  const router = useRouter();
  useEffect(() => { router.replace(`/${locale}/admin/licence`); }, [router, locale]);
  return <AdminShell><p>{t('common.loading')}</p></AdminShell>;
}
