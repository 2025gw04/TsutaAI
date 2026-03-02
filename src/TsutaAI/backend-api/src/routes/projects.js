const express = require('express');
const multer = require('multer');
const router = express.Router();
const projectController = require('../controllers/projectController');
const effortRecalculationController = require('../controllers/effortRecalculationController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeAdmin, authorizeManager } = require('../middleware/authorize');

// Multerの設定（メモリストレージ、最大10MBまで）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.txt', '.csv', '.json', '.md'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('許可されていないファイル形式です。txt, csv, json, md のいずれかをアップロードしてください。'));
    }
  }
});

// 基本CRUD - すべて認証必要
router.get('/', authenticateToken, projectController.listProjects);
router.post('/', authenticateToken, authorizeManager, projectController.createProject);
router.get('/:id', authenticateToken, projectController.getProject);
router.put('/:id', authenticateToken, authorizeManager, projectController.updateProject);
router.delete('/:id', authenticateToken, authorizeAdmin, projectController.deleteProject);

// インポート/エクスポート - 認証必要（インポートは管理者/マネージャー）
router.post('/import', authenticateToken, authorizeManager, upload.single('file'), projectController.importProject);
router.get('/:id/export', authenticateToken, projectController.exportProject);

// プロジェクトメンバー管理
router.get('/:id/members', authenticateToken, projectController.getProjectMembers);
router.put('/:id/members', authenticateToken, authorizeManager, projectController.updateProjectMembers);

// 工数再計算
router.post('/:projectId/recalculate-effort', authenticateToken, authorizeManager, effortRecalculationController.recalculateProjectEffort);

module.exports = router;
