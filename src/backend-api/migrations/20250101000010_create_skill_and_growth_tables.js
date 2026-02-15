/**
 * マイグレーション: スキル・成長関連テーブル作成
 * - user_skills
 * - skill_growth_history
 * - performance_metrics
 * - member_contributions
 * - growth_goals
 */
exports.up = function(knex) {
  return knex.schema
    // user_skills
    .createTable('user_skills', (table) => {
      table.increments('skill_id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('skill_name', 255).notNullable();
      table.integer('skill_level').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['user_id', 'skill_name']);
      table.index('user_id', 'idx_user_skills_user_id');
    })
    // skill_growth_history
    .createTable('skill_growth_history', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('skill_name', 255).notNullable();
      table.integer('skill_level').notNullable();
      table.date('recorded_date').notNullable();
      table.text('change_reason');
      table.text('notes');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['user_id', 'recorded_date'], 'idx_skill_growth_user_date');
      table.index(['user_id', 'skill_name'], 'idx_skill_growth_skill');
    })
    // performance_metrics
    .createTable('performance_metrics', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.date('metric_date').notNullable();
      table.float('task_completion_rate').defaultTo(0);
      table.float('bug_rate').defaultTo(0);
      table.integer('help_count').defaultTo(0);
      table.float('focus_level_avg').defaultTo(0);
      table.integer('tasks_completed').defaultTo(0);
      table.integer('tasks_total').defaultTo(0);
      table.float('estimated_vs_actual_ratio').defaultTo(1.0);
      table.float('avg_task_duration_hours').defaultTo(0);
      table.float('team_avg_duration_hours').defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['user_id', 'metric_date']);
      table.index(['user_id', 'metric_date'], 'idx_performance_metrics_user_date');
    })
    // member_contributions
    .createTable('member_contributions', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.date('contribution_date').notNullable();
      table.string('contribution_type', 100).notNullable();
      table.string('title', 255).notNullable();
      table.text('description');
      table.enum('impact_level', ['low', 'medium', 'high']).defaultTo('medium');
      table.integer('project_id').unsigned().references('id').inTable('projects').onDelete('SET NULL');
      table.integer('task_id').unsigned().references('id').inTable('tasks').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['user_id', 'contribution_date'], 'idx_contributions_user_date');
      table.index('contribution_type', 'idx_contributions_type');
    })
    // growth_goals
    .createTable('growth_goals', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('goal_title', 255).notNullable();
      table.text('goal_description');
      table.string('target_skill', 255);
      table.integer('target_level');
      table.integer('estimated_duration_weeks');
      table.enum('status', ['active', 'completed', 'cancelled']).defaultTo('active');
      table.integer('progress').defaultTo(0);
      table.boolean('ai_generated').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at');

      table.index(['user_id', 'status'], 'idx_growth_goals_user_status');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('growth_goals')
    .dropTableIfExists('member_contributions')
    .dropTableIfExists('performance_metrics')
    .dropTableIfExists('skill_growth_history')
    .dropTableIfExists('user_skills');
};
