'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';

/** Warns administrators before the platform licence expires, and during the grace period. */
export default function LicenceBanner() {
  const { t } = useI18n();
  const [l, setL] = useState(null);
  useEffect(() => { api('/ui/licence-banner').then(setL).catch(() => {}); }, []);
  if (!l || (l.active && !l.inGrace && (l.daysLeft == null || l.daysLeft > 30))) return null;
  return (
    <div className="notice warn" style={{ borderRadius: 0, borderInline: 0 }}>
      <div className="container">{l.inGrace || !l.active ? t('admin.licenceGrace') : t('admin.licenceWarning').replace('{days}', l.daysLeft)}</div>
    </div>
  );
}
