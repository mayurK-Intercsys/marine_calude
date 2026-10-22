import en from './en';
import ar from './ar';

export const LOCALES = ['en', 'ar'];
const dictionaries = { en, ar };

export const isLocale = (l) => LOCALES.includes(l);
export const getDictionary = (locale) => dictionaries[locale] || en;
export const dirFor = (locale) => (locale === 'ar' ? 'rtl' : 'ltr');
