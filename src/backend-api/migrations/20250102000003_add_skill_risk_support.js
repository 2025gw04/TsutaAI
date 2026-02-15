/**
 * マイグレーション: Phase 3 - skill_based と risk_based パターンのサポート
 * - estimate_tasks に required_skill_level カラムを追加（skill_based用）
 * - estimate_phases に risk_buffer_percentage カラムを追加（risk_based用）
 * - estimate_skill_allocation テーブルは既存（完全活用）
 * - estimate_risks テーブルは既存（完全活用）
 */
exports.up = function(knex) {
  return knex.schema
    // estimate_tasksテーブルにカラム追加
    .table('estimate_tasks', (table) => {
      table.string('required_skill_level', 20); // 'senior', 'middle', 'junior'
    })
    // estimate_phasesテーブルにカラム追加
    .table('estimate_phases', (table) => {
      table.decimal('risk_buffer_percentage', 5, 2).defaultTo(0); // リスクバッファ（%）
    });
};

exports.down = function(knex) {
  return knex.schema
    .table('estimate_tasks', (table) => {
      table.dropColumn('required_skill_level');
    })
    .table('estimate_phases', (table) => {
      table.dropColumn('risk_buffer_percentage');
    });
};
