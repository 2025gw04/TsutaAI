// メンタルヘルスログを扱うコントローラー
const mentalHealthService = require('../services/mentalHealthService');
const aiService = require('../services/aiService');
const activityLogService = require('../services/activityLogService');

/**
 * メンタルヘルスログを作成
 */
async function createMentalHealthLog(req, res, next) {
  try {
    const payload = req.body;

    // バリデーション
    if (!payload.user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_idが必要です'
      });
    }

    // AIアドバイスを生成（mood, stress_level, blocker_details, support_detailsが提供されている場合）
    if (payload.mood || payload.stress_level || payload.blocker_details) {
      try {
        // 過去のアクティビティログを取得してコンテキストを作成
        const recentActivityStats = await activityLogService.getUserActivityStats(payload.user_id, 24);

        const advicePayload = {
          mood: payload.mood || 3,
          stress_level: payload.stress_level || 3,
          has_blocker: payload.has_blocker || false,
          blocker_details: payload.blocker_details || '',
          need_support: payload.need_support || false,
          support_details: payload.support_details || '',
          recent_activity: {
            avg_activity_score: recentActivityStats.avgActivityScore,
            total_logs: recentActivityStats.totalLogs
          }
        };

        const aiAdvice = await aiService.generateMentalHealthAdvice(advicePayload);
        payload.ai_advice = aiAdvice.advice || null;
      } catch (error) {
        console.warn('AI adviceの生成に失敗しました:', error.message);
        // AIアドバイスの生成に失敗してもログは作成する
      }
    }

    const result = await mentalHealthService.createMentalHealthLog(payload);

    res.json({
      success: true,
      data: result,
      message: 'メンタルヘルスログを作成しました'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * メンタルヘルスログを更新
 */
async function updateMentalHealthLog(req, res, next) {
  try {
    const logId = parseInt(req.params.id);
    const payload = req.body;

    await mentalHealthService.updateMentalHealthLog(logId, payload);

    res.json({
      success: true,
      message: 'メンタルヘルスログを更新しました'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * ユーザーのメンタルヘルスログ一覧を取得
 */
async function getMentalHealthLogs(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);
    const days = parseInt(req.query.days) || 30;

    const logs = await mentalHealthService.getMentalHealthLogs(userId, { days });

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 特定の日付のメンタルヘルスログを取得
 */
async function getMentalHealthLogByDate(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);
    const reportDate = req.params.date;

    const log = await mentalHealthService.getMentalHealthLogByDate(userId, reportDate);

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    next(error);
  }
}

/**
 * チーム全体のメンタルヘルスサマリーを取得
 */
async function getTeamMentalHealthSummary(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 7;

    const summary = await mentalHealthService.getTeamMentalHealthSummary(days);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
}

/**
 * サポートが必要なユーザー一覧を取得
 */
async function getUsersNeedingSupport(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 7;

    const users = await mentalHealthService.getUsersNeedingSupport(days);

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    next(error);
  }
}

/**
 * メンタルヘルストレンド分析
 */
async function analyzeMentalHealthTrend(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);
    const weeks = parseInt(req.query.weeks) || 4;

    const trend = await mentalHealthService.analyzeMentalHealthTrend(userId, weeks);

    res.json({
      success: true,
      data: trend
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 管理者コメントを追加
 */
async function addManagerComment(req, res, next) {
  try {
    const logId = parseInt(req.params.id);
    const { manager_comment, manager_id } = req.body;

    if (!manager_comment) {
      return res.status(400).json({
        success: false,
        message: 'manager_commentが必要です'
      });
    }

    await mentalHealthService.updateMentalHealthLog(logId, {
      manager_comment,
      manager_id
    });

    res.json({
      success: true,
      message: '管理者コメントを追加しました'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 古いメンタルヘルスログを削除
 */
async function deleteOldMentalHealthLogs(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 365;

    const deletedCount = await mentalHealthService.deleteOldMentalHealthLogs(days);

    res.json({
      success: true,
      data: {
        deletedCount
      },
      message: `${deletedCount}件のメンタルヘルスログを削除しました`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createMentalHealthLog,
  updateMentalHealthLog,
  getMentalHealthLogs,
  getMentalHealthLogByDate,
  getTeamMentalHealthSummary,
  getUsersNeedingSupport,
  analyzeMentalHealthTrend,
  addManagerComment,
  deleteOldMentalHealthLogs
};
