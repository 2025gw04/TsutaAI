/**
 * マイグレーション: AIアラート機能改善
 * - project_snapshots テーブル作成（プロジェクト状態のスナップショット保存）
 * - dashboard_alerts テーブル拡張（ハッシュ値、ステータス、解決日時）
 */
exports.up = async function (knex) {
    const hasProjectSnapshots = await knex.schema.hasTable('project_snapshots');

    if (!hasProjectSnapshots) {
        await knex.schema.createTable('project_snapshots', (table) => {
            table.increments('id').primary();
            table.integer('project_id').unsigned().notNullable()
                .references('id').inTable('projects').onDelete('CASCADE');
            table.text('snapshot_data').notNullable();
            table.string('snapshot_hash', 64).notNullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());

            table.index('project_id', 'idx_project_snapshots_project_id');
            table.index('created_at', 'idx_project_snapshots_created_at');
        });
    }

    const hasAlertHash = await knex.schema.hasColumn('dashboard_alerts', 'alert_hash');
    const hasStatus = await knex.schema.hasColumn('dashboard_alerts', 'status');
    const hasResolvedAt = await knex.schema.hasColumn('dashboard_alerts', 'resolved_at');
    const hasAutoResolved = await knex.schema.hasColumn('dashboard_alerts', 'auto_resolved');

    await knex.schema.alterTable('dashboard_alerts', (table) => {
        if (!hasAlertHash) table.string('alert_hash', 64).nullable();
        if (!hasStatus) table.string('status', 20).defaultTo('active');
        if (!hasResolvedAt) table.timestamp('resolved_at').nullable();
        if (!hasAutoResolved) table.boolean('auto_resolved').defaultTo(false);
    });

    // Add indexes if they don't exist (Knex doesn't have hasIndex easily available, so wrap in try-catch or just try add)
    // Here we assume if column didn't exist, index didn't either. But to be safe, we can try-catch index creation separately
    // Or just let it be, often re-adding index might throw or be ignored depending on DB.
    // Better strategy: simply attempt to add index inside a raw query or separate schema block that ignores errors?
    // For simplicity with Knex schema builder, we rely on the fact that if we added columns, we likely need indexes.
    // However, if columns existed, indexes might too.
    // Let's check indexes by name if possible? No simple cross-db way.
    // We will attempt to add indexes only if we added the columns OR wrap in a try-catch block for safety.

    try {
        await knex.schema.alterTable('dashboard_alerts', (table) => {
            if (!hasAlertHash) table.index('alert_hash', 'idx_alerts_hash');
            if (!hasStatus) table.index('status', 'idx_alerts_status');
        });
    } catch (e) {
        // Ignore index creation errors (likely already exists)
        console.log('Index creation skipped or failed (likely already exists):', e.message);
    }
};

exports.down = function (knex) {
    return knex.schema
        // インデックス削除
        .alterTable('dashboard_alerts', (table) => {
            table.dropIndex('alert_hash', 'idx_alerts_hash');
            table.dropIndex('status', 'idx_alerts_status');
        })
        // カラム削除
        .then(() => {
            return knex.schema.alterTable('dashboard_alerts', (table) => {
                table.dropColumn('auto_resolved');
                table.dropColumn('resolved_at');
                table.dropColumn('status');
                table.dropColumn('alert_hash');
            });
        })
        // テーブル削除
        .then(() => {
            return knex.schema.dropTableIfExists('project_snapshots');
        });
};
