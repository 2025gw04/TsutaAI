/**
 * マイグレーション: projectsテーブル作成
 */
exports.up = function(knex) {
  return knex.schema.createTable('projects', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.text('description');
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    table.enum('status', ['planning', 'active', 'completed', 'cancelled']).notNullable();
    table.integer('created_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.integer('health_score').defaultTo(0);
    table.timestamp('last_health_score_update');
    table.integer('current_sprint_id').unsigned().references('id').inTable('sprint_goals');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('projects');
};
