const express = require('express');
const router = express.Router();
const reportGeneratorController = require('../controllers/reportGeneratorController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeManager, authorizeSelfOrAdmin } = require('../middleware/authorize');

// プロジェクトレポート生成
router.post('/projects/:projectId', authenticateToken, authorizeManager, reportGeneratorController.generateProjectReport);

// プロジェクトレポートCSVエクスポート
router.get('/projects/:projectId/csv', authenticateToken, reportGeneratorController.exportProjectReportCSV);

// 全プロジェクトレポート生成
router.post('/all-projects', authenticateToken, authorizeManager, reportGeneratorController.generateAllProjectsReport);

// ユーザー作業レポート生成
router.post('/users/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), reportGeneratorController.generateUserWorkReport);

module.exports = router;
