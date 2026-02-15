/**
 * マイグレーション: タスク関連テーブル作成
 * - task_comments
 * - task_attachments
 * - task_activity_log
 */
exports.up = function(knex) {
  return knex.schema
    // task_comments
    .createTable('task_comments', (table) => {
      table.increments('id').primary();
      table.integer('task_id').unsigned().notNullable().references('id').inTable('tasks').onDelete('CASCADE');
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.text('content').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index('task_id', 'idx_task_comments_task_id');
    })
    // task_attachments
    .createTable('task_attachments', (table) => {
      table.increments('id').primary();
      table.integer('task_id').unsigned().notNullable().references('id').inTable('tasks').onDelete('CASCADE');
      table.integer('uploaded_by').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('file_name', 255).notNullable();
      table.string('file_path', 500).notNullable();
      table.integer('file_size');
      table.string('file_type', 100);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('task_id', 'idx_task_attachments_task_id');
    })
    // task_activity_log
    .createTable('task_activity_log', (table) => {
      table.increments('id').primary();
      table.integer('task_id').unsigned().notNullable().references('id').inTable('tasks').onDelete('CASCADE');
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.string('action_type', 100).notNullable();
      table.text('old_value');
      table.text('new_value');
      table.text('description');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('task_id', 'idx_task_activity_log_task_id');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('task_activity_log')
    .dropTableIfExists('task_attachments')
    .dropTableIfExists('task_comments');
};
