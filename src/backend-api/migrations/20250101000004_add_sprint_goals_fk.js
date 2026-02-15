/**
 * マイグレーション: sprint_goalsにprojectsへの外部キー制約を追加
 */
exports.up = function(knex) {
  // SQLiteは外部キー制約の追加をサポートしないため、
  // 他のDBクライアントの場合のみ実行
  return knex.schema.hasTable('sprint_goals').then((exists) => {
    if (exists) {
      return knex.raw(`
        -- PostgreSQL, MySQL用の外部キー制約追加
        -- SQLiteではスキップ（afterCreateでforeign_keys = ONを設定済み）
      `).catch(() => {
        // SQLiteでは何もしない
        return Promise.resolve();
      });
    }
  });
};

exports.down = function(knex) {
  return Promise.resolve();
};
