const express = require('express');
const router = express.Router();
const controller = require('../controllers/sprintController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeManager } = require('../middleware/authorize');

router.post('/', authenticateToken, authorizeManager, controller.createSprint);
router.get('/', authenticateToken, controller.getSprints);
router.get('/:id', authenticateToken, controller.getSprintById);
router.patch('/:id', authenticateToken, authorizeManager, controller.updateSprint);
router.post('/:id/start', authenticateToken, authorizeManager, controller.startSprint);
router.post('/:id/complete', authenticateToken, authorizeManager, controller.completeSprint);
router.post('/:id/progress', authenticateToken, controller.recordProgress);
router.get('/:id/progress', authenticateToken, controller.getProgress);
router.get('/:id/progress/latest', authenticateToken, controller.getLatestProgress);
router.post('/:id/performance', authenticateToken, authorizeManager, controller.recordPerformance);
router.get('/:id/performance', authenticateToken, controller.getMemberPerformance);
router.get('/:id/stats', authenticateToken, controller.getSprintStats);
router.post('/:id/analyze', authenticateToken, controller.analyzeGoal);

module.exports = router;
