const express = require('express');
const router = express.Router();
const hourlyActivityController = require('../controllers/hourlyActivityController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeSelfOrAdmin } = require('../middleware/authorize');

// 1時間単位活動集計データを送信（デスクトップアプリから）
router.post('/', authenticateToken, hourlyActivityController.createHourlyActivitySummary);

// ユーザーの1時間単位活動集計データを取得
router.get('/user/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), hourlyActivityController.getHourlyActivitySummaries);

// 特定の1時間単位活動集計データを取得
router.get('/:summaryId', authenticateToken, hourlyActivityController.getHourlyActivitySummary);

module.exports = router;
