/**
 * マイグレーション: project_membersテーブル作成
 */
exports.up = function(knex) {
  return knex.schema.createTable('project_members', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.enum('role', ['owner', 'member', 'viewer']).defaultTo('member');
    table.timestamp('added_at').defaultTo(knex.fn.now());

    table.unique(['project_id', 'user_id']);
    table.index('project_id', 'idx_project_members_project_id');
    table.index('user_id', 'idx_project_members_user_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('project_members');
};
