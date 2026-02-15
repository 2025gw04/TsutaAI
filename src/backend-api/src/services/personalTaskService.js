// 個人タスク情報を扱うサービス (Knex.js対応版)
const db = require('./database');

/** 個人タスク一覧を取得します */
async function findPersonalTasks(filter = {}) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('personal_tasks')
    .select(
      'id',
      'task_id as taskId',
      'user_id as userId',
      'title',
      'description',
      'notes',
      'report_notes as reportNotes',
      'priority',
      'status',
      'progress',
      'estimated_minutes as estimatedMinutes',
      'actual_minutes as actualMinutes',
      'start_date as startDate',
      'due_date as dueDate',
      'completed_at as completedAt',
      'created_at as createdAt',
      'updated_at as updatedAt'
    );

  if (filter.userId) {
    query = query.where('user_id', filter.userId);
  }

  if (filter.status) {
    query = query.where('status', filter.status);
  }

  // Order by due_date IS NULL, due_date ASC, created_at DESC
  if (dbClient === 'better-sqlite3' || dbClient === 'mysql2') {
    query = query.orderByRaw('due_date IS NULL, due_date ASC, created_at DESC');
  } else if (dbClient === 'pg') {
    query = query.orderByRaw('due_date IS NULL, due_date ASC, created_at DESC');
  } else {
    query = query.orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, created_at DESC');
  }

  return await query;
}

/** ID指定で個人タスクを取得します */
async function findPersonalTaskById(taskId) {
  const knex = db.getKnex();

  return await knex('personal_tasks')
    .select(
      'id',
      'task_id as taskId',
      'user_id as userId',
      'title',
      'description',
      'notes',
      'report_notes as reportNotes',
      'priority',
      'status',
      'progress',
      'estimated_minutes as estimatedMinutes',
      'actual_minutes as actualMinutes',
      'start_date as startDate',
      'due_date as dueDate',
      'completed_at as completedAt',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .where('id', taskId)
    .first();
}

/** 新しい個人タスクを登録します */
async function createPersonalTask(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // task_idを生成（自動採番）
  const maxTaskIdResult = await knex('personal_tasks')
    .max('task_id as max_id')
    .first();
  const nextTaskId = (maxTaskIdResult?.max_id || 0) + 1;

  const insertData = {
    task_id: nextTaskId,
    user_id: payload.user_id || payload.userId,
    title: payload.title,
    description: payload.description || '',
    notes: payload.notes || '',
    report_notes: payload.report_notes || payload.reportNotes || '',
    priority: payload.priority || 'Medium',
    status: payload.status || 'not-started',
    progress: payload.progress || 0,
    estimated_minutes: payload.estimated_minutes || payload.estimatedMinutes || 0,
    actual_minutes: payload.actual_minutes || payload.actualMinutes || 0,
    start_date: payload.start_date || payload.startDate || '',
    due_date: payload.due_date || payload.dueDate || '',
    completed_at: payload.completed_at || payload.completedAt || ''
  };

  let resultId;
  if (dbClient === 'pg') {
    const [result] = await knex('personal_tasks').insert(insertData).returning('id');
    resultId = result.id || result;
  } else {
    const [id] = await knex('personal_tasks').insert(insertData);
    resultId = id;
  }

  return { id: resultId, taskId: nextTaskId };
}

/** 個人タスク内容を更新します */
async function updatePersonalTask(taskId, payload) {
  const knex = db.getKnex();

  // Build update data with only provided fields
  const updateData = {};

  if (payload.title !== undefined) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.notes !== undefined) updateData.notes = payload.notes;
  if (payload.report_notes !== undefined || payload.reportNotes !== undefined) {
    updateData.report_notes = payload.report_notes || payload.reportNotes;
  }
  if (payload.priority !== undefined) updateData.priority = payload.priority;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.progress !== undefined) updateData.progress = payload.progress;
  if (payload.estimated_minutes !== undefined || payload.estimatedMinutes !== undefined) {
    updateData.estimated_minutes = payload.estimated_minutes || payload.estimatedMinutes;
  }
  if (payload.actual_minutes !== undefined || payload.actualMinutes !== undefined) {
    updateData.actual_minutes = payload.actual_minutes || payload.actualMinutes;
  }
  if (payload.start_date !== undefined || payload.startDate !== undefined) {
    updateData.start_date = payload.start_date || payload.startDate;
  }
  if (payload.due_date !== undefined || payload.dueDate !== undefined) {
    updateData.due_date = payload.due_date || payload.dueDate;
  }
  if (payload.completed_at !== undefined || payload.completedAt !== undefined) {
    updateData.completed_at = payload.completed_at || payload.completedAt;
  }

  updateData.updated_at = knex.fn.now();

  await knex('personal_tasks')
    .where('id', taskId)
    .update(updateData);

  return true;
}

/** 個人タスクを削除します */
async function deletePersonalTask(taskId) {
  const knex = db.getKnex();

  await knex('personal_tasks')
    .where('id', taskId)
    .del();

  return true;
}

module.exports = {
  findPersonalTasks,
  findPersonalTaskById,
  createPersonalTask,
  updatePersonalTask,
  deletePersonalTask
};
