const express = require('express');
const router = express.Router();
const workSessionController = require('../controllers/workSessionController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeSelfOrAdmin } = require('../middleware/authorize');

// 作業セッションサマリーを作成（デスクトップアプリから）
router.post('/', authenticateToken, workSessionController.createWorkSessionSummary);

// ユーザーの作業セッションサマリー一覧を取得
router.get('/user/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), workSessionController.getWorkSessionSummaries);

// 特定の作業セッションサマリーを取得
router.get('/:sessionId', authenticateToken, workSessionController.getWorkSessionSummary);

// プロジェクト別の作業時間集計を取得
router.get('/project/:projectId/summary', authenticateToken, workSessionController.getProjectWorkSummary);

module.exports = router;
