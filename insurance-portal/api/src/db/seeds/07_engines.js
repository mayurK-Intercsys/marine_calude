/**
 * Engines seed: every product's referral rules become a published "underwriting" rule set
 * (version 1); Fire moves to the dynamic rating engine with its published rating model.
 * An example decision table is added to a draft rule set to show the format.
 */
const j = (v) => JSON.stringify(v);
const fireModel = require('../../products/models/fire');
const MODELS = { MARINE: require('../../products/models/marine'), WC: require('../../products/models/wc'), ENG: require('../../products/models/engineering') };

exports.seed = async function seed(knex) {
  const checker = await knex('users').where({ email: 'config2@portal.test' }).first();
  const maker = await knex('users').where({ email: 'config1@portal.test' }).first();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const legacy = await knex('referral_rules').where({ active: true }).orderBy(['product_code', 'sort']);
  const byProduct = {};
  for (const r of legacy) (byProduct[r.product_code] ||= []).push(r);
  for (const [product, rules] of Object.entries(byProduct)) {
    // eslint-disable-next-line no-await-in-loop
    const [setId] = await knex('rule_sets').insert({ product_code: product, purpose: 'underwriting', code: 'REFERRALS', name: `${product} referral rules`, version: 1, status: 'published', notes: 'Migrated from referral rules', created_by: maker.id, submitted_by: maker.id, approved_by: checker.id, published_at: now });
    // eslint-disable-next-line no-await-in-loop
    await knex('rules').insert(rules.map((r) => ({ rule_set_id: setId, code: r.code, name_en: r.description_en, name_ar: r.description_ar, condition: j(r.condition), action: 'refer', priority: r.sort * 10 })));
  }

  // Example: a decision table in a draft set (not live until submitted and approved).
  const [draftId] = await knex('rule_sets').insert({ product_code: 'FIRE', purpose: 'underwriting', code: 'LARGE_RISKS', name: 'Fire – large risks by hazard', version: 1, status: 'draft', notes: 'Example decision table', created_by: maker.id });
  await knex('decision_tables').insert({
    rule_set_id: draftId, code: 'UW-DT1', name: 'Large sum insured by hazard', hit_policy: 'first', priority: 10,
    inputs: j([{ name: 'Hazard', expr: 'hazard' }, { name: 'Largest location', expr: 'maxLocationSI' }]),
    rows: j([
      { label: 'high-3m', when: ["'high'", '> 3000000'], then: { action: 'refer', code: 'UW-DT1', name_en: 'High-hazard location above AED 3 million', name_ar: 'موقع عالي الخطورة يتجاوز 3 ملايين درهم' } },
      { label: 'medium-10m', when: ["'medium'", '> 10000000'], then: { action: 'refer', code: 'UW-DT1', name_en: 'Medium-hazard location above AED 10 million', name_ar: 'موقع متوسط الخطورة يتجاوز 10 ملايين درهم' } },
      { label: 'any-40m', when: ['-', '> 40000000'], then: { action: 'decline', code: 'UW-DT1-D', name_en: 'Location too large for online cover', name_ar: 'الموقع أكبر من التغطية عبر الإنترنت' } },
    ]),
  });
  await knex('rule_tests').insert([
    { rule_set_id: draftId, name: 'Small low-hazard shop: nothing fires', facts: j({ hazard: 'low', maxLocationSI: 900000 }), expected: j({ refer: [], decline: [] }) },
    { rule_set_id: draftId, name: 'High hazard, AED 4m: refer', facts: j({ hazard: 'high', maxLocationSI: 4000000 }), expected: j({ refer: ['UW-DT1'], decline: [] }) },
  ]);

  await knex('rating_models').insert({ product_code: 'FIRE', country_code: null, version: 1, status: 'published', model: j(fireModel), notes: 'Fire BRD section 8 (migrated from the coded rater; parity-tested)', created_by: maker.id, submitted_by: maker.id, approved_by: checker.id, published_at: now });
  await knex('products').where({ code: 'FIRE' }).update({ rater: 'dynamic' });
  for (const [code, m] of Object.entries(MODELS)) {
    // eslint-disable-next-line no-await-in-loop
    await knex('rating_models').insert({ product_code: code, country_code: null, version: 1, status: 'published', model: j(m), notes: `${m.name} (migrated from the coded rater; parity-tested)`, created_by: maker.id, submitted_by: maker.id, approved_by: checker.id, published_at: now });
    // eslint-disable-next-line no-await-in-loop
    await knex('products').where({ code }).update({ rater: 'dynamic' });
  }

  // Marine and Engineering deductibles move into product configuration (they override the rate tables).
  const tbl = async (product) => (await knex('rate_tables').where({ product_code: product, country_code: 'AE', table_key: 'deductibles', status: 'approved' }).first()).data;
  const marine = await tbl('MARINE');
  const groupNames = { general: ['General cargo', 'البضائع العامة'], electronics: ['Electronics and medicines', 'الإلكترونيات والأدوية'], fragile: ['Fragile goods', 'البضائع القابلة للكسر'], bulk: ['Bulk and bagged goods', 'البضائع السائبة والمعبأة'], used_machinery: ['Used machinery and vehicles', 'الآلات والمركبات المستعملة'] };
  await knex('product_deductibles').insert(Object.entries(marine).map(([group, d], i) => ({
    product_code: 'MARINE', code: group, name_en: groupNames[group]?.[0] || group, name_ar: groupNames[group]?.[1] || group,
    detail_en: d.pct ? `${d.pct * 100}% of the sum insured, minimum ${d.min}` : `${d.min} each claim`, detail_ar: d.pct ? `${d.pct * 100}% من مبلغ التأمين، بحد أدنى ${d.min}` : `${d.min} لكل مطالبة`,
    deductible_type: 'greater_of', amount: d.min, percent: d.pct, sort: i + 1,
  })));
  const engD = await tbl('ENG');
  const kindNames = { natcat: ['Storm, flood and earthquake', 'العواصف والفيضانات والزلازل'], other: ['Other losses', 'الخسائر الأخرى'], tplProperty: ['Third-party property damage', 'أضرار ممتلكات الغير'], testing: ['During testing', 'أثناء الاختبار'] };
  const rows = [];
  for (const [product, kinds] of Object.entries(engD)) {
    for (const [kind, d] of Object.entries(kinds)) {
      rows.push({ product_code: 'ENG', code: `${product}.${kind}`, name_en: `${product} – ${kindNames[kind]?.[0] || kind}`, name_ar: `${product} – ${kindNames[kind]?.[1] || kind}`,
        deductible_type: d.fixed != null ? 'fixed' : 'greater_of', amount: d.fixed ?? d.min, percent: d.pct ?? null, sort: rows.length + 1 });
    }
  }
  await knex('product_deductibles').insert(rows);

  await knex('permissions').insert([
    { code: 'admin.rules', module: 'admin', description: 'Configure rule sets, decision tables and rule tests' },
    { code: 'admin.rating', module: 'admin', description: 'Configure rating models' },
    { code: 'engines.approve', module: 'rating', description: 'Approve rule sets and rating models (checker)' },
  ]);
  const cfg = await knex('roles').where({ code: 'config_admin' }).first();
  const mgr = await knex('roles').where({ code: 'uw_manager' }).first();
  await knex('role_permissions').insert([
    { role_id: cfg.id, permission_code: 'admin.rules' }, { role_id: cfg.id, permission_code: 'admin.rating' }, { role_id: cfg.id, permission_code: 'engines.approve' },
    { role_id: mgr.id, permission_code: 'engines.approve' }, { role_id: mgr.id, permission_code: 'admin.rules' },
  ]);
};
