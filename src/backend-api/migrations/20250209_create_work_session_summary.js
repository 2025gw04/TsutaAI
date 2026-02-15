/**
 * マイグレーション: work_session_summary テーブル作成
 * プライバシーに配慮した作業セッション記録
 * - プロジェクト/タスク単位の作業時間
 * - 進捗情報
 * - コミット数
 */
exports.up = function (knex) {
    return knex.schema
        .createTable('work_session_summary', (table) => {
            table.increments('session_id').primary();
            table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
            table.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('SET NULL');
            table.integer('task_id').unsigned().nullable().references('id').inTable('tasks').onDelete('SET NULL');
            table.timestamp('session_start').notNullable();
            table.timestamp('session_end').notNullable();
            table.integer('work_duration_seconds').defaultTo(0); // 実際の作業時間
            table.integer('progress_percentage').defaultTo(0); // タスクの進捗率
            table.integer('commits_count').defaultTo(0); // コミット数
            table.integer('files_changed').defaultTo(0); // 変更ファイル数
            table.text('session_notes'); // セッションメモ（オプション）
            table.string('session_type', 20).defaultTo('work'); // work, meeting, review, etc.
            table.timestamp('created_at').defaultTo(knex.fn.now());

            table.index('user_id', 'idx_work_session_user');
            table.index('project_id', 'idx_work_session_project');
            table.index('task_id', 'idx_work_session_task');
            table.index('session_start', 'idx_work_session_start');
            table.index(['user_id', 'session_start'], 'idx_work_session_user_start');
            table.index(['project_id', 'session_start'], 'idx_work_session_project_start');
        });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('work_session_summary');
};
