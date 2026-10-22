'use client';

import { cloneElement, isValidElement } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { useFieldConfig } from '@/lib/fieldConfig';
import { money } from '@/lib/format';

const TONE = {
  active: 'ok', bound: 'ok', approved: 'ok', earned: 'ok', registered: 'ok',
  referred: 'warn', info_requested: 'warn', pending: 'warn', open: 'warn', clawback: 'warn', not_quotable: 'warn',
  declined: 'bad', cancelled: 'bad', expired: 'bad', rejected: 'bad',
};

export function StatusBadge({ status }) {
  const { t } = useI18n();
  return <span className={`badge ${TONE[status] || ''}`}>{t(`status.${status}`, status)}</span>;
}

export function Money({ value, currency }) {
  const { locale } = useI18n();
  return <span className="num">{money(value, currency, locale)}</span>;
}

export function ErrorNotice({ error }) {
  const { errorText } = useI18n();
  if (!error) return null;
  return <div className="notice bad" role="alert">{errorText(error.code || error)}</div>;
}

const INPUT_TYPES = ['text', 'number', 'email', 'tel', 'date'];

/** Tooltip: an accessible "i" button; the text shows on hover, focus or tap. */
export function Tip({ text, id }) {
  if (!text) return null;
  return (
    <span className="tip">
      <button type="button" className="tip-btn" aria-describedby={`${id}-tip`} aria-label={text}>i</button>
      <span role="tooltip" id={`${id}-tip`} className="tip-body">{text}</span>
    </span>
  );
}

function HelpLink({ slug }) {
  const { locale, t } = useI18n();
  if (!slug) return null;
  return <a className="small" href={`/${locale}/help/${slug}`} target="_blank" rel="noreferrer">{t('help.more')}</a>;
}

/**
 * Form field. When the surrounding screen has Admin field properties for this id, they apply:
 * label, tooltip, placeholder, visibility, mandatory, read-only, input type, limits, pattern, help.
 */
export function Field({ label, hint, id, children, error }) {
  const { pick, locale } = useI18n();
  const cfg = useFieldConfig(id);
  if (cfg && cfg.visible === false) return null;
  const text = (o) => (o && o[locale]) || null;
  const finalLabel = text(cfg?.label) || label;
  const tooltip = text(cfg?.tooltip);
  let control = children;
  if (cfg && isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type)) {
    const extra = {};
    if (cfg.mandatory) extra.required = true;
    if (cfg.readonly) { extra.readOnly = true; if (children.type === 'select') extra.disabled = true; }
    if (text(cfg.placeholder)) extra.placeholder = pick(cfg.placeholder);
    if (children.type === 'input') {
      if (cfg.pattern) extra.pattern = cfg.pattern;
      if (cfg.min != null && ['number', 'date'].includes(children.props.type)) extra.min = cfg.min;
      if (cfg.max != null && ['number', 'date'].includes(children.props.type)) extra.max = cfg.max;
      if (INPUT_TYPES.includes(cfg.type) && cfg.type !== 'text' && !children.props.type) extra.type = cfg.type;
      if (tooltip) extra['aria-describedby'] = `${id}-tip`;
    }
    control = cloneElement(children, extra);
  }
  return (
    <div className="field">
      <span className="field-label-row">
        <label htmlFor={id}>{finalLabel}{cfg?.mandatory ? <span aria-hidden="true" className="req"> *</span> : null}</label>
        <Tip text={tooltip} id={id} />
        <HelpLink slug={cfg?.help} />
      </span>
      {control}
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

/** Group legend (radio / checkbox groups) with the same configurable label, tooltip and help. */
export function Legend({ id, children }) {
  const { locale } = useI18n();
  const cfg = useFieldConfig(id);
  const label = (cfg?.label && cfg.label[locale]) || children;
  return (
    <legend className="legend field-label-row">
      <span>{label}</span>
      <Tip text={cfg?.tooltip && cfg.tooltip[locale]} id={id} />
      <HelpLink slug={cfg?.help} />
    </legend>
  );
}

export function Stepper({ steps, current, onSelect }) {
  return (
    <nav className="stepper" aria-label="Progress">
      <div className="container">
        <ol>
          {steps.map((label, i) => (
            <li key={label} className={i < current ? 'done' : ''} aria-current={i === current ? 'step' : undefined}>
              <span className="dot">{i + 1}</span>
              {i < current && onSelect ? <button type="button" className="btn-link" onClick={() => onSelect(i)}>{label}</button> : label}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

/** Automatic discounts / loadings and itemised fees and taxes from product configuration. */
export function PricingExtras({ breakdown, currency }) {
  const { t, pick } = useI18n();
  if (!breakdown) return null;
  const adj = breakdown.adjustments || [];
  const fees = (breakdown.fees || []).length > 1 ? breakdown.fees : [];
  const taxes = (breakdown.taxes || []).length > 1 ? breakdown.taxes : [];
  if (!adj.length && !fees.length && !taxes.length) return null;
  return (
    <div className="small" style={{ borderTop: '1px dashed var(--line)', marginTop: 6, paddingTop: 6 }}>
      {adj.length ? <div className="price-line"><span className="label">{t('pricing.rated')}</span><Money value={breakdown.ratedPremium} currency={currency} /></div> : null}
      {adj.map((a) => <div className="price-line" key={a.code}><span className="label">{pick(a.name)} ({a.kind === 'discount' ? '−' : '+'}{Math.round(a.percent * 1000) / 10}%)</span><Money value={a.amount} currency={currency} /></div>)}
      {fees.map((f) => <div className="price-line" key={f.code}><span className="label">{t('pricing.ofWhich')} {pick(f.name)}</span><Money value={f.amount} currency={currency} /></div>)}
      {taxes.map((x) => <div className="price-line" key={x.code}><span className="label">{t('pricing.ofWhich')} {pick(x.name)} {Math.round(x.rate * 1000) / 10}%</span><Money value={x.amount} currency={currency} /></div>)}
    </div>
  );
}
