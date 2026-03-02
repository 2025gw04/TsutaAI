const express = require('express');
const router = express.Router();
const personalTaskController = require('../controllers/personalTaskController');
const { authenticateToken } = require('../middleware/auth');

// 個人タスク基本操作
router.get('/', authenticateToken, personalTaskController.listPersonalTasks);
router.get('/:id', authenticateToken, personalTaskController.getPersonalTask);
router.post('/', authenticateToken, personalTaskController.createPersonalTask);
router.put('/:id', authenticateToken, personalTaskController.updatePersonalTask);
router.delete('/:id', authenticateToken, personalTaskController.deletePersonalTask);

module.exports = router;
