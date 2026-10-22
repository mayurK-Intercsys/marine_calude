/**
 * Feature completion across products: open-cover sub-users and API keys (Marine),
 * risk-engineer surveys (Engineering), batched premium billing and invoices (WC and others).
 */
const ROLES_OLD = ['customer', 'broker_admin', 'broker_user', 'underwriter', 'uw_manager', 'config_admin', 'ops'];
const ROLES_NEW = [...ROLES_OLD, 'risk_engineer'];
const enumSql = (vals) => vals.map((v) => `'${v}'`).join(',');

exports.up = async function up(knex) {
  await knex.raw(`ALTER TABLE users MODIFY role ENUM(${enumSql(ROLES_NEW)}) NOT NULL`);

  await knex.schema.createTable('customer_users', (t) => {
    t.increments('id');
    t.integer('customer_id').unsigned().notNullable().references('customers.id');
    t.integer('user_id').unsigned().notNullable().references('users.id');
    t.enum('role', ['admin', 'user']).notNullable().defaultTo('user');
    t.decimal('certificate_limit', 16, 3);
    t.boolean('can_see_premium').notNullable().defaultTo(false);
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(['customer_id', 'user_id']);
  });

  await knex.schema.createTable('api_keys', (t) => {
    t.increments('id');
    t.integer('policy_id').unsigned().notNullable().references('policies.id');
    t.string('key_prefix', 16).notNullable().unique();
    t.string('key_hash', 100).notNullable();
    t.string('label', 120).notNullable();
    t.decimal('certificate_limit', 16, 3);
    t.integer('created_by').unsigned().references('users.id');
    t.datetime('last_used_at');
    t.datetime('revoked_at');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('surveys', (t) => {
    t.increments('id');
    t.integer('quote_id').unsigned().references('quotes.id');
    t.integer('policy_id').unsigned().references('policies.id');
    t.integer('referral_id').unsigned().references('referrals.id');
    t.enum('status', ['requested', 'scheduled', 'completed', 'cancelled']).notNullable().defaultTo('requested');
    t.string('site', 300);
    t.text('instructions');
    t.integer('requested_by').unsigned().references('users.id');
    t.integer('assigned_to').unsigned().references('users.id');
    t.date('scheduled_for');
    t.enum('risk_grade', ['good', 'acceptable', 'poor']);
    t.text('findings');
    t.json('recommendations');
    t.integer('completed_by').unsigned().references('users.id');
    t.datetime('completed_at');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('invoices', (t) => {
    t.increments('id');
    t.string('invoice_no', 60).notNullable().unique();
    t.integer('policy_id').unsigned().notNullable().references('policies.id');
    t.string('period', 7).notNullable();
    t.decimal('premium', 14, 3).notNullable();
    t.decimal('tax', 14, 3).notNullable();
    t.decimal('total', 14, 3).notNullable();
    t.enum('status', ['due', 'paid', 'credit']).notNullable();
    t.date('due_date').notNullable();
    t.integer('payment_id').unsigned().references('payments.id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.datetime('paid_at');
  });

  await knex.schema.alterTable('endorsements', (t) => {
    t.enum('billing_status', ['billed', 'unbilled', 'invoiced']).notNullable().defaultTo('billed');
    t.integer('invoice_id').unsigned().references('invoices.id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('endorsements', (t) => {
    t.dropForeign('invoice_id');
    t.dropColumn('invoice_id');
    t.dropColumn('billing_status');
  });
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('surveys');
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('customer_users');
  const engineers = knex('users').where({ role: 'risk_engineer' }).select('id');
  await knex('referral_messages').whereIn('author_id', engineers).update({ author_id: null });
  await knex('users').where({ role: 'risk_engineer' }).del();
  await knex.raw(`ALTER TABLE users MODIFY role ENUM(${enumSql(ROLES_OLD)}) NOT NULL`);
};
