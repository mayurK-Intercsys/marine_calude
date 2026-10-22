/**
 * Marine documents (FR-ISS-M02, M03, M05): certificate of insurance for a single or
 * inland transit or for a certificate under an open cover, the open-cover schedule,
 * and the tax invoice. Bilingual HTML; Arabic renders right to left.
 */
const QRCode = require('qrcode');
const config = require('../../config');
const { shell, esc, fmt } = require('./render');

const L = {
  en: {
    certificate: 'Certificate of marine cargo insurance', schedule: 'Open cover schedule', invoice: 'Tax invoice',
    certNo: 'Certificate number', policyNo: 'Policy number', insured: 'Insured', lossPayee: 'Loss payee / LC bank', goods: 'Goods',
    packing: 'Packing', voyage: 'Voyage', from: 'From', to: 'to', via: 'final destination', conveyance: 'Conveyance', sailing: 'Sailing on or about',
    insuredValue: 'Insured value', conditions: 'Conditions', deductible: 'Deductible', claims: 'In case of loss', lcWording: 'Letter of credit wording',
    claimsText: 'Do not give a clean receipt for damaged goods. Hold the carrier liable in writing and call the surveyor at destination: [CLAIMS AGENT].',
    original: 'Original', duplicate: 'Duplicate', period: 'Period', turnover: 'Estimated annual turnover', perSending: 'Limit per sending',
    commodity: 'Commodity', clause: 'Clause', rate: 'Agreed rate', war: 'War and strikes', basis: 'Premium basis',
    deposit: 'Deposit', perCertificate: 'Charged per certificate', included: 'Included', notIncluded: 'Not included',
    premium: 'Premium', policyFee: 'Policy fee', vat: 'VAT', total: 'Total', invoiceNo: 'Invoice number', description: 'Description', amount: 'Amount',
    verify: 'Scan to verify this document', placeholder: '[INSURER LEGAL NAME]', footer: 'Licensed by', interest: 'Insured interest',
  },
  ar: {
    certificate: 'شهادة تأمين البضائع المنقولة', schedule: 'جدول الغطاء المفتوح', invoice: 'فاتورة ضريبية',
    certNo: 'رقم الشهادة', policyNo: 'رقم الوثيقة', insured: 'المؤمَّن له', lossPayee: 'المستفيد / بنك الاعتماد', goods: 'البضاعة',
    packing: 'التغليف', voyage: 'الرحلة', from: 'من', to: 'إلى', via: 'الوجهة النهائية', conveyance: 'وسيلة النقل', sailing: 'الإبحار في أو نحو',
    insuredValue: 'القيمة المؤمَّنة', conditions: 'الشروط', deductible: 'مبلغ التحمل', claims: 'عند حدوث خسارة', lcWording: 'صيغة الاعتماد المستندي',
    claimsText: 'لا تُصدر إيصال استلام نظيفًا للبضائع المتضررة. حمّل الناقل المسؤولية كتابيًا واتصل بالمعاين في الوجهة: [وكيل المطالبات].',
    original: 'أصل', duplicate: 'نسخة', period: 'المدة', turnover: 'حجم الأعمال السنوي المقدَّر', perSending: 'الحد لكل إرسالية',
    commodity: 'السلعة', clause: 'الشرط', rate: 'السعر المتفق عليه', war: 'الحرب والإضرابات', basis: 'أساس القسط',
    deposit: 'دفعة مقدمة', perCertificate: 'يُحتسب لكل شهادة', included: 'مشمول', notIncluded: 'غير مشمول',
    premium: 'القسط', policyFee: 'رسوم الوثيقة', vat: 'ضريبة القيمة المضافة', total: 'الإجمالي', invoiceNo: 'رقم الفاتورة', description: 'الوصف', amount: 'المبلغ',
    verify: 'امسح الرمز للتحقق من هذه الوثيقة', placeholder: '[الاسم القانوني لشركة التأمين]', footer: 'مرخصة من', interest: 'المصلحة المؤمَّنة',
  },
};

async function renderMarine({ type, lang = 'en', policy, product, country, tables, certificate = null, copy = 'original' }) {
  const t = L[lang] || L.en;
  const loc = (o) => (o && (o[lang] || o.en)) || '';
  const cfg = product.config;
  const money = (v) => fmt(v, policy.currency, country.currency_decimals, lang);
  const p = policy.proposer || {};
  const docRef = certificate ? certificate.cert_no : policy.policy_no;
  const qr = await QRCode.toDataURL(`${config.appUrl}/${lang}/verify/${encodeURIComponent(policy.policy_no)}`, { margin: 0, width: 192 });
  const commodityName = (code) => loc(tables.commodities.find((c) => c.code === code)?.name) || code;
  const countryName = (code) => loc(tables.countries[code]?.name) || code;
  const option = (list, code) => loc(cfg[list].find((x) => x.code === code)?.name) || code;
  const head = (title) => `<header><div><div class="logo">${esc(t.placeholder)}</div><h1>${esc(title)}</h1><div>${esc(lang === 'ar' ? product.name_ar : product.name_en)}</div></div>
<div class="qr"><img src="${qr}" alt="${esc(t.verify)}"><div>${esc(t.verify)}</div></div></header>`;
  const footer = `<footer>${esc(t.footer)} ${esc(country.regulator)}</footer>`;

  if (type === 'invoice') {
    const b = policy.rating.breakdown;
    const body = `${head(t.invoice)}<table><tr><th>${t.invoiceNo}</th><td>INV-${esc(policy.policy_no)}</td></tr><tr><th>${t.insured}</th><td>${esc(p.companyName)}</td></tr></table>
<table><thead><tr><th>${t.description}</th><th class="num">${t.amount}</th></tr></thead><tbody>
<tr><td>${t.premium} · ${esc(policy.policy_no)}</td><td class="num">${money(b.premium)}</td></tr>
<tr><td>${t.policyFee}</td><td class="num">${money(b.policyFee)}</td></tr>
<tr><td>${t.vat} ${Math.round(Number(b.vatRate) * 100)}%</td><td class="num">${money(b.tax)}</td></tr>
<tr class="total"><th>${t.total}</th><td class="num">${money(b.total)}</td></tr></tbody></table>${footer}`;
    return shell({ lang, title: `${t.invoice} ${policy.policy_no}`, body });
  }

  const risk = policy.risk_data;
  if (risk.productType === 'open_cover' && !certificate) {
    const rows = (policy.rating.agreedRates || []).map((r) => `<tr><td>${esc(commodityName(r.commodity))}</td><td>${esc(option('clauses', r.clause))}</td><td class="num">${(r.rate * 100).toFixed(3)}%</td></tr>`).join('');
    const body = `${head(t.schedule)}<table>
<tr><th>${t.policyNo}</th><td>${esc(policy.policy_no)}</td></tr><tr><th>${t.insured}</th><td>${esc(p.companyName)}</td></tr>
<tr><th>${t.period}</th><td>${esc(policy.inception_date)} ${t.to} ${esc(policy.expiry_date)}</td></tr>
<tr><th>${t.interest}</th><td>${esc(risk.interest)}</td></tr>
<tr><th>${t.turnover}</th><td>${money(risk.estimatedTurnover)}</td></tr><tr><th>${t.perSending}</th><td>${money(risk.perSendingLimit)}</td></tr>
<tr><th>${t.war}</th><td>${risk.war || risk.srcc ? t.included : t.notIncluded}</td></tr>
<tr><th>${t.basis}</th><td>${risk.premiumBasis === 'deposit' ? `${t.deposit}: ${money(policy.premium)}` : t.perCertificate}</td></tr></table>
<table><thead><tr><th>${t.commodity}</th><th>${t.clause}</th><th class="num">${t.rate}</th></tr></thead><tbody>${rows}</tbody></table>${footer}`;
    return shell({ lang, title: `${t.schedule} ${policy.policy_no}`, body });
  }

  // Certificate of insurance: a single/inland policy, or a certificate under an open cover.
  const s = certificate ? certificate.shipment : risk;
  const r = certificate ? certificate.rating : policy.rating;
  const calc = r.sumInsuredCalc;
  const clauses = [option('clauses', s.clause), (certificate ? policy.risk_data.war : s.war) ? 'Institute War Clauses (Cargo)' : null, (certificate ? policy.risk_data.srcc : s.srcc) ? 'Institute Strikes Clauses (Cargo)' : null].filter(Boolean);
  const ded = r.breakdown.deductible;
  const body = `${head(t.certificate)}<p><strong>${copy === 'duplicate' ? t.duplicate : t.original}</strong></p><table>
<tr><th>${certificate ? t.certNo : t.policyNo}</th><td>${esc(docRef)}${certificate ? ` · ${t.policyNo} ${esc(policy.policy_no)}` : ''}</td></tr>
<tr><th>${t.insured}</th><td>${esc(p.companyName)}</td></tr>
<tr><th>${t.lossPayee}</th><td>${esc(s.lc ? `${s.lc.bank} · ${s.lc.number}` : p.lossPayee || '—')}</td></tr>
<tr><th>${t.goods}</th><td>${esc(commodityName(s.commodity))}${s.description ? ` — ${esc(s.description)}` : ''}</td></tr>
<tr><th>${t.packing}</th><td>${esc(option('packings', s.packing))} · ${esc(option('containers', s.container))}${s.marks ? ` · ${esc(s.marks)}` : ''}</td></tr>
<tr><th>${t.voyage}</th><td>${t.from} ${esc(s.origin.place)} (${esc(countryName(s.origin.country))}) ${t.to} ${esc(s.destination.place)} (${esc(countryName(s.destination.country))})${s.finalDestination ? `, ${t.via}: ${esc(s.finalDestination)}` : ''}</td></tr>
<tr><th>${t.conveyance}</th><td>${esc(option('modes', s.mode))}${s.vessel?.name ? ` · ${esc(s.vessel.name)}` : ''}${s.vessel?.imo ? ` · IMO ${esc(s.vessel.imo)}` : ''}${s.conveyanceRef ? ` · ${esc(s.conveyanceRef)}` : ''}</td></tr>
<tr><th>${t.sailing}</th><td>${esc(s.sailingDate)}</td></tr>
<tr><th>${t.insuredValue}</th><td>${esc(calc.currency)} ${Number(calc.siForeign).toLocaleString('en')} (${esc(s.incoterm)} + ${Math.round(calc.upliftPct * 100)}%) · ${money(r.sumInsured)}</td></tr>
<tr><th>${t.conditions}</th><td>${clauses.map(esc).join('<br>')}</td></tr>
<tr><th>${t.deductible}</th><td>${ded.pct ? `${(ded.pct * 100).toFixed(1)}% · ` : ''}min ${money(ded.min)}</td></tr>
${s.lc?.wording ? `<tr><th>${t.lcWording}</th><td>${esc(s.lc.wording)}</td></tr>` : ''}
</table><h2>${t.claims}</h2><p>${esc(t.claimsText)}</p>${footer}`;
  return shell({ lang, title: `${t.certificate} ${docRef}`, body });
}

module.exports = { renderMarine };
