const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeAdmin, authorizeManager } = require('../middleware/authorize');

router.get('/', authenticateToken, reportController.listReports);
router.post('/', authenticateToken, authorizeManager, reportController.createReport);
router.put('/:id', authenticateToken, authorizeManager, reportController.updateReport);
router.delete('/:id', authenticateToken, authorizeAdmin, reportController.deleteReport);
router.get('/:userId/analyze-trends-ai', authenticateToken, reportController.analyzeTrendsAI);

module.exports = router;
