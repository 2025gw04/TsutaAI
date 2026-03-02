// 成長トラッキングコントローラー
const growthTrackingService = require('../services/growthTrackingService');
const growthAnalysisService = require('../services/growthAnalysisService');

// =============================================
// 成長レポート
// =============================================

/**
 * 成長レポートを取得
 */
async function getGrowthReport(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const months = Number(req.query.months) || 6;
    const includeGoals = req.query.includeGoals !== 'false';
    const includeContributions = req.query.includeContributions !== 'false';

    const report = await growthTrackingService.generateGrowthReport(userId, {
      months,
      includeGoals,
      includeContributions
    });

    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
}

// =============================================
// スキル成長履歴
// =============================================

/**
 * スキル成長履歴を取得
 */
async function getSkillGrowthHistory(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const months = Number(req.query.months) || 6;
    const skillName = req.query.skillName;

    let history;
    if (skillName) {
      history = await growthTrackingService.getSkillGrowthHistoryBySkill(userId, skillName, months);
    } else {
      history = await growthTrackingService.getSkillGrowthHistory(userId, months);
    }

    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
}

/**
 * スキル成長履歴を記録
 */
async function recordSkillGrowth(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const { skillName, skillLevel, changeReason, notes } = req.body;

    if (!skillName || skillLevel === undefined) {
      return res.status(400).json({
        success: false,
        message: 'skillNameとskillLevelは必須です'
      });
    }

    const result = await growthTrackingService.recordSkillGrowth(
      userId,
      skillName,
      skillLevel,
      changeReason,
      notes
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// =============================================
// パフォーマンスメトリクス
// =============================================

/**
 * パフォーマンスメトリクスを取得
 */
async function getPerformanceMetrics(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const months = Number(req.query.months) || 6;

    const metrics = await growthTrackingService.getPerformanceMetrics(userId, months);
    res.json({ success: true, data: metrics });
  } catch (error) {
    next(error);
  }
}

/**
 * パフォーマンスメトリクスを計算・保存（手動実行）
 */
async function calculateMetrics(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const targetMonth = req.body.targetMonth || new Date().toISOString().slice(0, 7);

    const result = await growthTrackingService.calculateAndSaveMonthlyMetrics(userId, targetMonth);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// =============================================
// 主な貢献
// =============================================

/**
 * 貢献一覧を取得
 */
async function getContributions(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const { startDate, endDate } = req.query;

    const contributions = await growthTrackingService.getContributions(userId, startDate, endDate);
    res.json({ success: true, data: contributions });
  } catch (error) {
    next(error);
  }
}

/**
 * 貢献を記録
 */
async function recordContribution(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const contribution = req.body;

    if (!contribution.title) {
      return res.status(400).json({
        success: false,
        message: 'titleは必須です'
      });
    }

    const result = await growthTrackingService.recordContribution(userId, contribution);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// =============================================
// 成長目標
// =============================================

/**
 * 成長目標一覧を取得
 */
async function getGrowthGoals(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const status = req.query.status || null;

    const goals = await growthTrackingService.getGrowthGoals(userId, status);
    res.json({ success: true, data: goals });
  } catch (error) {
    next(error);
  }
}

/**
 * 成長目標を作成
 */
async function createGrowthGoal(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const goal = req.body;

    if (!goal.goalTitle && !goal.title) {
      return res.status(400).json({
        success: false,
        message: 'goalTitle（またはtitle）は必須です'
      });
    }

    const result = await growthTrackingService.createGrowthGoal(userId, goal);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * 成長目標を更新
 */
async function updateGrowthGoal(req, res, next) {
  try {
    const goalId = Number(req.params.goalId);
    const updates = req.body;

    const result = await growthTrackingService.updateGrowthGoal(goalId, updates);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * 成長目標を削除
 */
async function deleteGrowthGoal(req, res, next) {
  try {
    const goalId = Number(req.params.goalId);

    const result = await growthTrackingService.deleteGrowthGoal(goalId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// =============================================
// AI分析
// =============================================

/**
 * 強みを分析（AI）
 */
async function analyzeStrengths(req, res, next) {
  try {
    const userId = Number(req.params.userId);

    const result = await growthAnalysisService.analyzeStrengths(userId);

    // C#モデルに合わせてレスポンスを整形
    const response = {
      userId: userId,
      topStrengths: (result.strengths || []).map(strength => ({
        skillName: strength.name || strength,
        level: strength.score || 0,
        evidence: strength.reason || strength.name || strength,
        score: strength.score || 0
      })),
      summary: (result.strengths || []).map(s => s.name || s).join(', '),
      recommendations: []
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
}

/**
 * 成長機会を提案（AI）
 */
async function suggestOpportunities(req, res, next) {
  try {
    const userId = Number(req.params.userId);

    const result = await growthAnalysisService.suggestGrowthOpportunities(userId);

    // C#モデルに合わせてレスポンスを整形
    const response = (result.opportunities || []).map(opportunity => ({
      title: opportunity,
      description: opportunity,
      skillToImprove: '',
      currentLevel: 0,
      targetLevel: 0,
      estimatedWeeks: 4,
      reasoning: opportunity,
      priority: 'medium'
    }));

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
}

/**
 * 目標を提案（AI）
 */
async function suggestGoals(req, res, next) {
  try {
    const userId = Number(req.params.userId);

    const result = await growthAnalysisService.generateGoalSuggestions(userId);

    // C#モデルに合わせてレスポンスを整形
    const response = (result.goals || []).map(goal => ({
      title: goal.title || '',
      description: goal.description || '',
      targetSkill: goal.targetSkill || '',
      targetLevel: goal.targetLevel || 0,
      estimatedDurationWeeks: goal.estimatedWeeks || 4,
      reasoning: goal.description || '',
      milestones: []
    }));

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
}

// =============================================
// レポート生成
// =============================================

/**
 * 1on1資料を生成（AI）
 */
async function generate1on1Material(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const period = req.body.period || req.query.period || 'monthly';

    const result = await growthAnalysisService.generate1on1Material(userId, period);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * 評価シートを生成（AI）
 */
async function generateEvaluationSheet(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const evaluationPeriod = req.body.evaluationPeriod || req.query.evaluationPeriod || 'Q1';

    const result = await growthAnalysisService.generateEvaluationSheet(userId, evaluationPeriod);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  // 成長レポート
  getGrowthReport,

  // スキル成長履歴
  getSkillGrowthHistory,
  recordSkillGrowth,

  // パフォーマンスメトリクス
  getPerformanceMetrics,
  calculateMetrics,

  // 主な貢献
  getContributions,
  recordContribution,

  // 成長目標
  getGrowthGoals,
  createGrowthGoal,
  updateGrowthGoal,
  deleteGrowthGoal,

  // AI分析
  analyzeStrengths,
  suggestOpportunities,
  suggestGoals,

  // レポート生成
  generate1on1Material,
  generateEvaluationSheet
};
