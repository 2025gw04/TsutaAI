/**
 * マイグレーション: ヘルプリクエスト・スプリント関連テーブル作成
 * - help_requests
 * - help_request_suggestions
 * - team_member_sprint_performance
 * - mental_health_logs
 * - sprint_progress
 */
exports.up = function (knex) {
  return knex.schema
    // help_requests
    .createTable('help_requests', (table) => {
      table.increments('id').primary();
      table.integer('task_id').unsigned().notNullable().references('id').inTable('tasks').onDelete('CASCADE');
      table.integer('requester_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('request_title', 255).notNullable();
      table.text('request_description');
      table.enum('urgency', ['low', 'medium', 'high', 'critical']).defaultTo('medium');
      table.text('ai_context_summary');
      table.string('problem_type', 100);
      table.text('detected_issues');
      table.enum('status', ['open', 'assigned', 'in_progress', 'resolved', 'cancelled']).defaultTo('open');
      table.integer('assigned_to').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('assigned_at');
      table.timestamp('resolved_at');
      table.text('resolution_notes');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index('task_id', 'idx_help_requests_task');
      table.index('requester_id', 'idx_help_requests_requester');
      table.index('status', 'idx_help_requests_status');
    })
    // help_request_suggestions
    .createTable('help_request_suggestions', (table) => {
      table.increments('id').primary();
      table.integer('help_request_id').unsigned().notNullable().references('id').inTable('help_requests').onDelete('CASCADE');
      table.integer('suggested_user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.float('skill_match_score').defaultTo(0);
      table.float('availability_score').defaultTo(0);
      table.float('experience_score').defaultTo(0);
      table.float('total_match_score').defaultTo(0);
      table.text('ai_reasoning');
      table.text('recommended_approach');
      table.integer('suggestion_rank');
      table.boolean('was_accepted').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['help_request_id', 'suggested_user_id'], 'help_req_sugg_unique');
      table.index('help_request_id', 'idx_help_request_suggestions_request');
      table.index('suggested_user_id', 'idx_help_request_suggestions_user');
    })
    // team_member_sprint_performance
    .createTable('team_member_sprint_performance', (table) => {
      table.increments('id').primary();
      table.integer('sprint_id').unsigned().notNullable().references('id').inTable('sprint_goals').onDelete('CASCADE');
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('completed_tasks').defaultTo(0);
      table.integer('completed_story_points').defaultTo(0);
      table.float('total_work_hours').defaultTo(0);
      table.float('avg_task_completion_time').defaultTo(0);
      table.float('contribution_percentage').defaultTo(0);
      table.float('velocity').defaultTo(0);
      table.integer('reopened_tasks').defaultTo(0);
      table.integer('blocked_tasks').defaultTo(0);
      table.integer('performance_rank');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['sprint_id', 'user_id']);
      table.index('sprint_id', 'idx_team_member_sprint_perf_sprint');
      table.index('user_id', 'idx_team_member_sprint_perf_user');
    })
    // mental_health_logs
    .createTable('mental_health_logs', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.date('report_date').notNullable();
      table.integer('mood');
      table.integer('stress_level');
      table.boolean('has_blocker').defaultTo(false);
      table.text('blocker_details');
      table.boolean('need_support').defaultTo(false);
      table.text('support_details');
      table.text('ai_advice');
      table.text('manager_comment');
      table.integer('manager_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('commented_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['user_id', 'report_date'], 'idx_mental_health_logs_user_date');
      table.unique(['user_id', 'report_date'], 'uq_mental_health_logs_user_date');
      table.index('need_support', 'idx_mental_health_logs_need_support');
      table.index('stress_level', 'idx_mental_health_logs_stress');
    })
    // sprint_progress
    .createTable('sprint_progress', (table) => {
      table.increments('id').primary();
      table.integer('sprint_id').unsigned().notNullable().references('id').inTable('sprint_goals').onDelete('CASCADE');
      table.date('progress_date').notNullable();
      table.integer('completed_story_points').defaultTo(0);
      table.integer('completed_tasks').defaultTo(0);
      table.integer('remaining_story_points').defaultTo(0);
      table.integer('remaining_tasks').defaultTo(0);
      table.float('daily_velocity').defaultTo(0);
      table.float('momentum_score').defaultTo(0);
      table.enum('trend', ['accelerating', 'steady', 'slowing', 'stalled']);
      table.date('predicted_completion_date');
      table.boolean('on_track').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['sprint_id', 'progress_date']);
      table.index('sprint_id', 'idx_sprint_progress_sprint_id');
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('sprint_progress')
    .dropTableIfExists('mental_health_logs')
    .dropTableIfExists('team_member_sprint_performance')
    .dropTableIfExists('help_request_suggestions')
    .dropTableIfExists('help_requests');
};
