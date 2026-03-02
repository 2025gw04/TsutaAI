// メンタルヘルスAPIのルート定義
const express = require('express');
const router = express.Router();
const mentalHealthController = require('../controllers/mentalHealthController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeAdmin, authorizeManager, authorizeSelfOrAdmin } = require('../middleware/authorize');

// メンタルヘルスログ作成
router.post('/', authenticateToken, mentalHealthController.createMentalHealthLog);

// メンタルヘルスログ更新
router.put('/:id', authenticateToken, mentalHealthController.updateMentalHealthLog);

// ユーザーのメンタルヘルスログ一覧取得
router.get('/user/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), mentalHealthController.getMentalHealthLogs);

// 特定の日付のメンタルヘルスログ取得
router.get('/user/:userId/date/:date', authenticateToken, authorizeSelfOrAdmin('userId'), mentalHealthController.getMentalHealthLogByDate);

// チーム全体のメンタルヘルスサマリー取得
router.get('/team/summary', authenticateToken, authorizeManager, mentalHealthController.getTeamMentalHealthSummary);

// サポートが必要なユーザー一覧取得
router.get('/team/need-support', authenticateToken, authorizeManager, mentalHealthController.getUsersNeedingSupport);

// メンタルヘルストレンド分析
router.get('/user/:userId/trend', authenticateToken, authorizeSelfOrAdmin('userId'), mentalHealthController.analyzeMentalHealthTrend);

// 管理者コメント追加
router.post('/:id/comment', authenticateToken, authorizeManager, mentalHealthController.addManagerComment);

// 古いメンタルヘルスログ削除
router.delete('/cleanup', authenticateToken, authorizeAdmin, mentalHealthController.deleteOldMentalHealthLogs);

module.exports = router;
