/**
 * WC documents: schedule (job types, sections and limits), certificate of insurance
 * (for MoHRE, main contractors and tenders), employee annex (named; IDs masked),
 * statutory benefit summary, tax invoice. Bilingual HTML.
 */
const QRCode = require('qrcode');
const config = require('../../config');
const { shell, esc, fmt } = require('./render');

const L = {
  en: {
    schedule: 'Policy schedule', certificate: 'Certificate of insurance', annex: 'Employee list annex', invoice: 'Tax invoice',
    policyNo: 'Policy number', insured: 'Insured', licence: 'Trade licence', establishment: 'Labour establishment no.', period: 'Period of insurance', to: 'to',
    trade: 'Business activity', type: 'Policy type', named: 'Named employees', unnamed: 'Unnamed (headcount)', plan: 'Plan',
    jobType: 'Job type', employees: 'Employees', wages: 'Estimated annual wages', sections: 'Sections and limits',
    secA: 'Section A – Workmen’s Compensation', asLaw: 'As required by labour law', secB: 'Section B – Employer’s Liability', secC: 'Section C – Medical expenses', perEmployee: 'per injured employee',
    notCovered: 'Not covered', extensions: 'Extensions', premium: 'Premium (deposit, adjusted on actual wages)', policyFee: 'Policy fee', vat: 'VAT', total: 'Total',
    statutory: 'What the law requires of you', death: 'Death or permanent total disability', months: 'months’ basic wage', min: 'minimum', max: 'maximum',
    temp: 'While unable to work', fullWage: 'full wage for up to', halfWage: 'then half wage for up to', report: 'Report injuries to', within: 'within', hours: 'hours',
    certText: 'This certifies that the employer named below holds Workmen’s Compensation insurance for the period shown, subject to the policy terms and exclusions.',
    name: 'Name', id: 'ID number', job: 'Job title', category: 'Job type', invoiceNo: 'Invoice number', description: 'Description', amount: 'Amount', warranty: 'Special conditions',
    verify: 'Scan to verify this document', placeholder: '[INSURER LEGAL NAME]', footer: 'Licensed by',
  },
  ar: {
    schedule: 'جدول الوثيقة', certificate: 'شهادة التأمين', annex: 'ملحق قائمة الموظفين', invoice: 'فاتورة ضريبية',
    policyNo: 'رقم الوثيقة', insured: 'المؤمَّن له', licence: 'الرخصة التجارية', establishment: 'رقم المنشأة لدى وزارة العمل', period: 'مدة التأمين', to: 'إلى',
    trade: 'النشاط التجاري', type: 'نوع الوثيقة', named: 'موظفون بالأسماء', unnamed: 'بدون أسماء (حسب العدد)', plan: 'الخطة',
    jobType: 'نوع الوظيفة', employees: 'عدد الموظفين', wages: 'الأجور السنوية التقديرية', sections: 'الأقسام والحدود',
    secA: 'القسم أ – تعويض العمال', asLaw: 'وفق ما يقتضيه قانون العمل', secB: 'القسم ب – مسؤولية صاحب العمل', secC: 'القسم ج – النفقات الطبية', perEmployee: 'لكل موظف مصاب',
    notCovered: 'غير مشمول', extensions: 'التغطيات الإضافية', premium: 'القسط (دفعة مقدمة تُسوّى على الأجور الفعلية)', policyFee: 'رسوم الوثيقة', vat: 'ضريبة القيمة المضافة', total: 'الإجمالي',
    statutory: 'ما يفرضه القانون عليك', death: 'الوفاة أو العجز الكلي الدائم', months: 'شهرًا من الأجر الأساسي', min: 'بحد أدنى', max: 'وبحد أقصى',
    temp: 'أثناء العجز عن العمل', fullWage: 'الأجر كاملًا لمدة تصل إلى', halfWage: 'ثم نصف الأجر لمدة تصل إلى', report: 'أبلغ عن الإصابات إلى', within: 'خلال', hours: 'ساعة',
    certText: 'تشهد هذه الوثيقة بأن صاحب العمل المذكور أدناه يحمل تأمين تعويض العمال للمدة المبينة، وفقًا لشروط الوثيقة واستثناءاتها.',
    name: 'الاسم', id: 'رقم الهوية', job: 'المسمى الوظيفي', category: 'نوع الوظيفة', invoiceNo: 'رقم الفاتورة', description: 'الوصف', amount: 'المبلغ', warranty: 'شروط خاصة',
    verify: 'امسح الرمز للتحقق من هذه الوثيقة', placeholder: '[الاسم القانوني لشركة التأمين]', footer: 'مرخصة من',
  },
};

const mask = (id) => String(id || '').replace(/\d(?=(?:\D*\d){4})/g, '•');

async function renderWc({ type, lang = 'en', policy, product, country, tables }) {
  const t = L[lang] || L.en;
  const loc = (o) => (o && (o[lang] || o.en)) || '';
  const money = (v) => fmt(v, policy.currency, country.currency_decimals, lang);
  const r = policy.risk_data;
  const b = policy.rating.breakdown;
  const p = policy.proposer || {};
  const cfg = product.config;
  const s = tables.statutory;
  const catName = (code) => loc(tables.categories.find((c) => c.code === code)?.name) || code;
  const qr = await QRCode.toDataURL(`${config.appUrl}/${lang}/verify/${encodeURIComponent(policy.policy_no)}`, { margin: 0, width: 192 });
  const head = (title) => `<header><div><div class="logo">${esc(t.placeholder)}</div><h1>${esc(title)}</h1><div>${esc(lang === 'ar' ? product.name_ar : product.name_en)}</div></div>
<div class="qr"><img src="${qr}" alt="${esc(t.verify)}"><div>${esc(t.verify)}</div></div></header>`;
  const footer = `<footer>${esc(t.footer)} ${esc(country.regulator)}</footer>`;
  const parties = `<table><tr><th>${t.policyNo}</th><td>${esc(policy.policy_no)}</td></tr><tr><th>${t.insured}</th><td>${esc(p.companyName)}</td></tr>
<tr><th>${t.licence}</th><td>${esc(p.tradeLicence)}</td></tr>${r.business?.establishmentNo ? `<tr><th>${t.establishment}</th><td>${esc(r.business.establishmentNo)}</td></tr>` : ''}
<tr><th>${t.period}</th><td>${esc(policy.inception_date)} ${t.to} ${esc(policy.expiry_date)}</td></tr>
<tr><th>${t.trade}</th><td>${esc(loc(tables.trades.find((x) => x.code === r.trade)?.name))}</td></tr>
<tr><th>${t.type}</th><td>${r.policyType === 'named' ? t.named : t.unnamed} · ${t.plan}: ${esc(loc(cfg.plans.find((x) => x.code === r.plan)?.name))}</td></tr></table>`;
  const sections = `<h2>${t.sections}</h2><table>
<tr><th>${t.secA}</th><td>${t.asLaw}</td></tr>
<tr><th>${t.secB}</th><td>${b.elLimit ? money(b.elLimit) : t.notCovered}</td></tr>
<tr><th>${t.secC}</th><td>${b.medicalLimit ? `${money(b.medicalLimit)} ${t.perEmployee}` : t.notCovered}</td></tr></table>`;
  const statutory = `<h2>${t.statutory}</h2><ul>
<li>${t.death}: ${s.deathMonths} ${t.months}, ${t.min} ${money(s.deathMin)} ${t.max} ${money(s.deathMax)}.</li>
<li>${t.temp}: ${t.fullWage} ${s.temporaryDisability[0].months}, ${t.halfWage} ${s.temporaryDisability[1].months}.</li>
<li>${t.report} ${esc(s.authority)} ${t.within} ${s.reportingHours} ${t.hours}.</li></ul>`;

  if (type === 'invoice') {
    const body = `${head(t.invoice)}<table><tr><th>${t.invoiceNo}</th><td>INV-${esc(policy.policy_no)}</td></tr><tr><th>${t.insured}</th><td>${esc(p.companyName)}</td></tr></table>
<table><thead><tr><th>${t.description}</th><th class="num">${t.amount}</th></tr></thead><tbody>
<tr><td>${t.premium}</td><td class="num">${money(b.premium)}</td></tr><tr><td>${t.policyFee}</td><td class="num">${money(b.policyFee)}</td></tr>
<tr><td>${t.vat} ${Math.round(b.vatRate * 100)}%</td><td class="num">${money(b.tax)}</td></tr><tr class="total"><th>${t.total}</th><td class="num">${money(b.total)}</td></tr></tbody></table>${footer}`;
    return shell({ lang, title: `${t.invoice} ${policy.policy_no}`, body });
  }
  if (type === 'annex') {
    const rows = (r.employees || []).map((e) => `<tr><td>${esc(e.name)}</td><td class="num">${esc(mask(e.idNo))}</td><td>${esc(e.jobTitle)}</td><td>${esc(catName(e.category))}</td></tr>`).join('');
    const body = `${head(t.annex)}${parties}<table><thead><tr><th>${t.name}</th><th>${t.id}</th><th>${t.job}</th><th>${t.category}</th></tr></thead><tbody>${rows}</tbody></table>${footer}`;
    return shell({ lang, title: `${t.annex} ${policy.policy_no}`, body });
  }
  if (type === 'certificate') {
    const body = `${head(t.certificate)}<p>${esc(t.certText)}</p>${parties}<table><tr><th>${t.employees}</th><td>${policy.rating.employees}</td></tr></table>${sections}${statutory}${footer}`;
    return shell({ lang, title: `${t.certificate} ${policy.policy_no}`, body });
  }
  const lines = (policy.rating.lines || []).map((l) => `<tr><td>${esc(catName(l.category))}</td><td class="num">${l.headcount}</td><td class="num">${money(l.annualWages)}</td></tr>`).join('');
  const ext = (r.extensions || []).map((c) => `<li>${esc(loc(cfg.extensions.find((x) => x.code === c)?.name))}</li>`).join('');
  const body = `${head(t.schedule)}${parties}<table><thead><tr><th>${t.jobType}</th><th class="num">${t.employees}</th><th class="num">${t.wages}</th></tr></thead><tbody>${lines}</tbody></table>
${sections}${ext ? `<h2>${t.extensions}</h2><ul>${ext}</ul>` : ''}${policy.uw_terms?.warranty ? `<h2>${t.warranty}</h2><p>${esc(policy.uw_terms.warranty)}</p>` : ''}
<table><tr><th>${t.premium}</th><td class="num">${money(b.premium)}</td></tr><tr><th>${t.policyFee}</th><td class="num">${money(b.policyFee)}</td></tr><tr><th>${t.vat}</th><td class="num">${money(b.tax)}</td></tr><tr class="total"><th>${t.total}</th><td class="num">${money(b.total)}</td></tr></table>${statutory}${footer}`;
  return shell({ lang, title: `${t.schedule} ${policy.policy_no}`, body });
}

module.exports = { renderWc, mask };
