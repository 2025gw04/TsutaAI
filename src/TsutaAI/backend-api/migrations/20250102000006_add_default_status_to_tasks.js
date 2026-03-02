/**
 * マイグレーション: tasksテーブルのstatusカラムにデフォルト値'todo'を追加
 */
exports.up = function(knex) {
  return knex.schema.alterTable('tasks', (table) => {
    table.enum('status', ['todo', 'in_progress', 'completed', 'cancelled'])
      .notNullable()
      .defaultTo('todo')
      .alter();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('tasks', (table) => {
    table.enum('status', ['todo', 'in_progress', 'completed', 'cancelled'])
      .notNullable()
      .alter();
  });
};
