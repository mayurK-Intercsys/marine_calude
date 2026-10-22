'use client';

import { createContext, useContext, useMemo } from 'react';

const I18nContext = createContext(null);

/** Provides the dictionary to client components. `t('fire.steps')` returns any value at that path. */
export function I18nProvider({ locale, dict, children }) {
  const value = useMemo(() => {
    const t = (path, fallback) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), dict) ?? fallback ?? path;
    /** Pick the right language from a { en, ar } object from the API. */
    const pick = (obj) => (obj && typeof obj === 'object' ? obj[locale] || obj.en || '' : obj ?? '');
    const errorText = (code) => dict.errors[code] || dict.common.error;
    return { locale, dict, t, pick, errorText, dir: locale === 'ar' ? 'rtl' : 'ltr' };
  }, [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
