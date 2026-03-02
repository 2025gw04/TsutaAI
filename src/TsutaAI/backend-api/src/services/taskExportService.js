// タスクエクスポートサービス (Knex.js対応版)
const db = require('./database');
const logger = require('../utils/logger');

/**
 * プロジェクトのタスクをエクスポート
 * @param {number} projectId - プロジェクトID
 * @param {string} format - フォーマット ('json' | 'csv')
 * @returns {Object} { content, filename, contentType }
 */
async function exportTasks(projectId, format) {
    const tasks = await getProjectTasks(projectId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'json') {
        return {
            content: JSON.stringify({ tasks }, null, 2),
            filename: `tasks-${projectId}-${timestamp}.json`,
            contentType: 'application/json'
        };
    } else if (format === 'csv') {
        return {
            content: convertToCsv(tasks),
            filename: `tasks-${projectId}-${timestamp}.csv`,
            contentType: 'text/csv'
        };
    } else {
        throw new Error('サポートされていないフォーマットです。json または csv を指定してください。');
    }
}

/**
 * プロジェクトの全タスクを取得
 * @param {number} projectId
 * @returns {Array}
 */
async function getProjectTasks(projectId) {
    const knex = db.getKnex();

    return await knex('tasks')
        .select('*')
        .where('project_id', projectId)
        .orderBy('id', 'asc');
}

/**
 * タスク配列をCSVに変換
 * @param {Array} tasks
 * @returns {string}
 */
function convertToCsv(tasks) {
    const mapping = getCsvFieldMapping();
    const headers = Object.keys(mapping);
    const rows = [];

    // ヘッダー行
    rows.push(headers.join(','));

    // データ行
    tasks.forEach(task => {
        const row = headers.map(header => {
            const field = mapping[header];
            let value = task[field];

            if (value === null || value === undefined) {
                value = '';
            }

            // 文字列化してエスケープ処理
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        });
        rows.push(row.join(','));
    });

    return rows.join('\n');
}

/**
 * CSV列名からフィールド名へのマッピング
 * (taskImportServiceと一致させる)
 * @returns {Object}
 */
function getCsvFieldMapping() {
    return {
        'タスクキー': 'task_key',
        'タスクID': 'id',
        'タスク名': 'name',
        '説明': 'description',
        '見積工数(時間)': 'estimated_hours',
        '実績工数(時間)': 'actual_hours',
        '優先度': 'priority',
        'ステータス': 'status',
        '進捗(%)': 'progress',
        '開始予定日': 'start_date',
        '終了予定日': 'end_date',
        '実際の開始日': 'actual_start_date',
        '実際の終了日': 'actual_end_date',
        '成果物': 'deliverable',
        '親タスクID': 'parent_task_id'
    };
}

module.exports = {
    exportTasks
};
