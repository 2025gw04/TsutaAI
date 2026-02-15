/**
 * マイグレーション: 分析関連テーブル作成
 * - project_health_scores
 * - progress_predictions
 * - burndown_data
 * - critical_path_tasks
 * - hourly_activity_summary
 */
exports.up = function (knex) {
  return knex.schema
    // project_health_scores
    .createTable('project_health_scores', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.integer('health_score');
      table.date('score_date').notNullable();
      table.integer('progress_score').defaultTo(0);
      table.integer('deadline_score').defaultTo(0);
      table.integer('team_morale_score').defaultTo(0);
      table.integer('blocker_score').defaultTo(0);
      table.integer('velocity_score').defaultTo(0);
      table.text('ai_analysis');
      table.text('risk_factors');
      table.text('recommendations');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('project_id', 'idx_project_health_scores_project_id');
      table.index(['project_id', 'score_date'], 'idx_project_health_scores_project_date');
    })
    // progress_predictions
    .createTable('progress_predictions', (table) => {
      table.increments('id').primary();
      table.integer('task_id').unsigned().notNullable().references('id').inTable('tasks').onDelete('CASCADE');
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.date('prediction_date').notNullable();
      table.integer('current_progress').defaultTo(0);
      table.date('predicted_completion_date');
      table.float('completion_probability');
      table.enum('risk_level', ['low', 'medium', 'high']);
      table.float('avg_activity_score');
      table.float('total_work_hours');
      table.float('daily_progress_rate');
      table.text('ai_suggestion');
      table.text('bottleneck_analysis');
      table.text('resource_recommendation');
      table.float('confidence_score');
      table.boolean('is_on_track').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index('task_id', 'idx_progress_predictions_task');
      table.index('user_id', 'idx_progress_predictions_user');
      table.index('prediction_date', 'idx_progress_predictions_date');
      table.index('risk_level', 'idx_progress_predictions_risk');
      table.index('is_on_track', 'idx_progress_predictions_on_track');
    })
    // burndown_data
    .createTable('burndown_data', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.date('date').notNullable();
      table.integer('planned_remaining_tasks').defaultTo(0);
      table.float('planned_remaining_hours').defaultTo(0);
      table.integer('actual_remaining_tasks').defaultTo(0);
      table.float('actual_remaining_hours').defaultTo(0);
      table.integer('completed_tasks_count').defaultTo(0);
      table.float('completed_hours').defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['project_id', 'date']);
      table.index(['project_id', 'date'], 'idx_burndown_data_project_date');
    })
    // critical_path_tasks
    .createTable('critical_path_tasks', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.integer('task_id').unsigned().notNullable().references('id').inTable('tasks').onDelete('CASCADE');
      table.date('analysis_date').notNullable();
      table.boolean('is_critical').defaultTo(false);
      table.float('slack_days').defaultTo(0);
      table.date('earliest_start');
      table.date('latest_start');
      table.date('earliest_finish');
      table.date('latest_finish');
      table.integer('blocking_task_count').defaultTo(0);
      table.integer('blocked_by_count').defaultTo(0);
      table.integer('dependency_chain_length').defaultTo(0);
      table.text('impact_analysis');
      table.text('risk_assessment');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['project_id', 'task_id', 'analysis_date']);
      table.index(['project_id', 'analysis_date'], 'idx_critical_path_tasks_project_date');
      table.index('task_id', 'idx_critical_path_tasks_task');
    })
    // hourly_activity_summary
    .createTable('hourly_activity_summary', (table) => {
      table.increments('summary_id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.timestamp('hour_start').notNullable();
      table.timestamp('hour_end').notNullable();
      table.integer('mouse_clicks').defaultTo(0);
      table.integer('key_presses').defaultTo(0);
      table.integer('mouse_wheel_scrolls').defaultTo(0);
      table.integer('total_active_seconds').defaultTo(0);
      table.text('top_windows');
      table.integer('file_changes_count').defaultTo(0);
      table.integer('lines_added').defaultTo(0);
      table.integer('lines_removed').defaultTo(0);
      table.string('activity_intensity', 20).defaultTo('low');
      table.float('avg_cpu_usage').defaultTo(0);
      table.float('avg_memory_mb').defaultTo(0);
      table.string('ai_analysis_status', 20).defaultTo('pending');
      table.text('ai_analysis_result');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('user_id', 'idx_hourly_activity_summary_user');
      table.index('hour_start', 'idx_hourly_activity_summary_hour_start');
      table.index(['user_id', 'hour_start'], 'idx_hourly_activity_summary_user_hour');
      table.index('ai_analysis_status', 'idx_hourly_activity_summary_ai_status');
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('hourly_activity_summary')
    .dropTableIfExists('critical_path_tasks')
    .dropTableIfExists('burndown_data')
    .dropTableIfExists('progress_predictions')
    .dropTableIfExists('project_health_scores');
};
