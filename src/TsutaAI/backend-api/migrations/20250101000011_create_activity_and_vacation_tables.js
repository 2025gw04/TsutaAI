/**
 * マイグレーション: アクティビティ・休暇関連テーブル作成
 * - activity_logs
 * - vacations
 * - user_prompts
 */
exports.up = function(knex) {
  return knex.schema
    // activity_logs
    .createTable('activity_logs', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('task_id').unsigned().references('id').inTable('tasks').onDelete('SET NULL');
      table.integer('mouse_clicks').defaultTo(0);
      table.integer('mouse_wheel').defaultTo(0);
      table.integer('key_presses').defaultTo(0);
      table.string('active_window', 500);
      table.string('process_name', 255);
      table.float('activity_score').defaultTo(0);
      table.timestamp('timestamp').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('user_id', 'idx_activity_logs_user_id');
      table.index('task_id', 'idx_activity_logs_task_id');
      table.index('timestamp', 'idx_activity_logs_timestamp');
      table.index(['user_id', 'timestamp'], 'idx_activity_logs_user_timestamp');
    })
    // vacations
    .createTable('vacations', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.date('start_date').notNullable();
      table.date('end_date').notNullable();
      table.string('vacation_type', 100).defaultTo('有給休暇');
      table.text('notes').defaultTo('');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('user_id', 'idx_vacations_user_id');
    })
    // user_prompts
    .createTable('user_prompts', (table) => {
      table.increments('user_prompt_id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('prompt_name', 255).notNullable();
      table.text('responsibility').defaultTo('');
      table.text('notes').defaultTo('');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('user_id', 'idx_user_prompts_user_id');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('user_prompts')
    .dropTableIfExists('vacations')
    .dropTableIfExists('activity_logs');
};
