// アクティビティログを扱うコントローラー
const activityLogService = require('../services/activityLogService');

/**
 * アクティビティログを作成
 */
async function createActivityLog(req, res, next) {
  try {
    const payload = req.body;

    // バリデーション
    if (!payload.user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_idが必要です'
      });
    }

    const result = await activityLogService.createActivityLog(payload);

    res.json({
      success: true,
      data: result,
      message: 'アクティビティログを作成しました'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * アクティビティログを一括作成
 */
async function createActivityLogsBatch(req, res, next) {
  try {
    const { logs } = req.body;

    if (!Array.isArray(logs) || logs.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'logsが必要です（配列形式）'
      });
    }

    await activityLogService.createActivityLogsBatch(logs);

    res.json({
      success: true,
      message: `${logs.length}件のアクティビティログを作成しました`
    });
  } catch (error) {
    next(error);
  }
}

/**
 * ユーザーのアクティビティログ一覧を取得
 */
async function getActivityLogs(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);
    const hours = parseInt(req.query.hours) || 24;
    const limit = parseInt(req.query.limit) || 100;

    const logs = await activityLogService.getActivityLogs(userId, { hours, limit });

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
}

/**
 * タスク別のアクティビティログを取得
 */
async function getActivityLogsByTask(req, res, next) {
  try {
    const taskId = parseInt(req.params.taskId);

    const logs = await activityLogService.getActivityLogsByTask(taskId);

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
}

/**
 * ユーザーのアクティビティ統計を取得
 */
async function getUserActivityStats(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);
    const hours = parseInt(req.query.hours) || 24;

    const stats = await activityLogService.getUserActivityStats(userId, hours);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
}

/**
 * ユーザーの時系列アクティビティデータを取得
 */
async function getUserActivityTimeSeries(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);
    const hours = parseInt(req.query.hours) || 24;

    const timeSeries = await activityLogService.getUserActivityTimeSeries(userId, hours);

    res.json({
      success: true,
      data: timeSeries
    });
  } catch (error) {
    next(error);
  }
}

/**
 * チーム全体のアクティビティ統計を取得
 */
async function getTeamActivityStats(req, res, next) {
  try {
    const hours = parseInt(req.query.hours) || 24;

    const stats = await activityLogService.getTeamActivityStats(hours);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
}

/**
 * ユーザーのアクティビティ異常を検知
 */
async function detectActivityAnomaly(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);

    const anomaly = await activityLogService.detectActivityAnomaly(userId);

    res.json({
      success: true,
      data: anomaly
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 古いアクティビティログを削除
 */
async function deleteOldActivityLogs(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 90;

    const deletedCount = await activityLogService.deleteOldActivityLogs(days);

    res.json({
      success: true,
      data: {
        deletedCount
      },
      message: `${deletedCount}件のアクティビティログを削除しました`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
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
