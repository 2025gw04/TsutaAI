/**
 * マイグレーション: sprint_goalsテーブル作成
 * Note: project_idの外部キー制約はprojectsテーブル作成後に追加
 */
exports.up = function(knex) {
  return knex.schema.createTable('sprint_goals', (table) => {
    table.increments('id').primary();
    table.integer('project_id').notNullable();
    table.string('sprint_name', 255).notNullable();
    table.integer('sprint_number');
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    table.text('goal_description').notNullable();
    table.integer('target_story_points').defaultTo(0);
    table.integer('target_task_count').defaultTo(0);
    table.enum('status', ['planning', 'active', 'completed', 'cancelled']).defaultTo('planning');
    table.integer('actual_story_points').defaultTo(0);
    table.integer('actual_task_count').defaultTo(0);
    table.integer('completed_story_points').defaultTo(0);
    table.integer('completed_task_count').defaultTo(0);
    table.float('achievability_score');
    table.text('ai_analysis');
    table.integer('created_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('project_id', 'idx_sprint_goals_project_id');
    table.index('status', 'idx_sprint_goals_status');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('sprint_goals');
};
