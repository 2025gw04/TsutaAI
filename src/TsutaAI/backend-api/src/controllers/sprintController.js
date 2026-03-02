const sprintService = require('../services/sprintService');
const aiService = require('../services/aiService');

// Helper to map DB result (snake_case) to API response (camelCase)
const mapSprintToResponse = (dbResult) => {
  if (!dbResult) return null;
  return {
    id: dbResult.id,
    projectId: dbResult.project_id,
    projectName: dbResult.projectName, // Already camelCase from service join alias
    sprintName: dbResult.sprint_name,
    sprintNumber: dbResult.sprint_number,
    startDate: dbResult.start_date,
    endDate: dbResult.end_date,
    goalDescription: dbResult.goal_description,
    targetStoryPoints: dbResult.target_story_points,
    targetTaskCount: dbResult.target_task_count,
    status: dbResult.status,
    actualStoryPoints: dbResult.actual_story_points,
    actualTaskCount: dbResult.actual_task_count,
    completedStoryPoints: dbResult.completed_story_points,
    completedTaskCount: dbResult.completed_task_count,
    achievabilityScore: dbResult.achievability_score,
    aiAnalysis: dbResult.ai_analysis,
    createdAt: dbResult.created_at,
    updatedAt: dbResult.updated_at
  };
};

async function createSprint(req, res, next) {
  try {
    const payload = req.body;
    const result = await sprintService.createSprint(payload);
    res.json({ success: true, data: mapSprintToResponse(result) });
  } catch (error) {
    next(error);
  }
}

async function getSprintById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sprintService.getSprintById(Number(id));
    res.json({ success: true, data: mapSprintToResponse(result) });
  } catch (error) {
    next(error);
  }
}

async function getSprints(req, res, next) {
  try {
    const filters = req.query;
    const dbResults = await sprintService.getSprints(filters);
    const results = dbResults.map(mapSprintToResponse);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}

async function updateSprint(req, res, next) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const result = await sprintService.updateSprint(Number(id), updates);
    res.json({ success: true, data: mapSprintToResponse(result) });
  } catch (error) {
    next(error);
  }
}

async function startSprint(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sprintService.startSprint(Number(id));
    res.json({ success: true, data: mapSprintToResponse(result) });
  } catch (error) {
    next(error);
  }
}

async function completeSprint(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sprintService.completeSprint(Number(id));
    res.json({ success: true, data: mapSprintToResponse(result) });
  } catch (error) {
    next(error);
  }
}

async function recordProgress(req, res, next) {
  try {
    const { id } = req.params;
    const { date } = req.body;
    const result = await sprintService.recordSprintProgress(Number(id), date);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getProgress(req, res, next) {
  try {
    const { id } = req.params;
    const { days } = req.query;
    const result = await sprintService.getSprintProgress(Number(id), Number(days) || 30);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getLatestProgress(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sprintService.getLatestSprintProgress(Number(id));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function recordPerformance(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sprintService.recordMemberPerformance(Number(id));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getMemberPerformance(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sprintService.getMemberPerformance(Number(id));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getSprintStats(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sprintService.getSprintStats(Number(id));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function analyzeGoal(req, res, next) {
  try {
    const { id } = req.params;
    const sprint = await sprintService.getSprintById(Number(id));
    const tasks = await sprintService.getSprintTasks(Number(id));

    // Calculate date metrics
    const startDate = new Date(sprint.start_date);
    const endDate = new Date(sprint.end_date);
    const currentDate = new Date();

    const totalDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
    const elapsedDays = Math.max(0, Math.ceil((currentDate - startDate) / (1000 * 60 * 60 * 24)));
    const remainingDays = Math.max(0, Math.ceil((endDate - currentDate) / (1000 * 60 * 60 * 24)));

    // Calculate task metrics
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    const todoTasks = tasks.filter(t => t.status === 'todo' || t.status === 'pending');

    const completedStoryPoints = completedTasks.reduce((sum, t) => sum + (t.story_points || 0), 0);
    const inProgressStoryPoints = inProgressTasks.reduce((sum, t) => sum + (t.story_points || 0), 0);
    const remainingStoryPoints = todoTasks.reduce((sum, t) => sum + (t.story_points || 0), 0);

    const completedTaskCount = completedTasks.length;
    const inProgressTaskCount = inProgressTasks.length;
    const remainingTaskCount = todoTasks.length;

    // Calculate velocity and momentum
    const avgDailyVelocity = elapsedDays > 0 ? completedStoryPoints / elapsedDays : 0;

    // Get team size (unique assignees)
    const uniqueAssignees = new Set(tasks.filter(t => t.assigned_to).map(t => t.assigned_to));
    const teamSize = uniqueAssignees.size;

    // Calculate team metrics (simplified - in production, fetch from activity logs)
    const avgActivityScore = 75; // Default value
    const avgMood = 3.5; // Default value
    const avgStress = 2.5; // Default value

    // Determine momentum based on recent velocity
    let currentMomentum = 'steady';
    if (elapsedDays >= 2) {
      const recentVelocity = avgDailyVelocity;
      const requiredVelocity = remainingDays > 0 ? remainingStoryPoints / remainingDays : 0;

      if (recentVelocity > requiredVelocity * 1.2) {
        currentMomentum = 'accelerating';
      } else if (recentVelocity < requiredVelocity * 0.8) {
        currentMomentum = 'slowing';
      } else if (recentVelocity < requiredVelocity * 0.5) {
        currentMomentum = 'stalled';
      }
    }

    // Format tasks for AI
    const formattedTasks = tasks.map(task => ({
      name: task.title || task.name,
      storyPoints: task.story_points || 0,
      status: task.status || 'todo',
      assignedTo: task.assignedToName || task.assignee_name || '未割当',
      progress: task.progress || 0
    }));

    // Prepare payload for AI
    const aiPayload = {
      sprintName: sprint.sprint_name,
      sprintNumber: sprint.sprint_number || 1,
      startDate: sprint.start_date,
      endDate: sprint.end_date,
      remainingDays,
      elapsedDays,
      totalDays,
      goalDescription: sprint.goal_description || '',
      targetStoryPoints: sprint.target_story_points || 0,
      targetTaskCount: sprint.target_task_count || 0,
      completedStoryPoints,
      completedTaskCount,
      inProgressStoryPoints,
      inProgressTaskCount,
      remainingStoryPoints,
      remainingTaskCount,
      teamSize,
      avgDailyVelocity: parseFloat(avgDailyVelocity.toFixed(2)),
      currentMomentum,
      avgActivityScore,
      avgMood,
      avgStress,
      tasks: formattedTasks
    };

    const analysis = await aiService.analyzeSprintGoalAI(aiPayload);

    if (analysis.achievabilityAnalysis) {
      await sprintService.updateSprint(Number(id), {
        achievability_score: analysis.achievabilityAnalysis.achievabilityScore,
        ai_analysis: JSON.stringify(analysis)
      });
    }

    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createSprint,
  getSprintById,
  getSprints,
  updateSprint,
  startSprint,
  completeSprint,
  recordProgress,
  getProgress,
  getLatestProgress,
  recordPerformance,
  getMemberPerformance,
  getSprintStats,
  analyzeGoal
};
