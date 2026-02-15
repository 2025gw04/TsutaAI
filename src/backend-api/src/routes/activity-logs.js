// アクティビティログAPIのルート定義
const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLogController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeAdmin, authorizeManager, authorizeSelfOrAdmin } = require('../middleware/authorize');

// アクティビティログ作成
router.post('/', authenticateToken, activityLogController.createActivityLog);

// アクティビティログ一括作成
router.post('/batch', authenticateToken, activityLogController.createActivityLogsBatch);

// ユーザーのアクティビティログ取得
router.get('/user/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), activityLogController.getActivityLogs);

// タスク別のアクティビティログ取得
router.get('/task/:taskId', authenticateToken, activityLogController.getActivityLogsByTask);

// ユーザーのアクティビティ統計取得
router.get('/user/:userId/stats', authenticateToken, authorizeSelfOrAdmin('userId'), activityLogController.getUserActivityStats);

// ユーザーの時系列アクティビティデータ取得
router.get('/user/:userId/timeseries', authenticateToken, authorizeSelfOrAdmin('userId'), activityLogController.getUserActivityTimeSeries);

// チーム全体のアクティビティ統計取得
router.get('/team/stats', authenticateToken, authorizeManager, activityLogController.getTeamActivityStats);

// ユーザーのアクティビティ異常検知
router.get('/user/:userId/anomaly', authenticateToken, authorizeSelfOrAdmin('userId'), activityLogController.detectActivityAnomaly);

// 古いアクティビティログ削除
router.delete('/cleanup', authenticateToken, authorizeAdmin, activityLogController.deleteOldActivityLogs);

module.exports = router;
