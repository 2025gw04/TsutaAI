// 作業ログを扱うサービス (Knex.js対応版)
const db = require('./database');

/** 作業ログ一覧を取得します。 */
async function findWorkLogs(filter = {}) {
  const knex = db.getKnex();

  let query = knex('work_logs')
    .select(
      'log_id as id',
      'user_id',
      'task_id',
      'start_time',
      'end_time',
      'duration_minutes',
      'activity_type',
      'notes'
    );

  if (filter.userId) {
    query = query.where('user_id', filter.userId);
  }
  if (filter.taskId) {
    query = query.where('task_id', filter.taskId);
  }

  return await query.orderBy('start_time', 'desc');
}

/** 作業ログを追加します。 */
async function createWorkLog(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    user_id: payload.user_id,
    task_id: payload.task_id,
    start_time: payload.start_time,
    end_time: payload.end_time,
    duration_minutes: payload.duration_minutes,
    activity_type: payload.activity_type,
    notes: payload.notes
  };

  if (dbClient === 'pg') {
    const [result] = await knex('work_logs').insert(insertData).returning('log_id');
    return { id: result.log_id || result };
  } else {
    const [id] = await knex('work_logs').insert(insertData);
    return { id };
  }
}

/** 作業ログを更新します。 */
async function updateWorkLog(logId, payload) {
  const knex = db.getKnex();

  // まず既存のログが存在するか確認
  const exists = await knex('work_logs').where('log_id', logId).first();

  if (!exists) {
    return null;
  }

  const updateData = {};

  if (payload.start_time !== undefined) {
    updateData.start_time = payload.start_time;
  }
  if (payload.end_time !== undefined) {
    updateData.end_time = payload.end_time;
  }
  if (payload.duration_minutes !== undefined) {
    updateData.duration_minutes = payload.duration_minutes;
  }
  if (payload.activity_type !== undefined) {
    updateData.activity_type = payload.activity_type;
  }
  if (payload.notes !== undefined) {
    updateData.notes = payload.notes;
  }

  if (Object.keys(updateData).length === 0) {
    return { id: logId };
  }

  await knex('work_logs')
    .where('log_id', logId)
    .update(updateData);

  return { id: logId };
}

/** 作業ログを削除します。 */
async function deleteWorkLog(logId) {
  const knex = db.getKnex();

  // まず既存のログが存在するか確認
  const exists = await knex('work_logs').where('log_id', logId).first();

  if (!exists) {
    return null;
  }

  await knex('work_logs').where('log_id', logId).del();

  return { id: logId };
}

module.exports = {
  findWorkLogs,
  createWorkLog,
  updateWorkLog,
  deleteWorkLog
};
