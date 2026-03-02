// ヘルプリクエストサービス (Knex.js対応版)
const db = require('./database');

/**
 * Help Request Service
 * Handles help requests, helper matching, and request lifecycle
 */

// ============================================================================
// Help Request CRUD
// ============================================================================

/**
 * Create a new help request
 * @param {object} payload - Help request data
 * @returns {object} Created help request
 */
async function createHelpRequest(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const {
    taskId,
    requesterId,
    requestTitle,
    requestDescription,
    urgency = 'medium',
    aiContextSummary = null,
    problemType = null,
    detectedIssues = null,
    assignedTo = null,
    assignedAt = null,
    status = 'open'
  } = payload;

  const insertData = {
    task_id: taskId,
    requester_id: requesterId,
    request_title: requestTitle,
    request_description: requestDescription,
    urgency,
    ai_context_summary: aiContextSummary,
    problem_type: problemType,
    detected_issues: detectedIssues,
    status,
    assigned_to: assignedTo,
    assigned_at: assignedAt
  };

  let requestId;
  if (dbClient === 'pg') {
    const [result] = await knex('help_requests').insert(insertData).returning('id');
    requestId = result.id || result;
  } else {
    const [id] = await knex('help_requests').insert(insertData);
    requestId = id;
  }

  return getHelpRequestById(requestId);
}

/**
 * Get help request by ID
 */
async function getHelpRequestById(requestId) {
  const knex = db.getKnex();

  return await knex('help_requests as hr')
    .leftJoin('tasks as t', 'hr.task_id', 't.id')
    .leftJoin('projects as p', 't.project_id', 'p.id')
    .leftJoin('users as requester', 'hr.requester_id', 'requester.id')
    .leftJoin('users as helper', 'hr.assigned_to', 'helper.id')
    .select(
      'hr.id',
      'hr.task_id as taskId',
      'hr.requester_id as requesterId',
      'hr.request_title as requestTitle',
      'hr.request_description as requestDescription',
      'hr.urgency',
      'hr.ai_context_summary as aiContextSummary',
      'hr.problem_type as problemType',
      'hr.detected_issues as detectedIssues',
      'hr.status',
      'hr.effectiveness',
      'hr.assigned_to as assignedTo',
      'hr.assigned_at as assignedAt',
      'hr.resolved_at as resolvedAt',
      'hr.resolution_notes as resolutionNotes',
      'hr.created_at as createdAt',
      'hr.updated_at as updatedAt',
      't.name as taskName',
      't.project_id as projectId',
      'p.name as projectName',
      'requester.username as requesterUsername',
      'requester.full_name as requesterName',
      'helper.username as assignedToUsername',
      'helper.full_name as assignedToName'
    )
    .where('hr.id', requestId)
    .first();
}

/**
 * Get help requests with filters
 */
async function getHelpRequests(filters = {}) {
  const knex = db.getKnex();

  let query = knex('help_requests as hr')
    .leftJoin('tasks as t', 'hr.task_id', 't.id')
    .leftJoin('projects as p', 't.project_id', 'p.id')
    .leftJoin('users as requester', 'hr.requester_id', 'requester.id')
    .leftJoin('users as helper', 'hr.assigned_to', 'helper.id')
    .select(
      'hr.id',
      'hr.task_id as taskId',
      'hr.requester_id as requesterId',
      'hr.request_title as requestTitle',
      'hr.request_description as requestDescription',
      'hr.urgency',
      'hr.ai_context_summary as aiContextSummary',
      'hr.problem_type as problemType',
      'hr.detected_issues as detectedIssues',
      'hr.status',
      'hr.effectiveness',
      'hr.assigned_to as assignedTo',
      'hr.assigned_at as assignedAt',
      'hr.resolved_at as resolvedAt',
      'hr.resolution_notes as resolutionNotes',
      'hr.created_at as createdAt',
      'hr.updated_at as updatedAt',
      't.name as taskName',
      't.project_id as projectId',
      'p.name as projectName',
      'requester.username as requesterUsername',
      'requester.full_name as requesterName',
      'helper.username as assignedToUsername',
      'helper.full_name as assignedToName'
    );

  if (filters.status) {
    query = query.where('hr.status', filters.status);
  }

  if (filters.requesterId) {
    query = query.where('hr.requester_id', filters.requesterId);
  }

  if (filters.assignedTo) {
    query = query.where('hr.assigned_to', filters.assignedTo);
  }

  if (filters.urgency) {
    query = query.where('hr.urgency', filters.urgency);
  }

  if (filters.projectId) {
    query = query.where('t.project_id', filters.projectId);
  }

  query = query.orderBy('hr.id', 'desc');

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  return await query;
}

/**
 * Update help request
 */
async function updateHelpRequest(requestId, updates) {
  const knex = db.getKnex();

  const allowedFields = [
    'request_title',
    'request_description',
    'urgency',
    'status',
    'assigned_to',
    'resolution_notes',
    'effectiveness'
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

  // Update timestamp
  updateData.updated_at = knex.fn.now();

  // Handle special fields
  if (updates.assigned_to) {
    updateData.assigned_at = knex.fn.now();
  }

  if (updates.status === 'resolved') {
    updateData.resolved_at = knex.fn.now();
  }

  await knex('help_requests')
    .where('id', requestId)
    .update(updateData);

  return getHelpRequestById(requestId);
}

/**
 * Assign help request to a helper
 */
async function assignHelpRequest(requestId, helperId) {
  return updateHelpRequest(requestId, {
    assigned_to: helperId,
    status: 'assigned'
  });
}

/**
 * Resolve help request
 */
async function resolveHelpRequest(requestId, resolutionNotes, effectiveness = null) {
  const updateData = {
    status: 'resolved',
    resolution_notes: resolutionNotes
  };
  if (effectiveness) {
    updateData.effectiveness = effectiveness;
  }
  return updateHelpRequest(requestId, updateData);
}

/**
 * Delete help request
 */
async function deleteHelpRequest(requestId) {
  const knex = db.getKnex();

  // トランザクションを使用して、ヘルプリクエストと関連通知を削除
  await knex.transaction(async (trx) => {
    // 1. 関連する通知を削除
    await trx('notifications')
      .where('related_entity_type', 'help_request')
      .where('related_entity_id', requestId)
      .del();

    // 2. ヘルプリクエストのサジェスチョンを削除
    await trx('help_request_suggestions')
      .where('help_request_id', requestId)
      .del();

    // 3. ヘルプリクエスト本体を削除
    await trx('help_requests')
      .where('id', requestId)
      .del();
  });

  return { deleted: true };
}

/**
 * Cancel help request
 */
async function cancelHelpRequest(requestId) {
  return updateHelpRequest(requestId, {
    status: 'cancelled'
  });
}

// ============================================================================
// Helper Suggestions
// ============================================================================

/**
 * Create helper suggestions for a help request
 * @param {number} requestId - Help request ID
 * @param {array} suggestions - Array of suggestion objects
 */
async function createHelperSuggestions(requestId, suggestions) {
  const knex = db.getKnex();
  const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  await knex.transaction(async (trx) => {
    for (const [index, sugg] of suggestions.entries()) {
      const scores = sugg.matchScores || {};
      const skillScore = toNumberOrNull(scores.skillMatchScore ?? sugg.skillMatchScore ?? sugg.skillMatch);
      const availabilityScore = toNumberOrNull(scores.availabilityScore ?? sugg.availabilityScore ?? sugg.availability);
      const experienceScore = toNumberOrNull(scores.experienceScore ?? sugg.experienceScore ?? sugg.experience);
      const totalScore = toNumberOrNull(scores.totalMatchScore ?? sugg.totalMatchScore ?? sugg.overallScore);

      await trx('help_request_suggestions').insert({
        help_request_id: requestId,
        suggested_user_id: sugg.userId,
        skill_match_score: skillScore,
        availability_score: availabilityScore,
        experience_score: experienceScore,
        total_match_score: totalScore,
        ai_reasoning: sugg.reasoning,
        recommended_approach: sugg.recommendedApproach,
        suggestion_rank: toNumberOrNull(sugg.suggestionRank) ?? (index + 1)
      });
    }
  });

  return getHelperSuggestions(requestId);
}

/**
 * Get helper suggestions for a help request
 */
async function getHelperSuggestions(requestId) {
  const knex = db.getKnex();

  return await knex('help_request_suggestions as hrs')
    .join('users as u', 'hrs.suggested_user_id', 'u.id')
    .select(
      'hrs.*',
      'u.username',
      'u.full_name',
      'u.email'
    )
    .where('hrs.help_request_id', requestId)
    .orderBy('hrs.suggestion_rank', 'asc');
}

/**
 * Mark suggestion as accepted
 */
async function acceptSuggestion(suggestionId) {
  const knex = db.getKnex();

  return await knex('help_request_suggestions')
    .where('id', suggestionId)
    .update({ was_accepted: 1 });
}

/**
 * Get candidate helpers for matching
 * Returns users with their current workload and skills
 */
async function getCandidateHelpers(requesterId) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('users as u')
    .leftJoin('tasks as t', 'u.id', 't.assigned_to')
    .leftJoin('activity_logs as al', function () {
      this.on('u.id', 'al.user_id');
      const dateCondition = dbClient === 'better-sqlite3' ? "datetime('now', '-7 days')"
        : dbClient === 'pg' ? "CURRENT_TIMESTAMP - INTERVAL '7 days'"
          : dbClient === 'mysql2' ? "DATE_SUB(NOW(), INTERVAL 7 DAY)"
            : "DATEADD(DAY, -7, GETDATE())";

      this.andOn(knex.raw(`al.timestamp >= ${dateCondition}`));
    })
    .leftJoin('mental_health_logs as mhl', function () {
      this.on('u.id', 'mhl.user_id');
      const dateCondition = dbClient === 'better-sqlite3' ? "date('now', '-7 days')"
        : dbClient === 'pg' ? "CURRENT_DATE - INTERVAL '7 days'"
          : dbClient === 'mysql2' ? "DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
            : "DATEADD(DAY, -7, CAST(GETDATE() AS DATE))";

      this.andOn(knex.raw(`mhl.report_date >= ${dateCondition}`));
    })
    .select(
      'u.id',
      'u.username',
      'u.full_name as fullName',
      'u.email',
      'u.role'
    )
    .countDistinct({ inProgressTaskCount: knex.raw("CASE WHEN t.status = 'in_progress' THEN t.id END") })
    .sum({ totalEstimatedHours: knex.raw("CASE WHEN t.status = 'in_progress' THEN COALESCE(t.estimated_hours, 8) ELSE 0 END") })
    .avg({ avgActivityScore: 'al.activity_score' })
    .sum({ weeklyWorkHours: knex.raw('CASE WHEN al.activity_score IS NOT NULL THEN al.activity_score / 100.0 ELSE 0 END') })
    .avg({ avgMood: 'mhl.mood' })
    .avg({ avgStress: 'mhl.stress_level' });

  // Count recent completed tasks
  if (dbClient === 'better-sqlite3') {
    query = query.countDistinct({ recentCompletedTasks: knex.raw("CASE WHEN t.status = 'completed' AND t.actual_end_date >= date('now', '-30 days') THEN t.id END") });
  } else if (dbClient === 'pg') {
    query = query.countDistinct({ recentCompletedTasks: knex.raw("CASE WHEN t.status = 'completed' AND t.actual_end_date >= CURRENT_DATE - INTERVAL '30 days' THEN t.id END") });
  } else if (dbClient === 'mysql2') {
    query = query.countDistinct({ recentCompletedTasks: knex.raw("CASE WHEN t.status = 'completed' AND t.actual_end_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN t.id END") });
  } else {
    query = query.countDistinct({ recentCompletedTasks: knex.raw("CASE WHEN t.status = 'completed' AND t.actual_end_date >= DATEADD(DAY, -30, CAST(GETDATE() AS DATE)) THEN t.id END") });
  }

  query = query
    .where('u.id', '!=', requesterId)
    .whereNot('u.role', 'admin')
    .groupBy('u.id');

  let candidates = await query;

  // Fetch skills for each candidate
  for (const candidate of candidates) {
    const skills = await knex('user_skills')
      .where('user_id', candidate.id)
      .select('skill_name', 'skill_level');

    candidate.skills = skills.length > 0
      ? skills.map(s => `${s.skill_name}(Lv${s.skill_level})`).join(', ')
      : 'スキル情報なし';
  }

  return candidates;
}

/**
 * Get related task experience for a user
 */
async function getRelatedTaskExperience(userId, technicalArea, limit = 5) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('tasks as t')
    .select(
      't.id',
      't.name as taskName',
      't.actual_end_date as completionDate',
      't.description',
      knex.raw("'Completed successfully' as outcome")
    )
    .where('t.assigned_to', userId)
    .where('t.status', 'completed');

  // Filter by recent tasks (180 days)
  if (dbClient === 'better-sqlite3') {
    query = query.whereRaw("t.actual_end_date >= date('now', '-180 days')");
  } else if (dbClient === 'pg') {
    query = query.whereRaw("t.actual_end_date >= CURRENT_DATE - INTERVAL '180 days'");
  } else if (dbClient === 'mysql2') {
    query = query.whereRaw('t.actual_end_date >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)');
  } else {
    query = query.whereRaw('t.actual_end_date >= DATEADD(DAY, -180, CAST(GETDATE() AS DATE))');
  }

  return await query.orderBy('t.actual_end_date', 'desc').limit(limit);
}

/**
 * Get help provider statistics for a user
 */
async function getHelpProviderStats(userId) {
  const knex = db.getKnex();

  const stats = await knex('help_requests')
    .where('assigned_to', userId)
    .select(
      knex.raw('COUNT(*) as helpProvidedCount'),
      knex.raw("SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as successfulHelps")
    )
    .first();

  const helpSuccessRate = stats.helpProvidedCount > 0
    ? (stats.successfulHelps / stats.helpProvidedCount) * 100
    : 0;

  return {
    helpProvidedCount: stats.helpProvidedCount || 0,
    helpSuccessRate: Math.round(helpSuccessRate)
  };
}

// ============================================================================
// Statistics and Analytics
// ============================================================================

/**
 * Get help request statistics
 */
async function getHelpRequestStats(filters = {}) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('help_requests as hr')
    .join('tasks as t', 'hr.task_id', 't.id')
    .select(
      knex.raw('COUNT(*) as total'),
      knex.raw("SUM(CASE WHEN hr.status = 'open' THEN 1 ELSE 0 END) as open"),
      knex.raw("SUM(CASE WHEN hr.status = 'assigned' THEN 1 ELSE 0 END) as assigned"),
      knex.raw("SUM(CASE WHEN hr.status = 'in_progress' THEN 1 ELSE 0 END) as inProgress"),
      knex.raw("SUM(CASE WHEN hr.status = 'resolved' THEN 1 ELSE 0 END) as resolved"),
      knex.raw("SUM(CASE WHEN hr.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled"),
      knex.raw("SUM(CASE WHEN hr.urgency = 'critical' THEN 1 ELSE 0 END) as critical"),
      knex.raw("SUM(CASE WHEN hr.urgency = 'high' THEN 1 ELSE 0 END) as high")
    );

  // Calculate average resolution days based on DB
  if (dbClient === 'better-sqlite3') {
    query = query.select(knex.raw(`
      AVG(CASE
        WHEN hr.resolved_at IS NOT NULL AND hr.created_at IS NOT NULL
        THEN (julianday(hr.resolved_at) - julianday(hr.created_at))
        ELSE NULL
      END) as avgResolutionDays
    `));
  } else if (dbClient === 'pg') {
    query = query.select(knex.raw(`
      AVG(CASE
        WHEN hr.resolved_at IS NOT NULL AND hr.created_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (hr.resolved_at - hr.created_at)) / 86400
        ELSE NULL
      END) as "avgResolutionDays"
    `));
  } else if (dbClient === 'mysql2') {
    query = query.select(knex.raw(`
      AVG(CASE
        WHEN hr.resolved_at IS NOT NULL AND hr.created_at IS NOT NULL
        THEN DATEDIFF(hr.resolved_at, hr.created_at)
        ELSE NULL
      END) as avgResolutionDays
    `));
  } else {
    query = query.select(knex.raw(`
      AVG(CASE
        WHEN hr.resolved_at IS NOT NULL AND hr.created_at IS NOT NULL
        THEN DATEDIFF(DAY, hr.created_at, hr.resolved_at)
        ELSE NULL
      END) as avgResolutionDays
    `));
  }

  if (filters.projectId) {
    query = query.where('t.project_id', filters.projectId);
  }

  if (filters.startDate) {
    query = query.where('hr.created_at', '>=', filters.startDate);
  }

  if (filters.endDate) {
    query = query.where('hr.created_at', '<=', filters.endDate);
  }

  return await query.first();
}

/**
 * Get top helpers (users who provide the most help)
 */
async function getTopHelpers(limit = 10) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let query = knex('users as u')
    .join('help_requests as hr', 'u.id', 'hr.assigned_to')
    .select(
      'u.id',
      'u.username',
      'u.full_name',
      knex.raw('COUNT(hr.id) as totalHelps'),
      knex.raw("SUM(CASE WHEN hr.status = 'resolved' THEN 1 ELSE 0 END) as resolvedHelps")
    )
    .groupBy('u.id')
    .having(knex.raw('COUNT(hr.id) > 0'));

  // Calculate average resolution days based on DB
  if (dbClient === 'better-sqlite3') {
    query = query.select(knex.raw(`
      AVG(CASE
        WHEN hr.resolved_at IS NOT NULL AND hr.assigned_at IS NOT NULL
        THEN (julianday(hr.resolved_at) - julianday(hr.assigned_at))
        ELSE NULL
      END) as avgResolutionDays
    `));
  } else if (dbClient === 'pg') {
    query = query.select(knex.raw(`
      AVG(CASE
        WHEN hr.resolved_at IS NOT NULL AND hr.assigned_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (hr.resolved_at - hr.assigned_at)) / 86400
        ELSE NULL
      END) as "avgResolutionDays"
    `));
  } else if (dbClient === 'mysql2') {
    query = query.select(knex.raw(`
      AVG(CASE
        WHEN hr.resolved_at IS NOT NULL AND hr.assigned_at IS NOT NULL
        THEN DATEDIFF(hr.resolved_at, hr.assigned_at)
        ELSE NULL
      END) as avgResolutionDays
    `));
  } else {
    query = query.select(knex.raw(`
      AVG(CASE
        WHEN hr.resolved_at IS NOT NULL AND hr.assigned_at IS NOT NULL
        THEN DATEDIFF(DAY, hr.assigned_at, hr.resolved_at)
        ELSE NULL
      END) as avgResolutionDays
    `));
  }

  return await query
    .orderBy('resolvedHelps', 'desc')
    .orderBy('avgResolutionDays', 'asc')
    .limit(limit);
}

module.exports = {
  // Help request CRUD
  createHelpRequest,
  getHelpRequestById,
  getHelpRequests,
  updateHelpRequest,
  assignHelpRequest,
  resolveHelpRequest,
  deleteHelpRequest,
  cancelHelpRequest,

  // Helper suggestions
  createHelperSuggestions,
  getHelperSuggestions,
  acceptSuggestion,
  getCandidateHelpers,
  getRelatedTaskExperience,
  getHelpProviderStats,

  // Statistics
  getHelpRequestStats,
  getTopHelpers
};
