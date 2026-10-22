/**
 * Marine: certificates issued under an annual open cover, and monthly declarations.
 * Single and inland transit policies use the shared quotes/policies tables.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('oc_certificates', (t) => {
    t.increments('id');
    t.string('cert_no', 60).notNullable().unique();
    t.integer('policy_id').unsigned().notNullable().references('policies.id');
    t.enum('status', ['issued', 'referred', 'info_requested', 'declined', 'cancelled']).notNullable();
    t.enum('source', ['portal', 'bulk', 'api']).notNullable().defaultTo('portal');
    t.json('shipment').notNullable();
    t.json('rating').notNullable();
    t.json('uw_terms');
    t.string('currency', 3).notNullable();
    t.decimal('sum_insured', 16, 3).notNullable();
    t.decimal('premium', 14, 3).notNullable();
    t.decimal('tax', 14, 3).notNullable();
    t.decimal('total', 14, 3).notNullable();
    t.date('sailing_date').notNullable();
    t.integer('issued_by').unsigned().references('users.id');
    t.integer('declaration_id').unsigned();
    t.timestamps(true, true);
    t.index(['policy_id', 'status']);
  });

  await knex.schema.createTable('oc_declarations', (t) => {
    t.increments('id');
    t.integer('policy_id').unsigned().notNullable().references('policies.id');
    t.string('period', 7).notNullable();
    t.integer('certificates').notNullable();
    t.decimal('sum_insured', 16, 3).notNullable();
    t.decimal('premium', 14, 3).notNullable();
    t.decimal('tax', 14, 3).notNullable();
    t.json('extra_shipments');
    t.integer('submitted_by').unsigned().references('users.id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['policy_id', 'period']);
  });

  await knex.schema.alterTable('oc_certificates', (t) => {
    t.foreign('declaration_id').references('oc_declarations.id');
  });

  await knex.schema.alterTable('referrals', (t) => {
    t.integer('certificate_id').unsigned().references('oc_certificates.id');
  });
};

exports.down = async function down(knex) {
  const orphan = knex('referrals').whereNotNull('certificate_id').select('id');
  await knex('referral_messages').whereIn('referral_id', orphan).del();
  await knex('referrals').whereNotNull('certificate_id').del();
  await knex.schema.alterTable('referrals', (t) => {
    t.dropForeign('certificate_id');
    t.dropColumn('certificate_id');
  });
  await knex.schema.alterTable('oc_certificates', (t) => { t.dropForeign('declaration_id'); });
  await knex.schema.dropTableIfExists('oc_declarations');
  await knex.schema.dropTableIfExists('oc_certificates');
};
