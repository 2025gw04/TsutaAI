/**
 * マイグレーション: Phase 2 - phase_based と agile パターンのサポート
 * - estimate_phases に gate_criteria, deliverables カラムを追加（phase_based用）
 * - estimate_phase_gates テーブルを作成（phase_based用）
 * - estimate_user_stories テーブルを作成（agile用）
 */
exports.up = function(knex) {
  return knex.schema
    // estimate_phasesテーブルにカラム追加
    .table('estimate_phases', (table) => {
      table.text('gate_criteria'); // JSON形式: フェーズゲート条件
      table.text('deliverables'); // JSON形式: 成果物リスト
    })
    // estimate_phase_gates テーブル作成
    .createTable('estimate_phase_gates', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable()
        .references('id').inTable('estimates').onDelete('CASCADE');
      table.integer('phase_id').unsigned().notNullable()
        .references('id').inTable('estimate_phases').onDelete('CASCADE');
      table.string('gate_name', 255);
      table.text('criteria'); // JSON: チェック項目リスト
      table.string('status', 50).defaultTo('pending'); // pending/passed/failed
      table.timestamp('reviewed_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('estimate_id', 'idx_phase_gates_estimate_id');
      table.index('phase_id', 'idx_phase_gates_phase_id');
    })
    // estimate_user_stories テーブル作成
    .createTable('estimate_user_stories', (table) => {
      table.increments('id').primary();
      table.integer('estimate_id').unsigned().notNullable()
        .references('id').inTable('estimates').onDelete('CASCADE');
      table.string('epic', 255);
      table.text('user_story').notNullable();
      table.integer('story_points');
      table.integer('sprint_number');
      table.integer('priority');
      table.text('acceptance_criteria'); // JSON
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index('estimate_id', 'idx_user_stories_estimate_id');
      table.index('sprint_number', 'idx_user_stories_sprint_number');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('estimate_user_stories')
    .dropTableIfExists('estimate_phase_gates')
    .table('estimate_phases', (table) => {
      table.dropColumn('gate_criteria');
      table.dropColumn('deliverables');
    });
};
