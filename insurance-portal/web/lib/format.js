const DECIMALS = { AED: 2, SAR: 2, QAR: 2, OMR: 3, BHD: 3, KWD: 3 };

export function money(amount, currency = 'AED', locale = 'en') {
  if (amount == null || amount === '') return '—';
  const d = DECIMALS[currency] ?? 2;
  const n = Number(amount).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-AE', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${currency} ${n}`;
}

export function date(value, locale = 'en') {
  if (!value) return '—';
  const d = typeof value === 'string' && value.length === 10 ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return d.toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const isoToday = () => new Date().toISOString().slice(0, 10);
export const isoInDays = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
