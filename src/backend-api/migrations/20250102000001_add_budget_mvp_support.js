/**
 * マイグレーション: Phase 1 - budget_fixed と mvp パターンのサポート
 * - estimate_tasks に priority カラムを追加（budget_fixed用）
 * - estimate_tasks に is_mvp_core カラムを追加（mvp用）
 */
exports.up = function(knex) {
  return knex.schema
    .table('estimate_tasks', (table) => {
      table.string('priority', 20); // 'must', 'should', 'nice'
      table.boolean('is_mvp_core').defaultTo(false);
    });
};

exports.down = function(knex) {
  return knex.schema
    .table('estimate_tasks', (table) => {
      table.dropColumn('priority');
      table.dropColumn('is_mvp_core');
    });
};
