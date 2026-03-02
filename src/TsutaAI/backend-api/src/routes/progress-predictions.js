// 進捗予測APIのルート定義
const express = require('express');
const router = express.Router();
const progressPredictionController = require('../controllers/progressPredictionController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeAdmin, authorizeManager, authorizeSelfOrAdmin } = require('../middleware/authorize');

// タスクの進捗予測を計算
router.post('/task/:taskId/calculate', authenticateToken, progressPredictionController.calculatePrediction);

// タスクの最新予測を取得
router.get('/task/:taskId/latest', authenticateToken, progressPredictionController.getLatestPrediction);

// タスクの予測履歴を取得
router.get('/task/:taskId/history', authenticateToken, progressPredictionController.getPredictionHistory);

// ユーザーの全タスクの予測を取得
router.get('/user/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), progressPredictionController.getUserPredictions);

// リスクの高いタスクを取得
router.get('/high-risk', authenticateToken, progressPredictionController.getHighRiskTasks);

// 遅延しているタスクを取得
router.get('/delayed', authenticateToken, progressPredictionController.getDelayedTasks);

// プロジェクト全体の進捗サマリーを取得
router.get('/project/:projectId/summary', authenticateToken, progressPredictionController.getProjectSummary);

// プロジェクトの納期分析を実行
router.post('/project/:projectId/analyze-deadline', authenticateToken, authorizeManager, progressPredictionController.analyzeProjectDeadline);

// 古い予測データを削除
router.delete('/cleanup', authenticateToken, authorizeAdmin, progressPredictionController.cleanupOldPredictions);

module.exports = router;
