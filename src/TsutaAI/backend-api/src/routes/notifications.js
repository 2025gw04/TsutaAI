const express = require('express');
const router = express.Router();
const notificationService = require('../services/notificationService');
const { authenticateToken } = require('../middleware/auth');

// 全通知取得
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const notifications = await notificationService.getAll(req.user.userId);
    res.json({ success: true, data: notifications });
  } catch (error) {
    next(error);
  }
});

// 未読通知取得
router.get('/unread', authenticateToken, async (req, res, next) => {
  try {
    const notifications = await notificationService.getUnread(req.user.userId);
    res.json({ success: true, data: notifications });
  } catch (error) {
    next(error);
  }
});

// 既読にする
router.put('/:id/read', authenticateToken, async (req, res, next) => {
  try {
    const result = await notificationService.markAsRead(req.user.userId, req.params.id);
    res.json({ success: true, data: { updated: result } });
  } catch (error) {
    next(error);
  }
});

// 全て既読にする
router.put('/read-all', authenticateToken, async (req, res, next) => {
  try {
    const count = await notificationService.markAllAsRead(req.user.userId);
    res.json({ success: true, data: { updatedCount: count } });
  } catch (error) {
    next(error);
  }
});

// 未読にする
router.put('/:id/unread', authenticateToken, async (req, res, next) => {
  try {
    const notificationService = require('../services/notificationService'); // Ensure service is avail
    const result = await notificationService.markAsUnread(req.user.userId, req.params.id);
    res.json({ success: true, data: { updated: result } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
