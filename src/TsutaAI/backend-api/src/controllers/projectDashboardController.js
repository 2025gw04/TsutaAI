const projectDashboardService = require('../services/projectDashboardService');
const aiService = require('../services/aiService');

async function calculateHealthScore(req, res, next) {
  try {
    const { projectId } = req.params;
    const result = await projectDashboardService.calculateProjectHealthScore(Number(projectId));

    // Generate AI analysis
    const aiAnalysis = await aiService.calculateProjectHealthScoreAI({
      projectName: result.projectId,
      ...result.metrics,
      ...result.components
    });

    // Update with AI analysis
    if (aiAnalysis) {
      // AI分析の結果を保存(overallAssessmentとconfidenceを含むオブジェクト)
      const aiAnalysisData = {
        overallAssessment: aiAnalysis.overallAssessment || '',
        confidence: aiAnalysis.confidence || 0
      };

      await projectDashboardService.updateHealthScoreAnalysis(
        result.id,
        aiAnalysisData,
        aiAnalysis.riskFactors || [],
        aiAnalysis.recommendations || []
      );
    }

    // レスポンスをフラットな構造にして、C#モデルと一致させる
    const responseData = {
      id: result.id,
      projectId: result.projectId,
      healthScore: result.healthScore,
      scoreDate: result.scoreDate,
      progressScore: result.components.progressScore,
      deadlineScore: result.components.deadlineScore,
      teamMoraleScore: result.components.teamMoraleScore,
      blockerScore: result.components.blockerScore,
      velocityScore: result.components.velocityScore,
      aiAnalysis: aiAnalysis?.overallAssessment || '',
      riskFactors: aiAnalysis?.riskFactors?.join(', ') || '',
      recommendations: aiAnalysis?.recommendations?.join(', ') || ''
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    next(error);
  }
}

async function getLatestHealthScore(req, res, next) {
  try {
    const { projectId } = req.params;
    const dbResult = await projectDashboardService.getLatestHealthScore(Number(projectId));

    if (!dbResult) {
      return res.json({ success: true, data: null });
    }

    // JSON文字列をパースする関数
    const parseJsonField = (field) => {
      if (!field) return '';
      try {
        const parsed = JSON.parse(field);
        // オブジェクトの場合は overallAssessment を返す（存在する場合）
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          // overallAssessment プロパティがある場合はその値を返す
          if ('overallAssessment' in parsed) {
            return parsed.overallAssessment || '';
          }
          // その他のオブジェクトの場合は空文字を返す
          return '';
        }
        // 配列の場合は結合して返す
        if (Array.isArray(parsed)) {
          return parsed.join(', ');
        }
        // 文字列の場合はそのまま返す
        return String(parsed);
      } catch (e) {
        // JSONパースに失敗した場合は元の文字列を返す
        return field;
      }
    };

    // データベースの snake_case を camelCase にマッピング
    const result = {
      id: dbResult.id,
      projectId: dbResult.project_id,
      healthScore: dbResult.health_score,
      scoreDate: dbResult.score_date,
      progressScore: dbResult.progress_score,
      deadlineScore: dbResult.deadline_score,
      teamMoraleScore: dbResult.team_morale_score,
      blockerScore: dbResult.blocker_score,
      velocityScore: dbResult.velocity_score,
      aiAnalysis: parseJsonField(dbResult.ai_analysis),
      riskFactors: parseJsonField(dbResult.risk_factors),
      recommendations: parseJsonField(dbResult.recommendations),
      createdAt: dbResult.created_at
    };

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getHealthScoreHistory(req, res, next) {
  try {
    const { projectId } = req.params;
    const { days } = req.query;
    const dbResults = await projectDashboardService.getHealthScoreHistory(Number(projectId), Number(days) || 30);

    // JSON文字列をパースする関数
    const parseJsonField = (field) => {
      if (!field) return '';
      try {
        const parsed = JSON.parse(field);
        // オブジェクトの場合は overallAssessment を返す（存在する場合）
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          if ('overallAssessment' in parsed) {
            return parsed.overallAssessment || '';
          }
          return '';
        }
        if (Array.isArray(parsed)) {
          return parsed.join(', ');
        }
        return String(parsed);
      } catch (e) {
        return field;
      }
    };

    // 各レコードをマッピング
    const results = dbResults.map(dbResult => ({
      id: dbResult.id,
      projectId: dbResult.project_id,
      healthScore: dbResult.health_score,
      scoreDate: dbResult.score_date,
      progressScore: dbResult.progress_score,
      deadlineScore: dbResult.deadline_score,
      teamMoraleScore: dbResult.team_morale_score,
      blockerScore: dbResult.blocker_score,
      velocityScore: dbResult.velocity_score,
      aiAnalysis: parseJsonField(dbResult.ai_analysis),
      riskFactors: parseJsonField(dbResult.risk_factors),
      recommendations: parseJsonField(dbResult.recommendations),
      createdAt: dbResult.created_at
    }));

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}

async function recordBurndown(req, res, next) {
  try {
    const { projectId } = req.params;
    const { date } = req.body;
    const result = await projectDashboardService.recordBurndownData(Number(projectId), date);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getBurndownData(req, res, next) {
  try {
    const { projectId } = req.params;
    const { days } = req.query;
    const dbResults = await projectDashboardService.getBurndownData(Number(projectId), Number(days) || 30);

    // 各レコードをマッピング
    const results = dbResults.map(dbResult => ({
      id: dbResult.id,
      projectId: dbResult.project_id,
      date: dbResult.date,
      plannedRemainingTasks: dbResult.planned_remaining_tasks,
      plannedRemainingHours: dbResult.planned_remaining_hours,
      actualRemainingTasks: dbResult.actual_remaining_tasks,
      actualRemainingHours: dbResult.actual_remaining_hours,
      completedTasksCount: dbResult.completed_tasks_count,
      completedHours: dbResult.completed_hours,
      createdAt: dbResult.created_at
    }));

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}

async function analyzeCriticalPath(req, res, next) {
  try {
    const { projectId } = req.params;
    const tasks = await projectDashboardService.analyzeCriticalPath(Number(projectId));

    // クリティカルタスクのみをフィルタリング
    const criticalTasks = tasks.filter(t => t.isCritical);

    // 最長パス日数を計算（簡易版）
    const longestPathDays = criticalTasks.length > 0
      ? Math.max(...criticalTasks.map(t => t.slackDays || 0))
      : 0;

    // プロジェクト終了予測日を計算（簡易版）
    const today = new Date();
    const projectEndDate = new Date(today.getTime() + longestPathDays * 24 * 60 * 60 * 1000);

    // リスクと推奨事項を生成
    const risks = [];
    const recommendations = [];

    if (criticalTasks.length > 5) {
      risks.push('クリティカルタスクが多すぎます');
      recommendations.push('タスクの優先順位を見直し、並行作業を検討してください');
    }

    if (criticalTasks.some(t => t.slackDays === 0)) {
      risks.push('余裕のないタスクが存在します');
      recommendations.push('リソースを追加配分するか、スコープを調整してください');
    }

    // CriticalPathAnalysis オブジェクトを構築
    const analysis = {
      projectId: Number(projectId),
      analysisDate: new Date().toISOString().split('T')[0],
      criticalTasks: criticalTasks.map(t => ({
        taskId: t.taskId,
        taskName: t.taskName,
        isCritical: t.isCritical,
        slackDays: t.slackDays,
        blockingTaskCount: t.blockingTaskCount,
        blockedByCount: t.blockedByCount,
        status: t.status,
        progress: t.progress,
        impactAnalysis: `このタスクは${t.blockingTaskCount}個のタスクをブロックしています`
      })),
      totalCriticalTasks: criticalTasks.length,
      longestPathDays: longestPathDays,
      projectEndDate: projectEndDate.toISOString().split('T')[0],
      risks: risks,
      recommendations: recommendations
    };

    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
}

async function getCriticalPathData(req, res, next) {
  try {
    const { projectId } = req.params;
    const { date } = req.query;
    const dbResults = await projectDashboardService.getCriticalPathData(Number(projectId), date);

    // snake_case を camelCase にマッピング
    const results = dbResults.map(row => ({
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      analysisDate: row.analysis_date,
      isCritical: row.is_critical === 1,
      slackDays: row.slack_days,
      earliestStart: row.earliest_start,
      latestStart: row.latest_start,
      earliestFinish: row.earliest_finish,
      latestFinish: row.latest_finish,
      blockingTaskCount: row.blocking_task_count,
      blockedByCount: row.blocked_by_count,
      dependencyChainLength: row.dependency_chain_length,
      impactAnalysis: row.impact_analysis,
      riskAssessment: row.risk_assessment,
      createdAt: row.created_at,
      taskName: row.taskName,
      status: row.status,
      progress: row.progress,
      assignedTo: row.assignedTo
    }));

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  calculateHealthScore,
  getLatestHealthScore,
  getHealthScoreHistory,
  recordBurndown,
  getBurndownData,
  analyzeCriticalPath,
  getCriticalPathData
};
