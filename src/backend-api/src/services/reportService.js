// 日報を扱うサービス (Knex.js対応版)
const db = require('./database');

/** 日報一覧を取得します。 */
async function findDailyReports(filter = {}) {
  const knex = db.getKnex();

  let query = knex('daily_reports as dr')
    .select(
      'dr.report_id as id',
      'dr.user_id',
      'u.full_name as member_name',
      'dr.report_date',
      'dr.summary',
      'dr.satisfaction_level',
      'dr.achievement_rate',
      'dr.focus_level',
      'dr.difficulty_level',
      'dr.learning_level',
      'dr.comment',
      'dr.ai_generated'
    )
    .leftJoin('users as u', 'dr.user_id', 'u.id');

  if (filter.userId) {
    query = query.where('dr.user_id', filter.userId);
  }
  if (filter.date) {
    query = query.where('dr.report_date', filter.date);
  }

  query = query.orderBy('dr.report_date', 'desc');

  return await query;
}

/** 日報を登録します。 */
async function createDailyReport(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    user_id: payload.user_id,
    report_date: payload.report_date,
    summary: payload.summary,
    satisfaction_level: payload.satisfaction_level,
    achievement_rate: payload.achievement_rate,
    focus_level: payload.focus_level,
    difficulty_level: payload.difficulty_level,
    learning_level: payload.learning_level,
    comment: payload.comment,
    ai_generated: payload.ai_generated
  };

  if (dbClient === 'pg') {
    const [result] = await knex('daily_reports').insert(insertData).returning('report_id');
    return { id: result.report_id };
  } else {
    const [id] = await knex('daily_reports').insert(insertData);
    return { id };
  }
}

/** 日報を更新します。 */
async function updateDailyReport(reportId, payload) {
  const knex = db.getKnex();

  // まず既存の日報が存在するか確認
  const exists = await knex('daily_reports')
    .where('report_id', reportId)
    .first();

  if (!exists) {
    return null;
  }

  const updateData = {};

  if (payload.summary !== undefined) {
    updateData.summary = payload.summary;
  }
  if (payload.satisfaction_level !== undefined) {
    updateData.satisfaction_level = payload.satisfaction_level;
  }
  if (payload.achievement_rate !== undefined) {
    updateData.achievement_rate = payload.achievement_rate;
  }
  if (payload.focus_level !== undefined) {
    updateData.focus_level = payload.focus_level;
  }
  if (payload.difficulty_level !== undefined) {
    updateData.difficulty_level = payload.difficulty_level;
  }
  if (payload.learning_level !== undefined) {
    updateData.learning_level = payload.learning_level;
  }
  if (payload.comment !== undefined) {
    updateData.comment = payload.comment;
  }
  if (payload.ai_generated !== undefined) {
    updateData.ai_generated = payload.ai_generated;
  }

  if (Object.keys(updateData).length === 0) {
    return { id: reportId };
  }

  await knex('daily_reports')
    .where('report_id', reportId)
    .update(updateData);

  return { id: reportId };
}

/** 日報を削除します。 */
async function deleteDailyReport(reportId) {
  const knex = db.getKnex();

  // まず既存の日報が存在するか確認
  const exists = await knex('daily_reports')
    .where('report_id', reportId)
    .first();

  if (!exists) {
    return null;
  }

  await knex('daily_reports')
    .where('report_id', reportId)
    .del();

  return { id: reportId };
}

module.exports = {
  findDailyReports,
  createDailyReport,
  updateDailyReport,
  deleteDailyReport
};
