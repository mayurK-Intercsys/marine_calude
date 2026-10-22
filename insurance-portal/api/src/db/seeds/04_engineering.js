/**
 * Engineering insurance (Engineering BRD v0.1): CPM, CAR, EAR, Machinery Breakdown, Electronic Equipment.
 * Rates, thresholds and deductibles are PLACEHOLDERS. Arabic copy needs native review.
 */
const j = (v) => JSON.stringify(v);
const t = (en, ar) => ({ en, ar });

const ENG_CONFIG = {
  productTypes: [
    { code: 'CPM', kind: 'equipment', name: t('My construction equipment', 'معدات البناء الخاصة بي'), product: t('Contractors’ Plant & Machinery', 'معدات وآلات المقاولين'), description: t('Cranes, excavators, loaders, generators', 'رافعات وحفارات ولوادر ومولدات') },
    { code: 'CAR', kind: 'project', name: t('A building project', 'مشروع بناء'), product: t('Contractors’ All Risks', 'جميع أخطار المقاولين'), description: t('The works, materials and third-party liability', 'الأعمال والمواد والمسؤولية تجاه الغير') },
    { code: 'EAR', kind: 'project', name: t('Machinery I’m installing', 'آلات أقوم بتركيبها'), product: t('Erection All Risks', 'جميع أخطار التركيب'), description: t('Erection, installation and testing', 'التركيب والتجميع والاختبار') },
    { code: 'CAR_ANNUAL', kind: 'annual', brokerOnly: true, name: t('All my building projects (annual)', 'جميع مشاريعي الإنشائية (سنوي)'), product: t('Annual Contractors’ All Risks', 'جميع أخطار المقاولين السنوي'), description: t('Declare each project online within agreed limits', 'صرّح عن كل مشروع عبر الإنترنت ضمن الحدود المتفق عليها') },
    { code: 'MB', kind: 'equipment', name: t('Machinery in my premises', 'آلات في منشأتي'), product: t('Machinery Breakdown', 'أعطال الآلات'), description: t('Sudden breakdown of generators, chillers, lines', 'الأعطال المفاجئة للمولدات والمبردات وخطوط الإنتاج') },
    { code: 'EEI', kind: 'equipment', name: t('Electronic equipment', 'الأجهزة الإلكترونية'), product: t('Electronic Equipment', 'الأجهزة الإلكترونية'), description: t('IT, telecom, CCTV, control systems, data', 'تقنية المعلومات والاتصالات والمراقبة وأنظمة التحكم والبيانات') },
  ],
  territories: [
    { code: 'single', name: t('One site', 'موقع واحد') },
    { code: 'named', name: t('Named sites', 'مواقع محددة') },
    { code: 'floater', name: t('Anywhere in the country', 'في أي مكان داخل الدولة') },
  ],
  ownership: [
    { code: 'owned', name: t('Owned', 'مملوكة') },
    { code: 'financed', name: t('Financed', 'ممولة') },
    { code: 'hired_in', name: t('Hired in', 'مستأجرة') },
  ],
  foundations: [
    { code: 'raft', name: t('Raft', 'لبشة') }, { code: 'piles', name: t('Piles', 'خوازيق') }, { code: 'footings', name: t('Isolated footings', 'قواعد منفصلة') },
  ],
  tplLimits: [1000000, 2000000, 5000000],
  maintenance: [
    { code: 'visits', months: 12, name: t('12 months (visits)', '12 شهرًا (زيارات)') },
    { code: 'extended', months: 12, name: t('12 months (extended)', '12 شهرًا (ممتدة)') },
    { code: 'extended24', months: 24, name: t('24 months (extended)', '24 شهرًا (ممتدة)') },
  ],
  addOns: [
    { code: 'SURROUNDING', products: ['CAR', 'EAR'], input: 'surroundingSI', name: t('Owner’s surrounding property', 'ممتلكات المالك المجاورة'), description: t('Existing buildings next to the works', 'المباني القائمة المجاورة للأعمال') },
    { code: 'CROSS', products: ['CAR', 'EAR'], name: t('Cross liability', 'المسؤولية المتبادلة'), description: t('Insured parties can claim against each other', 'يحق للأطراف المؤمَّن لها المطالبة ضد بعضها') },
    { code: 'ESCALATION', products: ['CAR', 'EAR', 'CPM'], name: t('Escalation (up to 10%)', 'التصاعد (حتى 10%)'), description: t('Covers rising costs during the period', 'يغطي ارتفاع التكاليف خلال المدة') },
    { code: 'EXPRESS', products: ['CAR', 'EAR', 'MB'], name: t('Overtime and express freight', 'العمل الإضافي والشحن السريع'), description: t('Extra cost to speed up repairs', 'التكلفة الإضافية لتسريع الإصلاح') },
    { code: 'CPM_TPL', products: ['CPM'], name: t('Third-party liability for the equipment', 'المسؤولية تجاه الغير للمعدات'), description: t('Damage or injury to others caused by the equipment', 'الأضرار أو الإصابات التي تسببها المعدات للغير') },
    { code: 'DATA', products: ['EEI'], input: 'dataSI', name: t('Data restoration', 'استعادة البيانات'), description: t('Cost to restore data and replace media', 'تكلفة استعادة البيانات واستبدال الوسائط') },
    { code: 'ICOW', products: ['EEI'], input: 'icowSI', name: t('Extra cost of working (3 months)', 'التكلفة الإضافية للتشغيل (3 أشهر)'), description: t('Substitute equipment while yours is repaired', 'معدات بديلة أثناء إصلاح معداتك') },
  ],
  exclusions: {
    CPM: [t('Mechanical or electrical breakdown', 'الأعطال الميكانيكية أو الكهربائية'), t('Wear parts (tyres, blades, ropes)', 'القطع المستهلكة (الإطارات والشفرات والحبال)'), t('Road vehicles licensed for public roads', 'المركبات المرخصة للطرق العامة'), t('Underground work and waterborne craft', 'العمل تحت الأرض والمراكب المائية')],
    CAR: [t('Cost of correcting defective design, material or workmanship', 'تكلفة تصحيح العيوب في التصميم أو المواد أو التنفيذ'), t('Penalties for delay and consequential loss', 'غرامات التأخير والخسائر التبعية'), t('Loss found only at inventory', 'الفقد المكتشف عند الجرد فقط'), t('Injury to your employees (Workmen’s Compensation)', 'إصابات موظفيك (تعويض العمال)')],
    EAR: [t('Defective design or material (the part itself)', 'العيب في التصميم أو المواد (الجزء نفسه)'), t('Second-hand machinery beyond fire and external causes', 'الآلات المستعملة فيما يتجاوز الحريق والأسباب الخارجية'), t('Penalties for delay and consequential loss', 'غرامات التأخير والخسائر التبعية')],
    MB: [t('Fire, theft and flood (property policy)', 'الحريق والسرقة والفيضان (وثيقة الممتلكات)'), t('Wear and tear, consumables', 'البلى والمواد المستهلكة'), t('Items under manufacturer warranty', 'البنود المشمولة بضمان المصنع')],
    EEI: [t('Wear and tear, consumables', 'البلى والمواد المستهلكة'), t('Cyber attack and software faults without physical damage', 'الهجمات الإلكترونية وأعطال البرمجيات دون ضرر مادي'), t('Items covered by a maintenance contract, to that extent', 'البنود المشمولة بعقد صيانة، في حدوده')],
  },
  claimCauses: [
    { code: 'accident', name: t('Accident / overturning', 'حادث / انقلاب') },
    { code: 'theft', name: t('Theft', 'سرقة') },
    { code: 'fire', name: t('Fire', 'حريق') },
    { code: 'flood_storm', name: t('Flood or storm', 'فيضان أو عاصفة') },
    { code: 'breakdown', name: t('Breakdown', 'عطل') },
    { code: 'collapse', name: t('Collapse of works', 'انهيار الأعمال') },
    { code: 'third_party', name: t('Damage or injury to others', 'ضرر أو إصابة للغير') },
    { code: 'other', name: t('Other', 'أخرى') },
  ],
  coveredCauses: ['accident', 'theft', 'fire', 'flood_storm', 'breakdown', 'collapse', 'third_party'],
};

const eq = (code, product, en, ar, rate, ded, extra = {}) => ({ code, product, name: t(en, ar), rate, deductible: ded, ...extra });
const pj = (code, product, en, ar, rate12, complexity) => ({ code, product, name: t(en, ar), rate12, complexity });

const ENG_RATES_AE = {
  equipmentTypes: [
    eq('MOBILE_CRANE', 'CPM', 'Mobile crane', 'رافعة متحركة', 0.015, { pct: 0.05, min: 2500 }),
    eq('TOWER_CRANE', 'CPM', 'Tower crane', 'رافعة برجية', 0.0125, { pct: 0.05, min: 2500 }),
    eq('EXCAVATOR', 'CPM', 'Excavator', 'حفارة', 0.01, { pct: 0.05, min: 2500 }),
    eq('LOADER', 'CPM', 'Wheel loader', 'لودر بعجلات', 0.01, { pct: 0.05, min: 2500 }),
    eq('CONCRETE_PUMP', 'CPM', 'Concrete pump', 'مضخة خرسانة', 0.012, { pct: 0.05, min: 2500 }),
    eq('GENERATOR_CPM', 'CPM', 'Generator / compressor', 'مولد / ضاغط', 0.0075, { pct: 0.05, min: 2500 }),
    eq('GENERATOR_MB', 'MB', 'Standby generator', 'مولد احتياطي', 0.004, { pct: 0.10, min: 2500 }),
    eq('CHILLER', 'MB', 'Chiller / HVAC', 'مبرد / تكييف', 0.0035, { pct: 0.10, min: 2500 }),
    eq('PRODUCTION_LINE', 'MB', 'Production line', 'خط إنتاج', 0.006, { pct: 0.10, min: 2500 }),
    eq('LIFT', 'MB', 'Passenger lift', 'مصعد ركاب', 0.0025, { pct: 0.10, min: 2500 }),
    eq('TRANSFORMER', 'MB', 'Transformer', 'محول كهربائي', 0.003, { pct: 0.10, min: 2500 }, { referAboveMW: 5 }),
    eq('OFFICE_IT', 'EEI', 'Servers, network and office IT', 'الخوادم والشبكات وأجهزة المكاتب', 0.003, { pct: 0.05, min: 1000 }),
    eq('TELECOM_CCTV', 'EEI', 'Telecom and CCTV', 'الاتصالات وكاميرات المراقبة', 0.0035, { pct: 0.05, min: 1000 }),
    eq('CONTROL_SYSTEMS', 'EEI', 'Control systems', 'أنظمة التحكم', 0.004, { pct: 0.05, min: 1000 }),
    eq('MEDICAL_IMAGING', 'EEI', 'Medical imaging', 'أجهزة التصوير الطبي', 0.006, { pct: 0.05, min: 2500 }, { referral: true }),
  ],
  projectTypes: [
    pj('VILLA', 'CAR', 'Villa / villa compound', 'فيلا / مجمع فلل', 0.0015, 1),
    pj('LOWRISE', 'CAR', 'Low-rise building (up to G+4)', 'مبنى منخفض الارتفاع (حتى أرضي + 4)', 0.0015, 1),
    pj('FITOUT', 'CAR', 'Interior fit-out', 'تجهيزات داخلية', 0.0012, 1),
    pj('WAREHOUSE', 'CAR', 'Warehouse / industrial shed', 'مستودع / منشأة صناعية', 0.0014, 1),
    pj('ROADWORKS', 'CAR', 'Road works', 'أعمال طرق', 0.0025, 2),
    pj('HIGHRISE', 'CAR', 'High-rise building (above G+12)', 'مبنى شاهق (أكثر من أرضي + 12)', 0.0020, 3),
    pj('MARINE_WORKS', 'CAR', 'Marine works, bridges, tunnels', 'أعمال بحرية وجسور وأنفاق', 0.0040, 3),
    pj('MEP_HVAC', 'EAR', 'MEP / HVAC installation', 'تركيب الأنظمة الكهروميكانيكية / التكييف', 0.0018, 1),
    pj('LIGHT_PLANT', 'EAR', 'Light plant installation', 'تركيب مصنع خفيف', 0.0025, 2),
    pj('HEAVY_PLANT', 'EAR', 'Heavy plant / petrochemical', 'مصنع ثقيل / بتروكيماويات', 0.0035, 3),
  ],
  factors: {
    age: [{ maxAge: 5, factor: 1.0 }, { maxAge: 10, factor: 1.15 }],
    territory: { single: 1.0, named: 1.05, floater: 1.15 },
    claims: { 0: 1.0, 1: 1.0, 2: 1.25 },
    complexity: { 1: 1.0, 2: 1.15, 3: 1.3 },
    natcat: { low: 1.0, medium: 1.1, high: 1.25 },
    tpl: { 1000000: 0.0003, 2000000: 0.00045, 5000000: 0.0007 },
    maintenance: { visits: 0.05, extended: 0.15, extended24: 0.25 },
    hotTestingLoading: 0.25,
    secondHandLoading: 0.20,
    minProjectMonths: 6,
  },
  addOns: {
    SURROUNDING: { method: 'rate_on_input', input: 'surroundingSI', rate: 0.001 },
    CROSS: { method: 'pct_of_tpl', pct: 0.10 },
    ESCALATION: { method: 'pct_of_base', pct: 0.05 },
    EXPRESS: { method: 'pct_of_base', pct: 0.03 },
    CPM_TPL: { method: 'pct_of_base', pct: 0.05 },
    DATA: { method: 'rate_on_input', input: 'dataSI', rate: 0.003 },
    ICOW: { method: 'rate_on_input', input: 'icowSI', rate: 0.005 },
  },
  deductibles: {
    CAR: { natcat: { pct: 0.10, min: 25000 }, other: { fixed: 10000 }, tplProperty: { fixed: 5000 } },
    EAR: { natcat: { pct: 0.10, min: 25000 }, other: { fixed: 10000 }, testing: { pct: 0.20, min: 25000 } },
  },
  charges: { minPremium: { CPM: 1000, MB: 750, EEI: 500, CAR: 2500, EAR: 2500, CAR_ANNUAL: 5000 }, policyFee: 50 },
};

const ENG_AE_SETTINGS = {
  quoteValidityDays: 30,
  maxInceptionDaysAhead: 60,
  online: { maxEquipmentTotal: 50000000, maxContractValue: 100000000 },
  // Instant-issue thresholds (Engineering BRD section 8)
  instant: { maxBasements: 1, maxExcavation: 6, maxComplexity: 2, earMaxHotTestingWeeks: 2, maxEquipmentAge: 10 },
  authority: {
    b2c: { maxItem: 2000000, maxTotal: 10000000, maxContractValue: 10000000, earMaxContractValue: 5000000, maxMonths: 24, maxDiscount: 0 },
    standard: { maxItem: 2000000, maxTotal: 10000000, maxContractValue: 10000000, earMaxContractValue: 5000000, maxMonths: 24, maxDiscount: 0.10 },
    preferred: { maxItem: 5000000, maxTotal: 25000000, maxContractValue: 25000000, earMaxContractValue: 10000000, maxMonths: 36, maxDiscount: 0.20, canBindAnnual: true, maxAnnualProjectValue: 10000000 },
    underwriter: { maxLocationSI: 100000000, maxDiscount: 0.15 },
    uw_manager: { maxLocationSI: null, maxDiscount: null },
  },
  numbering: { lineCode: 'ENG', byType: { CPM: 'CPM', CAR: 'CAR', EAR: 'EAR', MB: 'MBD', EEI: 'EEI', CAR_ANNUAL: 'CAA' } },
  uwSlaHours: { equipment: 24, project: 48 },
  minEndorsementPremium: 50,
  project: { extensionInstantPct: 0.25, minRetainedPct: 0.8 },
  renewal: { noticeDays: 45, reminderDays: [45, 30, 15, 7, 1], autoRenewDaysBefore: 7, graceDays: 30 },
  shortPeriodScale: [{ maxDays: 30, retain: 0.25 }, { maxDays: 90, retain: 0.4 }, { maxDays: 180, retain: 0.7 }, { maxDays: 270, retain: 0.85 }, { maxDays: 366, retain: 1.0 }],
};

const rule = (code, en, ar, condition, sort) => ({ product_code: 'ENG', country_code: null, code, description_en: en, description_ar: ar, condition: j(condition), active: true, sort });

const ENG_RULES = [
  rule('UW-E01', 'Value, contract value or period is above the instant-issue limit', 'القيمة أو قيمة العقد أو المدة تتجاوز حد الإصدار الفوري', { fact: 'exceedsAutoLimit', op: 'eq', value: true }, 1),
  rule('UW-E02', 'Complex project (high-rise, tunnels, bridges, marine works, heavy plant)', 'مشروع معقد (أبراج أو أنفاق أو جسور أو أعمال بحرية أو مصانع ثقيلة)', { fact: 'complexProject', op: 'eq', value: true }, 2),
  rule('UW-E03', 'Works have already started', 'بدأت الأعمال بالفعل', { fact: 'worksStarted', op: 'eq', value: true }, 3),
  rule('UW-E04', 'Equipment over 10 years old, or second-hand machinery being erected', 'معدات يزيد عمرها على 10 سنوات أو آلات مستعملة قيد التركيب', { fact: 'oldOrSecondHand', op: 'eq', value: true }, 4),
  rule('UW-E05', 'Two or more claims, or a large loss, in the last 3 years', 'مطالبتان أو أكثر، أو خسارة كبيرة، خلال آخر 3 سنوات', { fact: 'adverseClaims', op: 'eq', value: true }, 5),
  rule('UW-E06', 'An item or option that needs underwriter review (e.g. medical imaging, large transformer, long hot testing)', 'بند أو خيار يتطلب مراجعة المكتتب (مثل التصوير الطبي أو محول كبير أو اختبار ساخن طويل)', { fact: 'referralItem', op: 'eq', value: true }, 6),
  rule('UW-E07', 'Discount requested is above the broker’s band', 'الخصم المطلوب يتجاوز النطاق المسموح للوسيط', { fact: 'discountExceedsBand', op: 'eq', value: true }, 7),
  rule('UW-E08', 'Project in a high natural-catastrophe zone', 'المشروع في منطقة عالية الخطورة من الكوارث الطبيعية', { fact: 'highNatcat', op: 'eq', value: true }, 8),
  rule('UW-E09', 'Ground works outside instant criteria (basements, deep excavation, dewatering, blasting, piling near buildings, work over water)', 'أعمال أرضية خارج معايير الإصدار الفوري (أقبية أو حفر عميق أو نزح مياه أو تفجير أو خوازيق قرب مبانٍ أو عمل فوق الماء)', { fact: 'groundRisk', op: 'eq', value: true }, 9),
  rule('UW-E10', 'Sanctions screening needs review', 'فحص العقوبات يتطلب مراجعة', { fact: 'sanctionsHit', op: 'eq', value: true }, 10),
  rule('UW-E13', 'Declared project is outside the annual policy terms', 'المشروع المصرّح عنه خارج شروط الوثيقة السنوية', { fact: 'outsideAnnualTerms', op: 'eq', value: true }, 13),
  rule('UW-E14', 'Annual contractors’ policy needs underwriter approval', 'تتطلب وثيقة المقاولين السنوية موافقة المكتتب', { fact: 'annualNeedsApproval', op: 'eq', value: true }, 14),
  rule('UW-E11', 'Building or installation permit could not be verified', 'تعذّر التحقق من رخصة البناء أو التركيب', { fact: 'permitUnverified', op: 'eq', value: true }, 11),
];

exports.seed = async function seed(knex) {
  await knex('products').insert({ code: 'ENG', line: 'engineering', name_en: 'Engineering Insurance', name_ar: 'التأمين الهندسي', rater: 'engineering', status: 'active', config: j(ENG_CONFIG) });
  await knex('product_countries').insert({ product_code: 'ENG', country_code: 'AE', enabled_b2c: true, enabled_b2b: true, settings: j(ENG_AE_SETTINGS) });
  const maker = await knex('users').where({ email: 'config1@portal.test' }).first();
  const checker = await knex('users').where({ email: 'config2@portal.test' }).first();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await knex('rate_tables').insert(Object.entries(ENG_RATES_AE).map(([key, data]) => ({
    product_code: 'ENG', country_code: 'AE', table_key: key, version: 1, status: 'approved', data: j(data), effective_from: now,
    created_by: maker.id, submitted_by: maker.id, approved_by: checker.id, approved_at: now, change_note: 'Initial placeholder rates from Engineering BRD v0.1',
  })));
  await knex('referral_rules').insert(ENG_RULES);
};
