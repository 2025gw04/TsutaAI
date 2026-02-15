// アクティビティログを扱うサービス (Knex.js対応版)
const db = require('./database');

/**
 * アクティビティスコアを算出
 * マウス・キーボード操作から活動度を計算 (0-100)
 * @param {number} mouseClicks - マウスクリック数
 * @param {number} mouseWheel - マウスホイール操作数
 * @param {number} keyPresses - キー押下数
 * @returns {number} アクティビティスコア (0-100)
 */
function calculateActivityScore(mouseClicks, mouseWheel, keyPresses) {
  // 1時間あたりの標準的な操作回数を基準にスコアを算出
  // 標準値: マウスクリック 300回、ホイール 50回、キー押下 1000回
  const clickScore = Math.min((mouseClicks / 300) * 30, 30);
  const wheelScore = Math.min((mouseWheel / 50) * 10, 10);
  const keyScore = Math.min((keyPresses / 1000) * 60, 60);

  return Math.min(Math.round(clickScore + wheelScore + keyScore), 100);
}

/**
 * アクティビティログを作成
 * @param {Object} payload - アクティビティログデータ
 * @returns {Object} 作成されたログのID
 */
async function createActivityLog(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // アクティビティスコアを算出
  const activityScore = calculateActivityScore(
    payload.mouse_clicks || 0,
    payload.mouse_wheel || 0,
    payload.key_presses || 0
  );

  const insertData = {
    user_id: payload.user_id,
    task_id: payload.task_id || null,
    mouse_clicks: payload.mouse_clicks || 0,
    mouse_wheel: payload.mouse_wheel || 0,
    key_presses: payload.key_presses || 0,
    active_window: payload.active_window || null,
    process_name: payload.process_name || null,
    activity_score: activityScore,
    timestamp: payload.timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ')
  };

  let resultId;
  if (dbClient === 'pg') {
    const [result] = await knex('activity_logs').insert(insertData).returning('id');
    resultId = result.id || result;
  } else {
    const [id] = await knex('activity_logs').insert(insertData);
    resultId = id;
  }

  return { id: resultId, activity_score: activityScore };
}

/**
 * 複数のアクティビティログを一括作成
 * @param {Array} logs - アクティビティログの配列
 */
async function createActivityLogsBatch(logs) {
  const knex = db.getKnex();

  await knex.transaction(async (trx) => {
    for (const log of logs) {
      const activityScore = calculateActivityScore(
        log.mouse_clicks || 0,
        log.mouse_wheel || 0,
        log.key_presses || 0
      );

      await trx('activity_logs').insert({
        user_id: log.user_id,
        task_id: log.task_id || null,
        mouse_clicks: log.mouse_clicks || 0,
        mouse_wheel: log.mouse_wheel || 0,
        key_presses: log.key_presses || 0,
        active_window: log.active_window || null,
        process_name: log.process_name || null,
        activity_score: activityScore,
        timestamp: log.timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ')
      });
    }
  });
}

/**
 * ユーザーのアクティビティログを取得
 * @param {number} userId - ユーザーID
 * @param {Object} options - オプション（hours: 時間、limit: 件数）
 * @returns {Array} アクティビティログ一覧
 */
async function getActivityLogs(userId, options = {}) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();
  const hours = options.hours || 24;
  const limit = options.limit || 100;

  let query = knex('activity_logs')
    .select(
      'id',
      'user_id as userId',
      'task_id as taskId',
      'mouse_clicks as mouseClicks',
      'mouse_wheel as mouseWheel',
      'key_presses as keyPresses',
      'active_window as activeWindow',
      'process_name as processName',
      'activity_score as activityScore',
      'timestamp',
      'created_at as createdAt'
    )
    .where('user_id', userId);

  // Add time filter based on DB type
  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("timestamp >= datetime('now', ?)", [`-${hours} hours`]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw(`timestamp >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'`);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [hours]);
  } else {
    query = query.whereRaw('timestamp >= DATEADD(HOUR, ?, GETDATE())', [-hours]);
  }

  return await query.orderBy('timestamp', 'desc').limit(limit);
}

/**
 * タスク別のアクティビティログを取得
 * @param {number} taskId - タスクID
 * @returns {Array} アクティビティログ一覧
 */
async function getActivityLogsByTask(taskId) {
  const knex = db.getKnex();

  return await knex('activity_logs')
    .select(
      'id',
      'user_id as userId',
      'task_id as taskId',
      'mouse_clicks as mouseClicks',
      'mouse_wheel as mouseWheel',
      'key_presses as keyPresses',
      'active_window as activeWindow',
      'process_name as processName',
      'activity_score as activityScore',
      'timestamp',
      'created_at as createdAt'
    )
    .where('task_id', taskId)
    .orderBy('timestamp', 'desc');
}

/**
 * ユーザーのアクティビティ統計を取得
 * @param {number} userId - ユーザーID
 * @param {number} hours - 対象時間（デフォルト24時間）
 * @returns {Object} 統計情報
 */
async function getUserActivityStats(userId, hours = 24) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('activity_logs')
    .where('user_id', userId)
    .select(
      knex.raw('COUNT(*) as totalLogs'),
      knex.raw('SUM(mouse_clicks) as totalMouseClicks'),
      knex.raw('SUM(mouse_wheel) as totalMouseWheel'),
      knex.raw('SUM(key_presses) as totalKeyPresses'),
      knex.raw('AVG(activity_score) as avgActivityScore'),
      knex.raw('MAX(activity_score) as maxActivityScore'),
      knex.raw('MIN(activity_score) as minActivityScore')
    );

  // Add time filter based on DB type
  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("timestamp >= datetime('now', ?)", [`-${hours} hours`]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw(`timestamp >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'`);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [hours]);
  } else {
    query = query.whereRaw('timestamp >= DATEADD(HOUR, ?, GETDATE())', [-hours]);
  }

  const stats = await query.first();

  return {
    totalLogs: stats.totalLogs || 0,
    totalMouseClicks: stats.totalMouseClicks || 0,
    totalMouseWheel: stats.totalMouseWheel || 0,
    totalKeyPresses: stats.totalKeyPresses || 0,
    avgActivityScore: stats.avgActivityScore ? parseFloat(Number(stats.avgActivityScore).toFixed(2)) : 0,
    maxActivityScore: stats.maxActivityScore || 0,
    minActivityScore: stats.minActivityScore || 0
  };
}

/**
 * ユーザーの時系列アクティビティデータを取得
 * @param {number} userId - ユーザーID
 * @param {number} hours - 対象時間（デフォルト24時間）
 * @returns {Array} 時系列データ
 */
async function getUserActivityTimeSeries(userId, hours = 24) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query;

  if (dbClient === 'better-sqlite3') {
    query = knex('activity_logs')
      .where('user_id', userId)
      .whereRaw("timestamp >= datetime('now', ?)", [`-${hours} hours`])
      .select(
        knex.raw("strftime('%Y-%m-%d %H:00:00', timestamp) as hour"),
        knex.raw('AVG(activity_score) as avgScore'),
        knex.raw('SUM(mouse_clicks) as totalClicks'),
        knex.raw('SUM(key_presses) as totalKeys')
      )
      .groupByRaw("strftime('%Y-%m-%d %H:00:00', timestamp)")
      .orderByRaw("strftime('%Y-%m-%d %H:00:00', timestamp)");
  } else if (dbClient === 'pg') {
    query = knex('activity_logs')
      .where('user_id', userId)
      .whereRaw(`timestamp >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'`)
      .select(
        knex.raw("date_trunc('hour', timestamp) as hour"),
        knex.raw('AVG(activity_score) as "avgScore"'),
        knex.raw('SUM(mouse_clicks) as "totalClicks"'),
        knex.raw('SUM(key_presses) as "totalKeys"')
      )
      .groupByRaw("date_trunc('hour', timestamp)")
      .orderByRaw("date_trunc('hour', timestamp)");
  } else if (dbClient === 'mysql2') {
    query = knex('activity_logs')
      .where('user_id', userId)
      .whereRaw('timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [hours])
      .select(
        knex.raw("DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as hour"),
        knex.raw('AVG(activity_score) as avgScore'),
        knex.raw('SUM(mouse_clicks) as totalClicks'),
        knex.raw('SUM(key_presses) as totalKeys')
      )
      .groupByRaw("DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00')")
      .orderByRaw("DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00')");
  } else {
    query = knex('activity_logs')
      .where('user_id', userId)
      .whereRaw('timestamp >= DATEADD(HOUR, ?, GETDATE())', [-hours])
      .select(
        knex.raw("CONVERT(VARCHAR, timestamp, 120) as hour"),
        knex.raw('AVG(activity_score) as avgScore'),
        knex.raw('SUM(mouse_clicks) as totalClicks'),
        knex.raw('SUM(key_presses) as totalKeys')
      )
      .groupByRaw("CONVERT(VARCHAR, timestamp, 120)")
      .orderByRaw("CONVERT(VARCHAR, timestamp, 120)");
  }

  return await query;
}

/**
 * チーム全体のアクティビティ統計を取得
 * @param {number} hours - 対象時間（デフォルト24時間）
 * @returns {Array} ユーザー別統計
 */
async function getTeamActivityStats(hours = 24) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('users as u')
    .leftJoin('activity_logs as al', function () {
      this.on('u.id', 'al.user_id');
      if (dbClient === 'better-sqlite3') {
        this.andOnRaw("al.timestamp >= datetime('now', ?)", [`-${hours} hours`]);
      } else if (dbClient === 'pg') {
        this.andOnRaw(`al.timestamp >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'`);
      } else if (dbClient === 'mysql2') {
        this.andOnRaw('al.timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [hours]);
      } else {
        this.andOnRaw('al.timestamp >= DATEADD(HOUR, ?, GETDATE())', [-hours]);
      }
    })
    .select(
      'u.id as userId',
      'u.username',
      'u.full_name as fullName',
      knex.raw('COUNT(al.id) as totalLogs'),
      knex.raw('AVG(al.activity_score) as avgActivityScore'),
      knex.raw('SUM(al.mouse_clicks) as totalMouseClicks'),
      knex.raw('SUM(al.key_presses) as totalKeyPresses')
    )
    .groupBy('u.id')
    .orderBy('avgActivityScore', 'desc');

  const stats = await query;

  return stats.map(stat => ({
    userId: stat.userId,
    username: stat.username,
    fullName: stat.fullName,
    totalLogs: stat.totalLogs || 0,
    avgActivityScore: stat.avgActivityScore ? parseFloat(Number(stat.avgActivityScore).toFixed(2)) : 0,
    totalMouseClicks: stat.totalMouseClicks || 0,
    totalKeyPresses: stat.totalKeyPresses || 0
  }));
}

/**
 * 異常なアクティビティパターンを検知
 * @param {number} userId - ユーザーID
 * @returns {Object} 検知結果
 */
async function detectActivityAnomaly(userId) {
  // 過去7日間のデータを取得
  const recentLogs = await getActivityLogs(userId, { hours: 168 });

  if (recentLogs.length === 0) {
    return {
      hasAnomaly: false,
      reason: 'データなし'
    };
  }

  const stats = await getUserActivityStats(userId, 168);

  // 異常パターンの検知ロジック
  const anomalies = [];

  // 1. アクティビティスコアが極端に低い（平均20以下）
  if (stats.avgActivityScore < 20 && recentLogs.length >= 3) {
    anomalies.push('アクティビティスコアが低い（作業が進んでいない可能性）');
  }

  // 2. アクティビティスコアが極端に高い（平均90以上）
  if (stats.avgActivityScore > 90 && recentLogs.length >= 3) {
    anomalies.push('アクティビティスコアが高い（過度な作業負荷の可能性）');
  }

  // 3. アクティビティの変動が激しい（最大と最小の差が50以上）
  if (stats.maxActivityScore - stats.minActivityScore > 50 && recentLogs.length >= 5) {
    anomalies.push('アクティビティの変動が激しい（作業が不安定な可能性）');
  }

  return {
    hasAnomaly: anomalies.length > 0,
    anomalies,
    stats
  };
}

/**
 * アクティビティログを削除（古いデータのクリーンアップ用）
 * @param {number} days - 削除対象の日数（この日数より古いデータを削除）
 * @returns {number} 削除件数
 */
async function deleteOldActivityLogs(days = 90) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('activity_logs');

  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("timestamp < datetime('now', ?)", [`-${days} days`]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw(`timestamp < CURRENT_TIMESTAMP - INTERVAL '${days} days'`);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)', [days]);
  } else {
    query = query.whereRaw('timestamp < DATEADD(DAY, ?, GETDATE())', [-days]);
  }

  const result = await query.del();
  return result;
}

module.exports = {
  calculateActivityScore,
  createActivityLog,
  createActivityLogsBatch,
  getActivityLogs,
  getActivityLogsByTask,
  getUserActivityStats,
  getUserActivityTimeSeries,
  getTeamActivityStats,
  detectActivityAnomaly,
  deleteOldActivityLogs
};
