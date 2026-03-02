const express = require('express');
const router = express.Router();
const aiChatController = require('../controllers/aiChatController');
const { authenticateToken } = require('../middleware/auth');

// WBS AIチャット
router.post('/chat', authenticateToken, aiChatController.handleWbsChat);

module.exports = router;
