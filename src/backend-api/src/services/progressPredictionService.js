// 進捗予測を扱うサービス (Knex.js対応版)
const db = require('./database');
const activityLogService = require('./activityLogService');

/**
 * タスクの進捗予測を計算して保存
 * @param {number} taskId - タスクID
 * @param {number} userId - ユーザーID
 * @returns {Object} 予測結果
 */
async function calculateAndSaveProgressPrediction(taskId, userId) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // タスク情報を取得
  const task = await knex('tasks')
    .select('id', 'name', 'progress', 'estimated_hours', 'actual_hours',
            'due_date', 'start_date', 'status', 'assigned_to')
    .where('id', taskId)
    .first();

  if (!task) {
    throw new Error(`タスクID ${taskId} が見つかりません`);
  }

  // アクティビティログから作業統計を取得
  const activityStats = await activityLogService.getActivityLogsByTask(taskId);
  const userActivityStats = await activityLogService.getUserActivityStats(userId || task.assigned_to, 24 * 7); // 過去7日間

  // 進捗予測を計算
  const prediction = calculatePrediction(task, activityStats, userActivityStats);

  // データベースに保存
  const insertData = {
    task_id: taskId,
    user_id: userId || task.assigned_to,
    current_progress: prediction.currentProgress,
    predicted_completion_date: prediction.predictedCompletionDate,
    completion_probability: prediction.completionProbability,
    risk_level: prediction.riskLevel,
    avg_activity_score: prediction.avgActivityScore,
    total_work_hours: prediction.totalWorkHours,
    daily_progress_rate: prediction.dailyProgressRate,
    ai_suggestion: null,
    bottleneck_analysis: null,
    resource_recommendation: null,
    confidence_score: prediction.confidenceScore,
    is_on_track: prediction.isOnTrack ? 1 : 0
  };

  let resultId;
  if (dbClient === 'pg') {
    const [result] = await knex('progress_predictions').insert(insertData).returning('id');
    resultId = result.id || result;
  } else {
    const [id] = await knex('progress_predictions').insert(insertData);
    resultId = id;
  }

  return {
    id: resultId,
    ...prediction,
    taskId,
    userId: userId || task.assigned_to
  };
}

/**
 * 進捗予測を計算（コアロジック）
 * @param {Object} task - タスク情報
 * @param {Array} activityLogs - アクティビティログ
 * @param {Object} userActivityStats - ユーザーアクティビティ統計
 * @returns {Object} 予測結果
 */
function calculatePrediction(task, activityLogs, userActivityStats) {
  const currentProgress = task.progress || 0;
  const today = new Date();

  // アクティビティログから作業時間を推定（アクティビティスコアから）
  // アクティビティスコア 100 = 1時間の集中作業と仮定
  const totalWorkHours = activityLogs.reduce((sum, log) => {
    return sum + (log.activity_score || log.activityScore || 0) / 100;
  }, 0);

  // 作業開始日を特定
  const startDate = task.start_date
    ? new Date(task.start_date)
    : activityLogs.length > 0
      ? new Date(activityLogs[0].timestamp)
      : today;

  // 経過日数を計算
  const daysElapsed = Math.max(1, Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)));

  // 1日あたりの進捗率を計算
  const dailyProgressRate = currentProgress / daysElapsed;

  // 残り進捗を完了するのに必要な日数
  const remainingProgress = 100 - currentProgress;
  const daysToComplete = dailyProgressRate > 0
    ? Math.ceil(remainingProgress / dailyProgressRate)
    : 999; // 進捗がない場合は大きな値

  // 予測完了日を計算
  const predictedCompletionDate = new Date(today);
  predictedCompletionDate.setDate(predictedCompletionDate.getDate() + daysToComplete);
  const predictedCompletionStr = predictedCompletionDate.toISOString().split('T')[0];

  // 納期との比較
  let isOnTrack = true;
  let riskLevel = 'low';
  let completionProbability = 0.9;

  if (task.due_date) {
    const dueDate = new Date(task.due_date);
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    const daysDifference = daysUntilDue - daysToComplete;

    if (daysDifference < 0) {
      // 遅延リスク
      isOnTrack = false;
      if (Math.abs(daysDifference) > 7) {
        riskLevel = 'high';
        completionProbability = 0.3;
      } else if (Math.abs(daysDifference) > 3) {
        riskLevel = 'medium';
        completionProbability = 0.6;
      } else {
        riskLevel = 'medium';
        completionProbability = 0.7;
      }
    } else if (daysDifference < 3) {
      // ギリギリ
      riskLevel = 'medium';
      completionProbability = 0.8;
    } else {
      // 余裕あり
      riskLevel = 'low';
      completionProbability = 0.95;
    }
  }

  // アクティビティスコアが低い場合はリスクを上げる
  const avgActivityScore = userActivityStats.avgActivityScore || 0;
  if (avgActivityScore < 30) {
    if (riskLevel === 'low') riskLevel = 'medium';
    else if (riskLevel === 'medium') riskLevel = 'high';
    completionProbability = Math.max(0.2, completionProbability - 0.2);
  }

  // 信頼度スコアを計算（アクティビティログの量とアクティビティスコアに基づく）
  const confidenceScore = Math.min(1.0, Math.max(0.1,
    (activityLogs.length / 10) * 0.5 + (avgActivityScore / 100) * 0.5
  ));

  return {
    currentProgress,
    predictedCompletionDate: predictedCompletionStr,
    completionProbability: Math.round(completionProbability * 100) / 100,
    riskLevel,
    avgActivityScore: Math.round(avgActivityScore * 10) / 10,
    totalWorkHours: Math.round(totalWorkHours * 10) / 10,
    dailyProgressRate: Math.round(dailyProgressRate * 100) / 100,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    isOnTrack
  };
}

/**
 * タスクの最新の予測を取得
 * @param {number} taskId - タスクID
 * @returns {Object|null} 最新の予測結果
 */
async function getLatestPrediction(taskId) {
  const knex = db.getKnex();

  return await knex('progress_predictions')
    .where('task_id', taskId)
    .orderBy('created_at', 'desc')
    .first();
}

/**
 * タスクの予測履歴を取得
 * @param {number} taskId - タスクID
 * @param {number} limit - 取得件数
 * @returns {Array} 予測履歴
 */
async function getPredictionHistory(taskId, limit = 30) {
  const knex = db.getKnex();

  return await knex('progress_predictions')
    .where('task_id', taskId)
    .orderBy('created_at', 'desc')
    .limit(limit);
}

/**
 * ユーザーの全タスクの予測を取得
 * @param {number} userId - ユーザーID
 * @returns {Array} 予測一覧
 */
async function getUserPredictions(userId) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // Get latest predictions for each task assigned to the user
  let subQuery;
  if (dbClient === 'better-sqlite3' || dbClient === 'pg') {
    subQuery = knex('progress_predictions as pp2')
      .select('pp2.id')
      .whereRaw('pp2.task_id = pp.task_id')
      .orderBy('pp2.created_at', 'desc')
      .limit(1);
  } else {
    // MySQL and SQL Server handle subqueries differently
    subQuery = knex.raw(`(
      SELECT pp2.id FROM progress_predictions pp2
      WHERE pp2.task_id = pp.task_id
      ORDER BY pp2.created_at DESC
      LIMIT 1
    )`);
  }

  return await knex('progress_predictions as pp')
    .innerJoin('tasks as t', 'pp.task_id', 't.id')
    .select(
      'pp.*',
      't.name as task_name',
      't.status',
      't.due_date'
    )
    .where('pp.user_id', userId)
    .whereIn('pp.id', function() {
      this.select('pp2.id')
        .from('progress_predictions as pp2')
        .whereRaw('pp2.task_id = pp.task_id')
        .orderBy('pp2.created_at', 'desc')
        .limit(1);
    })
    .orderBy('pp.risk_level', 'desc')
    .orderBy('pp.created_at', 'desc');
}

/**
 * リスクの高いタスクを取得
 * @param {string} riskLevel - リスクレベル ('high', 'medium', 'low')
 * @returns {Array} リスクの高いタスク一覧
 */
async function getHighRiskTasks(riskLevel = 'high') {
  const knex = db.getKnex();

  return await knex('progress_predictions as pp')
    .innerJoin('tasks as t', 'pp.task_id', 't.id')
    .leftJoin('users as u', 't.assigned_to', 'u.id')
    .select(
      'pp.*',
      't.name as task_name',
      't.status',
      't.due_date',
      't.assigned_to',
      'u.username',
      'u.full_name as user_full_name'
    )
    .where('pp.risk_level', riskLevel)
    .whereIn('t.status', ['todo', 'in_progress'])
    .whereIn('pp.id', function() {
      this.select('pp2.id')
        .from('progress_predictions as pp2')
        .whereRaw('pp2.task_id = pp.task_id')
        .orderBy('pp2.created_at', 'desc')
        .limit(1);
    })
    .orderBy('pp.confidence_score', 'asc')
    .orderBy('pp.created_at', 'desc');
}

/**
 * 遅延しているタスクを取得
 * @returns {Array} 遅延タスク一覧
 */
async function getDelayedTasks() {
  const knex = db.getKnex();

  return await knex('progress_predictions as pp')
    .innerJoin('tasks as t', 'pp.task_id', 't.id')
    .leftJoin('users as u', 't.assigned_to', 'u.id')
    .select(
      'pp.*',
      't.name as task_name',
      't.status',
      't.due_date',
      't.assigned_to',
      'u.username',
      'u.full_name as user_full_name'
    )
    .where('pp.is_on_track', 0)
    .whereIn('t.status', ['todo', 'in_progress'])
    .whereIn('pp.id', function() {
      this.select('pp2.id')
        .from('progress_predictions as pp2')
        .whereRaw('pp2.task_id = pp.task_id')
        .orderBy('pp2.created_at', 'desc')
        .limit(1);
    })
    .orderBy('pp.risk_level', 'desc')
    .orderBy('pp.confidence_score', 'asc');
}

/**
 * AI提案を更新
 * @param {number} predictionId - 予測ID
 * @param {Object} aiData - AI生成データ
 * @returns {Object} 更新結果
 */
async function updateAiSuggestion(predictionId, aiData) {
  const knex = db.getKnex();

  const result = await knex('progress_predictions')
    .where('id', predictionId)
    .update({
      ai_suggestion: aiData.suggestion || null,
      bottleneck_analysis: aiData.bottleneckAnalysis || null,
      resource_recommendation: aiData.resourceRecommendation || null,
      updated_at: knex.fn.now()
    });

  return {
    success: result > 0,
    changes: result
  };
}

/**
 * プロジェクト全体の進捗サマリーを取得
 * @param {number} projectId - プロジェクトID
 * @returns {Object} プロジェクトサマリー
 */
async function getProjectProgressSummary(projectId) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // Build a subquery for getting the latest prediction per task
  let latestPredictionsSubquery;
  if (dbClient === 'pg') {
    latestPredictionsSubquery = knex('progress_predictions')
      .select(
        'task_id',
        'predicted_completion_date',
        'completion_probability',
        'risk_level',
        'is_on_track'
      )
      .distinctOn('task_id')
      .orderBy('task_id')
      .orderBy('created_at', 'desc')
      .as('pp');
  } else {
    // For SQLite, MySQL, SQL Server - use ROW_NUMBER()
    latestPredictionsSubquery = knex('progress_predictions')
      .select(
        'task_id',
        'predicted_completion_date',
        'completion_probability',
        'risk_level',
        'is_on_track',
        knex.raw('ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY created_at DESC) AS rn')
      )
      .as('pp_inner');
  }

  let tasks;
  if (dbClient === 'pg') {
    tasks = await knex('tasks as t')
      .leftJoin(latestPredictionsSubquery, 't.id', 'pp.task_id')
      .leftJoin('users as u', 't.assigned_to', 'u.id')
      .select(
        't.id', 't.name', 't.status', 't.progress', 't.due_date', 't.assigned_to',
        'pp.predicted_completion_date', 'pp.completion_probability',
        'pp.risk_level', 'pp.is_on_track',
        'u.full_name as assignee_name'
      )
      .where('t.project_id', projectId)
      .whereIn('t.status', ['todo', 'in_progress', 'completed'])
      .orderBy('t.sort_order');
  } else {
    // For other DBs, use a different approach with subquery
    tasks = await knex('tasks as t')
      .leftJoin(
        knex.raw(`(
          SELECT task_id, predicted_completion_date, completion_probability,
                 risk_level, is_on_track,
                 ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY created_at DESC) AS rn
          FROM progress_predictions
        ) AS pp`),
        function() {
          this.on('t.id', 'pp.task_id').andOn('pp.rn', knex.raw('1'));
        }
      )
      .leftJoin('users as u', 't.assigned_to', 'u.id')
      .select(
        't.id', 't.name', 't.status', 't.progress', 't.due_date', 't.assigned_to',
        'pp.predicted_completion_date', 'pp.completion_probability',
        'pp.risk_level', 'pp.is_on_track',
        'u.full_name as assignee_name'
      )
      .where('t.project_id', projectId)
      .whereIn('t.status', ['todo', 'in_progress', 'completed'])
      .orderBy('t.sort_order');
  }

  // 統計を計算
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const todoTasks = tasks.filter(t => t.status === 'todo').length;

  const avgProgress = totalTasks > 0
    ? tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / totalTasks
    : 0;

  const highRiskTasks = tasks.filter(t => t.risk_level === 'high').length;
  const mediumRiskTasks = tasks.filter(t => t.risk_level === 'medium').length;
  const lowRiskTasks = tasks.filter(t => t.risk_level === 'low').length;

  const delayedTasks = tasks.filter(t => t.is_on_track === 0).length;

  return {
    projectId,
    totalTasks,
    completedTasks,
    inProgressTasks,
    todoTasks,
    avgProgress: Math.round(avgProgress * 10) / 10,
    riskDistribution: {
      high: highRiskTasks,
      medium: mediumRiskTasks,
      low: lowRiskTasks
    },
    delayedTasks,
    tasks
  };
}

/**
 * 古い予測データを削除
 * @param {number} days - 削除する日数（この日数より古いデータを削除）
 * @returns {number} 削除件数
 */
async function deleteOldPredictions(days = 90) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('progress_predictions');

  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("prediction_date < date('now', ?)", [`-${days} days`]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw(`prediction_date < CURRENT_DATE - INTERVAL '${days} days'`);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('prediction_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days]);
  } else {
    query = query.whereRaw('prediction_date < DATEADD(DAY, ?, CAST(GETDATE() AS DATE))', [-days]);
  }

  const result = await query.del();
  return result;
}

module.exports = {
  calculateAndSaveProgressPrediction,
  calculatePrediction,
  getLatestPrediction,
  getPredictionHistory,
  getUserPredictions,
  getHighRiskTasks,
  getDelayedTasks,
  updateAiSuggestion,
  getProjectProgressSummary,
  deleteOldPredictions
};
