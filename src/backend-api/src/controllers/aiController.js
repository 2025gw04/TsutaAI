// AI関連APIのコントローラー
const aiService = require('../services/aiService');

/** AIによる日報下書きを生成する */
async function generateDailyReport(req, res, next) {
  try {
    const content = await aiService.generateDailyReport(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによる日報下書きをDBログから生成する */
async function generateDailyReportDraft(req, res, next) {
  try {
    const content = await aiService.generateDailyReportDraft(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによるWBS提案をJSON形式で生成する */
async function generateWbs(req, res, next) {
  try {
    const content = await aiService.generateWbs(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** 段階的WBS生成（WBSビルダー専用） */
async function generateWbsBuilder(req, res, next) {
  try {
    const content = await aiService.generateWbsBuilder(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AI提案によるサブタスク分解を実行する */
async function decomposeTask(req, res, next) {
  try {
    const content = await aiService.decomposeTask(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによるタスクブラッシュアップを実行する */
async function refineWbsTask(req, res, next) {
  try {
    const content = await aiService.refineWbsTask(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによるWBS健全性チェックを実行する */
async function sanityCheckWbs(req, res, next) {
  try {
    const content = await aiService.sanityCheckWbs(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによるタスク提案を生成する */
async function suggestTasks(req, res, next) {
  try {
    const content = await aiService.suggestTasks(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによるリスク検知を実行する */
async function detectRisk(req, res, next) {
  try {
    const content = await aiService.detectRisk(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによるプロジェクトサマリーを生成する */
async function summarizeProject(req, res, next) {
  try {
    const content = await aiService.summarizeProject(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによる感情分析を実行する */
async function analyzeSentiment(req, res, next) {
  try {
    const content = await aiService.analyzeSentiment(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによるリスケジュール提案を生成する */
async function rescheduleProposal(req, res, next) {
  try {
    const content = await aiService.rescheduleProposal(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによるタスク自動割り当て提案を生成する */
async function autoAssignTasks(req, res, next) {
  try {
    const content = await aiService.autoAssignTasks(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** AIによるタスク期間自動設定を実行する */
async function autoDuration(req, res, next) {
  try {
    const content = await aiService.autoDuration(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** 新規プロジェクト作成時の未入力フィールドをAIで生成する */
async function generateProjectFields(req, res, next) {
  try {
    const content = await aiService.generateProjectFields(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

/** 時間単位活動データをAI分析する（desktop-app AI監視機能用） */
async function analyzeHourlyActivity(req, res, next) {
  try {
    const { summaryId } = req.body;
    if (!summaryId) {
      return res.status(400).json({ success: false, message: 'summaryId is required' });
    }

    const result = await aiService.analyzeHourlyActivity(summaryId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** AIによるプロジェクトアラート生成 */
async function generateProjectAlerts(req, res, next) {
  try {
    const payload = {
      projectsJson: req.body.projectsJson || '[]'
    };

    const alerts = await aiService.generateProjectAlerts(payload);
    res.json({ success: true, data: { alerts } });
  } catch (error) {
    next(error);
  }
}

/** WBSビルダー詳細情報生成（最終段階） */
async function finalizeWbsBuilder(req, res, next) {
  try {
    const content = await aiService.finalizeWbsBuilder(req.body || {});
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  generateDailyReport,
  generateDailyReportDraft,
  generateWbs,
  generateWbsBuilder, // 段階的WBS生成（WBSビルダー専用）
  finalizeWbsBuilder, // WBSビルダー詳細情報生成
  decomposeTask,
  refineWbsTask,
  sanityCheckWbs,
  suggestTasks,
  detectRisk,
  summarizeProject,
  analyzeSentiment,
  rescheduleProposal,
  autoAssignTasks,
  autoDuration,
  generateProjectFields,
  analyzeHourlyActivity,
  generateProjectAlerts
};
