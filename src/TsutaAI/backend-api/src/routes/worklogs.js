const express = require('express');
const router = express.Router();
const worklogController = require('../controllers/worklogController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeManager } = require('../middleware/authorize');

router.get('/', authenticateToken, worklogController.listWorkLogs);
router.post('/', authenticateToken, worklogController.createWorkLog);
router.put('/:id', authenticateToken, worklogController.updateWorkLog);
router.delete('/:id', authenticateToken, authorizeManager, worklogController.deleteWorkLog);

module.exports = router;
