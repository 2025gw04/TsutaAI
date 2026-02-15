const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

// 全ての設定ルートで認証が必要
router.use(authenticateToken);

// システム設定エンドポイント
router.get('/', settingsController.getAllSettings);
router.get('/:key', settingsController.getSetting);

// 管理者のみ設定変更可能
router.post('/', authorize('admin'), settingsController.upsertSetting);
router.put('/bulk', authorize('admin'), settingsController.bulkUpdateSettings);
router.delete('/:key', authorize('admin'), settingsController.deleteSetting);

// データベース初期化（デモ用）
router.post('/init-database', authorize('admin'), settingsController.initDatabase);

// ログイン不具合解消（レート制限リセットなど）
router.post('/fix-login', authorize('admin'), settingsController.fixLoginIssues);

// LLM API接続テスト
router.post('/test-llm', authorize('admin'), settingsController.testLlmConnection);

module.exports = router;
