/**
 * マイグレーション: projectsテーブルにmain_deliverableとmilestoneフィールドを追加
 */
exports.up = function(knex) {
  return knex.schema.table('projects', (table) => {
    table.text('main_deliverable').comment('主要成果物');
    table.text('milestone').comment('主要マイルストーン');
  });
};

exports.down = function(knex) {
  return knex.schema.table('projects', (table) => {
    table.dropColumn('main_deliverable');
    table.dropColumn('milestone');
  });
};
