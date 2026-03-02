const express = require('express');
const router = express.Router();
const controller = require('../controllers/helpRequestController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeManager } = require('../middleware/authorize');

router.post('/preview', authenticateToken, controller.previewHelpRequest);
router.post('/', authenticateToken, controller.createHelpRequest);
router.get('/', authenticateToken, controller.getHelpRequests);
router.get('/stats', authenticateToken, controller.getStats);
router.get('/top-helpers', authenticateToken, controller.getTopHelpers);
router.get('/:id', authenticateToken, controller.getHelpRequestById);
router.patch('/:id', authenticateToken, controller.updateHelpRequest);
router.delete('/:id', authenticateToken, controller.deleteRequest);
router.post('/:id/assign', authenticateToken, authorizeManager, controller.assignHelper);
router.post('/:id/resolve', authenticateToken, controller.resolveRequest);
router.get('/:id/suggestions', authenticateToken, controller.getHelperSuggestions);

module.exports = router;
