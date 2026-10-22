'use client';

import { useI18n } from '@/lib/i18n/client';
import { Money } from '@/components/ui';

/**
 * Lightweight SVG charts (no library). Each chart is a <figure> with a caption, an accessible
 * label and a data table for screen readers. Colours come from the theme variables.
 */
const PALETTE = ['var(--brand)', '#2a9d8f', '#e9a23b', '#8e5ea2', '#d1495b', '#5c7fa3'];
const fmt = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));
const monthLabel = (m, locale) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', { month: 'short', timeZone: 'UTC' });

function SrTable({ head, rows }) {
  return (
    <table className="sr-only"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table>
  );
}

export function KpiGrid({ items }) {
  return (
    <div className="kpi-grid">
      {items.map((k) => (
        <div key={k.label} className="kpi card">
          <span className="kpi-label">{k.label}</span>
          <span className="kpi-value">{k.money ? <Money value={k.value} currency={k.currency || 'AED'} /> : k.suffix ? `${k.value}${k.suffix}` : k.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Monthly bars; `series` = [{ month, values: [n, ...] }] with one or two values per month. */
export function MonthBars({ title, series, names = [''] }) {
  const { locale } = useI18n();
  const W = 600; const H = 200; const P = 28;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const slot = (W - P) / series.length;
  const bw = Math.min(26, (slot - 6) / names.length);
  const empty = series.every((s) => s.values.every((v) => !v));
  return (
    <figure className="card chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={P} x2={W} y1={H - f * (H - 10)} y2={H - f * (H - 10)} stroke="var(--line)" /><text x={P - 4} y={H - f * (H - 10) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{fmt(max * f)}</text></g>)}
        {series.map((s, i) => (
          <g key={s.month}>
            {s.values.map((v, k) => {
              const h = (v / max) * (H - 10);
              return <rect key={k} x={P + i * slot + (slot - bw * names.length) / 2 + k * bw} y={H - h} width={bw - 2} height={h} rx="2" fill={PALETTE[k]}><title>{`${monthLabel(s.month, locale)} ${names[k]} ${v}`}</title></rect>;
            })}
            <text x={P + i * slot + slot / 2} y={H + 16} textAnchor="middle" fontSize="10" fill="var(--muted)">{monthLabel(s.month, locale)}</text>
          </g>
        ))}
        {empty ? <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--muted)">—</text> : null}
      </svg>
      {names.length > 1 ? <div className="legend-row">{names.map((n, k) => <span key={n}><i style={{ background: PALETTE[k] }} />{n}</span>)}</div> : null}
      <SrTable head={['', ...names]} rows={series.map((s) => [s.month, ...s.values])} />
    </figure>
  );
}

/** Share of a whole; `items` = [{ label, value }]. */
export function Donut({ title, items, currency }) {
  const total = items.reduce((s, x) => s + x.value, 0);
  let angle = -Math.PI / 2;
  const R = 70; const r = 44; const C = 90;
  const arc = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, a) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
    return `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
  };
  return (
    <figure className="card chart">
      <figcaption>{title}</figcaption>
      <div className="donut-wrap">
        <svg viewBox="0 0 180 180" role="img" aria-label={title} style={{ maxWidth: 180 }}>
          {total ? items.map((x, i) => {
            const a0 = angle; const a1 = angle + (x.value / total) * Math.PI * 2 - (items.length === 1 ? 0.0001 : 0);
            angle = a1;
            return <path key={x.label} d={arc(a0, a1)} fill={PALETTE[i % PALETTE.length]}><title>{`${x.label}: ${x.value}`}</title></path>;
          }) : <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="var(--line)" strokeWidth={R - r} />}
        </svg>
        <ul className="legend-list">{items.map((x, i) => <li key={x.label}><i style={{ background: PALETTE[i % PALETTE.length] }} />{x.label}<span>{currency ? <Money value={x.value} currency={currency} /> : x.value}{total ? ` · ${Math.round((x.value / total) * 100)}%` : ''}</span></li>)}</ul>
      </div>
      <SrTable head={['', '']} rows={items.map((x) => [x.label, x.value])} />
    </figure>
  );
}

/** Stages narrowing down; `stages` = [{ label, value }]. */
export function Funnel({ title, stages }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <figure className="card chart">
      <figcaption>{title}</figcaption>
      <div className="stack-sm" role="img" aria-label={`${title}: ${stages.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        {stages.map((s, i) => (
          <div key={s.label} className="funnel-row">
            <span className="small">{s.label}</span>
            <div className="funnel-track"><div className="funnel-bar" style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: PALETTE[i % PALETTE.length] }} /></div>
            <strong className="num">{s.value}</strong>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Horizontal bars for counts by category. */
export function HBars({ title, items }) {
  const max = Math.max(1, ...items.map((s) => s.value));
  return <Funnel title={title} stages={items.map((x) => ({ ...x, value: x.value }))} max={max} />;
}
