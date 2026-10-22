/**
 * Core schema shared by every product line (Fire, Marine, WC, Engineering).
 * Product-specific data lives in JSON columns (risk_data, rating) and in
 * configuration tables (products, product_countries, rate_tables, referral_rules),
 * so new lines and countries are added mostly by configuration.
 */

const ROLES = ['customer', 'broker_admin', 'broker_user', 'underwriter', 'uw_manager', 'config_admin', 'ops'];

exports.up = async function up(knex) {
  await knex.schema.createTable('countries', (t) => {
    t.string('code', 2).primary();
    t.string('name_en', 80).notNullable();
    t.string('name_ar', 80).notNullable();
    t.string('currency', 3).notNullable();
    t.tinyint('currency_decimals').notNullable().defaultTo(2);
    t.decimal('vat_rate', 6, 4).notNullable().defaultTo(0);
    t.string('regulator', 120);
    t.boolean('conventional_allowed').notNullable().defaultTo(true);
    t.boolean('takaful_allowed').notNullable().defaultTo(true);
    t.integer('free_look_days').notNullable().defaultTo(15);
    t.boolean('active').notNullable().defaultTo(false);
    t.json('settings');
  });

  await knex.schema.createTable('brokers', (t) => {
    t.increments('id');
    t.string('name', 160).notNullable();
    t.string('licence_no', 60).notNullable();
    t.date('licence_expiry').notNullable();
    t.enum('tier', ['standard', 'preferred']).notNullable().defaultTo('standard');
    t.decimal('commission_rate', 6, 4).notNullable().defaultTo(0.15);
    t.decimal('credit_limit', 14, 2).notNullable().defaultTo(0);
    t.json('countries');
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('users', (t) => {
    t.increments('id');
    t.string('email', 160).unique();
    t.string('mobile', 30).unique();
    t.string('password_hash', 100);
    t.string('full_name', 160);
    t.enum('role', ROLES).notNullable();
    t.integer('broker_id').unsigned().references('brokers.id');
    t.string('locale', 5).notNullable().defaultTo('en');
    t.boolean('active').notNullable().defaultTo(true);
    t.datetime('last_login_at');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('customers', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().references('users.id');
    t.integer('broker_id').unsigned().references('brokers.id');
    t.string('country_code', 2).notNullable().references('countries.code');
    t.string('company_name', 200).notNullable();
    t.string('trade_licence', 60);
    t.date('licence_expiry');
    t.string('licence_authority', 80);
    t.string('tax_no', 40);
    t.string('contact_name', 160);
    t.string('contact_id_no', 40);
    t.string('email', 160);
    t.string('mobile', 30);
    t.timestamps(true, true);
    t.index(['trade_licence', 'country_code']);
  });

  await knex.schema.createTable('otp_codes', (t) => {
    t.increments('id');
    t.string('target', 160).notNullable().index();
    t.string('code_hash', 100).notNullable();
    t.datetime('expires_at').notNullable();
    t.tinyint('attempts').notNullable().defaultTo(0);
    t.boolean('consumed').notNullable().defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('products', (t) => {
    t.string('code', 20).primary();
    t.enum('line', ['fire', 'marine', 'wc', 'engineering']).notNullable();
    t.string('name_en', 120).notNullable();
    t.string('name_ar', 120).notNullable();
    t.string('rater', 40).notNullable();
    t.enum('status', ['draft', 'active', 'retired']).notNullable().defaultTo('draft');
    t.json('config').notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('product_countries', (t) => {
    t.increments('id');
    t.string('product_code', 20).notNullable().references('products.code');
    t.string('country_code', 2).notNullable().references('countries.code');
    t.boolean('enabled_b2c').notNullable().defaultTo(false);
    t.boolean('enabled_b2b').notNullable().defaultTo(false);
    t.json('settings').notNullable();
    t.unique(['product_code', 'country_code']);
  });

  await knex.schema.createTable('rate_tables', (t) => {
    t.increments('id');
    t.string('product_code', 20).notNullable().references('products.code');
    t.string('country_code', 2).notNullable().references('countries.code');
    t.string('table_key', 40).notNullable();
    t.integer('version').notNullable();
    t.enum('status', ['draft', 'pending', 'approved', 'superseded', 'rejected']).notNullable();
    t.json('data').notNullable();
    t.datetime('effective_from');
    t.integer('created_by').unsigned().references('users.id');
    t.integer('submitted_by').unsigned().references('users.id');
    t.integer('approved_by').unsigned().references('users.id');
    t.datetime('approved_at');
    t.string('change_note', 400);
    t.timestamps(true, true);
    t.index(['product_code', 'country_code', 'table_key', 'status']);
  });

  await knex.schema.createTable('referral_rules', (t) => {
    t.increments('id');
    t.string('product_code', 20).notNullable().references('products.code');
    t.string('country_code', 2).references('countries.code');
    t.string('code', 20).notNullable();
    t.string('description_en', 300).notNullable();
    t.string('description_ar', 300).notNullable();
    t.json('condition').notNullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.integer('sort').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('quotes', (t) => {
    t.increments('id');
    t.string('ref', 30).notNullable().unique();
    t.string('product_code', 20).notNullable().references('products.code');
    t.string('country_code', 2).notNullable().references('countries.code');
    t.enum('channel', ['b2c', 'b2b']).notNullable();
    t.enum('status', ['draft', 'quoted', 'referred', 'info_requested', 'approved', 'declined', 'not_quotable', 'bound', 'expired']).notNullable().defaultTo('draft');
    t.integer('customer_id').unsigned().references('customers.id');
    t.integer('broker_id').unsigned().references('brokers.id');
    t.integer('created_by').unsigned().references('users.id');
    t.string('resume_token', 64).notNullable();
    t.json('risk_data');
    t.json('proposer');
    t.json('rating');
    t.json('referral_reasons');
    t.json('uw_terms');
    t.string('currency', 3);
    t.decimal('premium', 14, 3);
    t.decimal('policy_fee', 14, 3);
    t.decimal('tax', 14, 3);
    t.decimal('total', 14, 3);
    t.date('inception_date');
    t.date('expiry_date');
    t.datetime('valid_until');
    t.timestamps(true, true);
    t.index(['status']);
  });

  await knex.schema.createTable('referrals', (t) => {
    t.increments('id');
    t.integer('quote_id').unsigned().notNullable().references('quotes.id');
    t.enum('status', ['open', 'info_requested', 'approved', 'declined']).notNullable().defaultTo('open');
    t.json('reasons').notNullable();
    t.integer('assigned_to').unsigned().references('users.id');
    t.datetime('sla_due').notNullable();
    t.json('decision');
    t.integer('decided_by').unsigned().references('users.id');
    t.datetime('decided_at');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('referral_messages', (t) => {
    t.increments('id');
    t.integer('referral_id').unsigned().notNullable().references('referrals.id');
    t.integer('author_id').unsigned().references('users.id');
    t.text('body').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('policies', (t) => {
    t.increments('id');
    t.string('policy_no', 40).notNullable().unique();
    t.integer('quote_id').unsigned().notNullable().references('quotes.id');
    t.string('product_code', 20).notNullable().references('products.code');
    t.string('country_code', 2).notNullable().references('countries.code');
    t.enum('channel', ['b2c', 'b2b']).notNullable();
    t.integer('customer_id').unsigned().notNullable().references('customers.id');
    t.integer('broker_id').unsigned().references('brokers.id');
    t.enum('status', ['active', 'cancelled', 'expired']).notNullable().defaultTo('active');
    t.date('inception_date').notNullable();
    t.date('expiry_date').notNullable();
    t.string('currency', 3).notNullable();
    t.decimal('sum_insured', 16, 3).notNullable();
    t.decimal('premium', 14, 3).notNullable();
    t.decimal('policy_fee', 14, 3).notNullable();
    t.decimal('tax', 14, 3).notNullable();
    t.decimal('total', 14, 3).notNullable();
    t.json('risk_data').notNullable();
    t.json('proposer').notNullable();
    t.json('rating').notNullable();
    t.json('uw_terms');
    t.integer('version').notNullable().defaultTo(1);
    t.datetime('cancelled_at');
    t.decimal('cancel_refund', 14, 3);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('endorsements', (t) => {
    t.increments('id');
    t.integer('policy_id').unsigned().notNullable().references('policies.id');
    t.string('endorsement_no', 50).notNullable().unique();
    t.string('type', 30).notNullable();
    t.json('data').notNullable();
    t.decimal('premium_delta', 14, 3).notNullable().defaultTo(0);
    t.decimal('tax_delta', 14, 3).notNullable().defaultTo(0);
    t.integer('created_by').unsigned().references('users.id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('payments', (t) => {
    t.increments('id');
    t.integer('quote_id').unsigned().references('quotes.id');
    t.integer('policy_id').unsigned().references('policies.id');
    t.decimal('amount', 14, 3).notNullable();
    t.string('currency', 3).notNullable();
    t.enum('method', ['card', 'wallet', 'bank_transfer', 'broker_credit']).notNullable();
    t.enum('status', ['pending', 'succeeded', 'failed', 'refunded']).notNullable();
    t.string('provider', 40).notNullable();
    t.string('provider_ref', 80);
    t.string('failure_reason', 200);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('commissions', (t) => {
    t.increments('id');
    t.integer('broker_id').unsigned().notNullable().references('brokers.id');
    t.integer('policy_id').unsigned().notNullable().references('policies.id');
    t.integer('endorsement_id').unsigned().references('endorsements.id');
    t.string('transaction', 30).notNullable();
    t.decimal('base_amount', 14, 3).notNullable();
    t.decimal('rate', 6, 4).notNullable();
    t.decimal('amount', 14, 3).notNullable();
    t.enum('status', ['earned', 'paid', 'clawback']).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('claims', (t) => {
    t.increments('id');
    t.string('claim_no', 40).notNullable().unique();
    t.integer('policy_id').unsigned().notNullable().references('policies.id');
    t.integer('reported_by').unsigned().references('users.id');
    t.datetime('loss_date').notNullable();
    t.string('cause', 40).notNullable();
    t.text('description');
    t.decimal('estimate', 14, 3);
    t.json('data');
    t.json('cover_check').notNullable();
    t.enum('status', ['registered', 'surveyor_appointed', 'documents_pending', 'under_assessment', 'settled', 'rejected']).notNullable().defaultTo('registered');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id');
    t.integer('user_id').unsigned();
    t.string('action', 60).notNullable();
    t.string('entity', 40).notNullable();
    t.string('entity_id', 40);
    t.json('data');
    t.string('ip', 64);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['entity', 'entity_id']);
  });

  await knex.schema.createTable('sequences', (t) => {
    t.string('name', 60).primary();
    t.bigInteger('next_val').notNullable();
  });
};

exports.down = async function down(knex) {
  const tables = [
    'sequences', 'audit_log', 'claims', 'commissions', 'payments', 'endorsements', 'policies',
    'referral_messages', 'referrals', 'quotes', 'referral_rules', 'rate_tables', 'product_countries',
    'products', 'otp_codes', 'customers', 'users', 'brokers', 'countries',
  ];
  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.dropTableIfExists(table);
  }
};
