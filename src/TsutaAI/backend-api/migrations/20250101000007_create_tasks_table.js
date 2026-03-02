/**
 * マイグレーション: tasksテーブル作成
 */
exports.up = function(knex) {
  return knex.schema.createTable('tasks', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('description');
    table.integer('assigned_to').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.float('estimated_hours');
    table.float('actual_hours').defaultTo(0);
    table.enum('priority', ['low', 'medium', 'high']);
    table.enum('status', ['todo', 'in_progress', 'completed', 'cancelled']).notNullable();
    table.integer('progress').defaultTo(0);
    table.date('due_date');
    table.date('start_date');
    table.date('end_date');
    table.date('actual_start_date');
    table.date('actual_end_date');
    table.text('deliverable').defaultTo('');
    table.integer('parent_task_id').unsigned().references('id').inTable('tasks').onDelete('SET NULL');
    table.integer('sort_order').defaultTo(0);
    table.text('dependencies');
    table.string('task_key', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('assigned_to', 'idx_tasks_assigned_to');
    table.index('project_id', 'idx_tasks_project_id');
    table.index('actual_start_date', 'idx_tasks_actual_start_date');
    table.index('actual_end_date', 'idx_tasks_actual_end_date');
    table.index(['start_date', 'end_date', 'actual_start_date', 'actual_end_date'], 'idx_tasks_dates');
    table.index('task_key', 'idx_tasks_task_key_lookup');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('tasks');
};
