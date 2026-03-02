// レポートアシスタントAPIのルート
const express = require('express');
const router = express.Router();
const reportAssistantController = require('../controllers/reportAssistantController');
const { authenticateToken } = require('../middleware/auth');

// すべてのルートに認証を適用
router.use(authenticateToken);

// 初期メッセージを取得
router.get('/initial', reportAssistantController.getInitialMessage);

// チャットメッセージを処理
router.post('/chat', reportAssistantController.processChat);

// プロジェクト一覧を取得
router.get('/projects', reportAssistantController.getProjectsForReport);

// 次のステップを取得
router.post('/next-step', reportAssistantController.getNextStep);

// レポートを生成
router.post('/generate', reportAssistantController.generateReport);

// プロジェクトの洞察を抽出
router.get('/insights/:projectId', reportAssistantController.extractInsights);

module.exports = router;
