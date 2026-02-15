/**
 * マイグレーション: Phase 4 - similar_project, hybrid, maintenance パターンのサポート
 * - estimate_historical_projects テーブルを作成（similar_project用）
 * - estimate_phases に estimation_method カラムを追加（hybrid用）
 * - estimate_maintenance_items テーブルを作成（maintenance用）
 */
exports.up = function(knex) {
  return knex.schema
    // estimate_historical_projects テーブル作成
    .createTable('estimate_historical_projects', (table) => {
      table.increments('id').primary();
      table.string('project_name', 255);
      table.text('project_description');
      table.text('technology_stack'); // JSON形式
      table.decimal('total_effort', 10, 2); // 総工数（人日）
      table.integer('duration_days'); // 期間（日数）
      table.integer('team_size'); // チーム人数
      table.decimal('actual_cost', 12, 2); // 実コスト
      table.integer('success_rating'); // 成功度（1-5）
      table.text('lessons_learned'); // 教訓
      table.date('completed_at'); // 完了日
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('project_name', 'idx_historical_projects_name');
      table.index('completed_at', 'idx_historical_projects_completed');
    })
    // estimate_phasesテーブルにカラム追加
    .table('estimate_phases', (table) => {
      table.string('estimation_method', 50); // 使用した見積もり手法
    })
    // estimate_maintenance_items テーブル作成
    .createTable('estimate_maintenance_items', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable()
        .references('id').inTable('estimates').onDelete('CASCADE');
      table.string('item_type', 50); // 'incident', 'maintenance', 'minor_change', 'inquiry'
      table.string('item_name', 255);
      table.decimal('monthly_frequency', 5, 2); // 月次発生頻度
      table.decimal('hours_per_occurrence', 5, 2); // 1件あたり時間
      table.string('priority', 20); // 優先度
      table.boolean('use_ai').defaultTo(false);
      table.decimal('ai_efficiency_ratio', 3, 2).defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('estimate_id', 'idx_maintenance_items_estimate_id');
      table.index('item_type', 'idx_maintenance_items_type');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('estimate_maintenance_items')
    .table('estimate_phases', (table) => {
      table.dropColumn('estimation_method');
    })
    .dropTableIfExists('estimate_historical_projects');
};
