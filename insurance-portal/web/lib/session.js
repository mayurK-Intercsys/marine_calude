'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api('/auth/me');
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return <SessionContext.Provider value={{ user, loading: user === undefined, refresh, signOut }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** Where each role lands after signing in. */
export function homeFor(user, locale) {
  if (!user) return `/${locale}`;
  if (user.role === 'customer') return `/${locale}/account`;
  if (user.role === 'broker_admin' || user.role === 'broker_user') return `/${locale}/broker`;
  if (user.role === 'config_admin') return `/${locale}/backoffice/rates`;
  if (user.role === 'ops') return `/${locale}/backoffice/payments`;
  if (user.role === 'risk_engineer') return `/${locale}/backoffice/surveys`;
  return `/${locale}/backoffice/referrals`;
}
