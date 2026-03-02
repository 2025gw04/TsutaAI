const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeManager } = require('../middleware/authorize');

// アップロードディレクトリの作成
const uploadDir = path.join(__dirname, '../../uploads/attachments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multerの設定（タスクインポート用）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.json', '.csv'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('許可されていないファイル形式です。json, csv のいずれかをアップロードしてください。'));
    }
  }
});

// Multerの設定（添付ファイル用）
const attachmentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // ユニークなファイル名を生成
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, basename + '-' + uniqueSuffix + ext);
  }
});

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// タスク基本操作 - すべて認証必要
router.get('/', authenticateToken, taskController.listTasks);
router.get('/today', authenticateToken, taskController.getTodayTasks);
router.post('/', authenticateToken, authorizeManager, taskController.createTask);
router.delete('/', authenticateToken, authorizeManager, taskController.deleteAllProjectTasks); // プロジェクトの全タスクを削除（:idより先に定義）
router.get('/:id', authenticateToken, taskController.getTask);
router.put('/:id', authenticateToken, taskController.updateTask);
router.patch('/:id', authenticateToken, taskController.updateTask); // PATCH メソッドもサポート
router.delete('/:id', authenticateToken, authorizeManager, taskController.deleteTask);

// AI機能 - 認証必要
router.post('/ai/generate-description', authenticateToken, taskController.generateDescription);
router.post('/ai/subdivide', authenticateToken, taskController.subdivideTask);

// タスクコメント - 認証必要
router.get('/:id/comments', authenticateToken, taskController.getComments);
router.post('/:id/comments', authenticateToken, taskController.addComment);
router.delete('/comments/:commentId', authenticateToken, taskController.deleteComment);

// タスク添付ファイル - 認証必要
router.get('/:id/attachments', authenticateToken, taskController.getAttachments);
router.post('/:id/attachments', authenticateToken, attachmentUpload.single('file'), taskController.addAttachment);
router.get('/attachments/:attachmentId/download', authenticateToken, taskController.downloadAttachment);

// タスクアクティビティログ - 認証必要
router.get('/:id/activity', authenticateToken, taskController.getActivityLog);

// タスクインポート - 認証必要（マネージャー以上）
router.post('/import/:projectId', authenticateToken, authorizeManager, upload.single('file'), taskController.importTasks);
router.get('/export/:projectId', authenticateToken, taskController.exportTasks);

module.exports = router;
