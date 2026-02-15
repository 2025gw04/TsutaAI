const express = require('express');
const router = express.Router();
const controller = require('../controllers/projectDashboardController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeManager } = require('../middleware/authorize');

// Health scores
router.post('/:projectId/health-score', authenticateToken, controller.calculateHealthScore);
router.get('/:projectId/health-score/latest', authenticateToken, controller.getLatestHealthScore);
router.get('/:projectId/health-score/history', authenticateToken, controller.getHealthScoreHistory);

// Burndown
router.post('/:projectId/burndown', authenticateToken, controller.recordBurndown);
router.get('/:projectId/burndown', authenticateToken, controller.getBurndownData);

// Critical path
router.post('/:projectId/critical-path', authenticateToken, controller.analyzeCriticalPath);
router.get('/:projectId/critical-path', authenticateToken, controller.getCriticalPathData);

module.exports = router;
