/**
 * マイグレーション: tasksテーブルにstory_pointsカラムを追加
 */
exports.up = function (knex) {
    return knex.schema.hasColumn('tasks', 'story_points').then(exists => {
        if (!exists) {
            return knex.schema.table('tasks', (table) => {
                table.integer('story_points').defaultTo(0);
            });
        }
    });
};

exports.down = function (knex) {
    return knex.schema.hasColumn('tasks', 'story_points').then(exists => {
        if (exists) {
            return knex.schema.table('tasks', (table) => {
                table.dropColumn('story_points');
            });
        }
    });
};
