/**
 * Admin platform seed. Runs after the product seeds.
 * - Roles and privileges (system roles mirror the built-in base roles; custom roles can be added)
 * - Drop-down values: every option list in each product's configuration becomes an editable lookup
 * - System parameters, number formats, message templates (EN/AR), notification rules
 * - Commission schemes, a development platform licence, field definitions and help articles
 */
const { sign, MODULES } = require('../../lib/licence');

const j = (v) => JSON.stringify(v);

const PERMISSIONS = [
  ['admin.access', 'admin', 'Open the admin module'],
  ['admin.users', 'admin', 'Manage users'],
  ['admin.roles', 'admin', 'Manage roles and privileges'],
  ['admin.lookups', 'admin', 'Manage drop-down values'],
  ['admin.parameters', 'admin', 'Manage system parameters'],
  ['admin.numbering', 'admin', 'Manage quotation, policy and claim numbering'],
  ['admin.templates', 'admin', 'Manage email and SMS templates'],
  ['admin.notifications', 'admin', 'Manage notification rules'],
  ['admin.outbox', 'admin', 'View sent messages'],
  ['admin.commission', 'admin', 'Manage commission schemes and payouts'],
  ['admin.licence', 'admin', 'Manage the platform licence'],
  ['admin.fields', 'admin', 'Manage field labels, visibility and tooltips'],
  ['admin.help', 'admin', 'Manage the help manual'],
  ['admin.audit', 'admin', 'View the audit log'],
  ['quotes.create', 'quotes', 'Create and price quotes'],
  ['quotes.bind', 'quotes', 'Bind quotes and issue policies'],
  ['referrals.decide', 'underwriting', 'Decide referrals'],
  ['rates.edit', 'rating', 'Edit rate tables (maker)'],
  ['rates.approve', 'rating', 'Approve rate tables (checker)'],
  ['payments.confirm', 'finance', 'Confirm bank transfers'],
  ['reports.view', 'reports', 'View reports'],
  ['surveys.complete', 'engineering', 'Complete risk surveys'],
  ['commission.view', 'b2b', 'View own commission'],
  ['claims.notify', 'claims', 'Notify claims'],
];

const ALL_ADMIN = PERMISSIONS.filter((p) => p[0].startsWith('admin.')).map((p) => p[0]);
const ROLE_PERMS = {
  config_admin: [...ALL_ADMIN, 'rates.edit', 'reports.view'],
  uw_manager: ['admin.access', 'admin.audit', 'admin.commission', 'referrals.decide', 'rates.approve', 'reports.view', 'payments.confirm'],
  underwriter: ['referrals.decide', 'reports.view'],
  ops: ['admin.access', 'admin.outbox', 'admin.commission', 'payments.confirm', 'reports.view'],
  broker_admin: ['quotes.create', 'quotes.bind', 'commission.view', 'claims.notify'],
  broker_user: ['quotes.create', 'quotes.bind', 'claims.notify'],
  customer: ['quotes.create', 'quotes.bind', 'claims.notify'],
  risk_engineer: ['surveys.complete'],
};
const ROLE_NAMES = {
  config_admin: ['Configuration administrator', 'مسؤول الإعدادات'], uw_manager: ['Underwriting manager', 'مدير الاكتتاب'], underwriter: ['Underwriter', 'مكتتب'],
  ops: ['Operations', 'العمليات'], broker_admin: ['Broker administrator', 'مسؤول الوسيط'], broker_user: ['Broker user', 'مستخدم الوسيط'],
  customer: ['Customer', 'عميل'], risk_engineer: ['Risk engineer', 'مهندس المخاطر'],
};

const PARAMS = [
  ['general.insurerName', 'general', '[INSURER LEGAL NAME]', 'string', 'Shown in emails and documents'],
  ['general.supportEmail', 'general', 'support@insurer.example', 'string', 'Customer support email'],
  ['general.supportPhone', 'general', '[HELPLINE]', 'string', 'Customer support phone'],
  ['general.defaultLocale', 'general', 'en', 'string', 'Default language (en or ar)'],
  ['security.sessionHours', 'security', 12, 'number', 'Sign-in session length (hours)'],
  ['security.otpMinutes', 'security', 5, 'number', 'One-time code validity (minutes)'],
  ['security.otpMaxPer15Min', 'security', 5, 'number', 'Codes allowed per 15 minutes per mobile or email'],
  ['email.smtp.enabled', 'email', false, 'boolean', 'Send emails through SMTP (otherwise they are only logged in the outbox)'],
  ['email.smtp.host', 'email', '', 'string', 'SMTP host (use "json" to test without a server)'],
  ['email.smtp.port', 'email', 587, 'number', 'SMTP port'],
  ['email.smtp.secure', 'email', false, 'boolean', 'Use TLS from the start (port 465)'],
  ['email.smtp.user', 'email', '', 'string', 'SMTP user name'],
  ['email.smtp.password', 'email', '', 'secret', 'SMTP password'],
  ['email.from', 'email', 'Insurance Portal <no-reply@insurer.example>', 'string', 'From address'],
  ['sms.provider', 'sms', 'log', 'string', 'SMS provider adapter (log = record only)'],
  ['sms.senderId', 'sms', 'INSURER', 'string', 'SMS sender ID'],
  ['documents.maxSizeMb', 'documents', 10, 'number', 'Largest upload allowed (MB)'],
  ['documents.allowedTypes', 'documents', ['application/pdf', 'image/jpeg', 'image/png'], 'json', 'Allowed file types'],
  ['licence.warnDays', 'licence', 30, 'number', 'Warn administrators this many days before the licence expires'],
  ['products.requireApproval', 'products', false, 'boolean', 'Product configuration changes need approval by a second person'],
];

const NUMBER_FORMATS = [
  ['quote', 'Q-{COUNTRY}-{LINE}-{YYYY}-{SEQ:6}', 'New-business quotes'],
  ['renewal_quote', 'R-{COUNTRY}-{LINE}-{YYYY}-{SEQ:6}', 'Renewal quotes'],
  ['policy', '{COUNTRY}-{LINE}-{CHANNEL}-{YYYY}-{SEQ:6}', 'Policies (LINE = product type code, YYYY = inception year)'],
  ['claim', 'CLM-{COUNTRY}-{YYYY}-{SEQ:6}', 'Claims'],
  ['endorsement', '{POLICY}-E{SEQ:3}', 'Endorsements'],
  ['invoice', '{POLICY}-INV{SEQ:3}', 'Invoices for batched changes'],
  ['certificate', '{POLICY}/{SEQ:4}', 'Certificates under an open cover'],
];

const tpl = (code, channel, en, ar) => [
  { code, channel, locale: 'en', subject: en[0], body: en[1] },
  { code, channel, locale: 'ar', subject: ar[0], body: ar[1] },
];
const TEMPLATES = [
  ...tpl('otp', 'sms', [null, 'Your sign-in code is {{code}}. It expires in {{minutes}} minutes.'], [null, 'رمز الدخول الخاص بك هو {{code}}. تنتهي صلاحيته خلال {{minutes}} دقائق.']),
  ...tpl('otp', 'email', ['Your sign-in code', '<p>Your sign-in code is <strong>{{code}}</strong>. It expires in {{minutes}} minutes.</p>'], ['رمز الدخول', '<p>رمز الدخول الخاص بك هو <strong>{{code}}</strong>. تنتهي صلاحيته خلال {{minutes}} دقائق.</p>']),
  ...tpl('quote_saved', 'email', ['Your quote {{quoteRef}}', '<p>Dear {{customerName}},</p><p>Your quote <strong>{{quoteRef}}</strong> for {{productName}} is saved. Total: {{total}}. It is valid until {{validUntil}}.</p><p><a href="{{link}}">Continue your quote</a></p>'], ['عرض السعر {{quoteRef}}', '<p>عزيزنا {{customerName}}،</p><p>تم حفظ عرض السعر <strong>{{quoteRef}}</strong> لمنتج {{productName}}. الإجمالي: {{total}}. العرض ساري حتى {{validUntil}}.</p><p><a href="{{link}}">متابعة العرض</a></p>']),
  ...tpl('policy_issued', 'email', ['Your policy {{policyNo}} is issued', '<p>Dear {{customerName}},</p><p>Your {{productName}} policy <strong>{{policyNo}}</strong> is issued. Cover runs from {{inceptionDate}} to {{expiryDate}}. Total paid: {{total}}.</p><p><a href="{{link}}">View your documents</a></p>'], ['صدرت وثيقتك {{policyNo}}', '<p>عزيزنا {{customerName}}،</p><p>صدرت وثيقة {{productName}} رقم <strong>{{policyNo}}</strong>. تسري التغطية من {{inceptionDate}} إلى {{expiryDate}}. المبلغ المدفوع: {{total}}.</p><p><a href="{{link}}">عرض المستندات</a></p>']),
  ...tpl('policy_issued', 'sms', [null, 'Policy {{policyNo}} is issued. Documents: {{link}}'], [null, 'صدرت الوثيقة {{policyNo}}. المستندات: {{link}}']),
  ...tpl('policy_issued_broker', 'email', ['Policy {{policyNo}} issued for {{customerName}}', '<p>Policy <strong>{{policyNo}}</strong> ({{productName}}) is issued for {{customerName}}. Premium {{total}}.</p>'], ['صدرت الوثيقة {{policyNo}} للعميل {{customerName}}', '<p>صدرت الوثيقة <strong>{{policyNo}}</strong> ({{productName}}) للعميل {{customerName}}. القسط {{total}}.</p>']),
  ...tpl('referral_created', 'inapp', ['New referral {{reference}}', 'Referral {{reference}} for {{customerName}} needs review.'], ['إحالة جديدة {{reference}}', 'الإحالة {{reference}} للعميل {{customerName}} تحتاج إلى مراجعة.']),
  ...tpl('referral_received', 'email', ['We are reviewing {{reference}}', '<p>Dear {{customerName}},</p><p>An underwriter is reviewing <strong>{{reference}}</strong>. We usually reply within one working day.</p>'], ['نراجع {{reference}}', '<p>عزيزنا {{customerName}}،</p><p>يراجع أحد المكتتبين <strong>{{reference}}</strong>. نرد عادةً خلال يوم عمل واحد.</p>']),
  ...tpl('referral_decided', 'email', ['Underwriting decision for {{reference}}', '<p>Dear {{customerName}},</p><p>The underwriter has {{outcome}} <strong>{{reference}}</strong>.</p><p><a href="{{link}}">See the details</a></p>'], ['قرار الاكتتاب بشأن {{reference}}', '<p>عزيزنا {{customerName}}،</p><p>قرر المكتتب {{outcome}} بشأن <strong>{{reference}}</strong>.</p><p><a href="{{link}}">عرض التفاصيل</a></p>']),
  ...tpl('claim_registered', 'email', ['Claim {{claimNo}} registered', '<p>Dear {{customerName}},</p><p>Your claim <strong>{{claimNo}}</strong> on policy {{policyNo}} is registered. Please upload the documents listed in your account.</p>'], ['تم تسجيل المطالبة {{claimNo}}', '<p>عزيزنا {{customerName}}،</p><p>تم تسجيل مطالبتك <strong>{{claimNo}}</strong> على الوثيقة {{policyNo}}. يُرجى رفع المستندات المطلوبة في حسابك.</p>']),
  ...tpl('claim_registered', 'sms', [null, 'Claim {{claimNo}} registered on {{policyNo}}.'], [null, 'تم تسجيل المطالبة {{claimNo}} على الوثيقة {{policyNo}}.']),
  ...tpl('claim_registered_staff', 'inapp', ['New claim {{claimNo}}', 'Claim {{claimNo}} on {{policyNo}}: {{cause}}.'], ['مطالبة جديدة {{claimNo}}', 'المطالبة {{claimNo}} على {{policyNo}}: {{cause}}.']),
  ...tpl('renewal_ready', 'email', ['Your renewal for {{policyNo}} is ready', '<p>Dear {{customerName}},</p><p>Your policy {{policyNo}} expires on {{expiryDate}}. Your renewal quote {{renewalRef}} is ready: {{total}}.</p><p><a href="{{link}}">Review and renew</a></p>'], ['عرض تجديد {{policyNo}} جاهز', '<p>عزيزنا {{customerName}}،</p><p>تنتهي وثيقتك {{policyNo}} في {{expiryDate}}. عرض التجديد {{renewalRef}} جاهز: {{total}}.</p><p><a href="{{link}}">راجع وجدّد</a></p>']),
  ...tpl('renewal_ready_broker', 'email', ['Renewal ready: {{policyNo}}', '<p>Renewal quote {{renewalRef}} for {{customerName}} ({{policyNo}}, expires {{expiryDate}}) is ready.</p>'], ['التجديد جاهز: {{policyNo}}', '<p>عرض التجديد {{renewalRef}} للعميل {{customerName}} ({{policyNo}}، ينتهي {{expiryDate}}) جاهز.</p>']),
  ...tpl('renewal_reminder', 'email', ['{{daysLeft}} days left on {{policyNo}}', '<p>Dear {{customerName}},</p><p>Your policy {{policyNo}} expires in {{daysLeft}} days. <a href="{{link}}">Renew now</a> to stay covered.</p>'], ['تبقّى {{daysLeft}} يومًا على {{policyNo}}', '<p>عزيزنا {{customerName}}،</p><p>تنتهي وثيقتك {{policyNo}} خلال {{daysLeft}} يومًا. <a href="{{link}}">جدّد الآن</a> لتبقى مؤمَّنًا.</p>']),
  ...tpl('renewal_reminder', 'sms', [null, 'Policy {{policyNo}} expires in {{daysLeft}} days. Renew: {{link}}'], [null, 'تنتهي الوثيقة {{policyNo}} خلال {{daysLeft}} يومًا. جدّد: {{link}}']),
  ...tpl('renewal_reminder_broker', 'email', ['Client renewal due in {{daysLeft}} days: {{policyNo}}', '<p>{{customerName}} – {{policyNo}} expires in {{daysLeft}} days. Renewal {{renewalRef}}.</p>'], ['تجديد عميل خلال {{daysLeft}} يومًا: {{policyNo}}', '<p>{{customerName}} – تنتهي {{policyNo}} خلال {{daysLeft}} يومًا. التجديد {{renewalRef}}.</p>']),
  ...tpl('auto_renew_failed', 'email', ['We could not renew {{policyNo}} automatically', '<p>Dear {{customerName}},</p><p>The payment for your automatic renewal of {{policyNo}} did not go through. <a href="{{link}}">Renew with another card</a>.</p>'], ['تعذّر التجديد التلقائي لـ {{policyNo}}', '<p>عزيزنا {{customerName}}،</p><p>لم تكتمل عملية الدفع للتجديد التلقائي للوثيقة {{policyNo}}. <a href="{{link}}">جدّد ببطاقة أخرى</a>.</p>']),
  ...tpl('invoice_due', 'email', ['Invoice for {{policyNo}} ({{period}})', '<p>Dear {{customerName}},</p><p>An invoice for changes to {{policyNo}} in {{period}} is ready. <a href="{{link}}">Pay online</a>.</p>'], ['فاتورة {{policyNo}} ({{period}})', '<p>عزيزنا {{customerName}}،</p><p>فاتورة التعديلات على {{policyNo}} للفترة {{period}} جاهزة. <a href="{{link}}">ادفع عبر الإنترنت</a>.</p>']),
  ...tpl('wage_declaration_due', 'email', ['Declare actual wages for {{policyNo}}', '<p>Dear {{customerName}},</p><p>Please declare the wages you actually paid under {{policyNo}}. <a href="{{link}}">Declare now</a>.</p>'], ['صرّح بالأجور الفعلية لـ {{policyNo}}', '<p>عزيزنا {{customerName}}،</p><p>يُرجى التصريح بالأجور المدفوعة فعليًا بموجب {{policyNo}}. <a href="{{link}}">صرّح الآن</a>.</p>']),
  ...tpl('payment_failed', 'email', ['Payment not completed for {{quoteRef}}', '<p>Dear {{customerName}},</p><p>Your payment for {{quoteRef}} was not completed. Your quote is saved. <a href="{{link}}">Try again</a>.</p>'], ['لم تكتمل عملية الدفع لـ {{quoteRef}}', '<p>عزيزنا {{customerName}}،</p><p>لم تكتمل عملية الدفع لـ {{quoteRef}}. عرضك محفوظ. <a href="{{link}}">حاول مرة أخرى</a>.</p>']),
  ...tpl('survey_completed', 'inapp', ['Survey completed: {{reference}}', 'Risk grade {{grade}} for {{reference}}.'], ['اكتملت المعاينة: {{reference}}', 'تصنيف الخطر {{grade}} لـ {{reference}}.']),
  ...tpl('open_cover_turnover', 'email', ['{{pct}}% of the turnover used on {{policyNo}}', '<p>Certificates under open cover {{policyNo}} have reached {{pct}}% of the annual turnover estimate.</p>'], ['تم استخدام {{pct}}% من حجم الأعمال على {{policyNo}}', '<p>بلغت الشهادات الصادرة بموجب الغطاء المفتوح {{policyNo}} نسبة {{pct}}% من تقدير حجم الأعمال السنوي.</p>']),
  ...tpl('test_email', 'email', ['Test email from the insurance portal', '<p>This is a test email. SMTP is working.</p>'], ['رسالة تجريبية من بوابة التأمين', '<p>هذه رسالة تجريبية. خادم البريد يعمل.</p>']),
];

const RULES = [
  ['quote.saved', 'email', 'customer', 'quote_saved', 'Quote saved with the customer’s details'],
  ['referral.created', 'inapp', 'underwriters', 'referral_created', 'Tell underwriters about a new referral'],
  ['referral.created', 'email', 'customer', 'referral_received', 'Tell the customer we are reviewing'],
  ['referral.decided', 'email', 'customer', 'referral_decided', 'Underwriting decision to the customer'],
  ['referral.decided', 'email', 'broker', 'referral_decided', 'Underwriting decision to the broker'],
  ['policy.issued', 'email', 'customer', 'policy_issued', 'Policy issued'],
  ['policy.issued', 'sms', 'customer', 'policy_issued', 'Policy issued (SMS)'],
  ['policy.issued', 'email', 'broker', 'policy_issued_broker', 'Policy issued for a broker client'],
  ['claim.registered', 'email', 'customer', 'claim_registered', 'Claim registered'],
  ['claim.registered', 'sms', 'customer', 'claim_registered', 'Claim registered (SMS)'],
  ['claim.registered', 'inapp', 'ops', 'claim_registered_staff', 'New claim for operations'],
  ['renewal.ready', 'email', 'customer', 'renewal_ready', 'Renewal quote ready'],
  ['renewal.ready', 'email', 'broker', 'renewal_ready_broker', 'Renewal quote ready (broker)'],
  ['renewal.reminder', 'email', 'customer', 'renewal_reminder', 'Renewal reminder'],
  ['renewal.reminder', 'sms', 'customer', 'renewal_reminder', 'Renewal reminder (SMS)'],
  ['renewal.reminder', 'email', 'broker', 'renewal_reminder_broker', 'Renewal reminder (broker)'],
  ['autorenew.failed', 'email', 'customer', 'auto_renew_failed', 'Automatic renewal payment failed'],
  ['invoice.due', 'email', 'customer', 'invoice_due', 'Invoice for batched changes'],
  ['declaration.due', 'email', 'customer', 'wage_declaration_due', 'WC wage declaration reminder'],
  ['payment.failed', 'email', 'customer', 'payment_failed', 'Payment failed'],
  ['survey.completed', 'inapp', 'underwriters', 'survey_completed', 'Risk survey completed'],
  ['opencover.turnover', 'email', 'customer', 'open_cover_turnover', 'Open cover turnover alert'],
  ['opencover.turnover', 'email', 'broker', 'open_cover_turnover', 'Open cover turnover alert (broker)'],
];

/**
 * Field properties for every screen. Labels are left empty so the built-in (translated) label
 * shows until an administrator overrides it; tooltips explain what to enter and why.
 * [screen, key, tooltip EN, tooltip AR, extra]
 */
const FIELD_ROWS = [
  ['auth.login', 'email', null, null, { field_type: 'email', mandatory: true }],
  ['auth.login', 'password', null, null, { mandatory: true }],
  ['fire.premise', 'occupancy', 'Pick the activity that best matches your trade licence. It sets the base rate.', 'اختر النشاط الأقرب لرخصتك التجارية. يحدد السعر الأساسي.', { field_type: 'select', mandatory: true, help_slug: 'getting-started' }],
  ['fire.business', 'businessName', 'Use the exact legal name on your trade licence.', 'استخدم الاسم القانوني كما يظهر في الرخصة التجارية.', {}],
  ['fire.business', 'tradeLicence', 'We verify this with the licensing authority where available.', 'نتحقق منه لدى الجهة المختصة عند توفر ذلك.', {}],
  ['fire.business', 'interest', 'Owners usually insure the building; tenants insure fit-out, contents and stock.', 'يؤمّن المالك عادةً المبنى، ويؤمّن المستأجر التجهيزات والمحتويات والمخزون.', { field_type: 'radio' }],
  ['fire.business', 'claims3y', 'Include claims with any insurer. Two or more fire claims go to an underwriter.', 'اشمل المطالبات لدى أي شركة تأمين. مطالبتان أو أكثر تُحالان إلى المكتتب.', { field_type: 'radio' }],
  ['fire.business', 'building', 'Building name and unit or shop number.', 'اسم المبنى ورقم الوحدة أو المحل.', { mandatory: true }],
  ['fire.business', 'area', 'Area or district. We use it to check flood and storm exposure.', 'المنطقة أو الحي. نستخدمها لتقدير التعرض للفيضانات والعواصف.', { mandatory: true }],
  ['fire.business', 'city', null, null, {}],
  ['fire.business', 'construction', 'Light steel or sandwich-panel buildings burn faster and cost more to insure.', 'المباني الفولاذية الخفيفة أو ألواح الساندويتش تحترق أسرع وتكلفة تأمينها أعلى.', { field_type: 'radio', lookup_list: 'FIRE.constructionClasses' }],
  ['fire.business', 'buildingAge', null, null, { field_type: 'select', lookup_list: 'FIRE.buildingAges' }],
  ['fire.business', 'floorLevel', 'Stock kept in a basement is more exposed to flooding and may need review.', 'المخزون في القبو أكثر عرضة للفيضانات وقد يحتاج إلى مراجعة.', { field_type: 'select', lookup_list: 'FIRE.floorLevels' }],
  ['fire.business', 'protection', 'Sprinklers and alarms lower your premium.', 'مرشات الإطفاء وأجهزة الإنذار تخفّض القسط.', { field_type: 'checkbox' }],
  ['fire.business', 'civilDefence', 'Without a valid certificate an underwriter reviews the quote.', 'بدون شهادة سارية يراجع المكتتب العرض.', { field_type: 'radio' }],
  ['fire.quote', 'discount', 'Discounts above your authority band send the quote to an underwriter.', 'الخصومات فوق صلاحيتك تُحيل العرض إلى المكتتب.', { field_type: 'select' }],
  ['common.details', 'companyName', 'Exactly as on the trade licence; it is printed on the policy.', 'كما في الرخصة التجارية تمامًا؛ يُطبع على الوثيقة.', { mandatory: true }],
  ['common.details', 'tradeLicence', null, null, { mandatory: true }],
  ['common.details', 'licenceExpiry', 'An expired licence cannot be insured. Renew it first.', 'لا يمكن تأمين رخصة منتهية. جدّدها أولًا.', { field_type: 'date', mandatory: true }],
  ['common.details', 'taxNo', 'Needed for a tax invoice in your company’s name.', 'مطلوب لإصدار فاتورة ضريبية باسم شركتك.', {}],
  ['common.details', 'contactName', 'The person authorised to sign for the business.', 'الشخص المفوّض بالتوقيع عن المنشأة.', { mandatory: true }],
  ['common.details', 'contactIdNo', 'Emirates ID of the authorised signatory, for identity checks.', 'الهوية الإماراتية للمفوّض بالتوقيع، لأغراض التحقق من الهوية.', { mandatory: true }],
  ['common.details', 'email', 'Your policy documents are sent here.', 'تُرسل مستندات الوثيقة إلى هذا العنوان.', { field_type: 'email', mandatory: true }],
  ['common.details', 'mobile', 'Include the country code, e.g. +971 50 123 4567.', 'أدخل رمز الدولة، مثل ‎+971 50 123 4567.', { field_type: 'tel', mandatory: true }],
  ['common.details', 'inceptionDate', 'Cover starts at 00:01 on this date, up to 60 days ahead.', 'تبدأ التغطية الساعة 00:01 من هذا التاريخ، حتى 60 يومًا مقدمًا.', { field_type: 'date', mandatory: true }],
  ['common.details', 'lossPayee', 'If a bank finances the property, it is paid first in a claim.', 'إذا موّل بنك العقار، يُدفع له أولًا عند المطالبة.', {}],
  ['common.payment', 'method', null, null, { field_type: 'radio' }],
  ['common.payment', 'cardNumber', 'Test mode: any number works; one ending 0002 is declined.', 'وضع الاختبار: يُقبل أي رقم؛ البطاقة المنتهية بـ 0002 تُرفض.', { field_type: 'text', mandatory: true }],
  ['common.payment', 'cardExpiry', null, null, { mandatory: true }],
  ['common.payment', 'cardCvc', 'The 3 digits on the back of the card.', 'الأرقام الثلاثة على ظهر البطاقة.', { mandatory: true }],
  ['common.payment', 'referralNote', 'Anything that helps the underwriter decide faster, such as recent improvements.', 'أي معلومة تساعد المكتتب على القرار أسرع، مثل التحسينات الأخيرة.', { field_type: 'textarea' }],
  ['marine.shipment', 'commodity', 'Choose the closest match to the goods on your invoice.', 'اختر الأقرب للبضاعة في فاتورتك.', { field_type: 'select', mandatory: true }],
  ['marine.shipment', 'description', null, null, {}],
  ['marine.shipment', 'packing', 'Unpacked or bulk goods cannot have all-risks cover without review.', 'البضائع غير المغلفة أو السائبة لا تحصل على تغطية جميع المخاطر دون مراجعة.', { field_type: 'select', lookup_list: 'MARINE.packings' }],
  ['marine.shipment', 'container', null, null, { field_type: 'select', lookup_list: 'MARINE.containers' }],
  ['marine.shipment', 'direction', null, null, { field_type: 'radio' }],
  ['marine.shipment', 'mode', 'Main mode of transport; the clause options depend on it.', 'وسيلة النقل الرئيسية؛ تعتمد خيارات الشروط عليها.', { field_type: 'radio' }],
  ['marine.shipment', 'originCountry', null, null, { field_type: 'select' }],
  ['marine.shipment', 'originPlace', 'Start typing to pick a port code (UN/LOCODE), or enter a city.', 'ابدأ الكتابة لاختيار رمز الميناء (UN/LOCODE) أو أدخل المدينة.', { mandatory: true }],
  ['marine.shipment', 'destinationCountry', null, null, { field_type: 'select' }],
  ['marine.shipment', 'destinationPlace', 'Start typing to pick a port code (UN/LOCODE), or enter a city.', 'ابدأ الكتابة لاختيار رمز الميناء (UN/LOCODE) أو أدخل المدينة.', { mandatory: true }],
  ['marine.shipment', 'finalDestination', 'Cover continues to this warehouse, up to 60 days after discharge.', 'تستمر التغطية حتى هذا المستودع، لمدة تصل إلى 60 يومًا بعد التفريغ.', {}],
  ['marine.shipment', 'sailingDate', 'Buy cover before the goods leave. Sailing within 24 hours needs review.', 'اشترِ التغطية قبل مغادرة البضاعة. الإبحار خلال 24 ساعة يحتاج إلى مراجعة.', { field_type: 'date', mandatory: true }],
  ['marine.shipment', 'incoterm', 'FOB, FCA and EXW do not include freight, so we add it to the sum insured.', 'شروط FOB وFCA وEXW لا تشمل الشحن، لذا نضيفه إلى مبلغ التأمين.', { field_type: 'select', lookup_list: 'MARINE.incoterms', help_slug: 'marine-incoterms' }],
  ['marine.shipment', 'vesselName', 'We check age and class in the vessel register. Vessels over 25 years go to an underwriter.', 'نتحقق من العمر والتصنيف في سجل السفن. السفن التي يزيد عمرها على 25 عامًا تُحال إلى المكتتب.', {}],
  ['marine.shipment', 'vesselImo', 'Seven digits; on the booking confirmation.', 'سبعة أرقام؛ تجدها في تأكيد الحجز.', { pattern: '^\\d{7}$' }],
  ['marine.shipment', 'conveyanceRef', null, null, {}],
  ['marine.value', 'currency', null, null, { field_type: 'select' }],
  ['marine.value', 'invoiceAmount', 'Total on the commercial invoice, in the invoice currency.', 'إجمالي الفاتورة التجارية بعملة الفاتورة.', { field_type: 'money', mandatory: true }],
  ['marine.value', 'freight', 'Only when freight is not in the invoice (FOB, FCA, EXW).', 'فقط عندما لا يكون الشحن ضمن الفاتورة (FOB وFCA وEXW).', { field_type: 'money' }],
  ['marine.value', 'uplift', 'The standard 10% covers costs such as handling and loss of expected profit.', 'تغطي نسبة 10% القياسية تكاليف مثل المناولة وفقدان الربح المتوقع.', { field_type: 'select' }],
  ['marine.value', 'duty', 'Insure import duty if you pay it before delivery.', 'أمّن الرسوم الجمركية إذا كنت تدفعها قبل التسليم.', { field_type: 'money' }],
  ['marine.value', 'invoiceNo', null, null, {}],
  ['marine.value', 'lcBank', 'The bank that issued the letter of credit; named as loss payee.', 'البنك المُصدر للاعتماد المستندي؛ يُذكر كمستفيد من التعويض.', {}],
  ['marine.value', 'lcNumber', null, null, {}],
  ['marine.value', 'lcWording', 'Copy the insurance wording from the LC; it is printed on the certificate.', 'انسخ صيغة التأمين من الاعتماد؛ تُطبع على الشهادة.', { field_type: 'textarea' }],
  ['marine.opencover', 'businessName', null, null, {}],
  ['marine.opencover', 'interest', null, null, { field_type: 'select' }],
  ['marine.opencover', 'inception', null, null, { field_type: 'date' }],
  ['marine.opencover', 'turnover', 'Expected value of all shipments in the year. Certificates above it refer.', 'القيمة المتوقعة لجميع الشحنات خلال السنة. الشهادات التي تتجاوزها تُحال.', { field_type: 'money', mandatory: true }],
  ['marine.opencover', 'perSendingLimit', 'Largest single shipment covered without review.', 'أكبر شحنة منفردة تُغطّى دون مراجعة.', { field_type: 'money', mandatory: true }],
  ['marine.opencover', 'discount', null, null, { field_type: 'select' }],
  ['wc.workforce', 'trade', 'Choose the main activity of the business; it sets the hazard class.', 'اختر النشاط الرئيسي للمنشأة؛ يحدد فئة الخطورة.', { field_type: 'select', mandatory: true, help_slug: 'wc-law' }],
  ['wc.workforce', 'businessName', null, null, {}],
  ['wc.workforce', 'establishmentNo', 'Your MoHRE establishment number; printed on the certificate.', 'رقم المنشأة لدى وزارة الموارد البشرية؛ يُطبع على الشهادة.', {}],
  ['wc.workforce', 'workLocation', null, null, {}],
  ['wc.workforce', 'claims', 'Work accidents with any insurer in the last 3 years.', 'حوادث العمل لدى أي شركة تأمين خلال آخر 3 سنوات.', { field_type: 'radio' }],
  ['wc.plan', 'period', 'Short periods cost more per month (1 month 20%, 6 months 70% of annual).', 'الفترات القصيرة أعلى تكلفة شهريًا (شهر 20%، 6 أشهر 70% من السنوي).', { field_type: 'select' }],
  ['wc.plan', 'elLimit', 'Most for any one event if employees sue you for negligence.', 'الحد الأقصى لأي حادث واحد إذا رفع الموظفون دعوى إهمال ضدك.', { field_type: 'select' }],
  ['wc.plan', 'discount', null, null, { field_type: 'select' }],
  ['engineering.project', 'projectType', 'High-rise, marine works and heavy plant are reviewed by an engineer.', 'الأبراج والأعمال البحرية والمصانع الثقيلة يراجعها مهندس.', { field_type: 'select', mandatory: true, help_slug: 'engineering-instant' }],
  ['engineering.project', 'name', null, null, {}],
  ['engineering.project', 'principal', 'The project owner; usually named as an additional insured.', 'مالك المشروع؛ يُذكر عادةً كمؤمَّن له إضافي.', {}],
  ['engineering.project', 'permitNo', 'Building or installation permit from the municipality. Unverified permits go to an underwriter.', 'ترخيص البناء أو التركيب من البلدية. التراخيص غير المؤكدة تُحال إلى المكتتب.', {}],
  ['engineering.project', 'area', 'We use the location to check flood exposure.', 'نستخدم الموقع لتقدير التعرض للفيضانات.', { mandatory: true }],
  ['engineering.project', 'city', null, null, {}],
  ['engineering.project', 'contractValue', 'The full value of the works in your contract, including materials and labour.', 'القيمة الكاملة للأعمال في عقدك، بما فيها المواد والعمالة.', { field_type: 'money', mandatory: true }],
  ['engineering.project', 'ownerMaterials', 'Materials the owner supplies free to you; added to the sum insured.', 'المواد التي يوردها المالك مجانًا؛ تُضاف إلى مبلغ التأمين.', { field_type: 'money' }],
  ['engineering.project', 'startDate', 'Works that have already started need an underwriter.', 'الأعمال التي بدأت بالفعل تحتاج إلى مكتتب.', { field_type: 'date', mandatory: true }],
  ['engineering.project', 'completionDate', 'Planned handover date. You can extend online later.', 'تاريخ التسليم المخطط. يمكنك التمديد عبر الإنترنت لاحقًا.', { field_type: 'date', mandatory: true }],
  ['engineering.project', 'maintenance', 'Visits cover damage you cause while fixing defects; extended also covers defects from construction.', 'الزيارات تغطي الأضرار أثناء إصلاح العيوب؛ والممتدة تغطي أيضًا العيوب الناتجة عن الإنشاء.', { field_type: 'select' }],
  ['engineering.project', 'foundation', null, null, { field_type: 'select' }],
  ['engineering.project', 'storeysAbove', null, null, { field_type: 'number' }],
  ['engineering.project', 'basements', 'More than one basement goes to an underwriter.', 'أكثر من قبو واحد يُحال إلى المكتتب.', { field_type: 'number' }],
  ['engineering.project', 'excavationDepth', 'Excavation deeper than 6 m goes to an underwriter.', 'الحفر الأعمق من 6 أمتار يُحال إلى المكتتب.', { field_type: 'number' }],
  ['engineering.project', 'nearestBuildingM', null, null, { field_type: 'number' }],
  ['engineering.project', 'methods', 'Any of these works go to an engineer for review.', 'أي من هذه الأعمال يُحال إلى مهندس للمراجعة.', { field_type: 'checkbox' }],
  ['engineering.project', 'testingWeeks', 'Hot testing longer than 2 weeks needs an underwriter.', 'الاختبار الساخن لأكثر من أسبوعين يحتاج إلى مكتتب.', { field_type: 'number' }],
  ['engineering.annual', 'annualTurnover', null, null, { field_type: 'money' }],
  ['engineering.annual', 'maxContractValue', 'Projects above this value are referred when declared.', 'المشاريع التي تتجاوز هذه القيمة تُحال عند التصريح عنها.', { field_type: 'money' }],
  ['engineering.annual', 'maxMonths', null, null, { field_type: 'number' }],
  ['engineering.cover', 'territory', 'Floater covers the equipment anywhere in the country; it costs a little more.', 'التغطية المتنقلة تشمل المعدات في أي مكان داخل الدولة؛ وتكلفتها أعلى قليلًا.', { field_type: 'radio' }],
  ['engineering.cover', 'tplLimit', 'Damage or injury to others caused by the works.', 'الأضرار أو الإصابات التي تسببها الأعمال للغير.', { field_type: 'select' }],
  ['engineering.cover', 'discount', null, null, { field_type: 'select' }],
  ['policy.servicing', 'lossDate', 'Tell us within 7 days of the loss.', 'أبلغنا خلال 7 أيام من الخسارة.', { field_type: 'date', mandatory: true }],
  ['policy.servicing', 'cause', null, null, { field_type: 'select' }],
  ['policy.servicing', 'estimate', 'Your best estimate; the surveyor confirms the amount.', 'أفضل تقدير لديك؛ يؤكد المعاين المبلغ.', { field_type: 'money' }],
  ['policy.servicing', 'reportNo', 'Civil Defence report for fire; police report for theft or malicious damage.', 'تقرير الدفاع المدني للحريق؛ وتقرير الشرطة للسرقة أو الأضرار الكيدية.', {}],
  ['policy.servicing', 'description', null, null, { field_type: 'textarea', mandatory: true }],
  ['policy.servicing', 'contactName', null, null, {}],
  ['policy.servicing', 'email', null, null, { field_type: 'email' }],
  ['policy.servicing', 'mobile', null, null, { field_type: 'tel' }],
  ['policy.servicing', 'cancelReason', 'Within the free-look period you get a full refund if there was no claim.', 'خلال فترة المراجعة المجانية تسترد المبلغ كاملًا إن لم تكن هناك مطالبة.', { mandatory: true }],
];
const FIELDS = FIELD_ROWS.map(([screen, key, tipEn, tipAr, extra], i) => ({ screen, field_key: key, tooltip_en: tipEn, tooltip_ar: tipAr, field_type: 'text', sort: i + 1, ...extra }));

const h = (slug, category, titleEn, titleAr, bodyEn, bodyAr, audience, sort) => ({ slug, category, title_en: titleEn, title_ar: titleAr, body_en: bodyEn, body_ar: bodyAr, audience: j(audience), sort });
const HELP = [
  h('getting-started', 'General', 'Getting started', 'البدء', '## Buying cover online\n1. Choose a product on the home page.\n2. Answer the questions; your price updates as you type.\n3. Sign in with a one-time code to save your quote.\n4. Add your details and pay. Your documents arrive by email.\n\nIf a quote needs an underwriter, we tell you why and reply within one working day.', '## شراء التغطية عبر الإنترنت\n1. اختر منتجًا من الصفحة الرئيسية.\n2. أجب عن الأسئلة؛ يتحدث السعر أثناء الكتابة.\n3. سجّل الدخول برمز لمرة واحدة لحفظ العرض.\n4. أضف بياناتك وادفع. تصلك المستندات بالبريد الإلكتروني.\n\nإذا احتاج العرض إلى مكتتب، نخبرك بالسبب ونرد خلال يوم عمل واحد.', ['customer', 'broker'], 1),
  h('fire-sum-insured', 'Fire', 'How much should I insure for?', 'ما المبلغ الذي يجب أن أؤمّنه؟', 'Insure each item for the cost to **replace it new today**, including delivery and installation. Stock is insured at cost price, not selling price; use your highest stock level in the year.\n\nIf you insure for less than the true value, claims are reduced in the same proportion (average).', 'أمّن كل بند بتكلفة **استبداله بآخر جديد اليوم**، بما في ذلك التوصيل والتركيب. يُؤمَّن المخزون بسعر التكلفة لا بسعر البيع؛ استخدم أعلى مستوى للمخزون خلال السنة.\n\nإذا أمّنت بأقل من القيمة الحقيقية، تُخفَّض المطالبات بالنسبة نفسها.', ['customer', 'broker'], 2),
  h('marine-incoterms', 'Marine', 'Incoterms and the sum insured', 'شروط التسليم ومبلغ التأمين', 'With **FOB, FCA or EXW**, the invoice does not include freight, so we add it. With **CIF, CIP, CFR, DAP or DDP**, freight is already in the invoice. We then add the uplift (usually 10%) for extra costs.', 'مع شروط **FOB أو FCA أو EXW** لا تشمل الفاتورة الشحن، لذا نضيفه. ومع **CIF أو CIP أو CFR أو DAP أو DDP** يكون الشحن مشمولًا. ثم نضيف الزيادة (عادةً 10%) للتكاليف الإضافية.', ['customer', 'broker'], 3),
  h('wc-law', 'Workmen’s Compensation', 'What the law requires of employers', 'ما يفرضه القانون على أصحاب العمل', 'In the UAE, death or permanent total disability from a work injury is compensated at **24 months’ basic wage** (AED 18,000–200,000). While an employee cannot work, you pay full wage for up to 6 months, then half wage for up to 6 more. Report work injuries to MoHRE within 48 hours.', 'في الإمارات، تُعوَّض الوفاة أو العجز الكلي الدائم الناتج عن إصابة عمل بـ **أجر 24 شهرًا أساسيًا** (18,000 – 200,000 درهم). وأثناء عجز الموظف عن العمل تدفع الأجر كاملًا حتى 6 أشهر، ثم نصفه حتى 6 أشهر أخرى. أبلغ الوزارة عن إصابات العمل خلال 48 ساعة.', ['customer', 'broker'], 4),
  h('engineering-instant', 'Engineering', 'When is a project covered instantly?', 'متى تُغطّى المشاريع فورًا؟', 'Smaller, simpler projects are covered at once: contract value up to AED 10 million (CAR) or AED 5 million (EAR), up to 24 months, at most one basement and 6 m excavation, no dewatering, blasting, piling next to buildings or work over water, and not in a high flood zone. Anything else gets a quote online and an engineer’s review within 2 working days.', 'تُغطّى المشاريع الأصغر والأبسط فورًا: قيمة عقد حتى 10 ملايين درهم (CAR) أو 5 ملايين (EAR)، ومدة حتى 24 شهرًا، وقبو واحد كحد أقصى وحفر حتى 6 أمتار، دون نزح مياه أو تفجير أو خوازيق قرب مبانٍ أو عمل فوق الماء، وليس في منطقة فيضانات عالية الخطورة. أي مشروع آخر يحصل على عرض عبر الإنترنت ومراجعة مهندس خلال يومي عمل.', ['customer', 'broker'], 5),
  h('broker-portal', 'Brokers', 'Using the broker portal', 'استخدام بوابة الوسطاء', 'Quote for any client, apply discounts within your band, bind within your authority, and follow referrals in the conversation thread. Your commission statement shows earned, paid and clawed-back commission.', 'أعدّ عروضًا لأي عميل، وطبّق الخصومات ضمن نطاقك، وأصدر ضمن صلاحياتك، وتابع الإحالات في سلسلة المراسلات. يعرض كشف العمولات العمولة المستحقة والمدفوعة والمستردة.', ['broker'], 6),
  h('admin-overview', 'Administration', 'Admin module overview', 'نظرة عامة على وحدة الإدارة', 'The admin module controls drop-down values, field labels and tooltips, users and roles, number formats, system parameters, email and SMS templates, notification rules, commission schemes and the platform licence. Every change is recorded in the audit log.', 'تتحكم وحدة الإدارة في قيم القوائم المنسدلة وعناوين الحقول وتلميحاتها والمستخدمين والأدوار وصيغ الترقيم ومعايير النظام وقوالب البريد والرسائل وقواعد الإشعارات وخطط العمولات وترخيص المنصة. يُسجَّل كل تغيير في سجل التدقيق.', ['staff'], 7),
];

exports.seed = async function seed(knex) {
  await knex('permissions').insert(PERMISSIONS.map(([code, module, description]) => ({ code, module, description })));
  for (const [base, [en, ar]] of Object.entries(ROLE_NAMES)) {
    // eslint-disable-next-line no-await-in-loop
    const [id] = await knex('roles').insert({ code: base, name_en: en, name_ar: ar, base_role: base, system: true, description: 'Built-in role' });
    // eslint-disable-next-line no-await-in-loop
    await knex('role_permissions').insert(ROLE_PERMS[base].map((p) => ({ role_id: id, permission_code: p })));
    // eslint-disable-next-line no-await-in-loop
    await knex('users').where({ role: base }).update({ role_id: id });
  }

  // Every option list ({ code, name: { en, ar } }) in a product's configuration becomes an editable lookup.
  const products = await knex('products');
  for (const p of products) {
    for (const [key, list] of Object.entries(p.config)) {
      // Covers, clauses and deductibles are product structure (Admin → Products), not drop-down lists.
      if (['extensions', 'addOns', 'clauses', 'deductibles'].includes(key)) continue;
      if (!Array.isArray(list) || !list.length || !list.every((o) => o && o.code != null && o.name && o.name.en)) continue;
      const code = `${p.code}.${key}`;
      // eslint-disable-next-line no-await-in-loop
      await knex('lookup_lists').insert({ code, name: `${p.name_en} – ${key}`, product_code: p.code });
      // eslint-disable-next-line no-await-in-loop
      await knex('lookup_values').insert(list.map((o, i) => {
        const { code: c, name, ...attributes } = o;
        return { list_code: code, code: String(c), label_en: name.en, label_ar: name.ar, sort: i + 1, attributes: j(attributes) };
      }));
    }
  }
  await knex('lookup_lists').insert({ code: 'GLOBAL.documentTypes', name: 'Document types', product_code: null });
  const docs = [['trade_licence', 'Trade licence', 'الرخصة التجارية'], ['emirates_id', 'Emirates ID', 'الهوية الإماراتية'], ['invoice', 'Commercial invoice', 'الفاتورة التجارية'], ['photo', 'Photo', 'صورة'], ['civil_defence', 'Civil Defence certificate', 'شهادة الدفاع المدني'], ['permit', 'Building permit', 'رخصة البناء'], ['bill_of_lading', 'Bill of lading', 'بوليصة الشحن'], ['medical_report', 'Medical report', 'التقرير الطبي'], ['survey_report', 'Survey report', 'تقرير المعاينة'], ['other', 'Other', 'أخرى']];
  await knex('lookup_values').insert(docs.map(([c, en, ar], i) => ({ list_code: 'GLOBAL.documentTypes', code: c, label_en: en, label_ar: ar, sort: i + 1, attributes: j({}) })));

  await knex('system_parameters').insert(PARAMS.map(([key, group, value, type, description]) => ({ key, group, value: j(value), type, description })));
  await knex('number_formats').insert(NUMBER_FORMATS.map(([entity, pattern, description]) => ({ entity, pattern, description })));
  await knex('message_templates').insert(TEMPLATES);
  await knex('notification_rules').insert(RULES.map(([event, channel, recipient, template_code, description]) => ({ event, channel, recipient, template_code, description })));

  const brokers = await knex('brokers');
  await knex('commission_schemes').insert(brokers.map((b) => ({ name: `${b.name} – all products`, broker_id: b.id, rate: b.commission_rate, effective_from: '2026-01-01' })));
  await knex('commission_schemes').insert({ name: 'Marine – standard brokers', broker_tier: 'standard', product_code: 'MARINE', rate: 0.125, effective_from: '2026-01-01' });

  const today = new Date().toISOString().slice(0, 10);
  const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  const payload = { licenceId: 'LIC-DEV-0001', licensee: 'Development and test', validFrom: today, validTo: nextYear, maxUsers: 500, graceDays: 15, modules: MODULES };
  await knex('licences').insert({ licence_id: payload.licenceId, licensee: payload.licensee, modules: j(payload.modules), max_users: payload.maxUsers, valid_from: payload.validFrom, valid_to: payload.validTo, grace_days: payload.graceDays, licence_key: sign(payload), current: true });

  await knex('field_definitions').insert(FIELDS);
  await knex('help_articles').insert(HELP);
};
