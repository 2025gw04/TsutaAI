// プロジェクトダッシュボードサービス (Knex.js対応版)
const db = require('./database');

/**
 * Project Dashboard Service
 * Handles project health scores, burndown data, and critical path analysis
 */

// ============================================================================
// Project Health Scores
// ============================================================================

/**
 * Calculate and save project health score
 * @param {number} projectId - Project ID
 * @returns {object} Health score data
 */
async function calculateProjectHealthScore(projectId) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // Get project info
  const project = await knex('projects')
    .select('id', 'name', 'start_date', 'end_date', 'status')
    .where('id', projectId)
    .first();

  if (!project) {
    throw new Error(`Project with ID ${projectId} not found`);
  }

  // Get task statistics
  let taskStatsQuery = knex('tasks')
    .where('project_id', projectId)
    .select(
      knex.raw('COUNT(*) as totalTasks'),
      knex.raw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedTasks"),
      knex.raw("SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgressTasks"),
      knex.raw("SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as notStartedTasks")
    );

  // Add delayed tasks count based on DB type
  if (dbClient === 'better-sqlite3') {
    taskStatsQuery = taskStatsQuery.select(
      knex.raw("SUM(CASE WHEN due_date < date('now') AND status != 'completed' THEN 1 ELSE 0 END) as delayedTasks")
    );
  } else if (dbClient === 'pg') {
    taskStatsQuery = taskStatsQuery.select(
      knex.raw("SUM(CASE WHEN due_date < CURRENT_DATE AND status != 'completed' THEN 1 ELSE 0 END) as \"delayedTasks\"")
    );
  } else if (dbClient === 'mysql2') {
    taskStatsQuery = taskStatsQuery.select(
      knex.raw("SUM(CASE WHEN due_date < CURDATE() AND status != 'completed' THEN 1 ELSE 0 END) as delayedTasks")
    );
  } else {
    taskStatsQuery = taskStatsQuery.select(
      knex.raw("SUM(CASE WHEN due_date < CAST(GETDATE() AS DATE) AND status != 'completed' THEN 1 ELSE 0 END) as delayedTasks")
    );
  }

  const taskStats = await taskStatsQuery.first();

  // Note: has_blocker column doesn't exist, so we calculate blockedTasks as 0 for now
  taskStats.blockedTasks = 0;

  // Get team metrics (past 7 days)
  // Create raw conditions for date filtering in joins
  let alDateCondition, mhlDateCondition;
  if (dbClient === 'better-sqlite3') {
    alDateCondition = knex.raw("al.timestamp >= datetime('now', '-7 days')");
    mhlDateCondition = knex.raw("mhl.report_date >= date('now', '-7 days')");
  } else if (dbClient === 'pg') {
    alDateCondition = knex.raw("al.timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 days'");
    mhlDateCondition = knex.raw("mhl.report_date >= CURRENT_DATE - INTERVAL '7 days'");
  } else if (dbClient === 'mysql2') {
    alDateCondition = knex.raw('al.timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
    mhlDateCondition = knex.raw('mhl.report_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)');
  } else {
    alDateCondition = knex.raw('al.timestamp >= DATEADD(DAY, -7, GETDATE())');
    mhlDateCondition = knex.raw('mhl.report_date >= DATEADD(DAY, -7, CAST(GETDATE() AS DATE))');
  }

  let teamMetricsQuery = knex('tasks as t')
    .leftJoin('activity_logs as al', function() {
      this.on('t.assigned_to', 'al.user_id').andOn(alDateCondition);
    })
    .leftJoin('mental_health_logs as mhl', function() {
      this.on('t.assigned_to', 'mhl.user_id').andOn(mhlDateCondition);
    })
    .where('t.project_id', projectId)
    .select(
      knex.raw('COUNT(DISTINCT t.assigned_to) as teamSize'),
      knex.raw('AVG(al.activity_score) as avgActivityScore'),
      knex.raw('AVG(mhl.mood) as avgMood'),
      knex.raw('AVG(mhl.stress_level) as avgStress')
    );

  const teamMetrics = await teamMetricsQuery.first();

  // Calculate daily progress rate
  const now = new Date();
  const startDate = new Date(project.start_date);
  const deadline = new Date(project.end_date);
  const daysElapsed = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
  const totalDays = Math.max(1, Math.ceil((deadline - startDate) / (1000 * 60 * 60 * 24)));
  const daysUntilDeadline = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

  // Calculate current progress from completed tasks
  const currentProgress = taskStats.totalTasks > 0
    ? Math.round((taskStats.completedTasks / taskStats.totalTasks) * 100)
    : 0;
  const dailyProgressRate = currentProgress / daysElapsed;
  const expectedProgress = (daysElapsed / totalDays) * 100;

  // Predict completion date
  const remainingProgress = 100 - currentProgress;
  const daysToComplete = dailyProgressRate > 0
    ? Math.ceil(remainingProgress / dailyProgressRate)
    : 999;
  const predictedCompletionDate = new Date(now.getTime() + daysToComplete * 24 * 60 * 60 * 1000);

  // Calculate component scores
  const progressScore = calculateProgressScore(currentProgress, expectedProgress);
  const deadlineScore = calculateDeadlineScore(predictedCompletionDate, deadline);
  const teamMoraleScore = calculateTeamMoraleScore(
    teamMetrics.avgMood,
    teamMetrics.avgStress
  );
  const blockerScore = calculateBlockerScore(taskStats.blockedTasks);
  const velocityScore = calculateVelocityScore(
    dailyProgressRate,
    teamMetrics.avgActivityScore
  );

  // Calculate overall health score
  const healthScore = Math.round(
    progressScore * 0.30 +
    deadlineScore * 0.25 +
    teamMoraleScore * 0.20 +
    blockerScore * 0.15 +
    velocityScore * 0.10
  );

  // Save to database
  const scoreDate = new Date().toISOString().split('T')[0];

  const insertData = {
    project_id: projectId,
    health_score: healthScore,
    score_date: scoreDate,
    progress_score: progressScore,
    deadline_score: deadlineScore,
    team_morale_score: teamMoraleScore,
    blocker_score: blockerScore,
    velocity_score: velocityScore
  };

  let resultId;
  if (dbClient === 'pg') {
    const [result] = await knex('project_health_scores').insert(insertData).returning('id');
    resultId = result.id || result;
  } else {
    const [id] = await knex('project_health_scores').insert(insertData);
    resultId = id;
  }

  // Update project table
  await knex('projects')
    .where('id', projectId)
    .update({
      health_score: healthScore,
      last_health_score_update: scoreDate
    });

  return {
    id: resultId,
    projectId,
    healthScore,
    scoreDate,
    components: {
      progressScore,
      deadlineScore,
      teamMoraleScore,
      blockerScore,
      velocityScore
    },
    metrics: {
      currentProgress,
      expectedProgress,
      dailyProgressRate,
      daysUntilDeadline,
      predictedCompletionDate: predictedCompletionDate.toISOString().split('T')[0],
      ...taskStats,
      ...teamMetrics
    }
  };
}

// Helper functions for score calculation
function calculateProgressScore(currentProgress, expectedProgress) {
  const diff = currentProgress - expectedProgress;
  if (diff > 10) return 100;
  if (diff >= 0) return 90;
  if (diff >= -10) return 75;
  if (diff >= -20) return 50;
  if (diff >= -30) return 30;
  return 20;
}

function calculateDeadlineScore(predictedDate, deadline) {
  const daysDiff = Math.ceil((deadline - predictedDate) / (1000 * 60 * 60 * 24));
  if (daysDiff >= 7) return 100;
  if (daysDiff >= 0) return 85;
  if (daysDiff >= -7) return 65;
  if (daysDiff >= -14) return 45;
  return 25;
}

function calculateTeamMoraleScore(avgMood, avgStress) {
  if (!avgMood || !avgStress) return 70; // Default neutral
  const moodScore = (avgMood / 5) * 100;
  const stressScore = ((5 - avgStress) / 5) * 100;
  return Math.round((moodScore * 0.6) + (stressScore * 0.4));
}

function calculateBlockerScore(blockedTasks) {
  if (blockedTasks === 0) return 100;
  if (blockedTasks <= 2) return 85;
  if (blockedTasks <= 5) return 65;
  if (blockedTasks <= 10) return 45;
  return 25;
}

function calculateVelocityScore(dailyProgressRate, avgActivityScore) {
  const progressComponent = Math.min((dailyProgressRate / 5) * 100, 100);
  const activityComponent = avgActivityScore || 50;
  return Math.round((progressComponent * 0.6) + (activityComponent * 0.4));
}

/**
 * Get latest health score for a project
 */
async function getLatestHealthScore(projectId) {
  const knex = db.getKnex();

  return await knex('project_health_scores')
    .where('project_id', projectId)
    .orderBy('score_date', 'desc')
    .first();
}

/**
 * Get health score history
 */
async function getHealthScoreHistory(projectId, days = 30) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('project_health_scores')
    .where('project_id', projectId);

  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("score_date >= date('now', ?)", [`-${days} days`]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw(`score_date >= CURRENT_DATE - INTERVAL '${days} days'`);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('score_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days]);
  } else {
    query = query.whereRaw('score_date >= DATEADD(DAY, ?, CAST(GETDATE() AS DATE))', [-days]);
  }

  return await query.orderBy('score_date', 'desc');
}

/**
 * Update AI analysis for health score
 */
async function updateHealthScoreAnalysis(scoreId, aiAnalysis, riskFactors, recommendations) {
  const knex = db.getKnex();

  return await knex('project_health_scores')
    .where('id', scoreId)
    .update({
      ai_analysis: typeof aiAnalysis === 'string' ? aiAnalysis : JSON.stringify(aiAnalysis),
      risk_factors: typeof riskFactors === 'string' ? riskFactors : JSON.stringify(riskFactors),
      recommendations: typeof recommendations === 'string' ? recommendations : JSON.stringify(recommendations)
    });
}

// ============================================================================
// Burndown Data
// ============================================================================

/**
 * Record burndown data for a project
 */
async function recordBurndownData(projectId, date = null) {
  const knex = db.getKnex();

  const targetDate = date || new Date().toISOString().split('T')[0];

  // Get project baseline
  const project = await knex('projects')
    .select('start_date', 'end_date')
    .where('id', projectId)
    .first();

  if (!project) {
    throw new Error(`Project with ID ${projectId} not found`);
  }

  // Calculate planned values (ideal burndown)
  const startDate = new Date(project.start_date);
  const deadline = new Date(project.end_date);
  const totalDays = Math.max(1, Math.ceil((deadline - startDate) / (1000 * 60 * 60 * 24)));
  const currentDate = new Date(targetDate);
  const remainingDays = Math.ceil((deadline - currentDate) / (1000 * 60 * 60 * 24));

  // Get total tasks and hours at project start (or current if start data unavailable)
  const totalMetrics = await knex('tasks')
    .where('project_id', projectId)
    .select(
      knex.raw('COUNT(*) as totalTasks'),
      knex.raw('SUM(COALESCE(estimated_hours, 8)) as totalHours')
    )
    .first();

  const plannedRemainingTasks = Math.max(0, Math.round(
    totalMetrics.totalTasks * (remainingDays / totalDays)
  ));
  const plannedRemainingHours = Math.max(0,
    totalMetrics.totalHours * (remainingDays / totalDays)
  );

  // Get actual remaining tasks and hours
  const actualMetrics = await knex('tasks')
    .where('project_id', projectId)
    .where('status', '!=', 'completed')
    .select(
      knex.raw('COUNT(*) as remainingTasks'),
      knex.raw('SUM(COALESCE(estimated_hours, 8)) as remainingHours')
    )
    .first();

  const completedMetrics = await knex('tasks')
    .where('project_id', projectId)
    .where('status', 'completed')
    .select(
      knex.raw('COUNT(*) as completedCount'),
      knex.raw('SUM(COALESCE(estimated_hours, 8)) as completedHours')
    )
    .first();

  // Prepare data for upsert
  const burndownData = {
    project_id: projectId,
    date: targetDate,
    planned_remaining_tasks: plannedRemainingTasks,
    planned_remaining_hours: plannedRemainingHours,
    actual_remaining_tasks: actualMetrics.remainingTasks,
    actual_remaining_hours: actualMetrics.remainingHours,
    completed_tasks_count: completedMetrics.completedCount,
    completed_hours: completedMetrics.completedHours
  };

  // Upsert burndown data
  try {
    await knex('burndown_data')
      .insert(burndownData)
      .onConflict(['project_id', 'date'])
      .merge([
        'planned_remaining_tasks', 'planned_remaining_hours',
        'actual_remaining_tasks', 'actual_remaining_hours',
        'completed_tasks_count', 'completed_hours'
      ]);
  } catch (err) {
    // Fallback for databases that don't support onConflict
    const existing = await knex('burndown_data')
      .where({ project_id: projectId, date: targetDate })
      .first();

    if (existing) {
      await knex('burndown_data')
        .where({ project_id: projectId, date: targetDate })
        .update(burndownData);
    } else {
      await knex('burndown_data').insert(burndownData);
    }
  }

  return {
    projectId,
    date: targetDate,
    planned: {
      remainingTasks: plannedRemainingTasks,
      remainingHours: plannedRemainingHours
    },
    actual: {
      remainingTasks: actualMetrics.remainingTasks,
      remainingHours: actualMetrics.remainingHours,
      completedTasks: completedMetrics.completedCount,
      completedHours: completedMetrics.completedHours
    }
  };
}

/**
 * Get burndown data for a project
 */
async function getBurndownData(projectId, days = 30) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('burndown_data')
    .where('project_id', projectId);

  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("date >= date('now', ?)", [`-${days} days`]);
  } else if (dbClient === 'pg') {
    query = query.whereRaw(`date >= CURRENT_DATE - INTERVAL '${days} days'`);
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days]);
  } else {
    query = query.whereRaw('date >= DATEADD(DAY, ?, CAST(GETDATE() AS DATE))', [-days]);
  }

  return await query.orderBy('date', 'asc');
}

// ============================================================================
// Critical Path Analysis
// ============================================================================

/**
 * Analyze critical path for a project
 */
async function analyzeCriticalPath(projectId) {
  const knex = db.getKnex();

  // Get all tasks with dependencies
  const tasks = await knex('tasks as t')
    .leftJoin('users as u', 't.assigned_to', 'u.id')
    .where('t.project_id', projectId)
    .orderBy('t.id')
    .select(
      't.id',
      't.name',
      't.status',
      't.progress',
      't.start_date',
      't.due_date',
      't.estimated_hours',
      't.assigned_to',
      'u.full_name as assignedToName'
    );

  if (tasks.length === 0) {
    return [];
  }

  const analysisDate = new Date().toISOString().split('T')[0];
  const results = [];

  for (const task of tasks) {
    // Calculate blocking relationships
    const blockingResult = await knex('tasks')
      .where('project_id', projectId)
      .where('start_date', '>', task.due_date)
      .where('status', '!=', 'completed')
      .count('* as count')
      .first();

    const blockingTaskCount = blockingResult?.count || 0;

    // Note: has_blocker column doesn't exist, so we assume no blockers for now
    const blockedByCount = 0;

    // Simple critical path determination
    const isCritical = (
      blockingTaskCount >= 2 ||
      task.status === 'in_progress'
    );

    // Calculate slack (simplified)
    const now = new Date();
    const dueDate = new Date(task.due_date);
    const estimatedDays = (task.estimated_hours || 8) / 8;
    const remainingDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    const slackDays = isCritical ? 0 : Math.max(0, remainingDays - estimatedDays);

    // Earliest/Latest dates (simplified calculation)
    const earliestStart = task.start_date || analysisDate;
    const latestStart = new Date(new Date(earliestStart).getTime() + slackDays * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    const earliestFinish = new Date(new Date(earliestStart).getTime() + estimatedDays * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    const latestFinish = task.due_date;

    // Prepare data for upsert
    const criticalPathData = {
      project_id: projectId,
      task_id: task.id,
      analysis_date: analysisDate,
      is_critical: isCritical ? 1 : 0,
      slack_days: slackDays,
      earliest_start: earliestStart,
      latest_start: latestStart,
      earliest_finish: earliestFinish,
      latest_finish: latestFinish,
      blocking_task_count: blockingTaskCount,
      blocked_by_count: blockedByCount,
      dependency_chain_length: 1 // Simplified - would need full dependency graph
    };

    // Upsert critical path data
    try {
      await knex('critical_path_tasks')
        .insert(criticalPathData)
        .onConflict(['project_id', 'task_id', 'analysis_date'])
        .merge(['is_critical', 'slack_days', 'blocking_task_count', 'blocked_by_count']);
    } catch (err) {
      // Fallback for databases that don't support onConflict
      const existing = await knex('critical_path_tasks')
        .where({
          project_id: projectId,
          task_id: task.id,
          analysis_date: analysisDate
        })
        .first();

      if (existing) {
        await knex('critical_path_tasks')
          .where({
            project_id: projectId,
            task_id: task.id,
            analysis_date: analysisDate
          })
          .update(criticalPathData);
      } else {
        await knex('critical_path_tasks').insert(criticalPathData);
      }
    }

    results.push({
      taskId: task.id,
      taskName: task.name,
      isCritical,
      slackDays,
      blockingTaskCount,
      blockedByCount,
      status: task.status,
      progress: task.progress
    });
  }

  return results;
}

/**
 * Get critical path data for a project
 */
async function getCriticalPathData(projectId, analysisDate = null) {
  const knex = db.getKnex();

  const targetDate = analysisDate || new Date().toISOString().split('T')[0];

  return await knex('critical_path_tasks as cpt')
    .join('tasks as t', 'cpt.task_id', 't.id')
    .leftJoin('users as u', 't.assigned_to', 'u.id')
    .where('cpt.project_id', projectId)
    .where('cpt.analysis_date', targetDate)
    .orderBy('cpt.is_critical', 'desc')
    .orderBy('cpt.slack_days', 'asc')
    .select(
      'cpt.*',
      't.name as taskName',
      't.status',
      't.progress',
      'u.full_name as assignedTo'
    );
}

/**
 * Update AI analysis for critical path task
 */
async function updateCriticalPathAnalysis(taskId, analysisDate, impactAnalysis, riskAssessment) {
  const knex = db.getKnex();

  return await knex('critical_path_tasks')
    .where('task_id', taskId)
    .where('analysis_date', analysisDate)
    .update({
      impact_analysis: impactAnalysis,
      risk_assessment: riskAssessment
    });
}

module.exports = {
  // Health scores
  calculateProjectHealthScore,
  getLatestHealthScore,
  getHealthScoreHistory,
  updateHealthScoreAnalysis,

  // Burndown data
  recordBurndownData,
  getBurndownData,

  // Critical path
  analyzeCriticalPath,
  getCriticalPathData,
  updateCriticalPathAnalysis
};
