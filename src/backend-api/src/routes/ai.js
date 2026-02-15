const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeManager } = require('../middleware/authorize');
const { aiLimiter } = require('../middleware/rateLimit');

// すべてのAIエンドポイントにレート制限を適用
router.use(aiLimiter);

router.post('/daily-report', authenticateToken, aiController.generateDailyReport);
router.post('/daily-report-draft', authenticateToken, aiController.generateDailyReportDraft);
router.post('/wbs', authenticateToken, aiController.generateWbs);
router.post('/wbs/builder/generate', authenticateToken, aiController.generateWbsBuilder); // 段階的WBS生成（WBSビルダー専用）
router.post('/wbs/builder/finalize', authenticateToken, aiController.finalizeWbsBuilder); // WBSビルダー詳細情報生成
router.post('/wbs/decompose', authenticateToken, aiController.decomposeTask);
router.post('/wbs/refine', authenticateToken, aiController.refineWbsTask);
router.post('/wbs/sanity-check', authenticateToken, aiController.sanityCheckWbs);
router.post('/project-summary', authenticateToken, aiController.summarizeProject);
router.post('/sentiment-analysis', authenticateToken, aiController.analyzeSentiment);
router.post('/task-suggestion', authenticateToken, aiController.suggestTasks);
router.post('/risk-detection', authenticateToken, aiController.detectRisk);
router.post('/reschedule', authenticateToken, authorizeManager, aiController.rescheduleProposal);
router.post('/auto-assign', authenticateToken, aiController.autoAssignTasks);
router.post('/auto-duration', authenticateToken, aiController.autoDuration);
router.post('/generate-project-fields', authenticateToken, aiController.generateProjectFields);
router.post('/analyze-hourly-activity', authenticateToken, aiController.analyzeHourlyActivity);
router.post('/generate-alerts', authenticateToken, aiController.generateProjectAlerts);

module.exports = router;
