/**
 * Workmen's Compensation & Employer's Liability (WC BRD v0.1).
 * Rates, plans and limits are PLACEHOLDERS. UAE statutory benefits follow the
 * government summary (u.ae): death / PTD = 24 months' basic wage, AED 18,000–200,000;
 * full wage for up to 6 months of treatment, then half wage for up to 6 more; MoHRE within 48 hours.
 * Compliance owns the statutory table. Arabic copy needs review by a native insurance translator.
 */
const j = (v) => JSON.stringify(v);
const t = (en, ar) => ({ en, ar });

const WC_CONFIG = {
  plans: [
    { code: 'essential', name: t('Essential', 'الأساسية'), description: t('Statutory compensation only — meets the legal minimum', 'التعويض القانوني فقط — يلبّي الحد الأدنى المطلوب قانونًا') },
    { code: 'standard', name: t('Standard', 'القياسية'), description: t('Adds Employer’s Liability if staff sue you', 'تضيف مسؤولية صاحب العمل إذا رفع الموظفون دعوى عليك') },
    { code: 'complete', name: t('Complete', 'الشاملة'), description: t('Adds treatment costs for injured staff', 'تضيف تكاليف علاج الموظفين المصابين') },
  ],
  sections: {
    A: t('Workmen’s Compensation (statutory)', 'تعويض العمال (القانوني)'),
    B: t('Employer’s Liability', 'مسؤولية صاحب العمل'),
    C: t('Medical expenses for work injuries', 'النفقات الطبية لإصابات العمل'),
  },
  policyTypes: [
    { code: 'unnamed', name: t('By headcount (unnamed)', 'حسب العدد (بدون أسماء)'), description: t('Number of staff and wages per job type. Good if staff change often.', 'عدد الموظفين والأجور لكل نوع وظيفة. مناسب إذا تغيّر الموظفون كثيرًا.') },
    { code: 'named', name: t('By name (employee list)', 'بالأسماء (قائمة الموظفين)'), description: t('Only listed people are covered. Joiners and leavers are updated online.', 'يُغطّى المدرجون فقط. تُحدَّث حالات الانضمام والمغادرة عبر الإنترنت.') },
  ],
  periods: [1, 3, 6, 12],
  elLimits: [1000000, 2000000, 5000000],
  extensions: [
    { code: 'X05', name: t('Travel to and from work in company transport', 'التنقل من وإلى العمل بمركبات الشركة'), description: t('Accidents on the way to work in your buses or vans', 'الحوادث في الطريق إلى العمل بحافلات الشركة') },
    { code: 'X06', name: t('Repatriation of remains and one escort', 'إعادة الجثمان ومرافق واحد'), description: t('Return to home country after a fatal work accident', 'العودة إلى البلد الأم بعد حادث عمل مميت') },
    { code: 'X04', name: t('Business trips abroad (up to 90 days)', 'رحلات العمل للخارج (حتى 90 يومًا)'), description: t('For staff travelling for work', 'للموظفين المسافرين لأغراض العمل') },
    { code: 'X03', name: t('Terrorism, riot and strike injuries', 'إصابات الإرهاب والشغب والإضراب'), description: t('Injuries from terrorism, riot or strike', 'الإصابات الناتجة عن الإرهاب أو الشغب أو الإضراب') },
    { code: 'X07', name: t('Higher treatment limit (+AED 25,000 each)', 'حد علاج أعلى (+25,000 درهم لكل موظف)'), description: t('Complete plan only', 'للخطة الشاملة فقط'), plans: ['complete'] },
    { code: 'X01', name: t('Occupational disease', 'الأمراض المهنية'), description: t('Illness caused by work over time. Needs underwriter review.', 'الأمراض الناتجة عن العمل بمرور الوقت. تتطلب مراجعة المكتتب.'), referral: true },
    { code: 'X02', name: t('Contractors’ and sub-contractors’ workers', 'عمال المقاولين والمقاولين من الباطن'), description: t('Workers you engage through contractors. Needs underwriter review.', 'العمال الذين تستعين بهم عبر مقاولين. يتطلب مراجعة المكتتب.'), referral: true },
  ],
  exclusions: [
    t('Injury caused on purpose, or under the influence of alcohol or drugs', 'الإصابة المتعمدة أو تحت تأثير الكحول أو المخدرات'),
    t('Injury outside work, unless you add commuting or travel cover', 'الإصابة خارج العمل، ما لم تُضِف تغطية التنقل أو السفر'),
    t('Occupational disease, unless added and approved', 'الأمراض المهنية، ما لم تُضَف ويُوافَق عليها'),
    t('Contractors’ workers, unless added and declared', 'عمال المقاولين، ما لم يُضافوا ويُصرَّح عنهم'),
    t('War and nuclear risks; terrorism unless added', 'الحرب والمخاطر النووية؛ والإرهاب ما لم يُضَف'),
    t('Workers not declared (headcount) or not listed (named)', 'العمال غير المصرّح عنهم (حسب العدد) أو غير المدرجين (بالأسماء)'),
  ],
  claimCauses: [
    { code: 'fracture', name: t('Fracture', 'كسر') },
    { code: 'wound', name: t('Cut or wound', 'جرح') },
    { code: 'burn', name: t('Burn', 'حرق') },
    { code: 'back', name: t('Back or muscle injury', 'إصابة الظهر أو العضلات') },
    { code: 'fall', name: t('Fall from height', 'سقوط من مرتفع') },
    { code: 'road', name: t('Road accident at work', 'حادث مروري أثناء العمل') },
    { code: 'other', name: t('Other', 'أخرى') },
  ],
  coveredCauses: ['fracture', 'wound', 'burn', 'back', 'fall', 'road'],
  severities: [
    { code: 'minor', name: t('Minor, back within 3 days', 'بسيطة، عودة خلال 3 أيام') },
    { code: 'off_work', name: t('Off work, recovering', 'منقطع عن العمل، قيد التعافي') },
    { code: 'permanent', name: t('Permanent disability expected', 'عجز دائم متوقع') },
    { code: 'fatal', name: t('Fatal', 'وفاة') },
  ],
};

const trade = (code, en, ar, hazardClass, factor, status = 'accept') => ({ code, name: t(en, ar), hazardClass, factor, status });
const cat = (code, en, ar, rate, medPerHead, minWage) => ({ code, name: t(en, ar), rate, medPerHead, minWage });

const WC_RATES_AE = {
  trades: [
    trade('RETAIL', 'Retail shop', 'متجر تجزئة', 1, 0.9),
    trade('OFFICE', 'Office and professional services', 'مكاتب وخدمات مهنية', 1, 0.9),
    trade('FURNITURE', 'Furniture trading and delivery', 'تجارة وتوصيل الأثاث', 2, 1.0),
    trade('RESTAURANT', 'Restaurant and catering', 'مطاعم وخدمات تموين', 2, 1.0),
    trade('CLEANING', 'Cleaning and facility services', 'خدمات التنظيف والمرافق', 2, 1.0),
    trade('LOGISTICS', 'Logistics and warehousing', 'الخدمات اللوجستية والتخزين', 2, 1.1),
    trade('SECURITY', 'Security guarding', 'خدمات الحراسة الأمنية', 3, 1.2),
    trade('CONSTRUCTION', 'Building construction', 'إنشاء المباني', 3, 1.4),
    trade('FACADE', 'Facade, rope access and work at height', 'الواجهات والعمل على ارتفاعات', 4, 1.6),
    trade('OIL_GAS', 'Oil and gas field services', 'خدمات حقول النفط والغاز', 4, 1.5, 'refer'),
    trade('DEMOLITION', 'Demolition and explosives', 'الهدم والمتفجرات', 4, 0, 'decline'),
  ],
  categories: [
    cat('OFFICE', 'Office and admin', 'المكاتب والإدارة', 0.0010, 15, 2000),
    cat('SALES', 'Sales and field staff', 'المبيعات والعمل الميداني', 0.0020, 15, 1500),
    cat('SUPERVISOR', 'Site supervisors', 'مشرفو المواقع', 0.0020, 15, 2500),
    cat('DRIVER', 'Drivers', 'السائقون', 0.0075, 60, 1500),
    cat('SKILLED', 'Skilled manual workers', 'العمال المهرة', 0.0125, 60, 1200),
    cat('UNSKILLED', 'Unskilled manual workers and helpers', 'العمال غير المهرة والمساعدون', 0.0150, 60, 800),
    cat('HEIGHT', 'Work at height / heavy machinery', 'العمل على ارتفاعات / الآلات الثقيلة', 0.0250, 60, 1200),
  ],
  plans: {
    essential: { el: null, medical: false },
    standard: { el: 1000000, medical: false },
    complete: { el: 2000000, medical: true },
  },
  factors: {
    claims: { 0: 0.9, 1: 1.0, 2: 1.25 },
    elLoading: { 1000000: 0.10, 2000000: 0.15, 5000000: 0.25 },
    period: { 1: 0.20, 3: 0.40, 6: 0.70, 12: 1.0 },
  },
  extensions: {
    X01: { method: 'loading_a', pct: 0.15, referral: true },
    X02: { method: 'referral_only' },
    X03: { method: 'loading_a', pct: 0.03 },
    X04: { method: 'fixed', amount: 95 },
    X05: { method: 'per_head', amount: 6 },
    X06: { method: 'fixed', amount: 150 },
    X07: { method: 'per_head', amount: 20, plans: ['complete'] },
  },
  statutory: {
    deathMonths: 24, deathMin: 18000, deathMax: 200000, wageBasis: 'basic',
    temporaryDisability: [{ months: 6, pct: 1.0 }, { months: 6, pct: 0.5 }],
    reportingHours: 48, authority: 'MoHRE', medicalLimitPerEmployee: 50000,
  },
  charges: { minPremium: 750, policyFee: 50 },
};

const WC_AE_SETTINGS = {
  quoteValidityDays: 30,
  maxInceptionDaysAhead: 60,
  sectionsOffered: ['A', 'B', 'C'],
  online: { maxEmployees: 250, maxWages: 25000000 },
  authority: {
    b2c: { maxEmployees: 50, maxWages: 5000000, hazardClasses: [1, 2], maxEL: 2000000, maxDiscount: 0 },
    standard: { maxEmployees: 100, maxWages: 10000000, hazardClasses: [1, 2], maxEL: 2000000, maxDiscount: 0.10 },
    preferred: { maxEmployees: 250, maxWages: 25000000, hazardClasses: [1, 2, 3], maxEL: 5000000, maxDiscount: 0.20 },
    underwriter: { maxLocationSI: 50000000, maxDiscount: 0.15 },
    uw_manager: { maxLocationSI: null, maxDiscount: null },
  },
  numbering: { lineCode: 'WCE' },
  uwSlaHours: { wc: 24 },
  minEndorsementPremium: 50,
  minRetainedPct: 0.75,
  declaration: { opensDaysBeforeExpiry: 0, dueDaysAfterExpiry: 30, finalAfterDays: 60, reminderDaysAfterExpiry: [1, 20, 30] },
  // FR-EMP-07: net joiner / leaver premium billed 'per_change', 'monthly' or 'quarterly'.
  employeeBilling: 'quarterly',
  invoiceDueDays: 30,
  renewal: { noticeDays: 45, reminderDays: [45, 30, 15, 7, 1], autoRenewDaysBefore: 7, graceDays: 30 },
  shortPeriodScale: [{ maxDays: 30, retain: 0.25 }, { maxDays: 90, retain: 0.4 }, { maxDays: 180, retain: 0.7 }, { maxDays: 270, retain: 0.85 }, { maxDays: 366, retain: 1.0 }],
};

const rule = (code, en, ar, condition, sort) => ({ product_code: 'WC', country_code: null, code, description_en: en, description_ar: ar, condition: j(condition), active: true, sort });

const WC_RULES = [
  rule('UW-W01', 'Employees or annual wages are above the limit for this channel or broker', 'عدد الموظفين أو الأجور السنوية يتجاوز الحد المسموح لهذه القناة أو الوسيط', { fact: 'exceedsAutoLimit', op: 'eq', value: true }, 1),
  rule('UW-W02', 'Higher-hazard trade (e.g. work at height, security, construction)', 'نشاط عالي الخطورة (مثل العمل على ارتفاعات أو الحراسة أو الإنشاءات)', { fact: 'hazardOutsideAuthority', op: 'eq', value: true }, 2),
  rule('UW-W03', 'A fatal claim, or two or more claims, in the last 3 years', 'مطالبة وفاة، أو مطالبتان أو أكثر، خلال آخر 3 سنوات', { fact: 'adverseClaims', op: 'eq', value: true }, 3),
  rule('UW-W04', 'Occupational disease or contractors’ workers requested', 'طُلبت تغطية الأمراض المهنية أو عمال المقاولين', { fact: 'hasReferralExtension', op: 'eq', value: true }, 4),
  rule('UW-W05', 'Average wage for a job type looks too low', 'متوسط الأجر لنوع وظيفة يبدو منخفضًا جدًا', { fact: 'wageImplausible', op: 'eq', value: true }, 5),
  rule('UW-W06', 'Employer’s Liability limit above the authority', 'حد مسؤولية صاحب العمل يتجاوز الصلاحية', { fact: 'elAboveAuthority', op: 'eq', value: true }, 6),
  rule('UW-W07', 'Joiners added more than 7 days in the past', 'إضافة موظفين بأثر رجعي يزيد على 7 أيام', { fact: 'backdatedJoiner', op: 'eq', value: true }, 7),
  rule('UW-W08', 'Discount requested is above the broker’s band', 'الخصم المطلوب يتجاوز النطاق المسموح للوسيط', { fact: 'discountExceedsBand', op: 'eq', value: true }, 8),
  rule('UW-W09', 'Sanctions screening needs review', 'فحص العقوبات يتطلب مراجعة', { fact: 'sanctionsHit', op: 'eq', value: true }, 9),
];

exports.seed = async function seed(knex) {
  await knex('products').insert({ code: 'WC', line: 'wc', name_en: 'Workmen’s Compensation & Employer’s Liability', name_ar: 'تعويض العمال ومسؤولية صاحب العمل', rater: 'wc', status: 'active', config: j(WC_CONFIG) });
  await knex('product_countries').insert([
    { product_code: 'WC', country_code: 'AE', enabled_b2c: true, enabled_b2b: true, settings: j(WC_AE_SETTINGS) },
    // KSA: occupational injuries for registered workers sit with GOSI, so Section A is not offered (WC BRD section 4).
    { product_code: 'WC', country_code: 'SA', enabled_b2c: false, enabled_b2b: false, settings: j({ ...WC_AE_SETTINGS, sectionsOffered: ['B', 'C'] }) },
  ]);
  const maker = await knex('users').where({ email: 'config1@portal.test' }).first();
  const checker = await knex('users').where({ email: 'config2@portal.test' }).first();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await knex('rate_tables').insert(Object.entries(WC_RATES_AE).map(([key, data]) => ({
    product_code: 'WC', country_code: 'AE', table_key: key, version: 1, status: 'approved', data: j(data), effective_from: now,
    created_by: maker.id, submitted_by: maker.id, approved_by: checker.id, approved_at: now, change_note: 'Initial placeholder rates from WC BRD v0.1',
  })));
  await knex('referral_rules').insert(WC_RULES);
};
