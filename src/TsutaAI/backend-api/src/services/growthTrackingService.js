// 個人成長トラッキングサービス (Knex.js対応版)
const db = require('./database');
const { getCurrentTimestamp } = require('../utils/dbHelpers');

// =============================================
// スキル成長履歴
// =============================================

/**
 * スキル成長履歴を記録
 * @param {number} userId - ユーザーID
 * @param {string} skillName - スキル名
 * @param {number} skillLevel - スキルレベル（0-10）
 * @param {string} changeReason - 変更理由
 * @param {string} notes - 備考
 * @returns {Object} 作成されたレコード
 */
async function recordSkillGrowth(userId, skillName, skillLevel, changeReason = 'manual_update', notes = null) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    user_id: userId,
    skill_name: skillName,
    skill_level: skillLevel,
    recorded_date: new Date().toISOString().split('T')[0],
    change_reason: changeReason,
    notes: notes
  };

  if (dbClient === 'pg') {
    const [result] = await knex('skill_growth_history').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('skill_growth_history').insert(insertData);
    return { id };
  }
}

/**
 * スキル成長履歴を取得
 * @param {number} userId - ユーザーID
 * @param {number} months - 取得する月数（デフォルト: 6ヶ月）
 * @returns {Array} スキル成長履歴
 */
async function getSkillGrowthHistory(userId, months = 6) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('skill_growth_history')
    .select(
      'id',
      'user_id as userId',
      'skill_name as skillName',
      'skill_level as skillLevel',
      'recorded_date as recordedDate',
      'change_reason as changeReason',
      'notes',
      'created_at as createdAt'
    )
    .where('user_id', userId);

  // DB別の日付計算
  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("DATE(recorded_date) >= DATE('now', 'localtime', '-' || ? || ' months')", [months]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw("recorded_date >= CURRENT_DATE - INTERVAL '? months'", [months]);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('recorded_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)', [months]);
  } else {
    query = query.whereRaw('recorded_date >= DATEADD(MONTH, -?, GETDATE())', [months]);
  }

  return await query.orderBy('recorded_date', 'desc').orderBy('created_at', 'desc');
}

/**
 * 特定スキルの成長履歴を取得
 * @param {number} userId - ユーザーID
 * @param {string} skillName - スキル名
 * @param {number} months - 取得する月数
 * @returns {Array} スキル成長履歴
 */
async function getSkillGrowthHistoryBySkill(userId, skillName, months = 6) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('skill_growth_history')
    .select(
      'id',
      'user_id as userId',
      'skill_name as skillName',
      'skill_level as skillLevel',
      'recorded_date as recordedDate',
      'change_reason as changeReason',
      'notes',
      'created_at as createdAt'
    )
    .where('user_id', userId)
    .andWhere('skill_name', skillName);

  // DB別の日付計算
  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("DATE(recorded_date) >= DATE('now', 'localtime', '-' || ? || ' months')", [months]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw("recorded_date >= CURRENT_DATE - INTERVAL '? months'", [months]);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('recorded_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)', [months]);
  } else {
    query = query.whereRaw('recorded_date >= DATEADD(MONTH, -?, GETDATE())', [months]);
  }

  return await query.orderBy('recorded_date', 'asc');
}

// =============================================
// パフォーマンスメトリクス
// =============================================

/**
 * パフォーマンスメトリクスを計算・保存
 * @param {number} userId - ユーザーID
 * @param {string} targetMonth - 対象月（YYYY-MM）
 * @returns {Object} 保存されたメトリクス
 */
async function calculateAndSaveMonthlyMetrics(userId, targetMonth) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // 対象月のタスクを取得
  let taskQuery = knex('tasks')
    .select('id', 'estimated_hours', 'actual_hours', 'status', 'name', 'updated_at')
    .where('assigned_to', userId);

  // DB別の日付フォーマット処理
  if (dbClient === 'better-sqlite3') {
    taskQuery = taskQuery.where(function () {
      this.whereRaw("status = 'completed' AND strftime('%Y-%m', updated_at) = ?", [targetMonth])
        .orWhereRaw("status != 'completed' AND strftime('%Y-%m', created_at) = ?", [targetMonth]);
    });
  } else if (dbClient === 'pg') {
    taskQuery = taskQuery.where(function () {
      this.whereRaw("status = 'completed' AND to_char(updated_at, 'YYYY-MM') = ?", [targetMonth])
        .orWhereRaw("status != 'completed' AND to_char(created_at, 'YYYY-MM') = ?", [targetMonth]);
    });
  } else if (dbClient === 'mysql2') {
    taskQuery = taskQuery.where(function () {
      this.whereRaw("status = 'completed' AND DATE_FORMAT(updated_at, '%Y-%m') = ?", [targetMonth])
        .orWhereRaw("status != 'completed' AND DATE_FORMAT(created_at, '%Y-%m') = ?", [targetMonth]);
    });
  } else {
    taskQuery = taskQuery.where(function () {
      this.whereRaw("status = 'completed' AND FORMAT(updated_at, 'yyyy-MM') = ?", [targetMonth])
        .orWhereRaw("status != 'completed' AND FORMAT(created_at, 'yyyy-MM') = ?", [targetMonth]);
    });
  }

  const tasks = await taskQuery;

  // 完了タスクのみ
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const tasksCompleted = completedTasks.length;
  const tasksTotal = tasks.length;

  // タスク完了速度計算（平均タスク時間）
  let avgTaskDurationHours = 0;
  if (completedTasks.length > 0) {
    const totalActualHours = completedTasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);
    avgTaskDurationHours = totalActualHours / completedTasks.length;
  }

  // チーム全体の平均タスク時間
  let teamAvgQuery = knex('tasks')
    .avg('actual_hours as teamAvg')
    .where('status', 'completed')
    .andWhere('actual_hours', '>', 0);

  if (dbClient === 'better-sqlite3') {
    teamAvgQuery = teamAvgQuery.whereRaw("strftime('%Y-%m', updated_at) = ?", [targetMonth]);
  } else if (dbClient === 'pg') {
    teamAvgQuery = teamAvgQuery.whereRaw("to_char(updated_at, 'YYYY-MM') = ?", [targetMonth]);
  } else if (dbClient === 'mysql2') {
    teamAvgQuery = teamAvgQuery.whereRaw("DATE_FORMAT(updated_at, '%Y-%m') = ?", [targetMonth]);
  } else {
    teamAvgQuery = teamAvgQuery.whereRaw("FORMAT(updated_at, 'yyyy-MM') = ?", [targetMonth]);
  }

  const teamAvg = await teamAvgQuery.first();
  const teamAvgDurationHours = teamAvg?.teamAvg || avgTaskDurationHours || 1;

  // タスク完了率（%）
  const taskCompletionRate = tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0;

  // バグ率計算
  const bugTasks = tasks.filter(t =>
    t.name && (
      t.name.includes('バグ') ||
      t.name.includes('修正') ||
      t.name.toLowerCase().includes('fix') ||
      t.name.toLowerCase().includes('bug')
    )
  );
  const bugRate = tasksTotal > 0 ? (bugTasks.length / tasksTotal) * 100 : 0;

  // ヘルプ対応回数
  let helpQuery = knex('task_comments as tc')
    .join('tasks as t', 'tc.task_id', 't.id')
    .count('* as count')
    .where('tc.user_id', userId)
    .whereNot('t.assigned_to', userId);

  if (dbClient === 'better-sqlite3') {
    helpQuery = helpQuery.whereRaw("strftime('%Y-%m', tc.created_at) = ?", [targetMonth]);
  } else if (dbClient === 'pg') {
    helpQuery = helpQuery.whereRaw("to_char(tc.created_at, 'YYYY-MM') = ?", [targetMonth]);
  } else if (dbClient === 'mysql2') {
    helpQuery = helpQuery.whereRaw("DATE_FORMAT(tc.created_at, '%Y-%m') = ?", [targetMonth]);
  } else {
    helpQuery = helpQuery.whereRaw("FORMAT(tc.created_at, 'yyyy-MM') = ?", [targetMonth]);
  }

  const helpResult = await helpQuery.first();
  const helpCount = helpResult?.count || 0;

  // 集中度（daily_reportsから）
  let focusQuery = knex('daily_reports')
    .avg('focus_level as avgFocus')
    .where('user_id', userId);

  if (dbClient === 'better-sqlite3') {
    focusQuery = focusQuery.whereRaw("strftime('%Y-%m', report_date) = ?", [targetMonth]);
  } else if (dbClient === 'pg') {
    focusQuery = focusQuery.whereRaw("to_char(report_date, 'YYYY-MM') = ?", [targetMonth]);
  } else if (dbClient === 'mysql2') {
    focusQuery = focusQuery.whereRaw("DATE_FORMAT(report_date, '%Y-%m') = ?", [targetMonth]);
  } else {
    focusQuery = focusQuery.whereRaw("FORMAT(report_date, 'yyyy-MM') = ?", [targetMonth]);
  }

  const focusData = await focusQuery.first();
  const focusLevelAvg = focusData?.avgFocus || 0;

  // 見積vs実績比率
  let estimatedVsActualRatio = 1.0;
  if (completedTasks.length > 0) {
    const totalEstimated = completedTasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const totalActual = completedTasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);
    if (totalEstimated > 0 && totalActual > 0) {
      estimatedVsActualRatio = totalActual / totalEstimated;
    }
  }

  // メトリクスを保存（UPSERT）
  await knex('performance_metrics')
    .insert({
      user_id: userId,
      metric_date: targetMonth,
      task_completion_rate: Math.round(taskCompletionRate),
      bug_rate: Math.round(bugRate * 10) / 10,
      help_count: helpCount,
      focus_level_avg: Math.round(focusLevelAvg),
      tasks_completed: tasksCompleted,
      tasks_total: tasksTotal,
      estimated_vs_actual_ratio: Math.round(estimatedVsActualRatio * 100) / 100,
      avg_task_duration_hours: Math.round(avgTaskDurationHours * 10) / 10,
      team_avg_duration_hours: Math.round(teamAvgDurationHours * 10) / 10
    })
    .onConflict(['user_id', 'metric_date'])
    .merge([
      'task_completion_rate',
      'bug_rate',
      'help_count',
      'focus_level_avg',
      'tasks_completed',
      'tasks_total',
      'estimated_vs_actual_ratio',
      'avg_task_duration_hours',
      'team_avg_duration_hours',
      'updated_at'
    ]);

  return {
    userId,
    metricDate: targetMonth,
    taskCompletionRate: Math.round(taskCompletionRate),
    bugRate: Math.round(bugRate * 10) / 10,
    helpCount,
    focusLevelAvg: Math.round(focusLevelAvg),
    tasksCompleted,
    tasksTotal
  };
}

/**
 * パフォーマンスメトリクスを取得
 * @param {number} userId - ユーザーID
 * @param {number} months - 取得する月数
 * @returns {Array} パフォーマンスメトリクス
 */
async function getPerformanceMetrics(userId, months = 6) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // 月数前の日付を計算
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const targetMonth = targetDate.toISOString().slice(0, 7);

  return await knex('performance_metrics')
    .select(
      'id',
      'user_id as userId',
      'metric_date as metricDate',
      'task_completion_rate as taskCompletionRate',
      'bug_rate as bugRate',
      'help_count as helpCount',
      'focus_level_avg as focusLevelAvg',
      'tasks_completed as tasksCompleted',
      'tasks_total as tasksTotal',
      'estimated_vs_actual_ratio as estimatedVsActualRatio',
      'avg_task_duration_hours as avgTaskDurationHours',
      'team_avg_duration_hours as teamAvgDurationHours',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .where('user_id', userId)
    .andWhere('metric_date', '>=', targetMonth)
    .orderBy('metric_date', 'desc');
}

// =============================================
// 主な貢献
// =============================================

/**
 * 貢献を記録
 * @param {number} userId - ユーザーID
 * @param {Object} contribution - 貢献情報
 * @returns {Object} 作成されたレコード
 */
async function recordContribution(userId, contribution) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    user_id: userId,
    contribution_date: contribution.contributionDate || new Date().toISOString().split('T')[0],
    contribution_type: contribution.contributionType || 'other',
    title: contribution.title,
    description: contribution.description || null,
    impact_level: contribution.impactLevel || 'medium',
    project_id: contribution.projectId || null,
    task_id: contribution.taskId || null
  };

  if (dbClient === 'pg') {
    const [result] = await knex('member_contributions').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('member_contributions').insert(insertData);
    return { id };
  }
}

/**
 * 貢献を取得
 * @param {number} userId - ユーザーID
 * @param {string} startDate - 開始日（YYYY-MM-DD）
 * @param {string} endDate - 終了日（YYYY-MM-DD）
 * @returns {Array} 貢献一覧
 */
async function getContributions(userId, startDate = null, endDate = null) {
  const knex = db.getKnex();

  let query = knex('member_contributions as mc')
    .leftJoin('projects as p', 'mc.project_id', 'p.id')
    .leftJoin('tasks as t', 'mc.task_id', 't.id')
    .select(
      'mc.id',
      'mc.user_id as userId',
      'mc.contribution_date as contributionDate',
      'mc.contribution_type as contributionType',
      'mc.title',
      'mc.description',
      'mc.impact_level as impactLevel',
      'mc.project_id as projectId',
      'mc.task_id as taskId',
      'p.name as projectName',
      't.name as taskName',
      'mc.created_at as createdAt',
      'mc.updated_at as updatedAt'
    )
    .where('mc.user_id', userId);

  if (startDate) {
    query = query.where('mc.contribution_date', '>=', startDate);
  }

  if (endDate) {
    query = query.where('mc.contribution_date', '<=', endDate);
  }

  return await query.orderBy('mc.contribution_date', 'desc').orderBy('mc.created_at', 'desc');
}

// =============================================
// 成長目標
// =============================================

/**
 * 成長目標を作成
 * @param {number} userId - ユーザーID
 * @param {Object} goal - 目標情報
 * @returns {Object} 作成されたレコード
 */
async function createGrowthGoal(userId, goal) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    user_id: userId,
    goal_title: goal.goalTitle || goal.title,
    goal_description: goal.goalDescription || goal.description || null,
    target_skill: goal.targetSkill || null,
    target_level: goal.targetLevel || null,
    estimated_duration_weeks: goal.estimatedDurationWeeks || goal.estimatedWeeks || null,
    status: goal.status || 'active',
    progress: goal.progress || 0,
    ai_generated: goal.aiGenerated || 0
  };

  if (dbClient === 'pg') {
    const [result] = await knex('growth_goals').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('growth_goals').insert(insertData);
    return { id };
  }
}

/**
 * 成長目標を更新
 * @param {number} goalId - 目標ID
 * @param {Object} updates - 更新内容
 * @returns {Object} 更新結果
 */
async function updateGrowthGoal(goalId, updates) {
  const knex = db.getKnex();

  const updateData = {};

  if (updates.goalTitle !== undefined) {
    updateData.goal_title = updates.goalTitle;
  }
  if (updates.goalDescription !== undefined) {
    updateData.goal_description = updates.goalDescription;
  }
  if (updates.progress !== undefined) {
    updateData.progress = updates.progress;
  }
  if (updates.status !== undefined) {
    updateData.status = updates.status;
    if (updates.status === 'completed') {
      updateData.completed_at = getCurrentTimestamp();
    }
  }

  if (Object.keys(updateData).length === 0) {
    return { id: goalId };
  }

  updateData.updated_at = getCurrentTimestamp();

  await knex('growth_goals')
    .where('id', goalId)
    .update(updateData);

  return { id: goalId };
}

/**
 * 成長目標を取得
 * @param {number} userId - ユーザーID
 * @param {string} statusFilter - ステータスフィルタ（'active', 'completed', 'cancelled', null=全て）
 * @returns {Array} 成長目標一覧
 */
async function getGrowthGoals(userId, statusFilter = null) {
  const knex = db.getKnex();

  let query = knex('growth_goals')
    .select(
      'id',
      'user_id as userId',
      'goal_title as goalTitle',
      'goal_description as goalDescription',
      'target_skill as targetSkill',
      'target_level as targetLevel',
      'estimated_duration_weeks as estimatedDurationWeeks',
      'status',
      'progress',
      'ai_generated as aiGenerated',
      'created_at as createdAt',
      'updated_at as updatedAt',
      'completed_at as completedAt'
    )
    .where('user_id', userId);

  if (statusFilter) {
    query = query.andWhere('status', statusFilter);
  }

  return await query.orderByRaw(`
    CASE status
      WHEN 'active' THEN 1
      WHEN 'completed' THEN 2
      WHEN 'cancelled' THEN 3
    END
  `).orderBy('created_at', 'desc');
}

/**
 * 成長目標を削除
 * @param {number} goalId - 目標ID
 * @returns {Object} 削除結果
 */
async function deleteGrowthGoal(goalId) {
  const knex = db.getKnex();
  await knex('growth_goals').where('id', goalId).del();
  return { id: goalId };
}

// =============================================
// 包括的な成長レポート生成
// =============================================

/**
 * 包括的な成長レポートを生成
 * @param {number} userId - ユーザーID
 * @param {Object} options - オプション
 * @returns {Object} 成長レポート
 */
async function generateGrowthReport(userId, options = {}) {
  const months = options.months || 6;
  const includeGoals = options.includeGoals !== false;
  const includeContributions = options.includeContributions !== false;

  // 基本情報（userServiceから取得）
  const userService = require('./userService');
  const user = await userService.findUserById(userId);

  if (!user) {
    throw new Error('ユーザーが見つかりません');
  }

  // スキル成長履歴
  const skillGrowthHistory = await getSkillGrowthHistory(userId, months);

  // パフォーマンスメトリクス
  const performanceMetrics = await getPerformanceMetrics(userId, months);

  // 最新のメトリクス
  const latestMetrics = performanceMetrics.length > 0 ? performanceMetrics[0] : null;

  // 貢献（今月分）
  let contributions = [];
  if (includeContributions) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    contributions = await getContributions(userId, startOfMonth, endOfMonth);
  }

  // 成長目標
  let goals = [];
  if (includeGoals) {
    goals = await getGrowthGoals(userId, 'active');
  }

  // スキルの変化を計算
  const skillChanges = calculateSkillChanges(skillGrowthHistory, user.skills || []);

  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role
    },
    skillGrowth: {
      current: user.skills || [],
      changes: skillChanges,
      history: skillGrowthHistory
    },
    performance: {
      latest: latestMetrics,
      history: performanceMetrics
    },
    contributions,
    goals,
    generatedAt: new Date().toISOString()
  };
}

/**
 * スキルの変化を計算
 * @param {Array} history - スキル成長履歴
 * @param {Array} currentSkills - 現在のスキル
 * @returns {Array} スキルの変化
 */
function calculateSkillChanges(history, currentSkills) {
  const skillMap = new Map();

  // 現在のスキルをマップに追加
  currentSkills.forEach(skill => {
    skillMap.set(skill.skillName || skill.name, {
      name: skill.skillName || skill.name,
      currentLevel: skill.skillLevel || skill.level,
      oldLevel: skill.skillLevel || skill.level,
      change: 0
    });
  });

  // 履歴から最も古いレコードを取得
  const skillHistory = {};
  history.forEach(record => {
    if (!skillHistory[record.skillName]) {
      skillHistory[record.skillName] = record.skillLevel;
    }
  });

  // 変化を計算
  skillMap.forEach((value, key) => {
    if (skillHistory[key] !== undefined) {
      value.oldLevel = skillHistory[key];
      value.change = value.currentLevel - value.oldLevel;
    }
  });

  return Array.from(skillMap.values()).filter(s => s.change !== 0);
}

module.exports = {
  // スキル成長履歴
  recordSkillGrowth,
  getSkillGrowthHistory,
  getSkillGrowthHistoryBySkill,

  // パフォーマンスメトリクス
  calculateAndSaveMonthlyMetrics,
  getPerformanceMetrics,

  // 主な貢献
  recordContribution,
  getContributions,

  // 成長目標
  createGrowthGoal,
  updateGrowthGoal,
  getGrowthGoals,
  deleteGrowthGoal,

  // レポート
  generateGrowthReport
};
