/**
 * マイグレーション: 設定関連テーブル作成
 * - system_settings
 * - holidays
 */
exports.up = function(knex) {
  return knex.schema
    // system_settings
    .createTable('system_settings', (table) => {
      table.increments('id').primary();
      table.string('setting_key', 255).notNullable().unique();
      table.text('setting_value');
      table.enum('setting_type', ['string', 'number', 'boolean', 'json']).defaultTo('string');
      table.text('description');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index('setting_key', 'idx_system_settings_key');
    })
    // holidays
    .createTable('holidays', (table) => {
      table.increments('id').primary();
      table.date('holiday_date').notNullable().unique();
      table.string('holiday_name', 255).notNullable();
      table.enum('holiday_type', ['national', 'company', 'other']).defaultTo('national');
      table.boolean('is_recurring').defaultTo(false);
      table.text('notes');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index('holiday_date', 'idx_holidays_date');
      table.index('holiday_type', 'idx_holidays_type');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('holidays')
    .dropTableIfExists('system_settings');
};
