// 進捗予測を扱うコントローラー
const progressPredictionService = require('../services/progressPredictionService');
const aiService = require('../services/aiService');

/**
 * タスクの進捗予測を計算して取得
 */
async function calculatePrediction(req, res, next) {
  try {
    const taskId = parseInt(req.params.taskId);
    const userId = parseInt(req.body.userId) || null;

    const prediction = await progressPredictionService.calculateAndSaveProgressPrediction(taskId, userId);

    res.json({
      success: true,
      data: prediction,
      message: '進捗予測を計算しました'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * タスクの最新予測を取得
 */
async function getLatestPrediction(req, res, next) {
  try {
    const taskId = parseInt(req.params.taskId);

    const prediction = await progressPredictionService.getLatestPrediction(taskId);

    if (!prediction) {
      return res.status(404).json({
        success: false,
        message: '予測データが見つかりません'
      });
    }

    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    next(error);
  }
}

/**
 * タスクの予測履歴を取得
 */
async function getPredictionHistory(req, res, next) {
  try {
    const taskId = parseInt(req.params.taskId);
    const limit = parseInt(req.query.limit) || 30;

    const history = await progressPredictionService.getPredictionHistory(taskId, limit);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    next(error);
  }
}

/**
 * ユーザーの全タスクの予測を取得
 */
async function getUserPredictions(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);

    const predictions = await progressPredictionService.getUserPredictions(userId);

    res.json({
      success: true,
      data: predictions
    });
  } catch (error) {
    next(error);
  }
}

/**
 * リスクの高いタスクを取得
 */
async function getHighRiskTasks(req, res, next) {
  try {
    const riskLevel = req.query.riskLevel || 'high';

    const tasks = await progressPredictionService.getHighRiskTasks(riskLevel);

    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 遅延しているタスクを取得
 */
async function getDelayedTasks(req, res, next) {
  try {
    const tasks = await progressPredictionService.getDelayedTasks();

    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    next(error);
  }
}

/**
 * プロジェクト全体の進捗サマリーを取得
 */
async function getProjectSummary(req, res, next) {
  try {
    const projectId = parseInt(req.params.projectId);

    const summary = await progressPredictionService.getProjectProgressSummary(projectId);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
}

/**
 * プロジェクトの納期分析を実行
 */
async function analyzeProjectDeadline(req, res, next) {
  try {
    const projectId = parseInt(req.params.projectId);

    const hourlyJob = require('../jobs/hourly-progress-update');
    const analysis = await hourlyJob.analyzeProjectDeadline(projectId);

    res.json({
      success: true,
      data: analysis,
      message: '納期分析を実行しました'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 古い予測データを削除
 */
async function cleanupOldPredictions(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 90;

    const deletedCount = await progressPredictionService.deleteOldPredictions(days);

    res.json({
      success: true,
      data: {
        deletedCount
      },
      message: `${deletedCount}件の古い予測データを削除しました`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  calculatePrediction,
  getLatestPrediction,
  getPredictionHistory,
  getUserPredictions,
  getHighRiskTasks,
  getDelayedTasks,
  getProjectSummary,
  analyzeProjectDeadline,
  cleanupOldPredictions
};
