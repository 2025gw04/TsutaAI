const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeManager } = require('../middleware/authorize');

// デスクトップアプリ用
router.get('/summary', authenticateToken, dashboardController.getSummary);

// プロジェクトサマリー（web-admin用）
router.get('/project-summaries', authenticateToken, dashboardController.getAllProjectSummaries);
router.get('/project-summaries/:projectId', authenticateToken, dashboardController.getProjectSummary);
router.post('/project-summaries/:projectId', authenticateToken, authorizeManager, dashboardController.saveProjectSummary);

// ダッシュボードアラート（web-admin用）
router.get('/alerts', authenticateToken, dashboardController.getAllAlerts);
router.get('/alerts/:alertId', authenticateToken, dashboardController.getAlertById);
router.post('/alerts', authenticateToken, authorizeManager, dashboardController.saveAlerts);
router.post('/alerts/refresh', authenticateToken, authorizeManager, dashboardController.refreshAlerts); // 新規: 差分更新
router.post('/alerts/:alertId/resolve', authenticateToken, dashboardController.resolveAlert); // 新規: 手動解決
router.patch('/alerts/:alertId/read', authenticateToken, dashboardController.markAlertAsRead);
router.patch('/alerts/mark-read', authenticateToken, dashboardController.markAlertsAsRead);
router.post('/alerts/mark-all-read', authenticateToken, dashboardController.markAllAlertsAsRead);

// センチメント分析（web-admin用）
router.get('/sentiment', authenticateToken, dashboardController.getSentiment);
router.post('/sentiment', authenticateToken, authorizeManager, dashboardController.saveSentiment);

module.exports = router;
