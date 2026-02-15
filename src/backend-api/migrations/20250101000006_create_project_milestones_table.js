/**
 * マイグレーション: project_milestonesテーブル作成
 */
exports.up = function(knex) {
  return knex.schema.createTable('project_milestones', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('description').defaultTo('');
    table.date('due_date').notNullable();
    table.enum('status', ['pending', 'in_progress', 'completed']).defaultTo('pending');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('project_id', 'idx_project_milestones_project_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('project_milestones');
};
