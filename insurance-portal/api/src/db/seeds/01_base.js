/**
 * Base seed. All rates, limits and fees are PLACEHOLDERS from the Fire BRD for
 * configuration testing; underwriting must replace them before go-live.
 * Arabic text should be reviewed by a native-speaking insurance translator.
 */
const bcrypt = require('bcryptjs');

const j = (v) => JSON.stringify(v);

const COUNTRIES = [
  { code: 'AE', name_en: 'United Arab Emirates', name_ar: 'الإمارات العربية المتحدة', currency: 'AED', currency_decimals: 2, vat_rate: 0.05, regulator: 'Central Bank of the UAE (CBUAE)', conventional_allowed: true, takaful_allowed: true, free_look_days: 15, active: true },
  { code: 'SA', name_en: 'Saudi Arabia', name_ar: 'المملكة العربية السعودية', currency: 'SAR', currency_decimals: 2, vat_rate: 0.15, regulator: 'Insurance Authority (IA)', conventional_allowed: false, takaful_allowed: true, free_look_days: 15, active: false },
  { code: 'OM', name_en: 'Oman', name_ar: 'سلطنة عُمان', currency: 'OMR', currency_decimals: 3, vat_rate: 0.05, regulator: 'Financial Services Authority (FSA)', conventional_allowed: true, takaful_allowed: true, free_look_days: 15, active: false },
  { code: 'QA', name_en: 'Qatar', name_ar: 'قطر', currency: 'QAR', currency_decimals: 2, vat_rate: 0, regulator: 'Qatar Central Bank (QCB)', conventional_allowed: true, takaful_allowed: true, free_look_days: 15, active: false },
  { code: 'BH', name_en: 'Bahrain', name_ar: 'البحرين', currency: 'BHD', currency_decimals: 3, vat_rate: 0.10, regulator: 'Central Bank of Bahrain (CBB)', conventional_allowed: true, takaful_allowed: true, free_look_days: 15, active: false },
  { code: 'KW', name_en: 'Kuwait', name_ar: 'الكويت', currency: 'KWD', currency_decimals: 3, vat_rate: 0, regulator: 'Insurance Regulatory Unit (IRU)', conventional_allowed: true, takaful_allowed: true, free_look_days: 15, active: false },
];

const t = (en, ar) => ({ en, ar });

const FIRE_CONFIG = {
  occupancyGroups: [
    { code: 'shop', name: t('Shop', 'متجر') },
    { code: 'office', name: t('Office', 'مكتب') },
    { code: 'restaurant', name: t('Restaurant / Café', 'مطعم / مقهى') },
    { code: 'workshop', name: t('Workshop', 'ورشة') },
    { code: 'warehouse', name: t('Warehouse', 'مستودع') },
    { code: 'clinic', name: t('Clinic', 'عيادة') },
    { code: 'fuel', name: t('Fuel station', 'محطة وقود') },
    { code: 'other', name: t('Other', 'أخرى') },
  ],
  assetGroups: [
    { code: 'BLD', name: t('Building', 'المبنى'), basis: t('Reinstatement value. Usually insured by the owner.', 'قيمة إعادة البناء. يؤمّنه المالك عادةً.') },
    { code: 'IMP', name: t('Fit-out and tenant improvements', 'التجهيزات وتحسينات المستأجر'), basis: t('Shelving, partitions, ceilings, flooring, lighting. Reinstatement value.', 'الرفوف والفواصل والأسقف والأرضيات والإنارة. قيمة الاستبدال.') },
    { code: 'PLM', name: t('Plant, machinery and equipment', 'الآلات والمعدات'), basis: t('Chillers, generators, production equipment. Reinstatement value.', 'المبردات والمولدات ومعدات الإنتاج. قيمة الاستبدال.') },
    { code: 'FFF', name: t('Furniture, fixtures and office equipment', 'الأثاث والتركيبات والمعدات المكتبية'), basis: t('Counters, furniture, computers. Reinstatement value.', 'الطاولات والأثاث وأجهزة الحاسوب. قيمة الاستبدال.') },
    { code: 'STK', name: t('Stock', 'المخزون'), basis: t('Goods for sale at cost price. Enter your highest stock level in the year.', 'البضائع المعدّة للبيع بسعر التكلفة. أدخل أعلى مستوى للمخزون خلال السنة.') },
    { code: 'OTH', name: t('Documents and computer records', 'المستندات وسجلات الحاسوب'), basis: t('Cost to rewrite or restore, up to 50,000.', 'تكلفة إعادة الكتابة أو الاستعادة، بحد أقصى 50,000.') },
  ],
  constructionClasses: [
    { code: 'concrete', name: t('Concrete / fire-rated', 'خرسانة / مقاوم للحريق') },
    { code: 'mixed', name: t('Mixed', 'مختلط') },
    { code: 'light', name: t('Light steel / sandwich panel', 'هيكل فولاذي خفيف / ألواح ساندويتش') },
  ],
  buildingAges: [
    { code: 'lt10', name: t('Under 10 years', 'أقل من 10 سنوات') },
    { code: '10to25', name: t('10 to 25 years', 'من 10 إلى 25 سنة') },
    { code: 'gt25', name: t('Over 25 years', 'أكثر من 25 سنة') },
  ],
  floorLevels: [
    { code: 'ground', name: t('Ground floor', 'الطابق الأرضي') },
    { code: 'upper', name: t('Upper floor', 'طابق علوي') },
    { code: 'basement', name: t('Basement', 'القبو') },
  ],
  interests: [
    { code: 'owner', name: t('Owner', 'مالك') },
    { code: 'tenant', name: t('Tenant', 'مستأجر') },
    { code: 'lessee', name: t('Lessee / financier', 'مستأجر تمويلي / ممول') },
  ],
  deductibles: [
    { code: 'standard', name: t('Standard deductible', 'التحمل القياسي'), detail: t('2,500 or 1% of claim, whichever is higher', '2,500 أو 1% من المطالبة، أيهما أعلى') },
    { code: 'high', name: t('Higher deductible', 'تحمل أعلى'), detail: t('10,000 per claim, lower premium', '10,000 لكل مطالبة، بقسط أقل') },
  ],
  extensions: [
    { code: 'X01', name: t('Accidental damage', 'الأضرار العرضية'), description: t('Sudden, visible damage not listed in the standard perils', 'الأضرار المفاجئة والظاهرة غير المدرجة في المخاطر القياسية') },
    { code: 'X02', name: t('Electrical and electronic damage', 'الأضرار الكهربائية والإلكترونية'), description: t('Short circuit, overload and self-heating of equipment', 'التماس الكهربائي والحمل الزائد والتسخين الذاتي للمعدات') },
    { code: 'X03', name: t('Terrorism and sabotage', 'الإرهاب والتخريب'), description: t('Damage from acts of terrorism', 'الأضرار الناتجة عن الأعمال الإرهابية') },
    { code: 'X05', name: t('Loss of rent', 'فقدان الإيجار'), description: t('Rent for alternative premises, up to 12 months', 'إيجار مقر بديل لمدة تصل إلى 12 شهرًا'), input: 'rentSI' },
    { code: 'X06', name: t('Escalation clause', 'شرط التصاعد'), description: t('Sum insured rises with costs during the year', 'زيادة مبلغ التأمين مع ارتفاع التكاليف خلال السنة') },
    { code: 'X07', name: t('Waiver of under-insurance', 'التنازل عن شرط النسبية'), description: t('Claims not reduced if values are slightly low (small businesses only)', 'عدم تخفيض المطالبات إذا كانت القيم أقل قليلًا (للمنشآت الصغيرة فقط)') },
    { code: 'X08', name: t('Stock in cold storage', 'المخزون في التخزين المبرد'), description: t('Deterioration of chilled or frozen stock. Needs underwriter review.', 'تلف المخزون المبرد أو المجمد. يتطلب مراجعة المكتتب.'), referral: true },
  ],
  perils: [
    t('Fire and lightning', 'الحريق والصواعق'),
    t('Explosion and implosion', 'الانفجار والانفجار الداخلي'),
    t('Storm, flood and inundation', 'العواصف والفيضانات وطغيان المياه'),
    t('Earthquake', 'الزلازل'),
    t('Riot, strike and malicious damage', 'الشغب والإضراب والأضرار الكيدية'),
    t('Impact by vehicles, aircraft or falling objects', 'الاصطدام بالمركبات أو الطائرات أو الأجسام الساقطة'),
    t('Burst pipes and overflowing tanks', 'انفجار الأنابيب وفيضان الخزانات'),
    t('Subsidence and landslide', 'الهبوط الأرضي والانهيارات'),
    t('Sprinkler leakage and smoke damage', 'تسرب مرشات الإطفاء وأضرار الدخان'),
  ],
  exclusions: [
    t('War, nuclear and radioactive risks', 'الحرب والمخاطر النووية والإشعاعية'),
    t('Terrorism, unless you add it', 'الإرهاب، ما لم تقم بإضافته'),
    t('Wear and tear and gradual deterioration', 'البلى والتدهور التدريجي'),
    t('Electrical breakdown, unless you add it', 'الأعطال الكهربائية، ما لم تقم بإضافتها'),
    t('Theft and burglary', 'السرقة والسطو'),
    t('Business interruption and loss of profit', 'توقف الأعمال وخسارة الأرباح'),
  ],
  claimCauses: [
    { code: 'fire', name: t('Fire', 'حريق') },
    { code: 'flood_storm', name: t('Flood or storm', 'فيضان أو عاصفة') },
    { code: 'water', name: t('Burst pipe / water damage', 'انفجار أنابيب / أضرار المياه') },
    { code: 'impact', name: t('Impact damage', 'أضرار الاصطدام') },
    { code: 'malicious', name: t('Riot or malicious damage', 'شغب أو أضرار كيدية') },
    { code: 'other', name: t('Other', 'أخرى') },
  ],
  coveredCauses: ['fire', 'flood_storm', 'water', 'impact', 'malicious'],
};

const occ = (code, group, en, ar, ratePermille, hazard, status = 'accept') => ({ code, group, name: t(en, ar), ratePermille, hazard, status });

const FIRE_RATES_AE = {
  occupancies: [
    occ('SHOP_GROCERY', 'shop', 'Grocery / supermarket', 'بقالة / سوبرماركت', 0.75, 'low'),
    occ('SHOP_GARMENTS', 'shop', 'Garments and textiles', 'ملابس ومنسوجات', 0.75, 'low'),
    occ('SHOP_ELECTRONICS', 'shop', 'Electronics and mobiles', 'إلكترونيات وهواتف', 0.85, 'low'),
    occ('SHOP_PHARMACY', 'shop', 'Pharmacy', 'صيدلية', 0.70, 'low'),
    occ('SHOP_FIREWORKS', 'shop', 'Fireworks and explosives', 'ألعاب نارية ومتفجرات', 0, 'high', 'decline'),
    occ('OFFICE_GENERAL', 'office', 'Office', 'مكتب', 0.40, 'low'),
    occ('REST_FRYING', 'restaurant', 'Restaurant with deep-fat frying', 'مطعم مع قلي عميق', 1.50, 'medium'),
    occ('REST_CAFE', 'restaurant', 'Café, no cooking', 'مقهى بدون طهي', 1.00, 'low'),
    occ('WORKSHOP_LIGHT', 'workshop', 'Light assembly workshop', 'ورشة تجميع خفيف', 1.80, 'medium'),
    occ('WORKSHOP_SPRAY', 'workshop', 'Vehicle workshop with spray painting', 'ورشة سيارات مع رش الطلاء', 2.20, 'high'),
    occ('WAREHOUSE_GENERAL', 'warehouse', 'General goods warehouse', 'مستودع بضائع عامة', 1.25, 'low'),
    occ('CLINIC_GENERAL', 'clinic', 'Clinic', 'عيادة', 0.60, 'low'),
    occ('FUEL_STATION', 'fuel', 'Fuel station', 'محطة وقود', 2.50, 'high'),
    occ('OTHER_GENERAL', 'other', 'Other business', 'نشاط آخر', 1.00, 'medium'),
  ],
  factors: {
    construction: { concrete: 0.9, mixed: 1.1, light: 1.4 },
    protection: { sprinklers: 0.8, alarm: 0.95, extinguishers: 1.0, none: 1.2 },
    civilDefence: { yes: 1.0, no: 1.15 },
    natcat: { low: 1.0, medium: 1.15, high: 1.3 },
    claims: { 0: 0.95, 1: 1.0, 2: 1.25 },
    buildingAge: { lt10: 1.0, '10to25': 1.05, gt25: 1.15 },
    siBands: [
      { upTo: 1000000, factor: 1.0 },
      { upTo: 5000000, factor: 0.95 },
      { upTo: 20000000, factor: 0.9 },
      { upTo: null, factor: 0.85 },
    ],
    deductible: { standard: 1.0, high: 0.92 },
  },
  extensions: {
    X01: { method: 'loading', pct: 0.10 },
    X02: { method: 'rate_on_groups', groups: ['PLM', 'FFF'], permille: 0.6 },
    X03: { method: 'rate_on_total', permille: 0.1 },
    X05: { method: 'rate_on_input', input: 'rentSI', permille: 1.0 },
    X06: { method: 'loading', pct: 0.05 },
    X07: { method: 'loading', pct: 0.05, tier1Only: true },
    X08: { method: 'referral_only' },
  },
  charges: { minPremium: 500, policyFee: 50, othSubLimit: 50000 },
};

const FIRE_AE_SETTINGS = {
  tiers: { tier1: 5000000, tier2: 50000000 },
  quoteValidityDays: 30,
  maxInceptionDaysAhead: 60,
  maxLocationsB2C: 5,
  authority: {
    b2c: { maxLocationSI: 5000000, maxDiscount: 0, hazards: ['low'] },
    standard: { maxLocationSI: 5000000, maxDiscount: 0.10, hazards: ['low'] },
    preferred: { maxLocationSI: 20000000, maxDiscount: 0.20, hazards: ['low', 'medium'] },
    underwriter: { maxLocationSI: 20000000, maxDiscount: 0.15 },
    uw_manager: { maxLocationSI: null, maxDiscount: null },
  },
  numbering: { lineCode: 'FIR' },
  uwSlaHours: { tier1: 24, tier2: 72 },
  shortPeriodScale: [
    { maxDays: 30, retain: 0.25 },
    { maxDays: 90, retain: 0.40 },
    { maxDays: 180, retain: 0.70 },
    { maxDays: 270, retain: 0.85 },
    { maxDays: 366, retain: 1.0 },
  ],
  minEndorsementPremium: 50,
  // UW-11: total insured at one building / site across all our active policies.
  accumulationLimitPerSite: 100000000,
  renewal: { noticeDays: 45, reminderDays: [45, 30, 15, 7, 1], autoRenewDaysBefore: 7, graceDays: 30 },
};

const rule = (code, en, ar, condition, sort) => ({ product_code: 'FIRE', country_code: null, code, description_en: en, description_ar: ar, condition: j(condition), active: true, sort });

const FIRE_RULES = [
  rule('UW-01', 'Sum insured at a location is above the limit for this channel or broker', 'مبلغ التأمين في أحد المواقع يتجاوز الحد المسموح لهذه القناة أو الوسيط', { fact: 'exceedsAutoLimit', op: 'eq', value: true }, 1),
  rule('UW-02', 'Business activity is medium or high hazard', 'النشاط التجاري ذو خطورة متوسطة أو عالية', { fact: 'hazardOutsideAuthority', op: 'eq', value: true }, 2),
  rule('UW-03', 'Light or sandwich-panel construction with more than 1 million insured', 'إنشاء خفيف أو ألواح ساندويتش بمبلغ تأمين يزيد على مليون', { fact: 'lightConstructionOver1m', op: 'eq', value: true }, 3),
  rule('UW-04', 'No valid Civil Defence certificate', 'لا توجد شهادة دفاع مدني سارية', { fact: 'noCivilDefence', op: 'eq', value: true }, 4),
  rule('UW-05', 'Two or more fire claims in the last 3 years', 'مطالبتان أو أكثر بسبب الحريق خلال آخر 3 سنوات', { fact: 'claims3y', op: 'gte', value: 2 }, 5),
  rule('UW-06', 'High flood zone or stock kept in a basement', 'منطقة فيضانات عالية الخطورة أو تخزين المخزون في القبو', { any: [{ fact: 'highNatcat', op: 'eq', value: true }, { fact: 'basementStock', op: 'eq', value: true }] }, 6),
  rule('UW-07', 'Discount requested is above the broker’s band', 'الخصم المطلوب يتجاوز النطاق المسموح للوسيط', { fact: 'discountExceedsBand', op: 'eq', value: true }, 7),
  rule('UW-08', 'An extension that needs underwriter review was selected', 'تم اختيار تغطية إضافية تتطلب مراجعة المكتتب', { fact: 'hasReferralExtension', op: 'eq', value: true }, 8),
  rule('UW-09', 'Sanctions screening needs review', 'فحص العقوبات يتطلب مراجعة', { fact: 'sanctionsHit', op: 'eq', value: true }, 9),
  rule('UW-10', 'A previous insurer declined or imposed special terms', 'رفضت شركة تأمين سابقة الطلب أو فرضت شروطًا خاصة', { fact: 'previouslyDeclined', op: 'eq', value: true }, 10),
  rule('UW-11', 'Total we insure at this building would exceed the accumulation limit', 'سيتجاوز إجمالي ما نؤمّنه في هذا المبنى حد التراكم المسموح', { fact: 'accumulationExceeded', op: 'eq', value: true }, 11),
];

exports.seed = async function seed(knex) {
  const tables = ['documents', 'document_requirements', 'config_changes', 'rating_models', 'rule_tests', 'decision_tables', 'rules', 'rule_sets', 'taxes', 'charges', 'premium_adjustments', 'product_deductibles', 'product_covers', 'help_articles', 'field_definitions', 'licences', 'user_notifications', 'outbox', 'notification_rules', 'message_templates', 'number_formats', 'system_parameters', 'lookup_values', 'lookup_lists', 'api_keys', 'customer_users', 'surveys', 'notification_log', 'referrals', 'oc_certificates', 'oc_declarations', 'endorsements', 'invoices', 'endorsement_requests', 'audit_log', 'claims', 'commissions', 'commission_schemes', 'payments', 'endorsements', 'policies', 'referral_messages', 'referrals', 'quotes', 'referral_rules', 'rate_tables', 'product_countries', 'products', 'otp_codes', 'customers', 'users', 'brokers', 'countries', 'lobs', 'sequences', 'role_permissions', 'roles', 'permissions'];
  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    await knex(table).del();
  }

  await knex('countries').insert(COUNTRIES);

  await knex('products').insert({
    code: 'FIRE', line: 'fire', name_en: 'Fire & Allied Perils', name_ar: 'الحريق والمخاطر المرتبطة', rater: 'fire', status: 'active', config: j(FIRE_CONFIG),
  });

  await knex('product_countries').insert([
    { product_code: 'FIRE', country_code: 'AE', enabled_b2c: true, enabled_b2b: true, settings: j(FIRE_AE_SETTINGS) },
    { product_code: 'FIRE', country_code: 'OM', enabled_b2c: false, enabled_b2b: false, settings: j(FIRE_AE_SETTINGS) },
    { product_code: 'FIRE', country_code: 'SA', enabled_b2c: false, enabled_b2b: false, settings: j(FIRE_AE_SETTINGS) },
  ]);

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);

  const [standardBrokerId] = await knex('brokers').insert({
    name: 'Gulf Shield Insurance Brokers LLC', licence_no: 'BRK-0451', licence_expiry: '2027-06-30', tier: 'standard', commission_rate: 0.15, credit_limit: 250000, countries: j(['AE', 'OM']),
  });
  const [preferredBrokerId] = await knex('brokers').insert({
    name: 'Emirates Premier Brokers LLC', licence_no: 'BRK-0122', licence_expiry: '2027-12-31', tier: 'preferred', commission_rate: 0.175, credit_limit: 1000000, countries: j(['AE']),
  });

  const users = [
    { email: 'uw@portal.test', full_name: 'Ahmed Hassan', role: 'underwriter' },
    { email: 'uwm@portal.test', full_name: 'Layla Mansour', role: 'uw_manager' },
    { email: 'config1@portal.test', full_name: 'Ravi Menon', role: 'config_admin' },
    { email: 'config2@portal.test', full_name: 'Sara Khalil', role: 'config_admin' },
    { email: 'ops@portal.test', full_name: 'Omar Farouk', role: 'ops' },
    { email: 'engineer@portal.test', full_name: 'Yusuf Karim', role: 'risk_engineer' },
    { email: 'admin@gulfshield.test', full_name: 'Nadia Rahman', role: 'broker_admin', broker_id: standardBrokerId },
    { email: 'sara@gulfshield.test', full_name: 'Sara Kapoor', role: 'broker_user', broker_id: standardBrokerId },
    { email: 'agent@emiratespremier.test', full_name: 'Khalid Saeed', role: 'broker_user', broker_id: preferredBrokerId },
  ].map((u) => ({ ...u, password_hash: passwordHash }));
  await knex('users').insert(users);

  const [customerUserId] = await knex('users').insert({ mobile: '+971500000001', email: 'owner@alnoorgrocery.test', full_name: 'Mohammed Rafiq', role: 'customer' });
  await knex('customers').insert({
    user_id: customerUserId, country_code: 'AE', company_name: 'Al Noor Grocery LLC', trade_licence: 'DED-1023456', licence_expiry: '2027-03-14', licence_authority: 'Dubai', contact_name: 'Mohammed Rafiq', email: 'owner@alnoorgrocery.test', mobile: '+971500000001',
  });

  const configAdmin = await knex('users').where({ email: 'config1@portal.test' }).first();
  const checker = await knex('users').where({ email: 'config2@portal.test' }).first();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await knex('rate_tables').insert(Object.entries(FIRE_RATES_AE).map(([key, data]) => ({
    product_code: 'FIRE', country_code: 'AE', table_key: key, version: 1, status: 'approved', data: j(data), effective_from: now, created_by: configAdmin.id, submitted_by: configAdmin.id, approved_by: checker.id, approved_at: now, change_note: 'Initial placeholder rates from Fire BRD v0.1',
  })));

  await knex('referral_rules').insert(FIRE_RULES);
};

module.exports.FIRE_CONFIG = FIRE_CONFIG;
module.exports.FIRE_RATES_AE = FIRE_RATES_AE;
