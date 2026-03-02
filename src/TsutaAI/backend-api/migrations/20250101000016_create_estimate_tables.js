/**
 * マイグレーション: 見積もり関連テーブル作成
 * - estimates
 * - estimate_conversations
 * - estimate_parameters
 * - estimate_results
 * - estimate_phases
 * - estimate_tasks
 * - estimate_skill_allocation
 * - estimate_risks
 */
exports.up = function(knex) {
  return knex.schema
    // estimates
    .createTable('estimates', (table) => {
      table.increments('id').primary();
      table.integer('project_id').unsigned().references('id').inTable('projects');
      table.string('pattern_type', 100).notNullable();
      table.string('title', 255).notNullable();
      table.text('description');
      table.string('status', 50).defaultTo('draft');
      table.integer('created_by').unsigned().references('id').inTable('users');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at');

      table.index('project_id', 'idx_estimates_project_id');
      table.index('status', 'idx_estimates_status');
    })
    // estimate_conversations
    .createTable('estimate_conversations', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable().references('id').inTable('estimates').onDelete('CASCADE');
      table.string('role', 50).notNullable();
      table.text('content').notNullable();
      table.text('metadata');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('estimate_id', 'idx_estimate_conversations_estimate_id');
    })
    // estimate_parameters
    .createTable('estimate_parameters', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable().references('id').inTable('estimates').onDelete('CASCADE');
      table.string('param_key', 255).notNullable();
      table.text('param_value').notNullable();
      table.string('param_type', 50);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('estimate_id', 'idx_estimate_parameters_estimate_id');
    })
    // estimate_results
    .createTable('estimate_results', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable().references('id').inTable('estimates').onDelete('CASCADE');
      table.string('result_type', 50).notNullable();
      table.float('total_effort');
      table.integer('duration_days');
      table.float('team_size');
      table.float('total_cost');
      table.float('confidence_level');
      table.text('breakdown');
      table.text('recommendations');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('estimate_id', 'idx_estimate_results_estimate_id');
    })
    // estimate_phases
    .createTable('estimate_phases', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable().references('id').inTable('estimates').onDelete('CASCADE');
      table.string('phase_name', 255).notNullable();
      table.integer('phase_order').notNullable();
      table.float('effort');
      table.integer('duration_days');
      table.float('team_size');
      table.date('start_date');
      table.date('end_date');
      table.text('dependencies');
      table.boolean('use_ai').defaultTo(false);
      table.float('ai_efficiency_ratio').defaultTo(0);
      table.boolean('ai_efficiency_auto').defaultTo(true);
      table.float('effort_with_ai');
      table.integer('duration_with_ai');

      table.index('estimate_id', 'idx_estimate_phases_estimate_id');
    })
    // estimate_tasks
    .createTable('estimate_tasks', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable().references('id').inTable('estimates').onDelete('CASCADE');
      table.string('task_name', 255).notNullable();
      table.text('task_description');
      table.integer('task_order').notNullable();
      table.integer('phase_id').unsigned().references('id').inTable('estimate_phases').onDelete('SET NULL');
      table.float('effort');
      table.enum('complexity', ['low', 'medium', 'high']);
      table.boolean('use_ai').defaultTo(false);
      table.float('ai_efficiency_ratio').defaultTo(0);
      table.boolean('ai_efficiency_auto').defaultTo(true);
      table.float('effort_with_ai');

      table.index('estimate_id', 'idx_estimate_tasks_estimate_id');
    })
    // estimate_skill_allocation
    .createTable('estimate_skill_allocation', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable().references('id').inTable('estimates').onDelete('CASCADE');
      table.string('skill_level', 50).notNullable();
      table.float('count');
      table.float('hourly_rate');
      table.float('effort');
    })
    // estimate_risks
    .createTable('estimate_risks', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable().references('id').inTable('estimates').onDelete('CASCADE');
      table.string('risk_category', 100).notNullable();
      table.text('risk_description');
      table.enum('impact_level', ['low', 'medium', 'high']);
      table.float('buffer_percentage');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('estimate_risks')
    .dropTableIfExists('estimate_skill_allocation')
    .dropTableIfExists('estimate_tasks')
    .dropTableIfExists('estimate_phases')
    .dropTableIfExists('estimate_results')
    .dropTableIfExists('estimate_parameters')
    .dropTableIfExists('estimate_conversations')
    .dropTableIfExists('estimates');
};
