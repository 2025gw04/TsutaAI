// メンタルヘルスログを扱うサービス (Knex.js対応版)
const db = require('./database');
const { getCurrentTimestamp } = require('../utils/dbHelpers');

/**
 * メンタルヘルスログを作成
 * @param {Object} payload - メンタルヘルスログデータ
 * @returns {Object} 作成されたログのID
 */
async function createMentalHealthLog(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const reportDate = payload.report_date || new Date().toISOString().slice(0, 10);

  // 既に同じ日のログが存在するか確認
  const existingLog = await knex('mental_health_logs')
    .select('id')
    .where({
      user_id: payload.user_id,
      report_date: reportDate
    })
    .first();

  if (existingLog) {
    // 存在する場合は更新
    await updateMentalHealthLog(existingLog.id, payload);
    return { id: existingLog.id, updated: true };
  }

  const insertData = {
    user_id: payload.user_id,
    report_date: reportDate,
    mood: payload.mood || null,
    stress_level: payload.stress_level || null,
    has_blocker: payload.has_blocker ? 1 : 0,
    blocker_details: payload.blocker_details || null,
    need_support: payload.need_support ? 1 : 0,
    support_details: payload.support_details || null,
    ai_advice: payload.ai_advice || null
  };

  if (dbClient === 'pg') {
    const [result] = await knex('mental_health_logs').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('mental_health_logs').insert(insertData);
    return { id };
  }
}

/**
 * メンタルヘルスログを更新
 * @param {number} logId - ログID
 * @param {Object} payload - 更新データ
 */
async function updateMentalHealthLog(logId, payload) {
  const knex = db.getKnex();

  const updateData = {};

  if (payload.mood !== undefined) {
    updateData.mood = payload.mood;
  }
  if (payload.stress_level !== undefined) {
    updateData.stress_level = payload.stress_level;
  }
  if (payload.has_blocker !== undefined) {
    updateData.has_blocker = payload.has_blocker ? 1 : 0;
  }
  if (payload.blocker_details !== undefined) {
    updateData.blocker_details = payload.blocker_details;
  }
  if (payload.need_support !== undefined) {
    updateData.need_support = payload.need_support ? 1 : 0;
  }
  if (payload.support_details !== undefined) {
    updateData.support_details = payload.support_details;
  }
  if (payload.ai_advice !== undefined) {
    updateData.ai_advice = payload.ai_advice;
  }
  if (payload.manager_comment !== undefined) {
    updateData.manager_comment = payload.manager_comment;
    updateData.commented_at = getCurrentTimestamp();
  }
  if (payload.manager_id !== undefined) {
    updateData.manager_id = payload.manager_id;
  }

  if (Object.keys(updateData).length > 0) {
    updateData.updated_at = getCurrentTimestamp();
    await knex('mental_health_logs')
      .where('id', logId)
      .update(updateData);
  }
}

/**
 * ユーザーのメンタルヘルスログを取得
 * @param {number} userId - ユーザーID
 * @param {Object} options - オプション（days: 日数）
 * @returns {Array} メンタルヘルスログ一覧
 */
async function getMentalHealthLogs(userId, options = {}) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();
  const days = options.days || 30;

  let query = knex('mental_health_logs as mhl')
    .leftJoin('users as m', 'mhl.manager_id', 'm.id')
    .select(
      'mhl.id',
      'mhl.user_id as userId',
      'mhl.report_date as reportDate',
      'mhl.mood',
      'mhl.stress_level as stressLevel',
      'mhl.has_blocker as hasBlocker',
      'mhl.blocker_details as blockerDetails',
      'mhl.need_support as needSupport',
      'mhl.support_details as supportDetails',
      'mhl.ai_advice as aiAdvice',
      'mhl.manager_comment as managerComment',
      'mhl.manager_id as managerId',
      'm.full_name as managerName',
      'mhl.commented_at as commentedAt',
      'mhl.created_at as createdAt',
      'mhl.updated_at as updatedAt'
    )
    .where('mhl.user_id', userId);

  // DB別の日付計算
  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("mhl.report_date >= date('now', '-' || ? || ' days')", [days]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw("mhl.report_date >= CURRENT_DATE - INTERVAL '? days'", [days]);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('mhl.report_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days]);
  } else {
    query = query.whereRaw('mhl.report_date >= DATEADD(DAY, -?, GETDATE())', [days]);
  }

  return await query.orderBy('mhl.report_date', 'desc');
}

/**
 * 特定の日付のメンタルヘルスログを取得
 * @param {number} userId - ユーザーID
 * @param {string} reportDate - 日付（YYYY-MM-DD）
 * @returns {Object|null} メンタルヘルスログ
 */
async function getMentalHealthLogByDate(userId, reportDate) {
  const knex = db.getKnex();

  return await knex('mental_health_logs as mhl')
    .leftJoin('users as m', 'mhl.manager_id', 'm.id')
    .select(
      'mhl.id',
      'mhl.user_id as userId',
      'mhl.report_date as reportDate',
      'mhl.mood',
      'mhl.stress_level as stressLevel',
      'mhl.has_blocker as hasBlocker',
      'mhl.blocker_details as blockerDetails',
      'mhl.need_support as needSupport',
      'mhl.support_details as supportDetails',
      'mhl.ai_advice as aiAdvice',
      'mhl.manager_comment as managerComment',
      'mhl.manager_id as managerId',
      'm.full_name as managerName',
      'mhl.commented_at as commentedAt',
      'mhl.created_at as createdAt',
      'mhl.updated_at as updatedAt'
    )
    .where('mhl.user_id', userId)
    .andWhere('mhl.report_date', reportDate)
    .first();
}

/**
 * チーム全体のメンタルヘルスサマリーを取得
 * @param {number} days - 対象日数（デフォルト7日間）
 * @returns {Object} チームサマリー
 */
async function getTeamMentalHealthSummary(days = 7) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // 全ユーザーの最近のメンタルヘルス状況を取得
  // Create raw condition for date filtering in join
  let mhlDateCondition;
  if (dbClient === 'better-sqlite3') {
    mhlDateCondition = knex.raw("mhl.report_date >= date('now', '-' || ? || ' days')", [days]);
  } else if (dbClient === 'pg') {
    mhlDateCondition = knex.raw("mhl.report_date >= CURRENT_DATE - INTERVAL '" + days + " days'");
  } else if (dbClient === 'mysql2') {
    mhlDateCondition = knex.raw('mhl.report_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days]);
  } else {
    mhlDateCondition = knex.raw('mhl.report_date >= DATEADD(DAY, -?, GETDATE())', [days]);
  }

  let query = knex('users as u')
    .leftJoin('mental_health_logs as mhl', function () {
      this.on('u.id', '=', 'mhl.user_id').andOn(mhlDateCondition);
    })
    .select(
      'u.id as userId',
      'u.username',
      'u.full_name as fullName'
    )
    .avg('mhl.mood as avgMood')
    .avg('mhl.stress_level as avgStress')
    .sum('mhl.has_blocker as totalBlockers')
    .sum('mhl.need_support as totalSupportNeeds')
    .count('mhl.id as totalLogs')
    .max('mhl.report_date as lastReportDate')
    .where('u.role', '!=', 'admin')
    .groupBy('u.id', 'u.username', 'u.full_name');

  // SQLiteとPostgreSQLで NULLS LAST の扱いが異なる
  if (dbClient === 'pg') {
    query = query.orderByRaw('avgStress DESC NULLS LAST, totalSupportNeeds DESC');
  } else {
    query = query.orderBy([
      { column: 'avgStress', order: 'desc' },
      { column: 'totalSupportNeeds', order: 'desc' }
    ]);
  }

  const userSummaries = await query;

  // サポートが必要なユーザーを抽出
  const needSupportUsers = userSummaries.filter(u =>
    u.totalSupportNeeds > 0 ||
    (u.avgStress && u.avgStress >= 4) ||
    (u.avgMood && u.avgMood <= 2)
  );

  // ブロッカーがあるユーザーを抽出
  const blockerUsers = userSummaries.filter(u => u.totalBlockers > 0);

  // チーム全体の平均値を計算
  const validMoodUsers = userSummaries.filter(u => u.avgMood != null);
  const validStressUsers = userSummaries.filter(u => u.avgStress != null);

  const teamAvgMood = validMoodUsers.length > 0
    ? validMoodUsers.reduce((sum, u) => sum + u.avgMood, 0) / validMoodUsers.length
    : null;

  const teamAvgStress = validStressUsers.length > 0
    ? validStressUsers.reduce((sum, u) => sum + u.avgStress, 0) / validStressUsers.length
    : null;

  return {
    period: {
      days,
      startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10)
    },
    teamAverages: {
      mood: teamAvgMood ? parseFloat(teamAvgMood.toFixed(2)) : null,
      stress: teamAvgStress ? parseFloat(teamAvgStress.toFixed(2)) : null
    },
    alerts: {
      needSupportCount: needSupportUsers.length,
      blockerCount: blockerUsers.length,
      needSupportUsers: needSupportUsers.map(u => ({
        userId: u.userId,
        username: u.username,
        fullName: u.fullName,
        avgMood: u.avgMood ? parseFloat(u.avgMood.toFixed(2)) : null,
        avgStress: u.avgStress ? parseFloat(u.avgStress.toFixed(2)) : null,
        supportNeeds: u.totalSupportNeeds,
        lastReportDate: u.lastReportDate
      })),
      blockerUsers: blockerUsers.map(u => ({
        userId: u.userId,
        username: u.username,
        fullName: u.fullName,
        blockers: u.totalBlockers,
        lastReportDate: u.lastReportDate
      }))
    },
    userSummaries: userSummaries.map(u => ({
      userId: u.userId,
      username: u.username,
      fullName: u.fullName,
      avgMood: u.avgMood ? parseFloat(u.avgMood.toFixed(2)) : null,
      avgStress: u.avgStress ? parseFloat(u.avgStress.toFixed(2)) : null,
      totalBlockers: u.totalBlockers,
      totalSupportNeeds: u.totalSupportNeeds,
      totalLogs: u.totalLogs,
      lastReportDate: u.lastReportDate
    }))
  };
}

/**
 * サポートが必要なユーザー一覧を取得
 * @param {number} days - 対象日数
 * @returns {Array} サポートが必要なユーザー一覧
 */
async function getUsersNeedingSupport(days = 7) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('mental_health_logs as mhl')
    .join('users as u', 'mhl.user_id', 'u.id')
    .select(
      'u.id as userId',
      'u.username',
      'u.full_name as fullName',
      'u.email',
      'mhl.report_date as reportDate',
      'mhl.mood',
      'mhl.stress_level as stressLevel',
      'mhl.blocker_details as blockerDetails',
      'mhl.support_details as supportDetails',
      'mhl.manager_comment as managerComment',
      'mhl.manager_id as managerId',
      'mhl.updated_at as updatedAt'
    )
    .where('mhl.need_support', 1);

  // DB別の日付計算
  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("mhl.report_date >= date('now', '-' || ? || ' days')", [days]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw("mhl.report_date >= CURRENT_DATE - INTERVAL '? days'", [days]);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('mhl.report_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days]);
  } else {
    query = query.whereRaw('mhl.report_date >= DATEADD(DAY, -?, GETDATE())', [days]);
  }

  return await query.orderBy('mhl.report_date', 'desc');
}

/**
 * メンタルヘルストレンド分析
 * @param {number} userId - ユーザーID
 * @param {number} weeks - 対象週数（デフォルト4週間）
 * @returns {Object} トレンド分析結果
 */
async function analyzeMentalHealthTrend(userId, weeks = 4) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query;
  if (dbClient === 'better-sqlite3') {
    query = knex('mental_health_logs')
      .select(knex.raw("strftime('%Y-W%W', report_date) AS week"))
      .avg('mood as avgMood')
      .avg('stress_level as avgStress')
      .sum('has_blocker as totalBlockers')
      .sum('need_support as totalSupportNeeds')
      .count('* as logCount')
      .where('user_id', userId)
      .whereRaw("report_date >= date('now', '-' || ? || ' weeks')", [weeks])
      .groupByRaw("strftime('%Y-W%W', report_date)")
      .orderBy('week', 'asc');
  } else if (dbClient === 'pg') {
    query = knex('mental_health_logs')
      .select(knex.raw("to_char(report_date, 'IYYY-\"W\"IW') AS week"))
      .avg('mood as avgMood')
      .avg('stress_level as avgStress')
      .sum('has_blocker as totalBlockers')
      .sum('need_support as totalSupportNeeds')
      .count('* as logCount')
      .where('user_id', userId)
      .whereRaw("report_date >= CURRENT_DATE - INTERVAL '? weeks'", [weeks])
      .groupByRaw("to_char(report_date, 'IYYY-\"W\"IW')")
      .orderBy('week', 'asc');
  } else if (dbClient === 'mysql2') {
    query = knex('mental_health_logs')
      .select(knex.raw("DATE_FORMAT(report_date, '%Y-W%U') AS week"))
      .avg('mood as avgMood')
      .avg('stress_level as avgStress')
      .sum('has_blocker as totalBlockers')
      .sum('need_support as totalSupportNeeds')
      .count('* as logCount')
      .where('user_id', userId)
      .whereRaw('report_date >= DATE_SUB(CURDATE(), INTERVAL ? WEEK)', [weeks])
      .groupByRaw("DATE_FORMAT(report_date, '%Y-W%U')")
      .orderBy('week', 'asc');
  } else {
    query = knex('mental_health_logs')
      .select(knex.raw("FORMAT(report_date, 'yyyy-\"W\"ww') AS week"))
      .avg('mood as avgMood')
      .avg('stress_level as avgStress')
      .sum('has_blocker as totalBlockers')
      .sum('need_support as totalSupportNeeds')
      .count('* as logCount')
      .where('user_id', userId)
      .whereRaw('report_date >= DATEADD(WEEK, -?, GETDATE())', [weeks])
      .groupByRaw("FORMAT(report_date, 'yyyy-\"W\"ww')")
      .orderBy('week', 'asc');
  }

  const weeklyData = await query;

  // トレンド判定（最新週と前週を比較）
  let trend = 'stable';
  if (weeklyData.length >= 2) {
    const latest = weeklyData[weeklyData.length - 1];
    const previous = weeklyData[weeklyData.length - 2];

    if (latest.avgStress && previous.avgStress) {
      const stressDiff = latest.avgStress - previous.avgStress;
      if (stressDiff >= 1) {
        trend = 'worsening';
      } else if (stressDiff <= -1) {
        trend = 'improving';
      }
    }
  }

  return {
    userId,
    weeks,
    trend,
    weeklyData: weeklyData.map(w => ({
      week: w.week,
      avgMood: w.avgMood ? parseFloat(w.avgMood.toFixed(2)) : null,
      avgStress: w.avgStress ? parseFloat(w.avgStress.toFixed(2)) : null,
      totalBlockers: w.totalBlockers,
      totalSupportNeeds: w.totalSupportNeeds,
      logCount: w.logCount
    }))
  };
}

/**
 * メンタルヘルスログを削除（古いデータのクリーンアップ用）
 * @param {number} days - 削除対象の日数（この日数より古いデータを削除）
 * @returns {number} 削除件数
 */
async function deleteOldMentalHealthLogs(days = 365) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let result;
  if (dbClient === 'better-sqlite3') {
    result = await knex('mental_health_logs')
      .whereRaw("report_date < date('now', '-' || ? || ' days')", [days])
      .del();
  } else if (dbClient === 'pg') {
    result = await knex('mental_health_logs')
      .whereRaw("report_date < CURRENT_DATE - INTERVAL '? days'", [days])
      .del();
  } else if (dbClient === 'mysql2') {
    result = await knex('mental_health_logs')
      .whereRaw('report_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days])
      .del();
  } else {
    result = await knex('mental_health_logs')
      .whereRaw('report_date < DATEADD(DAY, -?, GETDATE())', [days])
      .del();
  }

  return result;
}

module.exports = {
  createMentalHealthLog,
  updateMentalHealthLog,
  getMentalHealthLogs,
  getMentalHealthLogByDate,
  getTeamMentalHealthSummary,
  getUsersNeedingSupport,
  analyzeMentalHealthTrend,
  deleteOldMentalHealthLogs
};
