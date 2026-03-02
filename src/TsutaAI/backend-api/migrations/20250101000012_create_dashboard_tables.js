/**
 * マイグレーション: ダッシュボード関連テーブル作成
 * - project_summaries
 * - dashboard_alerts
 * - sentiment_analysis
 * - personal_tasks
 */
exports.up = function(knex) {
  return knex.schema
    // project_summaries
    .createTable('project_summaries', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable().unique().references('id').inTable('projects').onDelete('CASCADE');
      table.integer('progress_percentage').defaultTo(0);
      table.string('current_phase', 255);
      table.text('summary_text');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    // dashboard_alerts
    .createTable('dashboard_alerts', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().references('id').inTable('projects').onDelete('CASCADE');
      table.enum('severity', ['low', 'medium', 'high']);
      table.text('message').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    // sentiment_analysis
    .createTable('sentiment_analysis', (table) => {
      table.increments('id').primary();
      table.float('overall_score').notNullable();
      table.text('summary').notNullable();
      table.text('positive_keywords').notNullable();
      table.text('negative_keywords').notNullable();
      table.text('comments_json').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    // personal_tasks
    .createTable('personal_tasks', (table) => {
      table.increments('id').primary();
      table.integer('task_id').unique().notNullable();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('title', 255).notNullable();
      table.text('description').defaultTo('');
      table.text('notes').defaultTo('');
      table.text('report_notes').defaultTo('');
      table.enum('priority', ['High', 'Medium', 'Low']).defaultTo('Medium');
      table.enum('status', ['not-started', 'in-progress', 'done', 'on-hold']).defaultTo('not-started');
      table.integer('progress').defaultTo(0);
      table.integer('estimated_minutes').defaultTo(0);
      table.integer('actual_minutes').defaultTo(0);
      table.date('start_date');
      table.date('due_date');
      table.timestamp('completed_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index('user_id', 'idx_personal_tasks_user_id');
      table.index('status', 'idx_personal_tasks_status');
      table.index('due_date', 'idx_personal_tasks_due_date');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('personal_tasks')
    .dropTableIfExists('sentiment_analysis')
    .dropTableIfExists('dashboard_alerts')
    .dropTableIfExists('project_summaries');
};
