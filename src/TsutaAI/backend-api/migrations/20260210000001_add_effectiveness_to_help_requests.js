/**
 * マイグレーション: help_requestsテーブルにeffectivenessカラムを追加
 * 解決時の効果を記録するためのカラム
 */
exports.up = function (knex) {
    return knex.schema.alterTable('help_requests', (table) => {
        table.string('effectiveness', 50).nullable().after('resolution_notes');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('help_requests', (table) => {
        table.dropColumn('effectiveness');
    });
};
