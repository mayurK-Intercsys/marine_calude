/** Uploaded documents and the required-document checklist per product and event. */
exports.up = async function up(knex) {
  await knex.schema.createTable('documents', (t) => {
    t.increments('id');
    t.enum('entity', ['quote', 'policy', 'claim', 'referral', 'survey']).notNullable();
    t.integer('entity_id').unsigned().notNullable();
    t.string('doc_type', 60).notNullable();
    t.string('file_name', 200).notNullable();
    t.string('mime', 80).notNullable();
    t.integer('size').unsigned().notNullable();
    t.string('sha256', 64).notNullable();
    t.string('storage_key', 200).notNullable();
    t.enum('status', ['uploaded', 'verified', 'rejected']).notNullable().defaultTo('uploaded');
    t.string('review_note', 300);
    t.integer('uploaded_by').unsigned().references('users.id');
    t.integer('reviewed_by').unsigned().references('users.id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.datetime('deleted_at');
    t.index(['entity', 'entity_id']);
  });
  await knex.schema.createTable('document_requirements', (t) => {
    t.increments('id');
    t.string('product_code', 20).references('products.code');
    t.enum('event', ['claim', 'referral', 'policy', 'survey']).notNullable();
    t.string('doc_type', 60).notNullable();
    t.string('note_en', 300);
    t.string('note_ar', 300);
    t.json('condition');
    t.boolean('mandatory').notNullable().defaultTo(true);
    t.integer('sort').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
  });
};
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('document_requirements');
  await knex.schema.dropTableIfExists('documents');
};
