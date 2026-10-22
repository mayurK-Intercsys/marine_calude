'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { api } from '@/lib/api';
import { isoToday } from '@/lib/format';
import RequireRole from '@/components/RequireRole';
import { ErrorNotice, Field } from '@/components/ui';

const NUMBER = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2 });
const show = (v) => (typeof v === 'number' ? NUMBER.format(v) : v ?? '—');

function Reports() {
  const { t } = useI18n();
  const [names, setNames] = useState([]);
  const [name, setName] = useState('funnel');
  const [range, setRange] = useState({ from: `${isoToday().slice(0, 7)}-01`, to: isoToday() });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { api('/reports').then((r) => setNames(r.reports)).catch(setError); }, []);
  const query = `from=${range.from}&to=${range.to}`;
  const run = async () => {
    setError(null);
    try { setData(await api(`/reports/${name}?${query}`)); } catch (e) { setError(e); }
  };
  useEffect(() => { if (names.length) run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [names, name]);

  return (
    <div className="container page stack">
      <h1>{t('reports.title')}</h1>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field id="rep" label={t('reports.title')}>
          <select id="rep" className="input" value={name} onChange={(e) => setName(e.target.value)}>
            {names.map((n) => <option key={n} value={n}>{t(`reports.names.${n}`, n)}</option>)}
          </select>
        </Field>
        <Field id="rf" label={t('common.from')}><input id="rf" type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field id="rt" label={t('common.to')}><input id="rt" type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <button type="button" className="btn btn-primary" onClick={run}>{t('reports.run')}</button>
        <a className="btn btn-secondary" href={`/api/reports/${name}?${query}&format=csv`}>{t('reports.csv')}</a>
      </div>
      <ErrorNotice error={error} />
      {data ? (
        <section className="card stack-sm">
          <h2>{t(`reports.names.${data.name}`, data.name)}</h2>
          {data.rows.length === 0 ? <p className="muted">{t('reports.empty')}</p> : (
            <div className="table-wrap"><table className="data">
              <thead><tr>{data.columns.map((c) => <th key={c} className={typeof data.rows[0]?.[c] === 'number' ? 'num' : ''}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
              <tbody>{data.rows.map((r, i) => <tr key={i}>{data.columns.map((c) => <td key={c} className={typeof r[c] === 'number' ? 'num' : ''}>{show(r[c])}</td>)}</tr>)}</tbody>
            </table></div>
          )}
          {data.totals ? (
            <div className="row small">{Object.entries(data.totals).map(([k, v]) => <span key={k} className="badge">{k.replace(/_/g, ' ')}: {show(v)}</span>)}</div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  return <RequireRole roles={['uw_manager', 'ops', 'config_admin', 'underwriter']}><Reports /></RequireRole>;
}
