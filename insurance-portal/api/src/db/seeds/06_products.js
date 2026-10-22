/**
 * Product configuration seed, built from each product's current configuration and UAE rate
 * tables so prices are unchanged: covers (with pricing), deductibles (with rating factors),
 * example discounts / loadings (inactive), charges (policy fees) and taxes (VAT by country).
 */
const j = (v) => JSON.stringify(v);

exports.seed = async function seed(knex) {
  await knex('lobs').insert([
    { code: 'fire', name_en: 'Property – Fire & Allied Perils', name_ar: 'الممتلكات – الحريق والمخاطر المرتبطة', sort: 1 },
    { code: 'marine', name_en: 'Marine Cargo', name_ar: 'تأمين البضائع المنقولة', sort: 2 },
    { code: 'wc', name_en: 'Liability – Workmen’s Compensation', name_ar: 'المسؤولية – تعويض العمال', sort: 3 },
    { code: 'engineering', name_en: 'Engineering', name_ar: 'التأمين الهندسي', sort: 4 },
  ]);
  const descriptions = {
    FIRE: ['Business premises, fit-out, equipment and stock against fire and allied perils.', 'المباني التجارية والتجهيزات والمعدات والمخزون ضد الحريق والمخاطر المرتبطة.'],
    MARINE: ['Goods in transit: single shipments, inland transit and annual open covers.', 'البضائع أثناء النقل: شحنات فردية ونقل داخلي وأغطية مفتوحة سنوية.'],
    WC: ['Statutory compensation, employer’s liability and medical expenses for work injuries.', 'التعويض القانوني ومسؤولية صاحب العمل والنفقات الطبية لإصابات العمل.'],
    ENG: ['Contractors’ plant, construction and erection projects, machinery and electronic equipment.', 'معدات المقاولين ومشاريع الإنشاء والتركيب والآلات والأجهزة الإلكترونية.'],
  };
  for (const [code, [en, ar]] of Object.entries(descriptions)) {
    // eslint-disable-next-line no-await-in-loop
    await knex('products').where({ code }).update({ description_en: en, description_ar: ar, effective_from: '2026-01-01' });
  }

  const tables = async (product) => Object.fromEntries((await knex('rate_tables').where({ product_code: product, country_code: 'AE', status: 'approved' })).map((r) => [r.table_key, r.data]));
  const products = Object.fromEntries((await knex('products')).map((p) => [p.code, p]));
  const covers = [];
  const add = (product, code, type, name, description, pricing, attributes, referral, sort) => covers.push({
    product_code: product, code, cover_type: type, name_en: name.en, name_ar: name.ar, description_en: description?.en || null, description_ar: description?.ar || null,
    pricing: pricing ? j(pricing) : null, attributes: j(attributes || {}), referral: Boolean(referral), sort,
  });

  const fire = await tables('FIRE');
  products.FIRE.config.perils.forEach((p, i) => add('FIRE', `P${String(i + 1).padStart(2, '0')}`, 'basic', p, null, null, {}, false, i + 1));
  products.FIRE.config.extensions.forEach((e, i) => { const { code, name, description, referral, ...attr } = e; add('FIRE', code, 'optional', name, description, fire.extensions[code], attr, referral, 20 + i); });

  const marine = await tables('MARINE');
  products.MARINE.config.clauses.forEach((c, i) => add('MARINE', c.code, 'clause', c.name, c.description, null, {}, false, i + 1));
  products.MARINE.config.extensions.forEach((e, i) => { const { code, name, description, referral, ...attr } = e; add('MARINE', code, 'optional', name, description, marine.extensions[code], attr, referral, 20 + i); });

  const wc = await tables('WC');
  Object.entries(products.WC.config.sections).forEach(([code, name], i) => add('WC', `SEC_${code}`, 'basic', name, null, null, { section: code }, false, i + 1));
  products.WC.config.extensions.forEach((e, i) => { const { code, name, description, referral, ...attr } = e; add('WC', code, 'optional', name, description, wc.extensions[code], attr, referral, 20 + i); });

  const eng = await tables('ENG');
  products.ENG.config.addOns.forEach((e, i) => { const { code, name, description, ...attr } = e; add('ENG', code, 'optional', name, description, eng.addOns[code], attr, false, 20 + i); });
  await knex('product_covers').insert(covers);

  const d = products.FIRE.config.deductibles;
  await knex('product_deductibles').insert([
    { product_code: 'FIRE', code: 'standard', name_en: d[0].name.en, name_ar: d[0].name.ar, detail_en: d[0].detail.en, detail_ar: d[0].detail.ar, deductible_type: 'greater_of', amount: 2500, percent: 0.01, rating_factor: fire.factors.deductible.standard, is_default: true, sort: 1 },
    { product_code: 'FIRE', code: 'high', name_en: d[1].name.en, name_ar: d[1].name.ar, detail_en: d[1].detail.en, detail_ar: d[1].detail.ar, deductible_type: 'fixed', amount: 10000, rating_factor: fire.factors.deductible.high, sort: 2 },
  ]);

  await knex('premium_adjustments').insert([
    { product_code: 'FIRE', code: 'ONLINE', name_en: 'Online purchase discount', name_ar: 'خصم الشراء عبر الإنترنت', kind: 'discount', percent: 0.05, channels: j(['b2c']), priority: 10, stackable: true, active: false },
    { product_code: 'FIRE', code: 'NO_CLAIMS', name_en: 'No-claims discount', name_ar: 'خصم عدم المطالبات', kind: 'discount', percent: 0.03, condition: j({ fact: 'claims3y', op: 'eq', value: 0 }), priority: 20, stackable: true, active: false },
    { product_code: 'MARINE', code: 'HIGH_RISK_ROUTE', name_en: 'High-risk route loading', name_ar: 'تحميل المسارات عالية الخطورة', kind: 'loading', percent: 0.25, condition: j({ fact: 'highRiskRoute', op: 'eq', value: true }), priority: 10, stackable: true, active: false },
    { product_code: 'WC', code: 'LARGE_WORKFORCE', name_en: 'Large workforce discount', name_ar: 'خصم القوى العاملة الكبيرة', kind: 'discount', percent: 0.05, condition: j({ fact: 'employees', op: 'gte', value: 100 }), priority: 10, stackable: false, active: false },
  ]);

  const fee = (code, en, ar, product, amount, condition, sort) => ({ code, name_en: en, name_ar: ar, product_code: product, country_code: 'AE', charge_type: 'fixed', amount, taxable: true, transactions: j(['new_business', 'renewal']), condition: condition ? j(condition) : null, sort });
  await knex('charges').insert([
    fee('POLICY_FEE', 'Policy fee', 'رسوم الوثيقة', 'FIRE', fire.charges.policyFee, null, 1),
    fee('POLICY_FEE', 'Policy fee', 'رسوم الوثيقة', 'MARINE', marine.charges.policyFee, { fact: 'productType', op: 'ne', value: 'open_cover' }, 1),
    fee('OC_FEE', 'Open cover fee', 'رسوم الغطاء المفتوح', 'MARINE', marine.charges.openCoverFee, { fact: 'productType', op: 'eq', value: 'open_cover' }, 2),
    fee('POLICY_FEE', 'Policy fee', 'رسوم الوثيقة', 'WC', wc.charges.policyFee, null, 1),
    fee('POLICY_FEE', 'Policy fee', 'رسوم الوثيقة', 'ENG', eng.charges.policyFee, null, 1),
  ]);

  const countries = await knex('countries');
  await knex('taxes').insert(countries.map((c) => ({ code: 'VAT', name_en: 'VAT', name_ar: 'ضريبة القيمة المضافة', country_code: c.code, rate: c.vat_rate, applies_to_fees: true, priority: 100 })));
  // Marine BRD: exports zero-rated (placeholder; Compliance to confirm).
  await knex('taxes').insert({ code: 'VAT', name_en: 'VAT (zero-rated export)', name_ar: 'ضريبة القيمة المضافة (تصدير بنسبة صفر)', country_code: 'AE', product_code: 'MARINE', rate: 0, applies_to_fees: true, priority: 10,
    condition: j({ all: [{ fact: 'productType', op: 'eq', value: 'single' }, { fact: 'direction', op: 'eq', value: 'export' }] }) });

  // Admin privilege for product configuration.
  await knex('permissions').insert({ code: 'admin.products', module: 'admin', description: 'Configure lines of business, products, covers, deductibles, discounts, charges and taxes' });
  const cfg = await knex('roles').where({ code: 'config_admin' }).first();
  await knex('role_permissions').insert({ role_id: cfg.id, permission_code: 'admin.products' });
};
