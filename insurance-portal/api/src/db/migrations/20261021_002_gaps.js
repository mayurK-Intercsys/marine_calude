/**
 * Phase 1 gap closure: endorsement referrals, renewals, notification log,
 * stored card tokens for auto-renewal.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('endorsement_requests', (t) => {
    t.increments('id');
    t.integer('policy_id').unsigned().notNullable().references('policies.id');
    t.string('type', 30).notNullable();
    t.json('data').notNullable();
    t.json('rating');
    t.json('reasons');
    t.json('uw_terms');
    t.decimal('premium_delta', 14, 3);
    t.decimal('tax_delta', 14, 3);
    t.enum('status', ['referred', 'info_requested', 'approved', 'declined', 'applied', 'withdrawn']).notNullable();
    t.integer('requested_by').unsigned().references('users.id');
    t.integer('endorsement_id').unsigned().references('endorsements.id');
    t.timestamps(true, true);
  });

  await knex.schema.alterTable('referrals', (t) => {
    t.integer('quote_id').unsigned().nullable().alter();
    t.integer('endorsement_request_id').unsigned().references('endorsement_requests.id');
  });

  await knex.schema.alterTable('quotes', (t) => {
    t.integer('renewal_of_policy_id').unsigned().references('policies.id');
  });

  await knex.schema.alterTable('policies', (t) => {
    t.integer('renewal_quote_id').unsigned().references('quotes.id');
    t.integer('renewed_from_policy_id').unsigned().references('policies.id');
    t.string('payment_token', 80);
  });

  await knex.raw("ALTER TABLE payments MODIFY method ENUM('card','wallet','bank_transfer','broker_credit','card_token') NOT NULL");
  await knex.raw("ALTER TABLE payments MODIFY status ENUM('pending','succeeded','failed','refunded','rejected') NOT NULL");

  await knex.schema.createTable('notification_log', (t) => {
    t.increments('id');
    t.string('entity', 30).notNullable();
    t.integer('entity_id').unsigned().notNullable();
    t.string('kind', 40).notNullable();
    t.string('recipient', 160);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['entity', 'entity_id', 'kind', 'recipient']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('notification_log');
  // Map values the older schema does not know before narrowing the enums.
  await knex('payments').where({ status: 'rejected' }).update({ status: 'failed' });
  await knex('payments').where({ method: 'card_token' }).update({ method: 'card' });
  const orphanReferrals = knex('referrals').whereNull('quote_id').select('id');
  await knex('referral_messages').whereIn('referral_id', orphanReferrals).del();
  await knex('referrals').whereNull('quote_id').del();
  await knex.raw("ALTER TABLE payments MODIFY status ENUM('pending','succeeded','failed','refunded') NOT NULL");
  await knex.raw("ALTER TABLE payments MODIFY method ENUM('card','wallet','bank_transfer','broker_credit') NOT NULL");
  await knex.schema.alterTable('policies', (t) => {
    t.dropForeign('renewal_quote_id');
    t.dropForeign('renewed_from_policy_id');
    t.dropColumn('renewal_quote_id');
    t.dropColumn('renewed_from_policy_id');
    t.dropColumn('payment_token');
  });
  await knex.schema.alterTable('quotes', (t) => {
    t.dropForeign('renewal_of_policy_id');
    t.dropColumn('renewal_of_policy_id');
  });
  await knex.schema.alterTable('referrals', (t) => {
    t.dropForeign('endorsement_request_id');
    t.dropColumn('endorsement_request_id');
  });
  await knex.schema.dropTableIfExists('endorsement_requests');
};
