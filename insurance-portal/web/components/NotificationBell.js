'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';

/** In-app notifications for the signed-in user, refreshed every minute. */
export default function NotificationBell() {
  const { t } = useI18n();
  const [data, setData] = useState({ unread: 0, notifications: [] });
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api('/ui/notifications').then(setData).catch(() => {}), []);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="btn-link" aria-label={t('account2.notifications')} aria-expanded={open} onClick={() => setOpen(!open)} style={{ textDecoration: 'none' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0" /></svg>
        {data.unread ? <span className="badge warn" style={{ marginInlineStart: 2 }}>{data.unread}</span> : null}
      </button>
      {open ? (
        <div className="card stack-sm" style={{ position: 'absolute', insetInlineEnd: 0, top: 32, width: 320, zIndex: 20, padding: 14, maxHeight: 420, overflowY: 'auto' }}>
          <div className="spread"><strong>{t('account2.notifications')}</strong>{data.unread ? <button type="button" className="btn-link small" onClick={async () => { await api('/ui/notifications/read', { method: 'POST', body: {} }); load(); }}>{t('account2.markAllRead')}</button> : null}</div>
          {data.notifications.length ? data.notifications.map((n) => (
            <div key={n.id} className="msg" style={{ opacity: n.read ? 0.7 : 1 }}>
              <div style={{ fontWeight: n.read ? 400 : 600 }}>{n.link ? <Link href={n.link}>{n.title}</Link> : n.title}</div>
              <div className="small muted">{n.body}</div>
            </div>
          )) : <p className="muted small">{t('account2.noNotifications')}</p>}
        </div>
      ) : null}
    </div>
  );
}
