/**
 * Product configuration: lines of business, product details, covers, deductibles,
 * discounts and loadings, charges and taxes. The pricing pipeline reads these at quote time.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('lobs', (t) => {
    t.string('code', 30).primary();
    t.string('name_en', 120).notNullable();
    t.string('name_ar', 120).notNullable();
    t.string('description', 300);
    t.integer('sort').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
  });
  await knex.raw('ALTER TABLE products MODIFY line VARCHAR(30) NOT NULL');
  await knex.schema.alterTable('products', (t) => {
    t.string('description_en', 500);
    t.string('description_ar', 500);
    t.date('effective_from');
    t.date('effective_to');
  });

  await knex.schema.createTable('product_covers', (t) => {
    t.increments('id');
    t.string('product_code', 20).notNullable().references('products.code');
    t.string('code', 30).notNullable();
    t.enum('cover_type', ['basic', 'optional', 'clause']).notNullable();
    t.string('name_en', 200).notNullable();
    t.string('name_ar', 200).notNullable();
    t.string('description_en', 500);
    t.string('description_ar', 500);
    t.json('pricing');
    t.json('attributes');
    t.boolean('referral').notNullable().defaultTo(false);
    t.integer('sort').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
    t.unique(['product_code', 'code']);
  });

  await knex.schema.createTable('product_deductibles', (t) => {
    t.increments('id');
    t.string('product_code', 20).notNullable().references('products.code');
    t.string('code', 30).notNullable();
    t.string('name_en', 200).notNullable();
    t.string('name_ar', 200).notNullable();
    t.string('detail_en', 300);
    t.string('detail_ar', 300);
    t.enum('deductible_type', ['fixed', 'percent_of_claim', 'percent_of_si', 'greater_of', 'days']).notNullable();
    t.decimal('amount', 14, 3);
    t.decimal('percent', 8, 5);
    t.decimal('rating_factor', 8, 5);
    t.boolean('is_default').notNullable().defaultTo(false);
    t.integer('sort').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
    t.unique(['product_code', 'code']);
  });

  await knex.schema.createTable('premium_adjustments', (t) => {
    t.increments('id');
    t.string('product_code', 20).references('products.code');
    t.string('code', 30).notNullable();
    t.string('name_en', 200).notNullable();
    t.string('name_ar', 200).notNullable();
    t.enum('kind', ['discount', 'loading']).notNullable();
    t.decimal('percent', 8, 5).notNullable();
    t.json('condition');
    t.json('channels');
    t.integer('priority').notNullable().defaultTo(100);
    t.boolean('stackable').notNullable().defaultTo(true);
    t.date('effective_from');
    t.date('effective_to');
    t.boolean('active').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('charges', (t) => {
    t.increments('id');
    t.string('code', 30).notNullable();
    t.string('name_en', 200).notNullable();
    t.string('name_ar', 200).notNullable();
    t.string('product_code', 20).references('products.code');
    t.string('country_code', 2).references('countries.code');
    t.enum('charge_type', ['fixed', 'percent']).notNullable();
    t.decimal('amount', 14, 3);
    t.decimal('percent', 8, 5);
    t.decimal('min_amount', 14, 3);
    t.decimal('max_amount', 14, 3);
    t.boolean('taxable').notNullable().defaultTo(true);
    t.boolean('refundable').notNullable().defaultTo(false);
    t.json('transactions');
    t.json('condition');
    t.integer('sort').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('taxes', (t) => {
    t.increments('id');
    t.string('code', 30).notNullable();
    t.string('name_en', 200).notNullable();
    t.string('name_ar', 200).notNullable();
    t.string('country_code', 2).notNullable().references('countries.code');
    t.string('product_code', 20).references('products.code');
    t.decimal('rate', 8, 5).notNullable();
    t.boolean('applies_to_fees').notNullable().defaultTo(true);
    t.json('condition');
    t.integer('priority').notNullable().defaultTo(100);
    t.date('effective_from');
    t.date('effective_to');
    t.boolean('active').notNullable().defaultTo(true);
  });
};

exports.down = async function down(knex) {
  for (const tb of ['taxes', 'charges', 'premium_adjustments', 'product_deductibles', 'product_covers']) await knex.schema.dropTableIfExists(tb); // eslint-disable-line no-await-in-loop
  await knex.schema.alterTable('products', (t) => { t.dropColumn('description_en'); t.dropColumn('description_ar'); t.dropColumn('effective_from'); t.dropColumn('effective_to'); });
  await knex.raw("ALTER TABLE products MODIFY line ENUM('fire','marine','wc','engineering') NOT NULL");
  await knex.schema.dropTableIfExists('lobs');
};
