/** Maker-checker queue for product configuration changes (Admin → Pending changes). */
exports.up = async function up(knex) {
  await knex.schema.createTable('config_changes', (t) => {
    t.increments('id');
    t.string('entity', 40).notNullable();
    t.enum('operation', ['create', 'update', 'delete']).notNullable();
    t.string('record_key', 80);
    t.json('payload');
    t.json('before');
    t.enum('status', ['pending', 'approved', 'rejected']).notNullable().defaultTo('pending');
    t.string('reason', 500);
    t.integer('requested_by').unsigned().notNullable().references('users.id');
    t.integer('decided_by').unsigned().references('users.id');
    t.datetime('decided_at');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['status']);
  });
};
exports.down = async function down(knex) { await knex.schema.dropTableIfExists('config_changes'); };
