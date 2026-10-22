'use client';

import { useI18n } from '@/lib/i18n/client';
import { Field, Money, Legend } from '@/components/ui';

const ICONS = {
  shop: 'M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6',
  office: 'M5 21V3h10v18M15 9h4v12M8 7h2M8 11h2M8 15h2M3 21h18',
  restaurant: 'M4 9h12v5a5 5 0 01-5 5H9a5 5 0 01-5-5V9zM16 10h2a2 2 0 010 4h-2M7 3v3M11 3v3',
  workshop: 'M14.5 6.5a4 4 0 00-5 5L4 17l3 3 5.5-5.5a4 4 0 005-5l-2.5 2.5-2-2 2.5-2.5z',
  warehouse: 'M3 10l9-6 9 6v10H3V10zM7 20v-7h10v7M7 16h10',
  clinic: 'M4 4h16v16H4zM12 8v8M8 12h8',
  fuel: 'M5 21V4h9v17M3 21h13M5 10h9M14 8l4 3v7a1.5 1.5 0 003 0V9l-3-3',
  other: 'M6 12h.01M12 12h.01M18 12h.01',
};

export const emptyLocation = () => ({
  address: { building: '', area: '', city: '' },
  construction: 'concrete',
  buildingAge: 'lt10',
  floorLevel: 'ground',
  protection: { sprinklers: false, alarm: false, extinguishers: true, hoseReels: false },
  civilDefence: true,
  sumsInsured: {},
});

const Choice = ({ name, value, checked, onChange, children }) => (
  <label className="choice"><input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} />{children}</label>
);

export function StepPremise({ config, risk, setRisk, group, setGroup }) {
  const { t, pick } = useI18n();
  const options = config.occupancies.filter((o) => o.group === group);
  const selected = config.occupancies.find((o) => o.code === risk.occupancy);
  return (
    <section className="card stack">
      <div className="stack-sm">
        <h1>{t('fire.premiseTitle')}</h1>
        <p className="muted">{t('fire.premiseLead')}</p>
      </div>
      <div className="tiles">
        {config.config.occupancyGroups.map((g) => (
          <button key={g.code} type="button" className="tile" aria-pressed={group === g.code}
            onClick={() => { setGroup(g.code); const first = config.occupancies.find((o) => o.group === g.code); setRisk({ ...risk, occupancy: first?.code || '' }); }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={ICONS[g.code] || ICONS.other} /></svg>
            {pick(g.name)}
          </button>
        ))}
      </div>
      {group ? (
        <Field id="occupancy" label={t('fire.activity')}>
          <select id="occupancy" className="input" value={risk.occupancy || ''} onChange={(e) => setRisk({ ...risk, occupancy: e.target.value })}>
            <option value="" disabled>{t('fire.chooseActivity')}</option>
            {options.map((o) => <option key={o.code} value={o.code}>{pick(o.name)}</option>)}
          </select>
        </Field>
      ) : null}
      {selected?.status === 'decline' ? <div className="notice bad">{t('fire.declinedActivity')}</div> : null}
    </section>
  );
}

export function StepBusiness({ config, risk, setRisk, maxLocations }) {
  const { t, pick } = useI18n();
  const cfg = config.config;
  const setLoc = (i, patch) => setRisk({ ...risk, locations: risk.locations.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setAddr = (i, patch) => setLoc(i, { address: { ...risk.locations[i].address, ...patch } });
  const setProt = (i, key, value) => setLoc(i, { protection: { ...risk.locations[i].protection, [key]: value } });

  return (
    <>
      <section className="card stack">
        <h1>{t('fire.businessTitle')}</h1>
        <div className="grid-2">
          <Field id="businessName" label={t('fire.businessName')}>
            <input id="businessName" className="input" value={risk.business.name || ''} onChange={(e) => setRisk({ ...risk, business: { ...risk.business, name: e.target.value } })} />
          </Field>
          <Field id="tradeLicence" label={t('fire.tradeLicence')}>
            <input id="tradeLicence" className="input" value={risk.business.tradeLicence || ''} onChange={(e) => setRisk({ ...risk, business: { ...risk.business, tradeLicence: e.target.value } })} />
          </Field>
        </div>
        <fieldset>
          <Legend id="interest">{t('fire.interest')}</Legend>
          <div className="choices">
            {cfg.interests.map((o) => <Choice key={o.code} name="interest" value={o.code} checked={risk.interest === o.code} onChange={(v) => setRisk({ ...risk, interest: v })}>{pick(o.name)}</Choice>)}
          </div>
        </fieldset>
        <fieldset>
          <Legend id="claims3y">{t('fire.claims3y')}</Legend>
          <div className="choices">
            {[0, 1, 2].map((n) => <Choice key={n} name="claims" value={n} checked={risk.claims3y === n} onChange={(v) => setRisk({ ...risk, claims3y: v })}>{t('fire.claimsOptions')[n]}</Choice>)}
          </div>
        </fieldset>
      </section>

      {risk.locations.map((loc, i) => (
        <section className="card stack" key={i}>
          <div className="spread">
            <h2>{t('fire.location')} {i + 1}</h2>
            {risk.locations.length > 1 ? <button type="button" className="btn-link" onClick={() => setRisk({ ...risk, locations: risk.locations.filter((_, j) => j !== i) })}>{t('fire.removeLocation')}</button> : null}
          </div>
          <div className="grid-3">
            <Field id={`building${i}`} label={t('fire.building')}><input id={`building${i}`} className="input" value={loc.address.building} onChange={(e) => setAddr(i, { building: e.target.value })} required /></Field>
            <Field id={`area${i}`} label={t('fire.area')}><input id={`area${i}`} className="input" value={loc.address.area} onChange={(e) => setAddr(i, { area: e.target.value })} required /></Field>
            <Field id={`city${i}`} label={t('fire.city')}><input id={`city${i}`} className="input" value={loc.address.city} onChange={(e) => setAddr(i, { city: e.target.value })} /></Field>
          </div>
          <fieldset>
            <Legend id="construction">{t('fire.construction')}</Legend>
            <div className="choices">{cfg.constructionClasses.map((o) => <Choice key={o.code} name={`con${i}`} value={o.code} checked={loc.construction === o.code} onChange={(v) => setLoc(i, { construction: v })}>{pick(o.name)}</Choice>)}</div>
          </fieldset>
          <div className="grid-2">
            <Field id={`buildingAge${i}`} label={t('fire.buildingAge')}>
              <select id={`buildingAge${i}`} className="input" value={loc.buildingAge} onChange={(e) => setLoc(i, { buildingAge: e.target.value })}>{cfg.buildingAges.map((o) => <option key={o.code} value={o.code}>{pick(o.name)}</option>)}</select>
            </Field>
            <Field id={`floorLevel${i}`} label={t('fire.floorLevel')}>
              <select id={`floorLevel${i}`} className="input" value={loc.floorLevel} onChange={(e) => setLoc(i, { floorLevel: e.target.value })}>{cfg.floorLevels.map((o) => <option key={o.code} value={o.code}>{pick(o.name)}</option>)}</select>
            </Field>
          </div>
          <fieldset>
            <Legend id="protection">{t('fire.protection')}</Legend>
            <div className="choices">
              {['sprinklers', 'alarm', 'extinguishers', 'hoseReels'].map((k) => (
                <label className="choice" key={k}><input type="checkbox" checked={Boolean(loc.protection[k])} onChange={(e) => setProt(i, k, e.target.checked)} />{t(`fire.${k}`)}</label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <Legend id="civilDefence">{t('fire.civilDefence')}</Legend>
            <div className="choices">
              <Choice name={`cd${i}`} value checked={loc.civilDefence === true} onChange={() => setLoc(i, { civilDefence: true })}>{t('common.yes')}</Choice>
              <Choice name={`cd${i}`} value={false} checked={loc.civilDefence === false} onChange={() => setLoc(i, { civilDefence: false })}>{t('common.no')}</Choice>
            </div>
          </fieldset>
        </section>
      ))}
      {risk.locations.length < maxLocations ? (
        <button type="button" className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => setRisk({ ...risk, locations: [...risk.locations, emptyLocation()] })}>{t('fire.addLocation')}</button>
      ) : null}
    </>
  );
}

export function StepCover({ config, risk, setRisk, currency }) {
  const { t, pick } = useI18n();
  const groups = config.config.assetGroups;
  const setSI = (i, code, value) => {
    const clean = value.replace(/[^\d.]/g, '');
    const locations = risk.locations.map((l, j) => (j === i ? { ...l, sumsInsured: { ...l.sumsInsured, [code]: clean === '' ? undefined : Number(clean) } } : l));
    setRisk({ ...risk, locations });
  };
  return (
    <>
      <section className="stack-sm">
        <h1>{t('fire.coverTitle')}</h1>
        <p className="muted">{t('fire.coverLead')}</p>
      </section>
      {risk.locations.map((loc, i) => {
        const total = groups.reduce((s, g) => s + (Number(loc.sumsInsured[g.code]) || 0), 0);
        const tier = total > 0 && total <= (config.settings.tiers?.tier1 || Infinity) ? 'tier1' : 'tier2';
        return (
          <section className="card" key={i}>
            <h2 style={{ marginBottom: 8 }}>{t('fire.location')} {i + 1}{loc.address.building ? `: ${loc.address.building}` : ''}</h2>
            {groups.map((g) => (
              <div className="asset" key={g.code}>
                <div><div style={{ fontWeight: 600 }}>{pick(g.name)}</div><div className="hint">{pick(g.basis)}</div></div>
                <input aria-label={pick(g.name)} className="input num-input" inputMode="decimal" placeholder={currency} value={loc.sumsInsured[g.code] ?? ''} onChange={(e) => setSI(i, g.code, e.target.value)} />
              </div>
            ))}
            <div className="spread" style={{ borderTop: '2px solid var(--ink)', paddingTop: 14, marginTop: 4 }}>
              <strong>{t('fire.locationTotal')}</strong>
              <div className="row">
                {total > 0 ? <span className={`badge ${tier === 'tier1' ? 'ok' : 'warn'}`}>{t(`fire.${tier}`)}</span> : null}
                <strong style={{ fontSize: 20 }}><Money value={total} currency={currency} /></strong>
              </div>
            </div>
          </section>
        );
      })}
      <div className="notice warn">{t('fire.underInsurance')}</div>
    </>
  );
}

export function StepQuote({ config, risk, setRisk, quote, isBroker, keyFactsRead, setKeyFactsRead }) {
  const { t, pick } = useI18n();
  const cfg = config.config;
  const toggleExt = (code, on) => setRisk({ ...risk, extensions: on ? [...risk.extensions, code] : risk.extensions.filter((c) => c !== code) });
  const rating = quote?.rating;
  const extAmount = (code) => rating?.breakdown?.extensions?.find((e) => e.code === code);

  return (
    <>
      <h1>{t('fire.quoteTitle')}{quote?.total ? <>: <Money value={quote.total} currency={quote.currency} /></> : null}</h1>
      {rating && !rating.quotable ? <div className="notice bad">{t(`fire.notQuotable.${rating.notQuotableReason}`)}<br /><span className="small">[HELPLINE]</span></div> : null}
      <section className="card stack-sm">
        <h2>{t('fire.included')}</h2>
        <div className="row">{cfg.perils.map((p) => <span className="badge" key={p.en}>{pick(p)}</span>)}</div>
      </section>
      <section className="card">
        <h2 style={{ marginBottom: 6 }}>{t('fire.extensionsTitle')}</h2>
        {cfg.extensions.map((ext) => {
          const on = risk.extensions.includes(ext.code);
          const line = extAmount(ext.code);
          return (
            <div className="asset" key={ext.code}>
              <label className="check">
                <input type="checkbox" checked={on} onChange={(e) => toggleExt(ext.code, e.target.checked)} />
                <span><strong>{pick(ext.name)}</strong><br /><span className="hint">{pick(ext.description)}</span></span>
              </label>
              <div style={{ textAlign: 'end' }}>
                {ext.input === 'rentSI' && on ? (
                  <input aria-label={t('fire.rentSI')} placeholder={t('fire.rentSI')} className="input num-input" inputMode="decimal" value={risk.extensionInputs.rentSI ?? ''}
                    onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); setRisk({ ...risk, extensionInputs: { ...risk.extensionInputs, rentSI: v === '' ? undefined : Number(v) } }); }} />
                ) : null}
                {on && line && line.available !== false && !ext.referral ? <strong>+ <Money value={line.amount} currency={quote.currency} /></strong> : null}
              </div>
            </div>
          );
        })}
      </section>
      <section className="card stack-sm">
        <h2>{t('fire.deductibleTitle')}</h2>
        <div className="choices">
          {cfg.deductibles.map((d) => (
            <label className="choice" key={d.code}><input type="radio" name="ded" checked={risk.deductible === d.code} onChange={() => setRisk({ ...risk, deductible: d.code })} />{pick(d.name)} · <span className="muted">{pick(d.detail)}</span></label>
          ))}
        </div>
      </section>
      {isBroker ? (
        <section className="card stack-sm">
          <Field id="discount" label={t('fire.discount')} hint={t('fire.discountHint')}>
            <select id="discount" className="input" value={risk.discountPct} onChange={(e) => setRisk({ ...risk, discountPct: Number(e.target.value) })}>
              {[0, 0.05, 0.1, 0.15, 0.2].map((d) => <option key={d} value={d}>{Math.round(d * 100)}%</option>)}
            </select>
          </Field>
        </section>
      ) : null}
      <section className="card stack-sm">
        <h2>{t('fire.notIncluded')}</h2>
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>{cfg.exclusions.map((x) => <li key={x.en}>{pick(x)}</li>)}</ul>
        <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={keyFactsRead} onChange={(e) => setKeyFactsRead(e.target.checked)} />{t('fire.keyFacts')}</label>
      </section>
    </>
  );
}
