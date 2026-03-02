// タスクインポートサービス (Knex.js対応版)
const db = require('./database');
const taskService = require('./taskService');
const logger = require('../utils/logger');

/**
 * タスクキーでタスクを検索
 * @param {string} taskKey - タスクキー
 * @returns {Object|null} タスク情報
 */
async function findTaskByKey(taskKey) {
  const knex = db.getKnex();

  return await knex('tasks')
    .select('*')
    .where('task_key', taskKey)
    .first();
}

/**
 * プロジェクト内のタスクキーを生成
 * @param {number} projectId - プロジェクトID
 * @returns {string} 新しいタスクキー
 */
async function generateTaskKey(projectId) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let result;

  if (dbClient === 'better-sqlite3') {
    // SQLite uses INSTR
    result = await knex('tasks')
      .select(knex.raw("COALESCE(MAX(CAST(SUBSTR(task_key, INSTR(task_key, '-') + 1) AS INTEGER)), 0) + 1 as next_num"))
      .where('project_id', projectId)
      .where('task_key', 'like', `${projectId}-%`)
      .first();
  } else if (dbClient === 'pg') {
    // PostgreSQL uses POSITION
    result = await knex('tasks')
      .select(knex.raw("COALESCE(MAX(CAST(SUBSTRING(task_key FROM POSITION('-' IN task_key) + 1) AS INTEGER)), 0) + 1 as next_num"))
      .where('project_id', projectId)
      .where('task_key', 'like', `${projectId}-%`)
      .first();
  } else if (dbClient === 'mysql2') {
    // MySQL uses LOCATE
    result = await knex('tasks')
      .select(knex.raw("COALESCE(MAX(CAST(SUBSTRING(task_key, LOCATE('-', task_key) + 1) AS UNSIGNED)), 0) + 1 as next_num"))
      .where('project_id', projectId)
      .where('task_key', 'like', `${projectId}-%`)
      .first();
  } else {
    // SQL Server uses CHARINDEX
    result = await knex('tasks')
      .select(knex.raw("COALESCE(MAX(CAST(SUBSTRING(task_key, CHARINDEX('-', task_key) + 1, LEN(task_key)) AS INT)), 0) + 1 as next_num"))
      .where('project_id', projectId)
      .where('task_key', 'like', `${projectId}-%`)
      .first();
  }

  const nextNum = String(result.next_num).padStart(3, '0');
  return `${projectId}-${nextNum}`;
}

/**
 * CSVファイルをパース
 * @param {string} content - CSV内容
 * @returns {Array} タスク配列
 */
function parseCsv(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSVファイルが空です');
  }

  // ヘッダー行を解析
  const headers = parseCsvLine(lines[0]);
  const tasks = [];

  // データ行を解析（最初の行はプロジェクト情報なのでスキップ）
  for (let i = 2; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const task = {};

    headers.forEach((header, index) => {
      const value = values[index] || '';
      const mapping = getCsvFieldMapping();
      const fieldName = mapping[header];

      if (fieldName && value) {
        task[fieldName] = value;
      }
    });

    if (task.name) {  // タスク名が必須
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * CSV行をパース（カンマ区切り、ダブルクォート対応）
 * @param {string} line - CSV行
 * @returns {Array} 値の配列
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * CSV列名からフィールド名へのマッピング
 * @returns {Object} マッピング
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

/**
 * JSON/Markdown/CSVからタスクをパース
 * @param {string} content - ファイル内容
 * @param {string} fileType - ファイルタイプ
 * @returns {Array} タスク配列
 */
function parseTaskFile(content, fileType) {
  if (fileType === 'json') {
    const data = JSON.parse(content);
    // 階層構造をフラット化
    return flattenTasks(data.tasks || []);
  } else if (fileType === 'csv') {
    return parseCsv(content);
  } else {
    // Markdown/Textは簡易的なパース
    throw new Error('Markdown/Textファイルのインポートはまだサポートされていません。JSON または CSV を使用してください。');
  }
}

/**
 * 階層構造のタスクをフラット化
 * @param {Array} tasks - タスク配列
 * @param {string|null} parentKey - 親タスクキー
 * @returns {Array} フラット化されたタスク配列
 */
function flattenTasks(tasks, parentKey = null) {
  let result = [];

  tasks.forEach(task => {
    const flatTask = { ...task };
    delete flatTask.children;

    if (parentKey) {
      flatTask.parent_task_key = parentKey;
    }

    result.push(flatTask);

    if (task.children && task.children.length > 0) {
      result = result.concat(flattenTasks(task.children, task.task_key));
    }
  });

  return result;
}

/**
 * タスクインポートのプレビューを生成
 * @param {number} projectId - プロジェクトID
 * @param {Array} tasks - インポートするタスク配列
 * @returns {Object} プレビュー情報
 */
async function previewTaskImport(projectId, tasks) {
  const toUpdate = [];
  const toAdd = [];
  const errors = [];

  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index];
    try {
      // 必須フィールドチェック
      if (!task.name || task.name.trim() === '') {
        errors.push({
          row: index + 1,
          task_key: task.task_key || '',
          error: '必須フィールド "タスク名" が欠けています'
        });
        continue;
      }

      // タスクキーがある場合、既存タスクを検索
      if (task.task_key) {
        const existing = await findTaskByKey(task.task_key);

        if (existing) {
          // プロジェクトIDが一致するかチェック
          if (existing.project_id !== projectId) {
            errors.push({
              row: index + 1,
              task_key: task.task_key,
              error: '他のプロジェクトのタスクキーです'
            });
            continue;
          }

          // 更新対象
          toUpdate.push({
            task_key: task.task_key,
            current: existing,
            new: task,
            changes: detectChanges(existing, task)
          });
        } else {
          // 新規追加（キーは指定されているが未存在）
          toAdd.push({ ...task, _isNewWithKey: true });
        }
      } else {
        // 新規追加（キー未指定）
        toAdd.push(task);
      }
    } catch (error) {
      errors.push({
        row: index + 1,
        task_key: task.task_key || '',
        error: error.message
      });
    }
  }

  return {
    toUpdate,
    toAdd,
    errors,
    summary: {
      total: tasks.length,
      toUpdate: toUpdate.length,
      toAdd: toAdd.length,
      errors: errors.length
    }
  };
}

/**
 * タスクの変更内容を検出
 * @param {Object} existing - 既存タスク
 * @param {Object} newTask - 新しいタスク
 * @returns {Array} 変更リスト
 */
function detectChanges(existing, newTask) {
  const changes = [];
  const fieldsToCheck = [
    'name', 'description', 'estimated_hours', 'actual_hours',
    'priority', 'status', 'progress', 'start_date', 'end_date',
    'actual_start_date', 'actual_end_date', 'deliverable'
  ];

  fieldsToCheck.forEach(field => {
    const oldValue = existing[field];
    const newValue = newTask[field];

    // 値が異なる場合
    if (newValue !== undefined && String(oldValue) !== String(newValue)) {
      changes.push({
        field,
        old: oldValue || '',
        new: newValue
      });
    }
  });

  return changes;
}

/**
 * タスクインポートを実行
 * @param {number} projectId - プロジェクトID
 * @param {Array} tasks - インポートするタスク配列
 * @returns {Object} 実行結果
 */
async function executeTaskImport(projectId, tasks) {
  const knex = db.getKnex();

  try {
    let updated = 0;
    let added = 0;
    const failed = [];

    await knex.transaction(async (trx) => {
      for (let index = 0; index < tasks.length; index++) {
        const task = tasks[index];
        try {
          // 必須フィールドチェック
          if (!task.name || task.name.trim() === '') {
            throw new Error('タスク名が必須です');
          }

          // タスクキーがある場合は既存タスクを検索
          if (task.task_key) {
            const existing = await trx('tasks')
              .where('task_key', task.task_key)
              .first();

            if (existing) {
              // プロジェクトIDチェック
              if (existing.project_id !== projectId) {
                throw new Error('他のプロジェクトのタスクキーです');
              }

              // 更新
              await updateTaskInTransaction(trx, existing.id, task);
              updated++;
            } else {
              // 新規追加（キー付き）
              await addTaskInTransaction(trx, projectId, task);
              added++;
            }
          } else {
            // 新規追加（キー自動生成）
            task.task_key = await generateTaskKeyInTransaction(trx, projectId);
            await addTaskInTransaction(trx, projectId, task);
            added++;
          }
        } catch (error) {
          failed.push({
            row: index + 1,
            task_key: task.task_key || '',
            error: error.message
          });
          throw error; // トランザクションをロールバック
        }
      }
    });

    logger.info(`タスクインポート成功: 更新=${updated}, 追加=${added}`);

    return {
      updated,
      added,
      failed: failed.length,
      details: failed
    };
  } catch (error) {
    logger.error(`タスクインポートエラー: ${error.message}`);
    throw error;
  }
}

/**
 * トランザクション内でタスクキーを生成
 * @param {object} trx - Knexトランザクション
 * @param {number} projectId - プロジェクトID
 * @returns {string} 新しいタスクキー
 */
async function generateTaskKeyInTransaction(trx, projectId) {
  const dbClient = db.getDbClient();

  let result;

  if (dbClient === 'better-sqlite3') {
    result = await trx('tasks')
      .select(trx.raw("COALESCE(MAX(CAST(SUBSTR(task_key, INSTR(task_key, '-') + 1) AS INTEGER)), 0) + 1 as next_num"))
      .where('project_id', projectId)
      .where('task_key', 'like', `${projectId}-%`)
      .first();
  } else if (dbClient === 'pg') {
    result = await trx('tasks')
      .select(trx.raw("COALESCE(MAX(CAST(SUBSTRING(task_key FROM POSITION('-' IN task_key) + 1) AS INTEGER)), 0) + 1 as next_num"))
      .where('project_id', projectId)
      .where('task_key', 'like', `${projectId}-%`)
      .first();
  } else if (dbClient === 'mysql2') {
    result = await trx('tasks')
      .select(trx.raw("COALESCE(MAX(CAST(SUBSTRING(task_key, LOCATE('-', task_key) + 1) AS UNSIGNED)), 0) + 1 as next_num"))
      .where('project_id', projectId)
      .where('task_key', 'like', `${projectId}-%`)
      .first();
  } else {
    result = await trx('tasks')
      .select(trx.raw("COALESCE(MAX(CAST(SUBSTRING(task_key, CHARINDEX('-', task_key) + 1, LEN(task_key)) AS INT)), 0) + 1 as next_num"))
      .where('project_id', projectId)
      .where('task_key', 'like', `${projectId}-%`)
      .first();
  }

  const nextNum = String(result.next_num).padStart(3, '0');
  return `${projectId}-${nextNum}`;
}

/**
 * トランザクション内でタスクを更新
 * @param {object} trx - Knexトランザクション
 * @param {number} taskId - タスクID
 * @param {Object} task - タスク情報
 */
async function updateTaskInTransaction(trx, taskId, task) {
  await trx('tasks')
    .where('id', taskId)
    .update({
      name: task.name,
      description: task.description || null,
      estimated_hours: task.estimated_hours || null,
      actual_hours: task.actual_hours || null,
      priority: task.priority || 'medium',
      status: task.status || 'todo',
      progress: task.progress || 0,
      start_date: task.start_date || null,
      end_date: task.end_date || null,
      actual_start_date: task.actual_start_date || null,
      actual_end_date: task.actual_end_date || null,
      deliverable: task.deliverable || '',
      updated_at: trx.fn.now()
    });
}

/**
 * トランザクション内でタスクを追加
 * @param {object} trx - Knexトランザクション
 * @param {number} projectId - プロジェクトID
 * @param {Object} task - タスク情報
 */
async function addTaskInTransaction(trx, projectId, task) {
  await trx('tasks').insert({
    project_id: projectId,
    name: task.name,
    description: task.description || null,
    estimated_hours: task.estimated_hours || null,
    actual_hours: task.actual_hours || null,
    priority: task.priority || 'medium',
    status: task.status || 'todo',
    progress: task.progress || 0,
    start_date: task.start_date || null,
    end_date: task.end_date || null,
    actual_start_date: task.actual_start_date || null,
    actual_end_date: task.actual_end_date || null,
    deliverable: task.deliverable || '',
    task_key: task.task_key
  });
}

module.exports = {
  parseTaskFile,
  previewTaskImport,
  executeTaskImport,
  findTaskByKey,
  generateTaskKey
};
