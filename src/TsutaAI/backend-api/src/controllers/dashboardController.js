// ダッシュボードAPIのコントローラー
const taskService = require('../services/taskService');
const projectService = require('../services/projectService');
const worklogService = require('../services/worklogService');
const dashboardService = require('../services/dashboardService');
const alertService = require('../services/alertService'); // 新規追加

/** ダッシュボードサマリーを取得します（デスクトップアプリ用） */
async function getSummary(req, res, next) {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : undefined;

    // ユーザーのタスクを取得
    // ユーザーのタスクを取得
    const taskResult = userId ? await taskService.findTasks({ assignedTo: userId }) : await taskService.findTasks({});
    const tasks = taskResult.data || [];

    // プロジェクト情報を取得
    const projectResult = await projectService.findProjects({});
    const projects = projectResult.data || [];

    // 本日の作業ログを取得
    const today = new Date().toISOString().split('T')[0];
    const todayWorklogs = userId ? await worklogService.findWorkLogs({ userId, date: today }) : [];

    // 統計を計算
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'done').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    const overdueTasks = tasks.filter(t => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate) < new Date() && t.status !== 'completed' && t.status !== 'done';
    }).length;

    // 今週の作業時間を計算
    const thisWeekMinutes = todayWorklogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0);

    // AIメッセージを生成
    let aiMessage = '今日も頑張りましょう！';
    if (inProgressTasks > 5) {
      aiMessage = `現在 ${inProgressTasks} 件のタスクが進行中です。優先度を確認して集中しましょう。`;
    } else if (overdueTasks > 0) {
      aiMessage = `⚠️ ${overdueTasks} 件のタスクが期限を過ぎています。早急な対応をお願いします。`;
    } else if (completedTasks === totalTasks && totalTasks > 0) {
      aiMessage = '🎉 すべてのタスクが完了しました！素晴らしいです！';
    }

    const summary = {
      user: {
        userId: userId,
        todayTasks: tasks.filter(t => {
          if (!t.startDate && !t.dueDate) return false;
          const today = new Date().toISOString().split('T')[0];
          return t.startDate === today || t.dueDate === today;
        }).length,
        completedToday: tasks.filter(t => {
          if (t.status !== 'completed' && t.status !== 'done') return false;
          // TODO: updated_atを使って今日完了したタスクを判定
          return true;
        }).length,
        workTimeMinutes: thisWeekMinutes
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        overdue: overdueTasks
      },
      projects: {
        total: projects.length,
        active: projects.filter(p => p.status === 'active' || p.status === 'running').length
      },
      aiMessage: aiMessage
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
}

/**
 * プロジェクトサマリーを保存します
 */
async function saveProjectSummary(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const summaryData = req.body;

    await dashboardService.saveProjectSummary(projectId, summaryData);
    res.json({ success: true, message: 'プロジェクトサマリーを保存しました' });
  } catch (error) {
    next(error);
  }
}

/**
 * プロジェクトサマリーを取得します
 */
async function getProjectSummary(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const summary = await dashboardService.getProjectSummary(projectId);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
}

/**
 * 全プロジェクトのサマリーを取得します
 */
async function getAllProjectSummaries(req, res, next) {
  try {
    const summaries = await dashboardService.getAllProjectSummaries();
    res.json({ success: true, data: summaries });
  } catch (error) {
    next(error);
  }
}

/**
 * ダッシュボードアラートを保存します
 */
async function saveAlerts(req, res, next) {
  try {
    const { alerts } = req.body;
    if (!Array.isArray(alerts)) {
      return res.status(400).json({
        success: false,
        message: 'alertsは配列で指定してください'
      });
    }

    const stats = await dashboardService.saveAlerts(alerts);
    res.json({
      success: true,
      data: stats,
      message: `アラートを保存しました（新規 ${stats.inserted}件 / 更新 ${stats.updated}件 / 変更なし ${stats.unchanged}件）`
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 全てのダッシュボードアラートを取得します（フィルタリング対応）
 */
async function getAllAlerts(req, res, next) {
  try {
    const filters = {};

    // クエリパラメータからフィルターを取得
    if (req.query.severity) {
      filters.severity = req.query.severity;
    }
    if (req.query.type) {
      filters.type = req.query.type;
    }
    if (req.query.isRead !== undefined) {
      filters.isRead = req.query.isRead === 'true';
    }
    if (req.query.projectId) {
      filters.projectId = Number(req.query.projectId);
    }

    const alerts = await dashboardService.getAllAlerts(filters);
    res.json({ success: true, data: alerts });
  } catch (error) {
    next(error);
  }
}

/**
 * 単一のアラートを取得します
 */
async function getAlertById(req, res, next) {
  try {
    const alertId = Number(req.params.alertId);
    const alert = await dashboardService.getAlertById(alertId);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'アラートが見つかりません'
      });
    }

    res.json({ success: true, data: alert });
  } catch (error) {
    next(error);
  }
}

/**
 * アラートを既読/未読に更新します
 */
async function markAlertAsRead(req, res, next) {
  try {
    const alertId = Number(req.params.alertId);
    const { isRead } = req.body;

    if (typeof isRead !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isReadはboolean型で指定してください'
      });
    }

    await dashboardService.markAlertAsRead(alertId, isRead);
    res.json({ success: true, message: 'アラートの既読状態を更新しました' });
  } catch (error) {
    next(error);
  }
}

/**
 * 複数のアラートを既読/未読に更新します
 */
async function markAlertsAsRead(req, res, next) {
  try {
    const { alertIds, isRead } = req.body;

    if (!Array.isArray(alertIds)) {
      return res.status(400).json({
        success: false,
        message: 'alertIdsは配列で指定してください'
      });
    }

    if (typeof isRead !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isReadはboolean型で指定してください'
      });
    }

    await dashboardService.markAlertsAsRead(alertIds, isRead);
    res.json({ success: true, message: 'アラートの既読状態を更新しました' });
  } catch (error) {
    next(error);
  }
}

/**
 * 全てのアラートを既読にします
 */
async function markAllAlertsAsRead(req, res, next) {
  try {
    await dashboardService.markAllAlertsAsRead();
    res.json({ success: true, message: '全てのアラートを既読にしました' });
  } catch (error) {
    next(error);
  }
}

/**
 * アラートを更新（差分更新方式）
 */
async function refreshAlerts(req, res, next) {
  try {
    const { forceFullRefresh = false } = req.body;

    // プロジェクト一覧を取得
    const projectResult = await projectService.findProjects({ includeTaskStats: true });
    const projects = projectResult.data || [];

    // アラートを更新
    const stats = await alertService.refreshAlerts(projects, forceFullRefresh);
    const modeLabel = stats.mode === 'forced' ? '強制更新' : '差分更新';

    res.json({
      success: true,
      data: stats,
      message: `${modeLabel}完了: 新規 ${stats.newAlertsCount}件 / 更新 ${stats.updatedAlertsCount}件 / 解決 ${stats.resolvedAlertsCount}件 / 処理 ${stats.processedProjects}件 / スキップ ${stats.skippedProjects}件`
    });
  } catch (error) {
    console.error('アラート更新エラー:', error);
    next(error);
  }
}

/**
 * アラートを手動で解決
 */
async function resolveAlert(req, res, next) {
  try {
    const alertId = Number(req.params.alertId);

    await alertService.resolveAlert(alertId, false);

    res.json({
      success: true,
      message: 'アラートを解決済みにしました'
    });
  } catch (error) {
    console.error('アラート解決エラー:', error);
    next(error);
  }
}

/**
 * センチメント分析結果を保存します
 */
async function saveSentiment(req, res, next) {
  try {
    const sentimentData = req.body;
    await dashboardService.saveSentiment(sentimentData);
    res.json({ success: true, message: 'センチメント分析結果を保存しました' });
  } catch (error) {
    next(error);
  }
}

/**
 * センチメント分析結果を取得します
 */
async function getSentiment(req, res, next) {
  try {
    const sentiment = await dashboardService.getSentiment();
    res.json({ success: true, data: sentiment });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSummary,
  saveProjectSummary,
  getProjectSummary,
  getAllProjectSummaries,
  saveAlerts,
  getAllAlerts,
  getAlertById,
  markAlertAsRead,
  markAlertsAsRead,
  markAllAlertsAsRead,
  refreshAlerts,      // 新規追加
  resolveAlert,       // 新規追加
  saveSentiment,
  getSentiment
};
