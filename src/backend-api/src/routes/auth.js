const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimit');

// ログインエンドポイントにレート制限を適用
router.post('/login', loginLimiter, authController.login);

module.exports = router;
