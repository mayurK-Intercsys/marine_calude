/** Engineering documents: schedule (items or project), certificate for principals and banks, tax invoice. */
const QRCode = require('qrcode');
const config = require('../../config');
const { shell, esc, fmt } = require('./render');

const L = {
  en: { schedule: 'Policy schedule', certificate: 'Certificate of insurance', invoice: 'Tax invoice', policyNo: 'Policy number', insured: 'Insured', period: 'Period of insurance', to: 'to',
    equipment: 'Insured equipment', item: 'Item', year: 'Year', serial: 'Serial no.', value: 'Replacement value', territory: 'Territory', project: 'Project', type: 'Type', location: 'Location',
    principal: 'Principal / owner', permit: 'Permit number', contractValue: 'Contract value', construction: 'Construction period', maintenance: 'Maintenance period ends', months: 'months',
    sec1: 'Section 1 – Damage to the works', sec2: 'Section 2 – Third-party liability, limit', addOns: 'Add-ons', deductibles: 'Deductibles', natcat: 'Storm, flood, earthquake', other: 'Other losses',
    premium: 'Premium', policyFee: 'Policy fee', vat: 'VAT', total: 'Total', invoiceNo: 'Invoice number', description: 'Description', amount: 'Amount', warranty: 'Special conditions',
    certText: 'This certifies that the insurance described below is in force for the period shown, subject to the policy terms, conditions and exclusions.', verify: 'Scan to verify this document', placeholder: '[INSURER LEGAL NAME]', footer: 'Licensed by' },
  ar: { schedule: 'جدول الوثيقة', certificate: 'شهادة التأمين', invoice: 'فاتورة ضريبية', policyNo: 'رقم الوثيقة', insured: 'المؤمَّن له', period: 'مدة التأمين', to: 'إلى',
    equipment: 'المعدات المؤمَّنة', item: 'البند', year: 'السنة', serial: 'الرقم التسلسلي', value: 'قيمة الاستبدال', territory: 'النطاق الجغرافي', project: 'المشروع', type: 'النوع', location: 'الموقع',
    principal: 'المالك / صاحب العمل', permit: 'رقم الترخيص', contractValue: 'قيمة العقد', construction: 'مدة الإنشاء', maintenance: 'نهاية فترة الصيانة', months: 'أشهر',
    sec1: 'القسم 1 – الأضرار بالأعمال', sec2: 'القسم 2 – المسؤولية تجاه الغير، الحد', addOns: 'الإضافات', deductibles: 'مبالغ التحمل', natcat: 'العواصف والفيضانات والزلازل', other: 'الخسائر الأخرى',
    premium: 'القسط', policyFee: 'رسوم الوثيقة', vat: 'ضريبة القيمة المضافة', total: 'الإجمالي', invoiceNo: 'رقم الفاتورة', description: 'الوصف', amount: 'المبلغ', warranty: 'شروط خاصة',
    certText: 'تشهد هذه الوثيقة بأن التأمين الموضح أدناه ساري المفعول للمدة المبينة، وفقًا لشروط الوثيقة وأحكامها واستثناءاتها.', verify: 'امسح الرمز للتحقق من هذه الوثيقة', placeholder: '[الاسم القانوني لشركة التأمين]', footer: 'مرخصة من' },
};

async function renderEngineering({ type, lang = 'en', policy, product, country, tables }) {
  const t = L[lang] || L.en;
  const loc = (o) => (o && (o[lang] || o.en)) || '';
  const money = (v) => fmt(v, policy.currency, country.currency_decimals, lang);
  const r = policy.risk_data;
  const b = policy.rating.breakdown;
  const cfg = product.config;
  const p = policy.proposer || {};
  const pt = cfg.productTypes.find((x) => x.code === r.productType);
  const qr = await QRCode.toDataURL(`${config.appUrl}/${lang}/verify/${encodeURIComponent(policy.policy_no)}`, { margin: 0, width: 192 });
  const head = (title) => `<header><div><div class="logo">${esc(t.placeholder)}</div><h1>${esc(title)}</h1><div>${esc(loc(pt?.product))}</div></div><div class="qr"><img src="${qr}" alt="${esc(t.verify)}"><div>${esc(t.verify)}</div></div></header>`;
  const footer = `<footer>${esc(t.footer)} ${esc(country.regulator)}</footer>`;
  const parties = `<table><tr><th>${t.policyNo}</th><td>${esc(policy.policy_no)}</td></tr><tr><th>${t.insured}</th><td>${esc(p.companyName)}</td></tr><tr><th>${t.period}</th><td>${esc(policy.inception_date)} ${t.to} ${esc(policy.expiry_date)}</td></tr></table>`;

  if (type === 'invoice') {
    const body = `${head(t.invoice)}<table><tr><th>${t.invoiceNo}</th><td>INV-${esc(policy.policy_no)}</td></tr><tr><th>${t.insured}</th><td>${esc(p.companyName)}</td></tr></table>
<table><thead><tr><th>${t.description}</th><th class="num">${t.amount}</th></tr></thead><tbody><tr><td>${t.premium}</td><td class="num">${money(b.premium)}</td></tr><tr><td>${t.policyFee}</td><td class="num">${money(b.policyFee)}</td></tr><tr><td>${t.vat}</td><td class="num">${money(b.tax)}</td></tr><tr class="total"><th>${t.total}</th><td class="num">${money(b.total)}</td></tr></tbody></table>${footer}`;
    return shell({ lang, title: `${t.invoice} ${policy.policy_no}`, body });
  }

  let detail;
  if (r.project) {
    const pr = r.project;
    const ded = b.deductibles || {};
    detail = `<h2>${t.project}</h2><table><tr><th>${t.project}</th><td>${esc(pr.name)} · ${esc(loc(tables.projectTypes.find((x) => x.code === pr.projectType)?.name))}</td></tr>
<tr><th>${t.location}</th><td>${esc([pr.area, pr.city].filter(Boolean).join(', '))}</td></tr><tr><th>${t.principal}</th><td>${esc(pr.principal)}</td></tr><tr><th>${t.permit}</th><td>${esc(pr.permitNo)}</td></tr>
<tr><th>${t.construction}</th><td>${esc(pr.startDate)} ${t.to} ${esc(pr.completionDate)}</td></tr><tr><th>${t.maintenance}</th><td>${esc(policy.expiry_date)}</td></tr>
<tr><th>${t.sec1}</th><td>${money(pr.contractValue + (pr.ownerMaterials || 0))}</td></tr><tr><th>${t.sec2}</th><td>${money(b.tplLimit)}</td></tr></table>
<h2>${t.deductibles}</h2><ul><li>${t.natcat}: ${ded.natcat ? `${ded.natcat.pct * 100}%, min ${money(ded.natcat.min)}` : '—'}</li><li>${t.other}: ${ded.other?.fixed ? money(ded.other.fixed) : '—'}</li></ul>`;
  } else {
    const rows = (policy.rating.items || []).map((i) => `<tr><td>${esc(loc(tables.equipmentTypes.find((x) => x.code === i.type)?.name))} ${esc(i.make)} ${esc(i.model)}</td><td>${i.year}</td><td>${esc(i.serial)}</td><td class="num">${money(i.value)}</td></tr>`).join('');
    detail = `<h2>${t.equipment}</h2><table><thead><tr><th>${t.item}</th><th>${t.year}</th><th>${t.serial}</th><th class="num">${t.value}</th></tr></thead><tbody>${rows}</tbody></table>
${r.productType === 'CPM' ? `<p>${t.territory}: ${esc(loc(cfg.territories.find((x) => x.code === r.territory)?.name))}</p>` : ''}`;
  }
  const addOns = (r.addOns || []).map((c) => `<li>${esc(loc(cfg.addOns.find((x) => x.code === c)?.name))}</li>`).join('');
  const body = `${head(type === 'certificate' ? t.certificate : t.schedule)}${type === 'certificate' ? `<p>${esc(t.certText)}</p>` : ''}${parties}${detail}
${addOns ? `<h2>${t.addOns}</h2><ul>${addOns}</ul>` : ''}${policy.uw_terms?.warranty ? `<h2>${t.warranty}</h2><p>${esc(policy.uw_terms.warranty)}</p>` : ''}
${type === 'schedule' ? `<table><tr><th>${t.premium}</th><td class="num">${money(b.premium)}</td></tr><tr><th>${t.policyFee}</th><td class="num">${money(b.policyFee)}</td></tr><tr><th>${t.vat}</th><td class="num">${money(b.tax)}</td></tr><tr class="total"><th>${t.total}</th><td class="num">${money(b.total)}</td></tr></table>` : ''}${footer}`;
  return shell({ lang, title: `${t.schedule} ${policy.policy_no}`, body });
}

module.exports = { renderEngineering };
