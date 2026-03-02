const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeAdmin, authorizeSelfOrAdmin } = require('../middleware/authorize');

// プロンプトカタログ - 認証必要
router.get('/prompts/catalog', authenticateToken, userController.listPromptCatalog);

// ユーザー一覧・作成 - 認証必要（作成は管理者のみ）
router.get('/', authenticateToken, userController.listUsers);
router.post('/', authenticateToken, authorizeAdmin, userController.createUser);

// ユーザー詳細・更新・削除 - 認証必要（本人または管理者）
router.get('/:id', authenticateToken, authorizeSelfOrAdmin('id'), userController.getUser);
router.put('/:id', authenticateToken, authorizeSelfOrAdmin('id'), userController.updateUser);
router.delete('/:id', authenticateToken, authorizeAdmin, userController.deleteUser);

// ユーザープロンプト管理 - 認証必要（本人または管理者）
router.post('/:id/prompts', authenticateToken, authorizeSelfOrAdmin('id'), userController.addUserPrompt);
router.put('/:id/prompts/:promptId', authenticateToken, authorizeSelfOrAdmin('id'), userController.updateUserPrompt);
router.delete('/:id/prompts/:promptId', authenticateToken, authorizeSelfOrAdmin('id'), userController.deleteUserPrompt);

module.exports = router;

