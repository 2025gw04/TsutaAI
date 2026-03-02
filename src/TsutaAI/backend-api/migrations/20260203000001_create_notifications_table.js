/**
 * マイグレーション: 通知テーブル作成
 */
exports.up = async function (knex) {
  // 古いテーブルが残っている可能性があるため、一度ドロップして作り直す
  // これにより、カラム不足などのスキーマ不整合を解消する
  await knex.schema.dropTableIfExists('notifications');

  return knex.schema
    .createTable('notifications', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('type', 50).notNullable(); // 'help_request', 'system', 'alert' etc.
      table.string('title', 255).notNullable();
      table.text('message');
      table.string('related_entity_type', 50); // 'help_request', 'project', 'task'
      table.integer('related_entity_id');
      table.boolean('is_read').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('user_id', 'idx_notifications_user');
      table.index(['user_id', 'is_read'], 'idx_notifications_user_read');
    });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('notifications');
};
