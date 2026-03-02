// 休暇管理API用のルーティング設定
const express = require('express');
const vacationController = require('../controllers/vacationController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeAdmin, authorizeManager } = require('../middleware/authorize');

const router = express.Router();

// GET /vacations - 休暇一覧を取得
router.get('/', authenticateToken, vacationController.listVacations);

// POST /vacations - 新規休暇を登録
router.post('/', authenticateToken, authorizeManager, vacationController.createVacation);

// PUT /vacations/:id - 休暇情報を更新
router.put('/:id', authenticateToken, authorizeManager, vacationController.updateVacation);

// DELETE /vacations/:id - 休暇情報を削除
router.delete('/:id', authenticateToken, authorizeAdmin, vacationController.deleteVacation);

// GET /vacations/analyze - 休暇影響分析
router.get('/analyze', authenticateToken, vacationController.analyzeImpact);

// GET /vacations/affected-tasks - 影響を受けるタスクを取得
router.get('/affected-tasks', authenticateToken, vacationController.getAffectedTasks);

module.exports = router;
