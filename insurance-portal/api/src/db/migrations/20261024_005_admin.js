/**
 * Admin platform: roles and privileges, lookups (drop-down values), system parameters,
 * number formats, message templates and outbox, configurable notifications, in-app
 * notifications, commission schemes and payouts, platform licence, field definitions, help.
 */
const BASE = ['customer', 'broker_admin', 'broker_user', 'underwriter', 'uw_manager', 'config_admin', 'ops', 'risk_engineer'];

exports.up = async function up(knex) {
  await knex.schema.createTable('roles', (t) => {
    t.increments('id');
    t.string('code', 40).notNullable().unique();
    t.string('name_en', 120).notNullable();
    t.string('name_ar', 120).notNullable();
    t.enum('base_role', BASE).notNullable();
    t.string('description', 300);
    t.boolean('system').notNullable().defaultTo(false);
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });
  await knex.schema.createTable('permissions', (t) => {
    t.string('code', 60).primary();
    t.string('module', 40).notNullable();
    t.string('description', 200).notNullable();
  });
  await knex.schema.createTable('role_permissions', (t) => {
    t.integer('role_id').unsigned().notNullable().references('roles.id').onDelete('CASCADE');
    t.string('permission_code', 60).notNullable().references('permissions.code').onDelete('CASCADE');
    t.primary(['role_id', 'permission_code']);
  });
  await knex.schema.alterTable('users', (t) => {
    t.integer('role_id').unsigned().references('roles.id');
    t.boolean('must_change_password').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('lookup_lists', (t) => {
    t.string('code', 80).primary();
    t.string('name', 160).notNullable();
    t.string('description', 300);
    t.string('product_code', 20);
    t.boolean('editable').notNullable().defaultTo(true);
  });
  await knex.schema.createTable('lookup_values', (t) => {
    t.increments('id');
    t.string('list_code', 80).notNullable().references('lookup_lists.code').onDelete('CASCADE');
    t.string('code', 60).notNullable();
    t.string('label_en', 200).notNullable();
    t.string('label_ar', 200).notNullable();
    t.string('parent_code', 60);
    t.integer('sort').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
    t.json('attributes');
    t.unique(['list_code', 'code']);
  });

  await knex.schema.createTable('system_parameters', (t) => {
    t.string('key', 80).primary();
    t.string('group', 40).notNullable();
    t.json('value');
    t.enum('type', ['string', 'number', 'boolean', 'json', 'secret']).notNullable();
    t.string('description', 300);
    t.boolean('editable').notNullable().defaultTo(true);
    t.integer('updated_by').unsigned();
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('number_formats', (t) => {
    t.increments('id');
    t.enum('entity', ['quote', 'renewal_quote', 'policy', 'claim', 'endorsement', 'invoice', 'certificate']).notNullable();
    t.string('product_code', 20);
    t.string('country_code', 2);
    t.string('channel', 3);
    t.string('pattern', 120).notNullable();
    t.string('description', 200);
    t.boolean('active').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('message_templates', (t) => {
    t.increments('id');
    t.string('code', 60).notNullable();
    t.enum('channel', ['email', 'sms', 'whatsapp', 'inapp']).notNullable();
    t.string('locale', 5).notNullable().defaultTo('en');
    t.string('subject', 200);
    t.text('body').notNullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(['code', 'channel', 'locale']);
  });
  await knex.schema.createTable('notification_rules', (t) => {
    t.increments('id');
    t.string('event', 60).notNullable();
    t.enum('channel', ['email', 'sms', 'whatsapp', 'inapp']).notNullable();
    t.enum('recipient', ['customer', 'broker', 'underwriters', 'ops', 'custom']).notNullable();
    t.string('custom_to', 300);
    t.string('template_code', 60).notNullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.string('description', 200);
    t.index(['event', 'active']);
  });
  await knex.schema.createTable('outbox', (t) => {
    t.bigIncrements('id');
    t.string('event', 60);
    t.string('template_code', 60);
    t.enum('channel', ['email', 'sms', 'whatsapp', 'inapp']).notNullable();
    t.string('to', 200).notNullable();
    t.string('subject', 300);
    t.text('body');
    t.enum('status', ['queued', 'sent', 'logged', 'failed']).notNullable();
    t.string('error', 500);
    t.string('provider_ref', 200);
    t.string('related_entity', 40);
    t.string('related_id', 40);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.datetime('sent_at');
    t.index(['status']);
  });
  await knex.schema.createTable('user_notifications', (t) => {
    t.bigIncrements('id');
    t.integer('user_id').unsigned().notNullable().references('users.id');
    t.string('title', 200).notNullable();
    t.text('body');
    t.string('link', 300);
    t.datetime('read_at');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['user_id', 'read_at']);
  });

  await knex.schema.createTable('commission_schemes', (t) => {
    t.increments('id');
    t.string('name', 120).notNullable();
    t.integer('broker_id').unsigned().references('brokers.id');
    t.enum('broker_tier', ['standard', 'preferred']);
    t.string('product_code', 20);
    t.string('country_code', 2);
    t.json('transactions');
    t.decimal('rate', 6, 4).notNullable();
    t.date('effective_from').notNullable();
    t.date('effective_to');
    t.boolean('active').notNullable().defaultTo(true);
  });
  await knex.schema.alterTable('commissions', (t) => {
    t.integer('scheme_id').unsigned().references('commission_schemes.id');
    t.datetime('paid_at');
    t.string('payout_ref', 80);
  });

  await knex.schema.createTable('licences', (t) => {
    t.increments('id');
    t.string('licence_id', 60).notNullable();
    t.string('licensee', 200).notNullable();
    t.json('modules').notNullable();
    t.integer('max_users').notNullable();
    t.date('valid_from').notNullable();
    t.date('valid_to').notNullable();
    t.integer('grace_days').notNullable().defaultTo(15);
    t.text('licence_key').notNullable();
    t.boolean('current').notNullable().defaultTo(false);
    t.integer('installed_by').unsigned();
    t.timestamp('installed_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('field_definitions', (t) => {
    t.increments('id');
    t.string('screen', 60).notNullable();
    t.string('field_key', 80).notNullable();
    t.string('label_en', 200);
    t.string('label_ar', 200);
    t.string('tooltip_en', 500);
    t.string('tooltip_ar', 500);
    t.string('placeholder_en', 120);
    t.string('placeholder_ar', 120);
    t.enum('field_type', ['text', 'number', 'money', 'date', 'select', 'radio', 'checkbox', 'textarea', 'email', 'tel']).notNullable().defaultTo('text');
    t.string('lookup_list', 80);
    t.boolean('visible').notNullable().defaultTo(true);
    t.boolean('mandatory').notNullable().defaultTo(false);
    t.boolean('readonly').notNullable().defaultTo(false);
    t.decimal('min_value', 16, 3);
    t.decimal('max_value', 16, 3);
    t.string('pattern', 200);
    t.string('default_value', 200);
    t.string('help_slug', 80);
    t.integer('sort').notNullable().defaultTo(0);
    t.unique(['screen', 'field_key']);
  });
  await knex.schema.createTable('help_articles', (t) => {
    t.increments('id');
    t.string('slug', 80).notNullable().unique();
    t.string('category', 60).notNullable();
    t.string('title_en', 200).notNullable();
    t.string('title_ar', 200).notNullable();
    t.text('body_en').notNullable();
    t.text('body_ar').notNullable();
    t.json('audience');
    t.integer('sort').notNullable().defaultTo(0);
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });
};

exports.down = async function down(knex) {
  for (const tb of ['help_articles', 'field_definitions', 'licences']) await knex.schema.dropTableIfExists(tb); // eslint-disable-line no-await-in-loop
  await knex.schema.alterTable('commissions', (t) => { t.dropForeign('scheme_id'); t.dropColumn('scheme_id'); t.dropColumn('paid_at'); t.dropColumn('payout_ref'); });
  for (const tb of ['commission_schemes', 'user_notifications', 'outbox', 'notification_rules', 'message_templates', 'number_formats', 'system_parameters', 'lookup_values', 'lookup_lists']) await knex.schema.dropTableIfExists(tb); // eslint-disable-line no-await-in-loop
  await knex.schema.alterTable('users', (t) => { t.dropForeign('role_id'); t.dropColumn('role_id'); t.dropColumn('must_change_password'); });
  for (const tb of ['role_permissions', 'permissions', 'roles']) await knex.schema.dropTableIfExists(tb); // eslint-disable-line no-await-in-loop
};
