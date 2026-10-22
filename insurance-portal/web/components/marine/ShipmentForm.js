'use client';

import { useI18n } from '@/lib/i18n/client';
import { isoInDays } from '@/lib/format';
import { Field, Money, Legend, PricingExtras } from '@/components/ui';

export const emptyShipment = (productType = 'single') => ({
  productType,
  direction: 'import',
  commodity: '',
  description: '',
  packing: 'pallets',
  container: productType === 'inland' ? 'none' : 'fcl',
  newGoods: true,
  mode: productType === 'inland' ? 'road' : 'sea',
  origin: { country: productType === 'inland' ? 'AE' : 'CN', place: '' },
  destination: { country: 'AE', place: '' },
  finalDestination: '',
  sailingDate: isoInDays(3),
  incoterm: 'CIF',
  vessel: { name: '', imo: '' },
  conveyanceRef: '',
  invoice: { currency: 'USD', amount: 0 },
  invoiceNo: '',
  blNo: '',
  freight: 0,
  upliftPct: 0.1,
  duty: 0,
  clause: '',
  war: productType !== 'inland',
  srcc: true,
  extensions: [],
});

/** Clauses offered for the goods, product type and mode (mirrors the API rule). */
export function clauseOptions(commodity, productType, mode) {
  const byMode = productType === 'inland' ? ['ITC-A', 'ITC-B'] : mode === 'air' ? ['ICC-AIR'] : ['ICC-A', 'ICC-B', 'ICC-C'];
  return byMode.filter((c) => commodity?.clauses?.includes(c));
}

const num = (v) => {
  const s = String(v).replace(/[^\d.]/g, '');
  return s === '' ? 0 : Number(s);
};

export function ShipmentFields({ config, value, onChange, allowedCommodities = null }) {
  const { t, pick } = useI18n();
  const cfg = config.config;
  const set = (patch) => onChange({ ...value, ...patch });
  const inland = value.productType === 'inland';
  const commodities = config.commodities.filter((c) => !allowedCommodities || allowedCommodities.includes(c.code));
  const countries = config.countries;
  const modes = cfg.modes.filter((m) => !inland || ['road', 'rail'].includes(m.code));
  const sel = (id, label, v, opts, on) => (
    <Field id={id} label={label}>
      <select id={id} className="input" value={v} onChange={(e) => on(e.target.value)}>{opts}</select>
    </Field>
  );

  return (
    <>
      <section className="card stack">
        <h2>{t('marine.goods')}</h2>
        <div className="grid-2">
          {sel('commodity', t('marine.commodity'), value.commodity, [<option key="" value="" disabled>{t('marine.chooseCommodity')}</option>, ...commodities.map((c) => <option key={c.code} value={c.code}>{pick(c.name)}{c.hs && c.hs !== '—' ? ` · HS ${c.hs}` : ''}</option>)], (v) => {
            const c = config.commodities.find((x) => x.code === v);
            const clauses = clauseOptions(c, value.productType, value.mode);
            set({ commodity: v, clause: clauses.includes(value.clause) ? value.clause : clauses[0] || '' });
          })}
          <Field id="description" label={t('marine.description')}><input id="description" className="input" value={value.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          {sel('packing', t('marine.packing'), value.packing, cfg.packings.map((p) => <option key={p.code} value={p.code}>{pick(p.name)}</option>), (v) => set({ packing: v }))}
          {sel('container', t('marine.container'), value.container, cfg.containers.map((p) => <option key={p.code} value={p.code}>{pick(p.name)}</option>), (v) => set({ container: v }))}
        </div>
        {config.commodities.find((c) => c.code === value.commodity)?.prohibited ? <div className="notice bad">{t('marine.notQuotable.COMMODITY_PROHIBITED')}</div> : null}
      </section>

      <section className="card stack">
        <h2>{t('marine.journey')}</h2>
        {!inland ? (
          <fieldset><Legend id="direction">{t('marine.direction')}</Legend>
            <div className="choices">{cfg.directions.map((d) => <label className="choice" key={d.code}><input type="radio" name="dir" checked={value.direction === d.code} onChange={() => set({ direction: d.code })} />{pick(d.name)}</label>)}</div>
          </fieldset>
        ) : null}
        <fieldset><Legend id="mode">{t('marine.mode')}</Legend>
          <div className="choices">{modes.map((m) => (
            <label className="choice" key={m.code}><input type="radio" name="mode" checked={value.mode === m.code} onChange={() => {
              const c = config.commodities.find((x) => x.code === value.commodity);
              const clauses = clauseOptions(c, value.productType, m.code);
              set({ mode: m.code, clause: clauses.includes(value.clause) ? value.clause : clauses[0] || '', war: ['sea', 'air'].includes(m.code) ? value.war : false });
            }} />{pick(m.name)}</label>
          ))}</div>
        </fieldset>
        <div className="grid-2">
          {sel('originCountry', t('marine.origin'), value.origin.country, countries.map((c) => <option key={c.code} value={c.code}>{pick(c.name)}</option>), (v) => set({ origin: { ...value.origin, country: v } }))}
          <datalist id="ports-origin">{(config.ports?.[value.origin.country] || []).map(([code, name]) => <option key={code} value={`${name} (${code})`} />)}</datalist>
          <datalist id="ports-destination">{(config.ports?.[value.destination.country] || []).map(([code, name]) => <option key={code} value={`${name} (${code})`} />)}</datalist>
          <Field id="originPlace" label={t('marine.originPlace')}><input id="originPlace" list="ports-origin" className="input" value={value.origin.place} onChange={(e) => set({ origin: { ...value.origin, place: e.target.value } })} required /></Field>
          {sel('destinationCountry', t('marine.destination'), value.destination.country, countries.map((c) => <option key={c.code} value={c.code}>{pick(c.name)}</option>), (v) => set({ destination: { ...value.destination, country: v } }))}
          <Field id="destinationPlace" label={t('marine.destinationPlace')}><input id="destinationPlace" list="ports-destination" className="input" value={value.destination.place} onChange={(e) => set({ destination: { ...value.destination, place: e.target.value } })} required /></Field>
          <Field id="finalDestination" label={`${t('marine.finalDestination')} (${t('common.optional')})`}><input id="finalDestination" className="input" value={value.finalDestination} onChange={(e) => set({ finalDestination: e.target.value })} /></Field>
          <Field id="sailingDate" label={t('marine.sailingDate')} hint={t('marine.sailingHint')}><input id="sailingDate" type="date" className="input" min={isoInDays(0)} max={isoInDays(60)} value={value.sailingDate} onChange={(e) => set({ sailingDate: e.target.value })} required /></Field>
          {!inland ? sel('incoterm', t('marine.incoterm'), value.incoterm, cfg.incoterms.map((i) => <option key={i.code} value={i.code}>{pick(i.name)}</option>), (v) => set({ incoterm: v })) : null}
          {value.mode === 'sea' ? (
            <>
              <Field id="vesselName" label={t('marine.vesselName')}><input id="vesselName" className="input" value={value.vessel.name} onChange={(e) => set({ vessel: { ...value.vessel, name: e.target.value } })} /></Field>
              <Field id="vesselImo" label={`${t('marine.vesselImo')} (${t('common.optional')})`}><input id="vesselImo" className="input num" inputMode="numeric" value={value.vessel.imo} onChange={(e) => set({ vessel: { ...value.vessel, imo: e.target.value.replace(/\D/g, '').slice(0, 7) } })} /></Field>
            </>
          ) : (
            <Field id="conveyanceRef" label={`${t('marine.conveyanceRef')} (${t('common.optional')})`}><input id="conveyanceRef" className="input" value={value.conveyanceRef} onChange={(e) => set({ conveyanceRef: e.target.value })} /></Field>
          )}
        </div>
      </section>
    </>
  );
}

export function ValueFields({ config, value, onChange, fixedClause = null, warLocked = null }) {
  const { t, pick } = useI18n();
  const cfg = config.config;
  const set = (patch) => onChange({ ...value, ...patch });
  const commodity = config.commodities.find((c) => c.code === value.commodity);
  const clauses = fixedClause ? [fixedClause] : clauseOptions(commodity, value.productType, value.mode);
  const freightApplies = ['EXW', 'FCA', 'FOB'].includes(value.incoterm) && value.productType !== 'inland';
  const currencies = config.settings.fxCurrencies || cfg.currencies;
  const siForeign = ((Number(value.invoice.amount) || 0) + (freightApplies ? Number(value.freight) || 0 : 0)) * (1 + Number(value.upliftPct)) + (Number(value.duty) || 0);

  return (
    <>
      <section className="card stack">
        <h2>{t('marine.valueTitle')}</h2>
        <div className="grid-3">
          <Field id="currency" label={t('marine.currency')}><select id="currency" className="input" value={value.invoice.currency} onChange={(e) => set({ invoice: { ...value.invoice, currency: e.target.value } })}>{currencies.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field id="invoiceAmount" label={t('marine.invoiceAmount')}><input id="invoiceAmount" className="input num-input" inputMode="decimal" value={value.invoice.amount || ''} onChange={(e) => set({ invoice: { ...value.invoice, amount: num(e.target.value) } })} required /></Field>
          {freightApplies ? <Field id="freight" label={t('marine.freight')}><input id="freight" className="input num-input" inputMode="decimal" value={value.freight || ''} onChange={(e) => set({ freight: num(e.target.value) })} /></Field> : null}
          <Field id="uplift" label={t('marine.uplift')}><select id="uplift" className="input" value={value.upliftPct} onChange={(e) => set({ upliftPct: Number(e.target.value) })}>{[0, 0.1, 0.2].map((u) => <option key={u} value={u}>{Math.round(u * 100)}%</option>)}</select></Field>
          <Field id="duty" label={`${t('marine.duty')} (${t('common.optional')})`}><input id="duty" className="input num-input" inputMode="decimal" value={value.duty || ''} onChange={(e) => set({ duty: num(e.target.value) })} /></Field>
          <Field id="invoiceNo" label={`${t('marine.invoiceNo')} (${t('common.optional')})`}><input id="invoiceNo" className="input" value={value.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} /></Field>
        </div>
        <div className="notice info num">{t('marine.siFormula')}: ({value.invoice.amount || 0}{freightApplies ? ` + ${value.freight || 0}` : ''}) × {100 + Math.round(value.upliftPct * 100)}%{value.duty ? ` + ${value.duty}` : ''} = <strong>{value.invoice.currency} {siForeign.toLocaleString('en', { maximumFractionDigits: 2 })}</strong></div>
      </section>
      <section className="card stack">
        <h2>{t('marine.clauseTitle')}</h2>
        <div className="stack-sm">
          {clauses.map((code) => {
            const c = cfg.clauses.find((x) => x.code === code);
            return (
              <label className="check" key={code} style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 10, background: value.clause === code ? 'var(--brand-tint)' : undefined }}>
                <input type="radio" name="clause" checked={value.clause === code} onChange={() => set({ clause: code })} disabled={Boolean(fixedClause)} />
                <span><strong>{pick(c?.name)}</strong><br /><span className="hint">{pick(c?.description)}</span></span>
              </label>
            );
          })}
        </div>
        {warLocked == null ? (
          <div className="choices">
            {['sea', 'air'].includes(value.mode) ? <label className="choice"><input type="checkbox" checked={value.war} onChange={(e) => set({ war: e.target.checked })} />{t('marine.war')}</label> : null}
            <label className="choice"><input type="checkbox" checked={value.srcc} onChange={(e) => set({ srcc: e.target.checked })} />{t('marine.srcc')}</label>
          </div>
        ) : null}
        {fixedClause == null ? (
          <div className="stack-sm">
            {cfg.extensions.map((x) => (
              <label className="check" key={x.code}>
                <input type="checkbox" checked={value.extensions.includes(x.code)} onChange={(e) => set({ extensions: e.target.checked ? [...value.extensions, x.code] : value.extensions.filter((c) => c !== x.code) })} />
                <span><strong>{pick(x.name)}</strong> <span className="hint">{pick(x.description)}</span></span>
              </label>
            ))}
          </div>
        ) : null}
      </section>
      {value.productType !== 'inland' ? (
        <section className="card stack-sm">
          <label className="check"><input type="checkbox" checked={Boolean(value.lc)} onChange={(e) => set({ lc: e.target.checked ? { bank: '', number: '', wording: '' } : undefined })} />{t('marine.hasLc')}</label>
          {value.lc ? (
            <div className="grid-2">
              <Field id="lcBank" label={t('marine.lcBank')}><input id="lcBank" className="input" value={value.lc.bank} onChange={(e) => set({ lc: { ...value.lc, bank: e.target.value } })} /></Field>
              <Field id="lcNumber" label={t('marine.lcNumber')}><input id="lcNumber" className="input" value={value.lc.number} onChange={(e) => set({ lc: { ...value.lc, number: e.target.value } })} /></Field>
              <div style={{ gridColumn: '1 / -1' }}><Field id="lcWording" label={t('marine.lcWording')}><textarea id="lcWording" className="input" value={value.lc.wording} onChange={(e) => set({ lc: { ...value.lc, wording: e.target.value } })} /></Field></div>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

export function MarinePriceLines({ breakdown, currency, sumInsured }) {
  const { t } = useI18n();
  if (!breakdown) return null;
  const line = (label, v) => (v ? <div className="price-line"><span className="label">{label}</span><Money value={v} currency={currency} /></div> : null);
  return (
    <>
      {line(t('common.sumInsured'), sumInsured)}
      {line(t('marine.basePremium'), breakdown.basePremium)}
      {line(t('marine.warLine'), breakdown.warPremium)}
      {line(t('marine.srccLine'), breakdown.srccPremium)}
      {line(t('fire.extensions'), breakdown.extensionsTotal)}
      {line(t('fire.uwLoading'), breakdown.uwLoading)}
      {breakdown.discount > 0 ? <div className="price-line"><span className="label">{t('fire.discountLine')}</span><span>− <Money value={breakdown.discount} currency={currency} /></span></div> : null}
      <div className="price-line" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 10 }}><span className="label">{t('common.premium')}</span><Money value={breakdown.premium} currency={currency} /></div>
      {breakdown.policyFee ? line(t('common.policyFee'), breakdown.policyFee) : null}
      <div className="price-line"><span className="label">{t('common.vat')} {Math.round((breakdown.vatRate || 0) * 100)}%</span><Money value={breakdown.tax} currency={currency} /></div>
            <PricingExtras breakdown={breakdown} currency={currency} />
      <div className="price-line total"><span>{t('common.total')}</span><Money value={breakdown.total} currency={currency} /></div>
      {breakdown.deductible ? <p className="hint">{t('marine.deductible')}: {breakdown.deductible.pct ? `${(breakdown.deductible.pct * 100).toFixed(1)}%, ` : ''}min <Money value={breakdown.deductible.min} currency={currency} /></p> : null}
    </>
  );
}
