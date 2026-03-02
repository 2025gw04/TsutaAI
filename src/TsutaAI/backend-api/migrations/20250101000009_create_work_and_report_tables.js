/**
 * マイグレーション: 作業ログ・レポート関連テーブル作成
 * - work_logs
 * - daily_reports
 * - ai_predictions
 * - notifications
 */
exports.up = function(knex) {
  return knex.schema
    // work_logs
    .createTable('work_logs', (table) => {
      table.increments('log_id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('task_id').unsigned().notNullable().references('id').inTable('tasks').onDelete('CASCADE');
      table.timestamp('start_time').notNullable();
      table.timestamp('end_time');
      table.integer('duration_minutes');
      table.string('activity_type', 100);
      table.text('notes');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('user_id', 'idx_work_logs_user_id');
      table.index('task_id', 'idx_work_logs_task_id');
    })
    // daily_reports
    .createTable('daily_reports', (table) => {
      table.increments('report_id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.date('report_date').notNullable();
      table.text('summary').notNullable();
      table.integer('satisfaction_level');
      table.integer('achievement_rate');
      table.integer('focus_level');
      table.integer('difficulty_level');
      table.integer('learning_level');
      table.text('comment');
      table.boolean('ai_generated').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['user_id', 'report_date'], 'idx_daily_reports_user_date');
    })
    // ai_predictions
    .createTable('ai_predictions', (table) => {
      table.increments('prediction_id').primary();
      table.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.string('prediction_type', 100).notNullable();
      table.enum('risk_level', ['low', 'medium', 'high']);
      table.text('prediction_content').notNullable();
      table.text('recommended_action');
      table.boolean('is_resolved').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    // notifications
    .createTable('notifications', (table) => {
      table.increments('notification_id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('title', 255).notNullable();
      table.text('message').notNullable();
      table.string('notification_type', 100);
      table.boolean('is_read').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('notifications')
    .dropTableIfExists('ai_predictions')
    .dropTableIfExists('daily_reports')
    .dropTableIfExists('work_logs');
};
