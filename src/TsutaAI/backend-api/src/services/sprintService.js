// Sprint Service (Knex.js対応版)
// Handles sprint goals, progress tracking, and team performance
const db = require('./database');
const { getCurrentTimestamp } = require('../utils/dbHelpers');

// ============================================================================
// Sprint Goals CRUD
// ============================================================================

/**
 * Create a new sprint
 * @param {object} payload - Sprint data
 * @returns {object} Created sprint
 */
async function createSprint(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const {
    projectId,
    sprintName,
    sprintNumber,
    startDate,
    endDate,
    goalDescription,
    targetStoryPoints = 0,
    targetTaskCount = 0,
    createdBy
  } = payload;

  const insertData = {
    project_id: projectId,
    sprint_name: sprintName,
    sprint_number: sprintNumber,
    start_date: startDate,
    end_date: endDate,
    goal_description: goalDescription,
    target_story_points: targetStoryPoints,
    target_task_count: targetTaskCount,
    status: 'planning',
    created_by: createdBy
  };

  let sprintId;
  if (dbClient === 'pg') {
    const [result] = await knex('sprint_goals').insert(insertData).returning('id');
    sprintId = result.id || result;
  } else {
    const [id] = await knex('sprint_goals').insert(insertData);
    sprintId = id;
  }

  return await getSprintById(sprintId);
}

/**
 * Get sprint by ID
 */
async function getSprintById(sprintId) {
  const knex = db.getKnex();

  return await knex('sprint_goals as sg')
    .join('projects as p', 'sg.project_id', 'p.id')
    .leftJoin('users as u', 'sg.created_by', 'u.id')
    .select(
      'sg.*',
      'p.name as projectName',
      'u.full_name as createdByName'
    )
    .where('sg.id', sprintId)
    .first();
}

/**
 * Get sprints with filters
 */
async function getSprints(filters = {}) {
  const knex = db.getKnex();

  let query = knex('sprint_goals as sg')
    .join('projects as p', 'sg.project_id', 'p.id')
    .leftJoin('users as u', 'sg.created_by', 'u.id')
    .select(
      'sg.*',
      'p.name as projectName',
      'u.full_name as createdByName'
    );

  if (filters.projectId) {
    query = query.where('sg.project_id', filters.projectId);
  }

  if (filters.status) {
    query = query.where('sg.status', filters.status);
  }

  query = query.orderBy('sg.sprint_number', 'desc').orderBy('sg.created_at', 'desc');

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  return await query;
}

/**
 * Update sprint
 */
async function updateSprint(sprintId, updates) {
  const knex = db.getKnex();

  const allowedFields = [
    'sprint_name',
    'start_date',
    'end_date',
    'goal_description',
    'target_story_points',
    'target_task_count',
    'status',
    'actual_story_points',
    'actual_task_count',
    'completed_story_points',
    'completed_task_count',
    'achievability_score',
    'ai_analysis'
  ];

  const updateData = {};

  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      updateData[key] = updates[key];
    }
  });

  if (Object.keys(updateData).length === 0) {
    throw new Error('No valid fields to update');
  }

  updateData.updated_at = getCurrentTimestamp();

  await knex('sprint_goals')
    .where('id', sprintId)
    .update(updateData);

  return await getSprintById(sprintId);
}

/**
 * Start sprint (change status to active)
 */
async function startSprint(sprintId) {
  return await updateSprint(sprintId, { status: 'active' });
}

/**
 * Complete sprint
 */
async function completeSprint(sprintId) {
  // Calculate final metrics
  const sprint = await getSprintById(sprintId);
  const tasks = await getSprintTasks(sprintId);

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const completedTaskCount = completedTasks.length;
  const completedStoryPoints = completedTasks.reduce((sum, t) => sum + (t.story_points || 0), 0);

  return await updateSprint(sprintId, {
    status: 'completed',
    completed_task_count: completedTaskCount,
    completed_story_points: completedStoryPoints
  });
}

/**
 * Cancel sprint
 */
async function cancelSprint(sprintId) {
  return await updateSprint(sprintId, { status: 'cancelled' });
}

// ============================================================================
// Sprint Progress Tracking
// ============================================================================

/**
 * Record daily sprint progress
 */
async function recordSprintProgress(sprintId, progressDate = null) {
  const knex = db.getKnex();

  const targetDate = progressDate || new Date().toISOString().split('T')[0];
  const sprint = await getSprintById(sprintId);

  if (!sprint) {
    throw new Error(`Sprint with ID ${sprintId} not found`);
  }

  // Get current sprint metrics
  const tasks = await getSprintTasks(sprintId);
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const remainingTasks = tasks.filter(t => t.status !== 'completed');

  const completedStoryPoints = completedTasks.reduce((sum, t) => sum + (t.story_points || 0), 0);
  const remainingStoryPoints = remainingTasks.reduce((sum, t) => sum + (t.story_points || 0), 0);

  // Calculate velocity and momentum
  const startDate = new Date(sprint.start_date);
  const currentDate = new Date(targetDate);
  const elapsedDays = Math.max(1, Math.ceil((currentDate - startDate) / (1000 * 60 * 60 * 24)));

  const dailyVelocity = completedStoryPoints / elapsedDays;

  // Get previous day's progress for momentum calculation
  const previousProgress = await knex('sprint_progress')
    .select('completed_story_points', 'daily_velocity')
    .where('sprint_id', sprintId)
    .andWhere('progress_date', '<', targetDate)
    .orderBy('progress_date', 'desc')
    .first();

  let momentumScore = 50; // Default neutral
  let trend = 'steady';

  if (previousProgress) {
    const velocityChange = dailyVelocity - previousProgress.daily_velocity;
    const velocityChangePercent = previousProgress.daily_velocity > 0
      ? (velocityChange / previousProgress.daily_velocity) * 100
      : 0;

    if (velocityChangePercent > 20) {
      trend = 'accelerating';
      momentumScore = 80;
    } else if (velocityChangePercent > 5) {
      trend = 'steady';
      momentumScore = 60;
    } else if (velocityChangePercent > -10) {
      trend = 'slowing';
      momentumScore = 40;
    } else {
      trend = 'stalled';
      momentumScore = 20;
    }
  }

  // Predict completion date
  const remainingDays = dailyVelocity > 0
    ? Math.ceil(remainingStoryPoints / dailyVelocity)
    : 999;
  const predictedCompletionDate = new Date(currentDate.getTime() + remainingDays * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const endDate = new Date(sprint.end_date);
  const onTrack = new Date(predictedCompletionDate) <= endDate ? 1 : 0;

  // Insert or update progress using onConflict().merge()
  await knex('sprint_progress')
    .insert({
      sprint_id: sprintId,
      progress_date: targetDate,
      completed_story_points: completedStoryPoints,
      completed_tasks: completedTasks.length,
      remaining_story_points: remainingStoryPoints,
      remaining_tasks: remainingTasks.length,
      daily_velocity: dailyVelocity,
      momentum_score: momentumScore,
      trend: trend,
      predicted_completion_date: predictedCompletionDate,
      on_track: onTrack
    })
    .onConflict(['sprint_id', 'progress_date'])
    .merge([
      'completed_story_points',
      'completed_tasks',
      'remaining_story_points',
      'remaining_tasks',
      'daily_velocity',
      'momentum_score',
      'trend',
      'predicted_completion_date',
      'on_track'
    ]);

  return {
    sprintId,
    progressDate: targetDate,
    completed: {
      tasks: completedTasks.length,
      storyPoints: completedStoryPoints
    },
    remaining: {
      tasks: remainingTasks.length,
      storyPoints: remainingStoryPoints
    },
    velocity: dailyVelocity,
    momentum: {
      score: momentumScore,
      trend
    },
    prediction: {
      completionDate: predictedCompletionDate,
      onTrack
    }
  };
}

/**
 * Get sprint progress data
 */
async function getSprintProgress(sprintId, days = 30) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query;
  if (dbClient === 'better-sqlite3') {
    query = knex('sprint_progress')
      .select('*')
      .where('sprint_id', sprintId)
      .andWhereRaw("progress_date >= date('now', '-' || ? || ' days')", [days])
      .orderBy('progress_date', 'asc');
  } else if (dbClient === 'pg') {
    query = knex('sprint_progress')
      .select('*')
      .where('sprint_id', sprintId)
      .andWhereRaw("progress_date >= CURRENT_DATE - INTERVAL '? days'", [days])
      .orderBy('progress_date', 'asc');
  } else if (dbClient === 'mysql2') {
    query = knex('sprint_progress')
      .select('*')
      .where('sprint_id', sprintId)
      .andWhereRaw('progress_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days])
      .orderBy('progress_date', 'asc');
  } else {
    // SQL Server
    query = knex('sprint_progress')
      .select('*')
      .where('sprint_id', sprintId)
      .andWhereRaw('progress_date >= DATEADD(DAY, -?, GETDATE())', [days])
      .orderBy('progress_date', 'asc');
  }

  const results = await query;

  // Map database column names to frontend-expected names
  return results.map(row => ({
    ...row,
    momentum_trend: row.trend
  }));
}

/**
 * Get latest sprint progress
 */
async function getLatestSprintProgress(sprintId) {
  const knex = db.getKnex();

  const result = await knex('sprint_progress')
    .select('*')
    .where('sprint_id', sprintId)
    .orderBy('progress_date', 'desc')
    .first();

  if (!result) return null;

  // Map database column names to frontend-expected names
  return {
    ...result,
    momentum_trend: result.trend
  };
}

// ============================================================================
// Team Member Sprint Performance
// ============================================================================

/**
 * Record team member sprint performance
 */
async function recordMemberPerformance(sprintId) {
  const knex = db.getKnex();

  const sprint = await getSprintById(sprintId);
  if (!sprint) {
    throw new Error(`Sprint with ID ${sprintId} not found`);
  }

  // Get all team members and their tasks in this sprint
  const tasks = await getSprintTasks(sprintId);
  const memberMap = new Map();

  for (const task of tasks) {
    if (!task.assigned_to) continue;

    if (!memberMap.has(task.assigned_to)) {
      memberMap.set(task.assigned_to, {
        userId: task.assigned_to,
        completedTasks: 0,
        completedStoryPoints: 0,
        totalWorkHours: 0,
        taskCompletionTimes: [],
        reopenedTasks: 0,
        blockedTasks: 0
      });
    }

    const member = memberMap.get(task.assigned_to);

    if (task.status === 'completed') {
      member.completedTasks++;
      member.completedStoryPoints += task.story_points || 0;

      // Calculate completion time (simplified)
      if (task.start_date && task.completed_date) {
        const start = new Date(task.start_date);
        const end = new Date(task.completed_date);
        const hours = (end - start) / (1000 * 60 * 60);
        member.taskCompletionTimes.push(hours);
      }
    }

    if (task.has_blocker) {
      member.blockedTasks++;
    }

    // Get work hours from work_logs
    // Note: work_logs uses start_time and duration_minutes, not date and hours
    const workHoursResult = await knex('work_logs')
      .sum('duration_minutes as totalMinutes')
      .where('task_id', task.id)
      .andWhere(function() {
        this.where('start_time', '>=', sprint.start_date)
          .andWhere('start_time', '<=', sprint.end_date);
      })
      .first();

    const totalHours = workHoursResult?.totalMinutes ? workHoursResult.totalMinutes / 60 : 0;
    member.totalWorkHours += totalHours;
  }

  // Calculate contribution percentages and rankings
  const totalCompletedPoints = Array.from(memberMap.values())
    .reduce((sum, m) => sum + m.completedStoryPoints, 0);

  const performances = Array.from(memberMap.values()).map(member => {
    const contributionPercentage = totalCompletedPoints > 0
      ? (member.completedStoryPoints / totalCompletedPoints) * 100
      : 0;

    const avgTaskCompletionTime = member.taskCompletionTimes.length > 0
      ? member.taskCompletionTimes.reduce((a, b) => a + b, 0) / member.taskCompletionTimes.length
      : 0;

    const sprintDays = Math.max(1, Math.ceil(
      (new Date(sprint.end_date) - new Date(sprint.start_date)) / (1000 * 60 * 60 * 24)
    ));
    const velocity = member.completedStoryPoints / sprintDays;

    return {
      userId: member.userId,
      completedTasks: member.completedTasks,
      completedStoryPoints: member.completedStoryPoints,
      totalWorkHours: member.totalWorkHours,
      avgTaskCompletionTime,
      contributionPercentage,
      velocity,
      reopenedTasks: member.reopenedTasks,
      blockedTasks: member.blockedTasks
    };
  });

  // Sort by story points for ranking
  performances.sort((a, b) => b.completedStoryPoints - a.completedStoryPoints);

  // Insert or update performance records
  for (let i = 0; i < performances.length; i++) {
    const perf = performances[i];
    await knex('team_member_sprint_performance')
      .insert({
        sprint_id: sprintId,
        user_id: perf.userId,
        completed_tasks: perf.completedTasks,
        completed_story_points: perf.completedStoryPoints,
        total_work_hours: perf.totalWorkHours,
        avg_task_completion_time: perf.avgTaskCompletionTime,
        contribution_percentage: perf.contributionPercentage,
        velocity: perf.velocity,
        reopened_tasks: perf.reopenedTasks,
        blocked_tasks: perf.blockedTasks,
        performance_rank: i + 1
      })
      .onConflict(['sprint_id', 'user_id'])
      .merge([
        'completed_tasks',
        'completed_story_points',
        'total_work_hours',
        'avg_task_completion_time',
        'contribution_percentage',
        'velocity',
        'reopened_tasks',
        'blocked_tasks',
        'performance_rank',
        'updated_at'
      ]);
  }

  return performances;
}

/**
 * Get team member performance for a sprint
 */
async function getMemberPerformance(sprintId) {
  const knex = db.getKnex();

  const results = await knex('team_member_sprint_performance as tmsp')
    .join('users as u', 'tmsp.user_id', 'u.id')
    .select(
      'tmsp.*',
      'u.username',
      'u.full_name'
    )
    .where('tmsp.sprint_id', sprintId)
    .orderBy('tmsp.performance_rank', 'asc');

  // Map database column names to frontend-expected names
  return results.map(row => ({
    ...row,
    member_id: row.user_id,
    member_name: row.full_name,
    performance_score: 100 // Default score, can be calculated based on metrics
  }));
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get tasks for a sprint
 * Note: This is a simplified implementation.
 * In a real system, you'd have a sprint_tasks junction table or sprint_id on tasks.
 */
async function getSprintTasks(sprintId) {
  const knex = db.getKnex();

  const sprint = await getSprintById(sprintId);
  if (!sprint) return [];

  // Get tasks that were active during the sprint period
  return await knex('tasks as t')
    .leftJoin('users as u', 't.assigned_to', 'u.id')
    .select(
      't.*',
      't.story_points',
      'u.full_name as assignedToName'
    )
    .where('t.project_id', sprint.project_id)
    .andWhere(function () {
      this.where(function () {
        this.where('t.start_date', '>=', sprint.start_date)
          .andWhere('t.start_date', '<=', sprint.end_date);
      })
        .orWhere(function () {
          this.where('t.due_date', '>=', sprint.start_date)
            .andWhere('t.due_date', '<=', sprint.end_date);
        })
        .orWhere(function () {
          this.where('t.start_date', '<=', sprint.start_date)
            .andWhere('t.due_date', '>=', sprint.end_date);
        });
    })
    .orderBy('t.id');
}

/**
 * Get active sprint for a project
 */
async function getActiveSprint(projectId) {
  const knex = db.getKnex();

  return await knex('sprint_goals')
    .select('*')
    .where('project_id', projectId)
    .andWhere('status', 'active')
    .orderBy('created_at', 'desc')
    .first();
}

/**
 * Get sprint statistics
 */
async function getSprintStats(sprintId) {
  const sprint = await getSprintById(sprintId);
  if (!sprint) {
    throw new Error(`Sprint with ID ${sprintId} not found`);
  }

  const tasks = await getSprintTasks(sprintId);
  const progress = await getLatestSprintProgress(sprintId);
  const performance = await getMemberPerformance(sprintId);

  // Calculate task counts
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const remainingTasks = tasks.filter(t => t.status !== 'completed').length;

  // Calculate story points
  const totalStoryPoints = tasks.reduce((sum, t) => sum + (t.story_points || 0), 0);
  const completedStoryPoints = tasks
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + (t.story_points || 0), 0);

  // Calculate progress percentage
  const progressPercentage = totalStoryPoints > 0
    ? (completedStoryPoints / totalStoryPoints) * 100
    : 0;

  // Calculate velocity (story points per day)
  let velocity = 0;
  if (sprint.status === 'active' || sprint.status === 'completed') {
    const startDate = new Date(sprint.start_date);
    const endDate = sprint.status === 'completed'
      ? new Date(sprint.end_date)
      : new Date();
    const elapsedDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
    velocity = completedStoryPoints / elapsedDays;
  }

  return {
    totalTasks,
    completedTasks,
    inProgressTasks,
    remainingTasks,
    totalStoryPoints,
    completedStoryPoints,
    progressPercentage,
    velocity
  };
}

module.exports = {
  // Sprint CRUD
  createSprint,
  getSprintById,
  getSprints,
  updateSprint,
  startSprint,
  completeSprint,
  cancelSprint,

  // Progress tracking
  recordSprintProgress,
  getSprintProgress,
  getLatestSprintProgress,

  // Team performance
  recordMemberPerformance,
  getMemberPerformance,

  // Helpers
  getSprintTasks,
  getActiveSprint,
  getSprintStats
};
