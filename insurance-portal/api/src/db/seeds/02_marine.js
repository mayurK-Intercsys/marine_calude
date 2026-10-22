/**
 * Marine Cargo (Marine BRD v0.1). All rates, limits and FX values are PLACEHOLDERS
 * for configuration testing. Arabic copy needs review by a native insurance translator.
 * Runs after 01_base, which clears the tables.
 */
const j = (v) => JSON.stringify(v);
const t = (en, ar) => ({ en, ar });

const MARINE_CONFIG = {
  productTypes: [
    { code: 'single', name: t('One shipment', 'شحنة واحدة'), description: t('Import or export, any mode', 'استيراد أو تصدير، بأي وسيلة نقل') },
    { code: 'inland', name: t('Inland trip', 'نقل داخلي'), description: t('By road within the country', 'برًا داخل الدولة') },
    { code: 'open_cover', name: t('All my shipments', 'جميع شحناتي'), description: t('Annual open cover, set up with a broker', 'غطاء مفتوح سنوي يُعَدّ عبر وسيط') },
  ],
  directions: [
    { code: 'import', name: t('Import', 'استيراد') },
    { code: 'export', name: t('Export', 'تصدير') },
  ],
  modes: [
    { code: 'sea', name: t('Sea', 'بحري') },
    { code: 'air', name: t('Air', 'جوي') },
    { code: 'road', name: t('Road', 'بري') },
    { code: 'rail', name: t('Rail', 'سكك حديدية') },
    { code: 'multimodal', name: t('Multimodal', 'متعدد الوسائط') },
  ],
  packings: [
    { code: 'cartons', name: t('Cartons', 'كراتين') },
    { code: 'pallets', name: t('Cartons on pallets', 'كراتين على منصات') },
    { code: 'crates', name: t('Wooden crates', 'صناديق خشبية') },
    { code: 'bags', name: t('Bags', 'أكياس') },
    { code: 'drums', name: t('Drums', 'براميل') },
    { code: 'bulk', name: t('Bulk / loose', 'سائب') },
    { code: 'unpacked', name: t('Unpacked', 'غير مغلّف') },
  ],
  containers: [
    { code: 'fcl', name: t('Full container (FCL)', 'حاوية كاملة') },
    { code: 'lcl', name: t('Shared container (LCL)', 'حاوية مشتركة') },
    { code: 'reefer', name: t('Refrigerated container', 'حاوية مبردة') },
    { code: 'none', name: t('No container', 'بدون حاوية') },
  ],
  incoterms: [
    { code: 'EXW', freightIncluded: false, name: t('EXW – collected from seller', 'EXW – الاستلام من البائع') },
    { code: 'FCA', freightIncluded: false, name: t('FCA – handed to your carrier', 'FCA – التسليم لناقلك') },
    { code: 'FOB', freightIncluded: false, name: t('FOB – you pay freight and insurance', 'FOB – تدفع أنت الشحن والتأمين') },
    { code: 'CFR', freightIncluded: true, name: t('CFR – freight included', 'CFR – الشحن مشمول') },
    { code: 'CIF', freightIncluded: true, name: t('CIF – freight and insurance included', 'CIF – الشحن والتأمين مشمولان') },
    { code: 'CIP', freightIncluded: true, name: t('CIP – carriage and insurance paid', 'CIP – النقل والتأمين مدفوعان') },
    { code: 'DAP', freightIncluded: true, name: t('DAP – delivered at place', 'DAP – التسليم في المكان') },
    { code: 'DDP', freightIncluded: true, name: t('DDP – delivered, duty paid', 'DDP – التسليم مع دفع الرسوم') },
  ],
  clauses: [
    { code: 'ICC-A', name: t('All risks (ICC A)', 'جميع المخاطر (ICC A)'), description: t('Any accidental loss or damage, unless excluded. Includes theft with forced entry and handling damage.', 'أي فقد أو ضرر عرضي ما لم يكن مستثنى، ويشمل السرقة بالكسر وأضرار المناولة.') },
    { code: 'ICC-B', name: t('Named perils (ICC B)', 'مخاطر محددة (ICC B)'), description: t('Fire, sinking, collision, earthquake, lightning, sea water, packages lost overboard.', 'الحريق والغرق والاصطدام والزلازل والصواعق ودخول مياه البحر وفقدان الطرود من على السفينة.') },
    { code: 'ICC-C', name: t('Major casualty (ICC C)', 'الحوادث الكبرى (ICC C)'), description: t('Fire, explosion, sinking, stranding, collision, overturning, jettison and general average only.', 'الحريق والانفجار والغرق والجنوح والاصطدام والانقلاب والإلقاء في البحر والعوارية العامة فقط.') },
    { code: 'ICC-AIR', name: t('All risks by air (ICC Air)', 'جميع المخاطر للشحن الجوي (ICC Air)'), description: t('Any accidental loss or damage to air freight, unless excluded.', 'أي فقد أو ضرر عرضي للشحن الجوي ما لم يكن مستثنى.') },
    { code: 'ITC-A', name: t('Inland all risks (ITC A)', 'جميع المخاطر للنقل الداخلي (ITC A)'), description: t('Any accidental loss or damage by road or rail, unless excluded.', 'أي فقد أو ضرر عرضي أثناء النقل البري أو بالسكك الحديدية ما لم يكن مستثنى.') },
    { code: 'ITC-B', name: t('Inland accident (ITC B)', 'حوادث النقل الداخلي (ITC B)'), description: t('Fire, collision, overturning, derailment and accident to the vehicle.', 'الحريق والاصطدام والانقلاب والخروج عن القضبان وحوادث المركبة.') },
  ],
  extensions: [
    { code: 'X02', name: t('Extra storage at destination (30 days)', 'تخزين إضافي في الوجهة (30 يومًا)'), description: t('Standard cover ends 60 days after discharge.', 'تنتهي التغطية القياسية بعد 60 يومًا من التفريغ.') },
    { code: 'X09', name: t('Theft, pilferage and non-delivery', 'السرقة والنهب وعدم التسليم'), description: t('For named-peril clauses, which exclude theft.', 'لشروط المخاطر المحددة التي تستثني السرقة.') },
    { code: 'X08', name: t('Refrigeration breakdown', 'تعطل التبريد'), description: t('Reefer cargo only. Needs underwriter review.', 'للبضائع المبردة فقط. يتطلب مراجعة المكتتب.'), referral: true },
  ],
  exclusions: [
    t('Poor or unsuitable packing by you', 'سوء التغليف أو عدم ملاءمته من قبلك'),
    t('Delay, loss of market, inherent vice of the goods', 'التأخير وخسارة السوق والعيب الذاتي في البضاعة'),
    t('Ordinary leakage, loss of weight, wear and tear', 'التسرب العادي ونقص الوزن والبلى'),
    t('Rust or discolouration of unpacked goods', 'صدأ البضائع غير المغلفة أو تغير لونها'),
    t('Theft without forced entry, employee theft', 'السرقة دون كسر، وسرقة الموظفين'),
    t('War and strikes, unless you add them', 'الحرب والإضرابات، ما لم تقم بإضافتها'),
  ],
  claimCauses: [
    { code: 'damage', name: t('Goods damaged', 'تلف البضاعة') },
    { code: 'shortage', name: t('Shortage', 'نقص') },
    { code: 'non_delivery', name: t('Not delivered', 'عدم التسليم') },
    { code: 'total_loss', name: t('Total loss', 'خسارة كلية') },
    { code: 'theft', name: t('Theft', 'سرقة') },
    { code: 'other', name: t('Other', 'أخرى') },
  ],
  coveredCauses: ['damage', 'shortage', 'non_delivery', 'total_loss', 'theft'],
  currencies: ['AED', 'USD', 'EUR', 'GBP', 'CNY', 'INR', 'JPY', 'SAR', 'OMR', 'QAR', 'BHD', 'KWD'],
};

const com = (code, group, en, ar, hs, rates, extra = {}) => ({ code, group, name: t(en, ar), hs, rates, referral: false, prohibited: false, ...extra });

const MARINE_RATES_AE = {
  commodities: [
    com('GEN_PACKED', 'general', 'General packed goods', 'بضائع عامة مغلفة', '—', { 'ICC-A': 0.0015, 'ICC-B': 0.0010, 'ICC-C': 0.0006, 'ICC-AIR': 0.0012, 'ITC-A': 0.0008, 'ITC-B': 0.0005 }),
    com('ELEC_APPLIANCES', 'general', 'Household electrical appliances', 'أجهزة كهربائية منزلية', '8516', { 'ICC-A': 0.0015, 'ICC-B': 0.0010, 'ICC-C': 0.0006, 'ICC-AIR': 0.0012, 'ITC-A': 0.0008, 'ITC-B': 0.0005 }),
    com('ELECTRONICS', 'electronics', 'Mobile phones and electronics', 'هواتف وأجهزة إلكترونية', '8517', { 'ICC-A': 0.0030, 'ICC-AIR': 0.0025, 'ITC-A': 0.0015 }, { referralAboveSI: 500000 }),
    com('FOOD_PACKED', 'general', 'Canned and packed food', 'أغذية معلبة ومغلفة', '2005', { 'ICC-A': 0.0014, 'ICC-B': 0.0010, 'ICC-C': 0.0006, 'ITC-A': 0.0008, 'ITC-B': 0.0005 }),
    com('FOOD_BAGGED', 'bulk', 'Rice and grains in bags', 'أرز وحبوب في أكياس', '1006', { 'ICC-A': 0.0018, 'ICC-B': 0.0012, 'ICC-C': 0.0008, 'ITC-A': 0.0009, 'ITC-B': 0.0006 }),
    com('BULK_GRAIN', 'bulk', 'Grain in bulk', 'حبوب سائبة', '1001', { 'ICC-B': 0.0010, 'ICC-C': 0.0008 }),
    com('FROZEN', 'general', 'Frozen meat and poultry (reefer)', 'لحوم ودواجن مجمدة (مبردة)', '0202', { 'ICC-A': 0.0030 }, { referral: true }),
    com('PHARMA_TEMP', 'electronics', 'Temperature-controlled medicines', 'أدوية تتطلب تحكمًا بالحرارة', '3004', { 'ICC-A': 0.0035, 'ICC-AIR': 0.0030 }, { referral: true }),
    com('FRAGILE', 'fragile', 'Glass, ceramics and marble', 'زجاج وخزف ورخام', '6802', { 'ICC-A': 0.0040, 'ICC-B': 0.0020, 'ITC-A': 0.0020 }),
    com('USED_MACHINERY', 'used_machinery', 'Used machinery', 'آلات مستعملة', '8479', { 'ICC-C': 0.0025, 'ITC-B': 0.0015 }, { referral: true }),
    com('VEHICLES', 'used_machinery', 'New vehicles', 'مركبات جديدة', '8703', { 'ICC-A': 0.0035, 'ITC-A': 0.0020 }, { referral: true }),
    com('CHEMICALS_3', 'general', 'Flammable liquids (class 3)', 'سوائل قابلة للاشتعال (الفئة 3)', '2710', { 'ICC-B': 0.0025, 'ICC-C': 0.0015 }, { referral: true }),
    com('EXPLOSIVES', 'general', 'Explosives and radioactive goods', 'متفجرات ومواد مشعة', '3601', {}, { prohibited: true }),
  ],
  countries: {
    AE: { region: 'gcc', name: t('United Arab Emirates', 'الإمارات') }, SA: { region: 'gcc', name: t('Saudi Arabia', 'السعودية') }, OM: { region: 'gcc', name: t('Oman', 'عُمان') },
    QA: { region: 'gcc', name: t('Qatar', 'قطر') }, BH: { region: 'gcc', name: t('Bahrain', 'البحرين') }, KW: { region: 'gcc', name: t('Kuwait', 'الكويت') },
    CN: { region: 'asia', name: t('China', 'الصين') }, IN: { region: 'asia', name: t('India', 'الهند') }, KR: { region: 'asia', name: t('South Korea', 'كوريا الجنوبية') },
    JP: { region: 'asia', name: t('Japan', 'اليابان') }, VN: { region: 'asia', name: t('Vietnam', 'فيتنام') }, TH: { region: 'asia', name: t('Thailand', 'تايلاند') },
    PK: { region: 'asia', name: t('Pakistan', 'باكستان') }, DE: { region: 'europe', name: t('Germany', 'ألمانيا') }, IT: { region: 'europe', name: t('Italy', 'إيطاليا') },
    GB: { region: 'europe', name: t('United Kingdom', 'المملكة المتحدة') }, TR: { region: 'europe', name: t('Türkiye', 'تركيا') }, US: { region: 'americas', name: t('United States', 'الولايات المتحدة') },
    BR: { region: 'americas', name: t('Brazil', 'البرازيل') }, ZA: { region: 'africa', name: t('South Africa', 'جنوب أفريقيا') }, KE: { region: 'africa', name: t('Kenya', 'كينيا') },
    EG: { region: 'africa', name: t('Egypt', 'مصر') }, SD: { region: 'africa', status: 'war_listed', name: t('Sudan', 'السودان') }, YE: { region: 'gcc', status: 'war_listed', name: t('Yemen', 'اليمن') },
    IR: { region: 'asia', status: 'decline', name: t('Iran', 'إيران') }, KP: { region: 'asia', status: 'decline', name: t('North Korea', 'كوريا الشمالية') }, SY: { region: 'gcc', status: 'decline', name: t('Syria', 'سوريا') },
  },
  factors: {
    region: { gcc: 0.9, asia: 1.0, europe: 0.95, americas: 1.05, africa: 1.3, other: 1.1 },
    mode: { sea: 1.0, air: 0.8, road: 0.9, rail: 0.95, multimodal: 1.1 },
    packing: { cartons: 1.0, pallets: 1.0, crates: 0.95, bags: 1.1, drums: 1.05, bulk: 1.25, unpacked: 1.4 },
    container: { fcl: 0.9, lcl: 1.0, reefer: 1.1, none: 1.0 },
    vesselAge: [{ maxAge: 15, factor: 1.0 }, { maxAge: 25, factor: 1.15 }],
    war: { sea: 0.0003, air: 0.0003 },
    srcc: 0.0002,
  },
  extensions: {
    X02: { method: 'rate_on_si', rate: 0.0002 },
    X09: { method: 'loading', pct: 0.10 },
    X08: { method: 'referral_only' },
  },
  deductibles: {
    general: { pct: 0.005, min: 1000 },
    electronics: { pct: 0.01, min: 2500 },
    fragile: { pct: 0.02, min: 2500 },
    bulk: { pct: 0.005, min: 1000 },
    used_machinery: { pct: 0, min: 5000 },
  },
  fx: { AED: 1, USD: 3.6725, EUR: 4.0, GBP: 4.65, CNY: 0.51, INR: 0.044, JPY: 0.025, SAR: 0.98, OMR: 9.55, QAR: 1.01, BHD: 9.74, KWD: 11.95 },
  charges: { minPremium: 100, policyFee: 25, openCoverFee: 100, minCertificatePremium: 50 },
  // UN/LOCODE subset for the port picker; extend from the full UNECE list.
  ports: {
    AE: [['AEJEA', 'Jebel Ali'], ['AEDXB', 'Dubai'], ['AEAUH', 'Abu Dhabi'], ['AEKHL', 'Khalifa Port'], ['AESHJ', 'Sharjah'], ['AEFJR', 'Fujairah'], ['AERKT', 'Ras Al Khaimah']],
    SA: [['SAJED', 'Jeddah'], ['SADMM', 'Dammam'], ['SARUH', 'Riyadh']], OM: [['OMSOH', 'Sohar'], ['OMSLL', 'Salalah'], ['OMMCT', 'Muscat']],
    QA: [['QAHMD', 'Hamad Port'], ['QADOH', 'Doha']], BH: [['BHKBS', 'Khalifa Bin Salman']], KW: [['KWSAA', 'Shuaiba'], ['KWSWK', 'Shuwaikh']],
    CN: [['CNSHA', 'Shanghai'], ['CNNGB', 'Ningbo'], ['CNSZX', 'Shenzhen'], ['CNTAO', 'Qingdao'], ['CNCAN', 'Guangzhou']],
    IN: [['INNSA', 'Nhava Sheva'], ['INMUN', 'Mundra'], ['INMAA', 'Chennai']], KR: [['KRPUS', 'Busan']], JP: [['JPTYO', 'Tokyo'], ['JPYOK', 'Yokohama']],
    VN: [['VNSGN', 'Ho Chi Minh City']], TH: [['THLCH', 'Laem Chabang']], PK: [['PKKHI', 'Karachi']],
    DE: [['DEHAM', 'Hamburg'], ['DEBRV', 'Bremerhaven']], IT: [['ITGOA', 'Genoa']], GB: [['GBFXT', 'Felixstowe'], ['GBLGP', 'London Gateway']], TR: [['TRMER', 'Mersin']],
    US: [['USNYC', 'New York'], ['USLAX', 'Los Angeles']], BR: [['BRSSZ', 'Santos']], ZA: [['ZADUR', 'Durban']], KE: [['KEMBA', 'Mombasa']], EG: [['EGALY', 'Alexandria'], ['EGPSD', 'Port Said']],
  },
};

const MARINE_AE_SETTINGS = {
  quoteValidityDays: 7,
  maxInceptionDaysAhead: 60,
  maxOnlineSI: 10000000,
  transitValidityDays: 90,
  depositPct: 0.75,
  ocMinRetainedPct: 0.8,
  ocTurnoverAlerts: [0.8, 1.0],
  // VAT treatment per direction: Compliance to confirm (Marine BRD open question).
  vat: { import: 'standard', export: 'zero', domestic: 'standard', open_cover: 'standard' },
  authority: {
    b2c: { maxSI: 5000000, maxDiscount: 0, canBindOpenCover: false },
    standard: { maxSI: 2000000, maxDiscount: 0.10, canBindOpenCover: false, maxOpenCoverTurnover: 0 },
    preferred: { maxSI: 5000000, maxDiscount: 0.20, canBindOpenCover: true, maxOpenCoverTurnover: 25000000 },
    underwriter: { maxLocationSI: 10000000, maxDiscount: 0.15 },
    uw_manager: { maxLocationSI: null, maxDiscount: null },
  },
  numbering: { lineCode: 'MAR', byType: { single: 'MST', inland: 'MIT', open_cover: 'MOC' } },
  uwSlaHours: { single: 4, inland: 4, open_cover: 48, certificate: 4 },
  minEndorsementPremium: 25,
  // Open covers renew from actual utilisation (FR-B2B-M08); single transits do not renew.
  renewal: { noticeDays: 60, reminderDays: [60, 30, 7], autoRenewDaysBefore: 0, graceDays: 30, productTypes: ['open_cover'] },
  shortPeriodScale: [{ maxDays: 366, retain: 1.0 }],
};

const rule = (code, en, ar, condition, sort) => ({ product_code: 'MARINE', country_code: null, code, description_en: en, description_ar: ar, condition: j(condition), active: true, sort });

const MARINE_RULES = [
  rule('UW-M01', 'Sum insured is above the limit for this channel or broker', 'مبلغ التأمين يتجاوز الحد المسموح لهذه القناة أو الوسيط', { fact: 'exceedsAutoLimit', op: 'eq', value: true }, 1),
  rule('UW-M02', 'These goods need underwriter review', 'تتطلب هذه البضائع مراجعة المكتتب', { fact: 'referralCommodity', op: 'eq', value: true }, 2),
  rule('UW-M03', 'Route passes through a high-risk or war-listed area', 'يمر المسار عبر منطقة عالية الخطورة أو مدرجة ضمن مناطق الحرب', { fact: 'highRiskRoute', op: 'eq', value: true }, 3),
  rule('UW-M04', 'Vessel is over 25 years old, not classed, or not found', 'عمر السفينة يتجاوز 25 عامًا أو غير مصنّفة أو غير موجودة في السجل', { fact: 'vesselIssue', op: 'eq', value: true }, 4),
  rule('UW-M05', 'All-risks cover requested for unpacked or bulk goods', 'طُلبت تغطية جميع المخاطر لبضائع غير مغلفة أو سائبة', { fact: 'unpackedAllRisks', op: 'eq', value: true }, 5),
  rule('UW-M06', 'Goods leave within 24 hours', 'تغادر البضائع خلال 24 ساعة', { fact: 'departureSoon', op: 'eq', value: true }, 6),
  rule('UW-M07', 'Sanctions screening needs review', 'فحص العقوبات يتطلب مراجعة', { fact: 'sanctionsHit', op: 'eq', value: true }, 7),
  rule('UW-M08', 'Discount requested is above the broker’s band', 'الخصم المطلوب يتجاوز النطاق المسموح للوسيط', { fact: 'discountExceedsBand', op: 'eq', value: true }, 8),
  rule('UW-M09', 'An extension that needs underwriter review was selected', 'تم اختيار تغطية إضافية تتطلب مراجعة المكتتب', { fact: 'hasReferralExtension', op: 'eq', value: true }, 9),
  rule('UW-M10', 'Open cover needs underwriter approval', 'يتطلب الغطاء المفتوح موافقة المكتتب', { fact: 'openCoverNeedsApproval', op: 'eq', value: true }, 10),
  rule('UW-M11', 'Shipment is outside the open cover terms', 'الشحنة خارج شروط الغطاء المفتوح', { fact: 'outsideTerms', op: 'eq', value: true }, 11),
  rule('UW-M12', 'Shipment is above the limit per sending', 'الشحنة تتجاوز الحد لكل إرسالية', { fact: 'exceedsSendingLimit', op: 'eq', value: true }, 12),
  rule('UW-M13', 'Annual turnover estimate has been used up', 'تم استنفاد تقدير حجم الأعمال السنوي', { fact: 'turnoverExceeded', op: 'eq', value: true }, 13),
  rule('UW-M14', 'Above the issuing user’s own certificate limit', 'يتجاوز حد الشهادة الخاص بالمستخدم المُصدِر', { fact: 'issuerLimitExceeded', op: 'eq', value: true }, 14),
];

exports.seed = async function seed(knex) {
  await knex('products').insert({ code: 'MARINE', line: 'marine', name_en: 'Marine Cargo', name_ar: 'تأمين البضائع المنقولة', rater: 'marine', status: 'active', config: j(MARINE_CONFIG) });
  await knex('product_countries').insert([
    { product_code: 'MARINE', country_code: 'AE', enabled_b2c: true, enabled_b2b: true, settings: j(MARINE_AE_SETTINGS) },
    { product_code: 'MARINE', country_code: 'OM', enabled_b2c: false, enabled_b2b: false, settings: j(MARINE_AE_SETTINGS) },
  ]);
  const maker = await knex('users').where({ email: 'config1@portal.test' }).first();
  const checker = await knex('users').where({ email: 'config2@portal.test' }).first();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await knex('rate_tables').insert(Object.entries(MARINE_RATES_AE).map(([key, data]) => ({
    product_code: 'MARINE', country_code: 'AE', table_key: key, version: 1, status: 'approved', data: j(data), effective_from: now,
    created_by: maker.id, submitted_by: maker.id, approved_by: checker.id, approved_at: now, change_note: 'Initial placeholder rates from Marine BRD v0.1',
  })));
  await knex('referral_rules').insert(MARINE_RULES);
};

module.exports.MARINE_RATES_AE = MARINE_RATES_AE;
