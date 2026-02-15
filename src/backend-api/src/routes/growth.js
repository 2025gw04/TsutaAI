// 成長トラッキング関連のルート
const express = require('express');
const router = express.Router();
const growthController = require('../controllers/growthController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeManager, authorizeSelfOrAdmin } = require('../middleware/authorize');

// =============================================
// 成長レポート
// =============================================

// GET /api/growth/reports/:userId - 成長レポートを取得
router.get('/reports/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.getGrowthReport);

// =============================================
// スキル成長履歴
// =============================================

// GET /api/growth/skills/:userId/history - スキル成長履歴を取得
router.get('/skills/:userId/history', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.getSkillGrowthHistory);

// POST /api/growth/skills/:userId/history - スキル成長履歴を記録
router.post('/skills/:userId/history', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.recordSkillGrowth);

// =============================================
// パフォーマンスメトリクス
// =============================================

// GET /api/growth/metrics/:userId - パフォーマンスメトリクスを取得
router.get('/metrics/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.getPerformanceMetrics);

// POST /api/growth/metrics/:userId/calculate - パフォーマンスメトリクスを計算
router.post('/metrics/:userId/calculate', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.calculateMetrics);

// =============================================
// 主な貢献
// =============================================

// GET /api/growth/contributions/:userId - 貢献一覧を取得
router.get('/contributions/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.getContributions);

// POST /api/growth/contributions/:userId - 貢献を記録
router.post('/contributions/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.recordContribution);

// =============================================
// 成長目標
// =============================================

// GET /api/growth/goals/:userId - 成長目標一覧を取得
router.get('/goals/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.getGrowthGoals);

// POST /api/growth/goals/:userId - 成長目標を作成
router.post('/goals/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.createGrowthGoal);

// PUT /api/growth/goals/:goalId - 成長目標を更新
router.put('/goals/:goalId', authenticateToken, growthController.updateGrowthGoal);

// DELETE /api/growth/goals/:goalId - 成長目標を削除
router.delete('/goals/:goalId', authenticateToken, growthController.deleteGrowthGoal);

// =============================================
// AI分析
// =============================================

// POST /api/growth/analyze/:userId/strengths - 強みを分析
router.post('/analyze/:userId/strengths', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.analyzeStrengths);

// POST /api/growth/analyze/:userId/opportunities - 成長機会を提案
router.post('/analyze/:userId/opportunities', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.suggestOpportunities);

// POST /api/growth/analyze/:userId/goal-suggestions - 目標を提案
router.post('/analyze/:userId/goal-suggestions', authenticateToken, authorizeSelfOrAdmin('userId'), growthController.suggestGoals);

// =============================================
// レポート生成
// =============================================

// POST /api/growth/reports/:userId/1on1 - 1on1資料を生成
router.post('/reports/:userId/1on1', authenticateToken, authorizeManager, growthController.generate1on1Material);

// POST /api/growth/reports/:userId/evaluation - 評価シートを生成
router.post('/reports/:userId/evaluation', authenticateToken, authorizeManager, growthController.generateEvaluationSheet);

module.exports = router;
