/**
 * Rule engine (rule sets with rules, decision tables and test cases; versioned with maker-checker)
 * and dynamic rating engine (versioned rating models per product).
 */
const STATUS = ['draft', 'pending', 'published', 'superseded', 'rejected'];

exports.up = async function up(knex) {
  await knex.schema.createTable('rule_sets', (t) => {
    t.increments('id');
    t.string('product_code', 20).notNullable().references('products.code');
    t.string('country_code', 2).references('countries.code');
    t.enum('purpose', ['underwriting', 'eligibility', 'validation', 'pricing']).notNullable();
    t.string('code', 40).notNullable();
    t.string('name', 160).notNullable();
    t.integer('version').notNullable();
    t.enum('status', STATUS).notNullable();
    t.string('notes', 500);
    t.integer('created_by').unsigned().references('users.id');
    t.integer('submitted_by').unsigned().references('users.id');
    t.integer('approved_by').unsigned().references('users.id');
    t.datetime('published_at');
    t.timestamps(true, true);
    t.index(['product_code', 'purpose', 'status']);
  });
  await knex.schema.createTable('rules', (t) => {
    t.increments('id');
    t.integer('rule_set_id').unsigned().notNullable().references('rule_sets.id').onDelete('CASCADE');
    t.string('code', 30).notNullable();
    t.string('name_en', 300).notNullable();
    t.string('name_ar', 300).notNullable();
    t.json('condition').notNullable();
    t.enum('action', ['refer', 'decline', 'message', 'set']).notNullable();
    t.json('params');
    t.integer('priority').notNullable().defaultTo(100);
    t.boolean('stop').notNullable().defaultTo(false);
    t.boolean('active').notNullable().defaultTo(true);
  });
  await knex.schema.createTable('decision_tables', (t) => {
    t.increments('id');
    t.integer('rule_set_id').unsigned().notNullable().references('rule_sets.id').onDelete('CASCADE');
    t.string('code', 30).notNullable();
    t.string('name', 200).notNullable();
    t.json('inputs').notNullable();
    t.json('rows').notNullable();
    t.enum('hit_policy', ['first', 'collect']).notNullable().defaultTo('first');
    t.integer('priority').notNullable().defaultTo(200);
    t.boolean('active').notNullable().defaultTo(true);
  });
  await knex.schema.createTable('rule_tests', (t) => {
    t.increments('id');
    t.integer('rule_set_id').unsigned().notNullable().references('rule_sets.id').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.json('facts').notNullable();
    t.json('expected').notNullable();
  });
  await knex.schema.createTable('rating_models', (t) => {
    t.increments('id');
    t.string('product_code', 20).notNullable().references('products.code');
    t.string('country_code', 2).references('countries.code');
    t.integer('version').notNullable();
    t.enum('status', STATUS).notNullable();
    t.json('model').notNullable();
    t.string('notes', 500);
    t.integer('created_by').unsigned().references('users.id');
    t.integer('submitted_by').unsigned().references('users.id');
    t.integer('approved_by').unsigned().references('users.id');
    t.datetime('published_at');
    t.timestamps(true, true);
    t.index(['product_code', 'status']);
  });
};

exports.down = async function down(knex) {
  for (const tb of ['rating_models', 'rule_tests', 'decision_tables', 'rules', 'rule_sets']) await knex.schema.dropTableIfExists(tb); // eslint-disable-line no-await-in-loop
  await knex('products').where({ rater: 'dynamic' }).update({ rater: knex.raw('LOWER(line)') });
};
