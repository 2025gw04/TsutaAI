/**
 * マイグレーション: dashboard_alertsテーブルの機能拡張
 * - type: アラート種類（risk/suggestion/warning）
 * - is_read: 既読/未読状態
 * - title: アラートタイトル
 * - details: 詳細情報
 * - related_task_id: 関連タスクへのリンク
 */
exports.up = function(knex) {
  return knex.schema.alterTable('dashboard_alerts', (table) => {
    // アラート種類（リスク/提案/警告）- SQLiteではenumはtextとして扱われる
    table.string('type', 20).defaultTo('warning');
    // 既読/未読状態
    table.boolean('is_read').defaultTo(false);
    // アラートタイトル
    table.string('title', 255).nullable();
    // 詳細情報
    table.text('details').nullable();
    // 関連タスクID
    table.integer('related_task_id').unsigned().nullable().references('id').inTable('tasks').onDelete('SET NULL');
  }).then(() => {
    // インデックスを別途追加（SQLite互換）
    return knex.schema.alterTable('dashboard_alerts', (table) => {
      table.index('is_read', 'idx_alerts_is_read');
      table.index('type', 'idx_alerts_type');
      table.index('severity', 'idx_alerts_severity');
    });
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('dashboard_alerts', (table) => {
    table.dropIndex('is_read', 'idx_alerts_is_read');
    table.dropIndex('type', 'idx_alerts_type');
    table.dropIndex('severity', 'idx_alerts_severity');
  }).then(() => {
    return knex.schema.alterTable('dashboard_alerts', (table) => {
      table.dropColumn('related_task_id');
      table.dropColumn('details');
      table.dropColumn('title');
      table.dropColumn('is_read');
      table.dropColumn('type');
    });
  });
};
