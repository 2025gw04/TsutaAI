const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');
const { authenticateToken } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

// 全てのルートで認証が必要
router.use(authenticateToken);

// 祝日取得（全ユーザー可能）
router.get('/', holidayController.getAllHolidays);
router.get('/range', holidayController.getHolidaysByRange);
router.get('/:id', holidayController.getHoliday);

// 管理者とメンバーが祝日編集可能
router.post('/', authorize('admin', 'member'), holidayController.createHoliday);
router.post('/bulk', authorize('admin', 'member'), holidayController.bulkCreateHolidays);
router.put('/:id', authorize('admin', 'member'), holidayController.updateHoliday);
router.delete('/:id', authorize('admin', 'member'), holidayController.deleteHoliday);

module.exports = router;
