/**
 * Policy documents as print-ready HTML in English or Arabic (right to left).
 * Browsers render Arabic shaping correctly; a PDF service (e.g. headless Chrome)
 * can print these same templates to PDF in production.
 */
const QRCode = require('qrcode');
const config = require('../../config');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const L = {
  en: {
    schedule: 'Policy schedule', certificate: 'Certificate of insurance', invoice: 'Tax invoice',
    policyNo: 'Policy number', product: 'Product', insured: 'Insured', licence: 'Trade licence', period: 'Period of insurance',
    from: 'From', to: 'to', location: 'Location', occupancy: 'Business activity', sumInsured: 'Sum insured', total: 'Total',
    perils: 'Insured perils', extensions: 'Extensions', deductible: 'Deductible', premium: 'Premium', policyFee: 'Policy fee',
    vat: 'VAT', amountDue: 'Total', lossPayee: 'Loss payee', warranty: 'Special conditions', currency: 'Currency',
    verify: 'Scan to verify this document', issued: 'Issued', broker: 'Broker', none: 'None', status: 'Status',
    certText: 'This certifies that the business named below holds a Fire & Allied Perils insurance policy for the period shown, subject to the policy terms, conditions and exclusions.',
    invoiceNo: 'Invoice number', taxNo: 'Customer tax number', description: 'Description', amount: 'Amount',
    footer: 'Licensed by', placeholder: '[INSURER LEGAL NAME]',
  },
  ar: {
    schedule: 'جدول الوثيقة', certificate: 'شهادة التأمين', invoice: 'فاتورة ضريبية',
    policyNo: 'رقم الوثيقة', product: 'المنتج', insured: 'المؤمَّن له', licence: 'الرخصة التجارية', period: 'مدة التأمين',
    from: 'من', to: 'إلى', location: 'الموقع', occupancy: 'النشاط التجاري', sumInsured: 'مبلغ التأمين', total: 'الإجمالي',
    perils: 'المخاطر المؤمَّن ضدها', extensions: 'التغطيات الإضافية', deductible: 'مبلغ التحمل', premium: 'القسط', policyFee: 'رسوم الوثيقة',
    vat: 'ضريبة القيمة المضافة', amountDue: 'الإجمالي', lossPayee: 'المستفيد من التعويض', warranty: 'شروط خاصة', currency: 'العملة',
    verify: 'امسح الرمز للتحقق من هذه الوثيقة', issued: 'تاريخ الإصدار', broker: 'الوسيط', none: 'لا يوجد', status: 'الحالة',
    certText: 'تشهد هذه الوثيقة بأن المنشأة المذكورة أدناه تحمل وثيقة تأمين ضد الحريق والمخاطر المرتبطة للمدة المبينة، وفقًا لشروط الوثيقة وأحكامها واستثناءاتها.',
    invoiceNo: 'رقم الفاتورة', taxNo: 'الرقم الضريبي للعميل', description: 'الوصف', amount: 'المبلغ',
    footer: 'مرخصة من', placeholder: '[الاسم القانوني لشركة التأمين]',
  },
};

function fmt(amount, currency, decimals, lang) {
  const n = Number(amount || 0).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${currency} ${n}`;
}

function shell({ lang, title, body }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap">
<style>
:root{--ink:#0F1B2D;--muted:#4A5568;--line:#D9DEE5;--brand:#12355B}
*{box-sizing:border-box}body{margin:0;font-family:'IBM Plex Sans','IBM Plex Sans Arabic',system-ui,sans-serif;color:var(--ink);font-size:13px;line-height:1.5;background:#fff}
.page{max-width:820px;margin:0 auto;padding:40px 44px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:3px solid var(--brand);padding-bottom:16px;margin-bottom:24px}
.logo{font-weight:700;font-size:18px;color:var(--brand)}h1{font-size:22px;margin:4px 0 0}
table{width:100%;border-collapse:collapse;margin:0 0 20px}th,td{text-align:start;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{width:34%;color:var(--muted);font-weight:600}td.num,th.num{text-align:end;font-variant-numeric:tabular-nums}
h2{font-size:15px;margin:24px 0 8px;color:var(--brand)}ul{margin:0;padding-inline-start:18px}
.qr{text-align:center;font-size:11px;color:var(--muted)}.qr img{width:96px;height:96px;display:block;margin:0 auto 4px}
.total td,.total th{font-weight:700;border-top:2px solid var(--ink)}
footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}
@media print{.page{padding:0}a{color:inherit}}
</style></head><body><div class="page">${body}</div></body></html>`;
}

async function render({ type, lang = 'en', policy, product, country, occupancyName }) {
  const t = L[lang] || L.en;
  const loc = (obj) => (obj && (obj[lang] || obj.en)) || '';
  const money = (v) => fmt(v, policy.currency, country.currency_decimals, lang);
  const verifyUrl = `${config.appUrl}/${lang}/verify/${encodeURIComponent(policy.policy_no)}`;
  const qr = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 192 });
  const p = policy.proposer || {};
  const risk = policy.risk_data;
  const cfg = product.config;
  const productName = lang === 'ar' ? product.name_ar : product.name_en;

  const head = (title) => `<header><div><div class="logo">${esc(t.placeholder)}</div><h1>${esc(title)}</h1><div>${esc(productName)}</div></div>
<div class="qr"><img src="${qr}" alt="${esc(t.verify)}"><div>${esc(t.verify)}</div></div></header>`;

  const partyTable = `<table>
<tr><th>${t.policyNo}</th><td>${esc(policy.policy_no)}</td></tr>
<tr><th>${t.insured}</th><td>${esc(p.companyName)}</td></tr>
<tr><th>${t.licence}</th><td>${esc(p.tradeLicence)}</td></tr>
<tr><th>${t.period}</th><td>${t.from} ${esc(policy.inception_date)} ${t.to} ${esc(policy.expiry_date)}</td></tr>
<tr><th>${t.occupancy}</th><td>${esc(occupancyName)}</td></tr>
<tr><th>${t.lossPayee}</th><td>${esc(p.lossPayee || t.none)}</td></tr>
</table>`;

  const footer = `<footer>${esc(t.footer)} ${esc(country.regulator)} · ${t.issued}: ${esc(new Date(policy.created_at).toISOString().slice(0, 10))}</footer>`;

  if (type === 'certificate') {
    const body = `${head(t.certificate)}<p>${esc(t.certText)}</p>${partyTable}
<table><tr><th>${t.sumInsured}</th><td>${money(policy.sum_insured)}</td></tr><tr><th>${t.status}</th><td>${esc(policy.status)}</td></tr></table>${footer}`;
    return shell({ lang, title: `${t.certificate} ${policy.policy_no}`, body });
  }

  const b = policy.rating.breakdown;
  if (type === 'invoice') {
    const body = `${head(t.invoice)}<table>
<tr><th>${t.invoiceNo}</th><td>INV-${esc(policy.policy_no)}</td></tr>
<tr><th>${t.insured}</th><td>${esc(p.companyName)}</td></tr>
<tr><th>${t.taxNo}</th><td>${esc(p.taxNo || t.none)}</td></tr></table>
<table><thead><tr><th>${t.description}</th><th class="num">${t.amount}</th></tr></thead><tbody>
<tr><td>${t.premium} · ${esc(policy.policy_no)}</td><td class="num">${money(b.premium)}</td></tr>
<tr><td>${t.policyFee}</td><td class="num">${money(b.policyFee)}</td></tr>
<tr><td>${t.vat} ${Math.round(Number(b.vatRate) * 100)}%</td><td class="num">${money(b.tax)}</td></tr>
<tr class="total"><th>${t.amountDue}</th><td class="num">${money(b.total)}</td></tr></tbody></table>${footer}`;
    return shell({ lang, title: `${t.invoice} ${policy.policy_no}`, body });
  }

  // Schedule
  const assetName = (code) => loc(cfg.assetGroups.find((g) => g.code === code)?.name) || code;
  const locationsHtml = risk.locations.map((l, i) => {
    const rows = Object.entries(l.sumsInsured || {}).filter(([, v]) => Number(v) > 0)
      .map(([code, v]) => `<tr><td>${esc(assetName(code))}</td><td class="num">${money(v)}</td></tr>`).join('');
    const address = [l.address?.building, l.address?.area, l.address?.city].filter(Boolean).join(', ');
    return `<h2>${t.location} ${i + 1}: ${esc(address)}</h2><table><tbody>${rows}<tr class="total"><th>${t.total}</th><td class="num">${money(policy.rating.locations[i]?.sumInsured)}</td></tr></tbody></table>`;
  }).join('');
  const extNames = (risk.extensions || []).map((c) => loc(cfg.extensions.find((e) => e.code === c)?.name)).filter(Boolean);
  const ded = cfg.deductibles.find((d) => d.code === (b.deductible || 'standard'));
  const warranty = policy.uw_terms?.warranty;

  const body = `${head(t.schedule)}${partyTable}${locationsHtml}
<h2>${t.perils}</h2><ul>${cfg.perils.map((x) => `<li>${esc(loc(x))}</li>`).join('')}</ul>
<h2>${t.extensions}</h2><ul>${extNames.length ? extNames.map((x) => `<li>${esc(x)}</li>`).join('') : `<li>${t.none}</li>`}</ul>
<h2>${t.deductible}</h2><p>${esc(loc(ded?.name))}: ${esc(loc(ded?.detail))}</p>
${warranty ? `<h2>${t.warranty}</h2><p>${esc(warranty)}</p>` : ''}
<h2>${t.premium}</h2><table>
<tr><th>${t.premium}</th><td class="num">${money(b.premium)}</td></tr>
<tr><th>${t.policyFee}</th><td class="num">${money(b.policyFee)}</td></tr>
<tr><th>${t.vat}</th><td class="num">${money(b.tax)}</td></tr>
<tr class="total"><th>${t.amountDue}</th><td class="num">${money(b.total)}</td></tr></table>${footer}`;
  return shell({ lang, title: `${t.schedule} ${policy.policy_no}`, body });
}

module.exports = { render, shell, esc, fmt };
