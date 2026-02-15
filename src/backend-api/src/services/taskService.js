// タスク情報を扱うサービス (Knex.js対応版)
const db = require('./database');
const { getCurrentTimestamp } = require('../utils/dbHelpers');
const { applyPagination, applySearch } = require('../utils/pagination');

/** 条件付きでタスク一覧を取得します（ページネーション対応）。 */
async function findTasks(filter = {}) {
  const knex = db.getKnex();

  // ベースクエリを構築
  let baseQuery = knex('tasks as t')
    .leftJoin('projects as p', 't.project_id', 'p.id')
    .leftJoin('users as u', 't.assigned_to', 'u.id');

  // フィルタ条件を適用
  if (filter.projectId) {
    baseQuery = baseQuery.where('t.project_id', filter.projectId);
  }
  if (filter.assignedTo) {
    baseQuery = baseQuery.where('t.assigned_to', filter.assignedTo);
  }
  if (filter.status) {
    if (Array.isArray(filter.status)) {
      baseQuery = baseQuery.whereIn('t.status', filter.status);
    } else {
      baseQuery = baseQuery.where('t.status', filter.status);
    }
  }
  if (filter.priority) {
    baseQuery = baseQuery.where('t.priority', filter.priority);
  }

  // 検索キーワード
  if (filter.search) {
    baseQuery = applySearch(baseQuery, filter.search, ['t.name', 't.description']);
  }

  // 総件数を取得（ページネーション用）
  const countQuery = baseQuery.clone().count('t.id as count');
  const [{ count }] = await countQuery;
  const total = parseInt(count) || 0;

  // データクエリ
  let dataQuery = baseQuery.select(
    't.id',
    't.project_id as projectId',
    'p.name as projectName',
    't.name',
    't.description',
    't.assigned_to as assignedTo',
    'u.full_name as assigneeName',
    't.estimated_hours as estimatedHours',
    't.actual_hours as actualHours',
    't.priority',
    't.status',
    't.progress',
    't.due_date as dueDate',
    't.start_date as startDate',
    't.end_date as endDate',
    't.actual_start_date as actualStartDate',
    't.actual_end_date as actualEndDate',
    't.deliverable',
    't.parent_task_id as parentTaskId',
    't.sort_order as sortOrder',
    't.dependencies',
    't.task_key as taskKey',
    't.story_points as storyPoints'
  );

  // ソート順序（カスタムソートまたはデフォルト）
  if (filter.sortBy) {
    const sortField = filter.sortBy.startsWith('-') ? filter.sortBy.substring(1) : filter.sortBy;
    const sortDirection = filter.sortBy.startsWith('-') ? 'desc' : 'asc';
    dataQuery = dataQuery.orderBy(`t.${sortField}`, sortDirection);
  } else {
    // デフォルトのソート順序
    dataQuery = dataQuery
      .orderBy('t.sort_order', 'asc')
      .orderByRaw('t.due_date IS NULL')
      .orderBy('t.due_date', 'asc');
  }

  // ページネーション適用
  if (filter.pagination) {
    const { limit, offset } = filter.pagination;
    dataQuery = applyPagination(dataQuery, { limit, offset });
  }

  const data = await dataQuery;

  return { data, total };
}

/** ID指定でタスクを取得します。 */
async function findTaskById(taskId) {
  const knex = db.getKnex();

  return await knex('tasks as t')
    .leftJoin('projects as p', 't.project_id', 'p.id')
    .leftJoin('users as u', 't.assigned_to', 'u.id')
    .select(
      't.id',
      't.project_id as projectId',
      'p.name as projectName',
      't.name',
      't.description',
      't.assigned_to as assignedTo',
      'u.full_name as assigneeName',
      't.estimated_hours as estimatedHours',
      't.actual_hours as actualHours',
      't.priority',
      't.status',
      't.progress',
      't.due_date as dueDate',
      't.start_date as startDate',
      't.end_date as endDate',
      't.actual_start_date as actualStartDate',
      't.actual_end_date as actualEndDate',
      't.deliverable',
      't.parent_task_id as parentTaskId',
      't.sort_order as sortOrder',
      't.dependencies',
      't.task_key as taskKey',
      't.story_points as storyPoints'
    )
    .where('t.id', taskId)
    .first();
}

/** 新しいタスクを登録します。 */
async function createTask(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    project_id: payload.project_id,
    name: payload.name,
    description: payload.description,
    assigned_to: payload.assigned_to,
    estimated_hours: payload.estimated_hours,
    priority: payload.priority,
    status: payload.status || 'todo', // デフォルト値を確実に設定
    progress: payload.progress,
    due_date: payload.due_date,
    start_date: payload.start_date,
    end_date: payload.end_date,
    actual_start_date: payload.actual_start_date,
    actual_end_date: payload.actual_end_date,
    deliverable: payload.deliverable,
    parent_task_id: payload.parent_task_id,
    sort_order: payload.sort_order,
    dependencies: payload.dependencies
  };

  if (dbClient === 'pg') {
    const [result] = await knex('tasks').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('tasks').insert(insertData);
    return { id };
  }
}

/** タスク内容を更新します。 */
async function updateTask(taskId, payload) {
  const knex = db.getKnex();
  const growthTrackingService = require('./growthTrackingService');

  // ステータスが変更された場合、実績日を自動設定
  if (payload.status) {
    const currentTask = await findTaskById(taskId);
    if (currentTask) {
      // in_progressに変更され、actual_start_dateが未設定の場合
      if (payload.status === 'in_progress' && !currentTask.actualStartDate && !payload.actual_start_date) {
        payload.actual_start_date = new Date().toISOString().split('T')[0];
      }

      // completedに変更され、actual_end_dateが未設定の場合
      if (payload.status === 'completed' && !currentTask.actualEndDate && !payload.actual_end_date) {
        payload.actual_end_date = new Date().toISOString().split('T')[0];
      }
    }
  }

  // ペイロードに存在するキーのみを更新対象とする
  const fieldsToUpdate = Object.keys(payload).filter(key => payload[key] !== undefined);
  if (fieldsToUpdate.length === 0) {
    return; // 更新するフィールドがない場合は何もしない
  }

  // 更新データを構築
  const updateData = {};
  for (const field of fieldsToUpdate) {
    updateData[field] = payload[field];
  }
  updateData.updated_at = getCurrentTimestamp();

  await knex('tasks')
    .where('id', taskId)
    .update(updateData);

  // タスクが完了した場合、担当者のパフォーマンスメトリクスを再計算（成長トラッキング連携）
  if (payload.status === 'completed') {
    const updatedTask = await findTaskById(taskId);
    if (updatedTask && updatedTask.assignedTo) {
      try {
        // 完了した月のメトリクスを計算
        const completedMonth = (payload.actual_end_date || new Date().toISOString()).slice(0, 7);
        await growthTrackingService.calculateAndSaveMonthlyMetrics(updatedTask.assignedTo, completedMonth);
      } catch (error) {
        // 成長トラッキング機能がまだ有効でない場合は無視
        console.warn('Growth tracking metrics calculation failed:', error.message);
      }
    }
  }
}

/** タスクを削除します。 */
async function deleteTask(taskId) {
  const knex = db.getKnex();
  await knex('tasks').where('id', taskId).del();
}

/** プロジェクトの全タスクを削除します。 */
async function deleteAllTasksByProject(projectId) {
  const knex = db.getKnex();

  return await knex.transaction(async (trx) => {
    // 1. プロジェクトのタスクIDを取得
    const taskIds = await trx('tasks').where('project_id', projectId).pluck('id');

    if (taskIds.length === 0) {
      return 0; // 削除するタスクがない場合
    }

    // 2. 関連するwork_logsを削除（CASCADE設定がないため手動で削除）
    await trx('work_logs').whereIn('task_id', taskIds).del();

    // 3. タスクを削除（コメント、添付ファイル、アクティビティログは自動的にCASCADEで削除される）
    const deletedCount = await trx('tasks').where('project_id', projectId).del();

    return deletedCount;
  });
}

/** タスクにコメントを追加します */
async function addComment(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    task_id: payload.task_id,
    user_id: payload.user_id,
    content: payload.content
  };

  let commentId;
  if (dbClient === 'pg') {
    const [result] = await knex('task_comments').insert(insertData).returning('id');
    commentId = result.id || result;
  } else {
    const [id] = await knex('task_comments').insert(insertData);
    commentId = id;
  }

  // アクティビティログに記録
  await logActivity({
    task_id: payload.task_id,
    user_id: payload.user_id,
    action_type: 'commented',
    old_value: null,
    new_value: null,
    description: 'コメントを追加しました'
  });

  return { id: commentId };
}

/** タスクのコメント一覧を取得します */
async function getComments(taskId) {
  const knex = db.getKnex();

  return await knex('task_comments as c')
    .leftJoin('users as u', 'c.user_id', 'u.id')
    .select(
      'c.id',
      'c.task_id as taskId',
      'c.user_id as userId',
      'c.content',
      'c.created_at as createdAt',
      'c.updated_at as updatedAt',
      'u.full_name as userName'
    )
    .where('c.task_id', taskId)
    .orderBy('c.created_at', 'desc');
}

/** コメントを削除します */
async function deleteComment(commentId) {
  const knex = db.getKnex();
  await knex('task_comments').where('id', commentId).del();
}

/** タスクに添付ファイルを追加します */
async function addAttachment(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    task_id: payload.task_id,
    uploaded_by: payload.uploaded_by,
    file_name: payload.file_name,
    file_path: payload.file_path,
    file_size: payload.file_size,
    file_type: payload.file_type
  };

  let attachmentId;
  if (dbClient === 'pg') {
    const [result] = await knex('task_attachments').insert(insertData).returning('id');
    attachmentId = result.id || result;
  } else {
    const [id] = await knex('task_attachments').insert(insertData);
    attachmentId = id;
  }

  // アクティビティログに記録
  await logActivity({
    task_id: payload.task_id,
    user_id: payload.uploaded_by,
    action_type: 'attached_file',
    old_value: null,
    new_value: null,
    description: `ファイルを添付: ${payload.file_name}`
  });

  return { id: attachmentId };
}

/** タスクの添付ファイル一覧を取得します */
async function getAttachments(taskId) {
  const knex = db.getKnex();

  return await knex('task_attachments as a')
    .leftJoin('users as u', 'a.uploaded_by', 'u.id')
    .select(
      'a.id',
      'a.task_id as taskId',
      'a.uploaded_by as uploadedBy',
      'a.file_name as fileName',
      'a.file_path as filePath',
      'a.file_size as fileSize',
      'a.file_type as fileType',
      'a.created_at as createdAt',
      'u.full_name as uploaderName'
    )
    .where('a.task_id', taskId)
    .orderBy('a.created_at', 'desc');
}

/** ID指定で添付ファイルを取得します */
async function getAttachmentById(attachmentId) {
  const knex = db.getKnex();

  return await knex('task_attachments')
    .select(
      'id',
      'task_id',
      'uploaded_by',
      'file_name',
      'file_path',
      'file_size',
      'file_type',
      'created_at'
    )
    .where('id', attachmentId)
    .first();
}

/** タスクのアクティビティログを記録します */
async function logActivity(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    task_id: payload.task_id,
    user_id: payload.user_id,
    action_type: payload.action_type,
    old_value: payload.old_value,
    new_value: payload.new_value,
    description: payload.description
  };

  if (dbClient === 'pg') {
    const [result] = await knex('task_activity_log').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('task_activity_log').insert(insertData);
    return { id };
  }
}

/** タスクのアクティビティログを取得します */
async function getActivityLog(taskId) {
  const knex = db.getKnex();

  return await knex('task_activity_log as l')
    .leftJoin('users as u', 'l.user_id', 'u.id')
    .select(
      'l.id',
      'l.task_id as taskId',
      'l.user_id as userId',
      'l.action_type as actionType',
      'l.old_value as oldValue',
      'l.new_value as newValue',
      'l.description',
      'l.created_at as createdAt',
      'u.full_name as userName'
    )
    .where('l.task_id', taskId)
    .orderBy('l.created_at', 'desc');
}

/**
 * タスクの進捗と実績時間を更新します。
 * 作業セッションから呼び出されます。
 * @param {number} taskId - タスクID
 * @param {number} additionalSeconds - 追加された作業時間(秒)
 * @param {number} progressPercentage - 新しい進捗率(0-100)
 */
async function updateProgressAndHours(taskId, additionalSeconds, progressPercentage) {
  const knex = db.getKnex();

  // 現在のタスクを取得
  const task = await knex('tasks').where('id', taskId).first();
  if (!task) return;

  // 実績時間を加算 (秒 -> 時間)
  const additionalSecondsVal = additionalSeconds || 0;
  const additionalHours = additionalSecondsVal / 3600;
  const newActualHours = (task.actual_hours || 0) + additionalHours;

  const updateData = {
    actual_hours: newActualHours,
    updated_at: getCurrentTimestamp()
  };

  // 進捗率の更新
  if (progressPercentage !== undefined && progressPercentage !== null) {
    updateData.progress = progressPercentage;

    // ステータスの自動更新
    if (progressPercentage >= 100 && task.status !== 'completed') {
      updateData.status = 'completed';
      if (!task.actual_end_date) {
        updateData.actual_end_date = new Date().toISOString().split('T')[0];
      }
    } else if (progressPercentage > 0 && progressPercentage < 100 && task.status === 'todo') {
      updateData.status = 'in_progress';
      if (!task.actual_start_date) {
        updateData.actual_start_date = new Date().toISOString().split('T')[0];
      }
    }
  }

  await knex('tasks').where('id', taskId).update(updateData);

  // バーンダウンデータを更新（プロジェクト進捗の反映）
  try {
    const projectDashboardService = require('./projectDashboardService');
    await projectDashboardService.recordBurndownData(task.project_id);
  } catch (error) {
    console.error('Failed to update burndown data:', error.message);
  }
}

module.exports = {
  findTasks,
  findTaskById,
  createTask,
  updateTask,
  deleteTask,
  deleteAllTasksByProject,
  addComment,
  getComments,
  deleteComment,
  addAttachment,
  getAttachments,
  getAttachmentById,
  logActivity,
  getActivityLog,
  updateProgressAndHours
};
