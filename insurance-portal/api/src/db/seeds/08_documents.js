/** Required documents by product and event, the "document uploaded" notification, and the privilege to review documents. */
const j = (v) => JSON.stringify(v);

exports.seed = async function seed(knex) {
  const r = (product, event, docType, en, ar, extra = {}) => ({ product_code: product, event, doc_type: docType, note_en: en, note_ar: ar, sort: 0, ...extra });
  const rows = [
    r('FIRE', 'claim', 'photo', 'Photos of the damage before any clean-up', 'صور الأضرار قبل أي تنظيف'),
    r('FIRE', 'claim', 'invoice', 'Invoices or valuations for damaged items', 'فواتير أو تقييمات البنود المتضررة'),
    r('FIRE', 'claim', 'other', 'Civil Defence or police report', 'تقرير الدفاع المدني أو الشرطة', { condition: j({ fact: 'cause', op: 'in', value: ['fire', 'theft', 'malicious'] }) }),
    r('FIRE', 'referral', 'civil_defence', 'Civil Defence certificate (or proof of renewal)', 'شهادة الدفاع المدني (أو ما يثبت تجديدها)', { condition: j({ fact: 'noCivilDefence', op: 'eq', value: true }) }),
    r('MARINE', 'claim', 'bill_of_lading', 'Bill of lading or air waybill', 'بوليصة الشحن البحري أو الجوي'),
    r('MARINE', 'claim', 'invoice', 'Commercial invoice and packing list', 'الفاتورة التجارية وقائمة التعبئة'),
    r('MARINE', 'claim', 'photo', 'Photos of the damaged goods and packaging', 'صور البضاعة والتغليف المتضرر'),
    r('MARINE', 'claim', 'survey_report', 'Survey report, if a surveyor attended', 'تقرير المعاينة إن حضر معاين', { mandatory: false }),
    r('WC', 'claim', 'medical_report', 'Medical report from the treating hospital', 'التقرير الطبي من المستشفى المعالج'),
    r('WC', 'claim', 'emirates_id', 'Employee’s Emirates ID', 'الهوية الإماراتية للموظف'),
    r('WC', 'claim', 'other', 'MoHRE work-injury report', 'بلاغ إصابة العمل لدى الوزارة'),
    r('ENG', 'claim', 'photo', 'Photos of the damage (before repair)', 'صور الأضرار (قبل الإصلاح)'),
    r('ENG', 'claim', 'other', 'Incident report from the site', 'تقرير الحادث من الموقع'),
    r('ENG', 'referral', 'permit', 'Building or installation permit', 'رخصة البناء أو التركيب', { condition: j({ fact: 'permitUnverified', op: 'eq', value: true }) }),
    r(null, 'referral', 'trade_licence', 'Trade licence copy', 'نسخة الرخصة التجارية', { mandatory: false }),
  ].map((x, i) => ({ ...x, sort: i + 1 }));
  await knex('document_requirements').insert(rows);

  await knex('message_templates').insert([
    { code: 'document_uploaded', channel: 'inapp', locale: 'en', subject: 'New document: {{reference}}', body: '{{docType}} uploaded for {{reference}}.' },
    { code: 'document_uploaded', channel: 'inapp', locale: 'ar', subject: 'مستند جديد: {{reference}}', body: 'تم رفع {{docType}} لـ {{reference}}.' },
  ]);
  await knex('notification_rules').insert({ event: 'document.uploaded', channel: 'inapp', recipient: 'ops', template_code: 'document_uploaded', description: 'Tell operations about new claim documents' });

  await knex('permissions').insert({ code: 'documents.review', module: 'claims', description: 'Verify or reject uploaded documents' });
  for (const code of ['ops', 'underwriter', 'uw_manager', 'risk_engineer']) {
    // eslint-disable-next-line no-await-in-loop
    const role = await knex('roles').where({ code }).first();
    // eslint-disable-next-line no-await-in-loop
    await knex('role_permissions').insert({ role_id: role.id, permission_code: 'documents.review' });
  }
};
