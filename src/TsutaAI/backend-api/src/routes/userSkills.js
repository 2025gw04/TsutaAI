const express = require('express');
const router = express.Router();
const userSkillController = require('../controllers/userSkillController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeSelfOrAdmin } = require('../middleware/authorize');

// ユーザーのスキル一覧を取得
router.get('/:userId', authenticateToken, userSkillController.getUserSkills);

// スキルを追加または更新
router.post('/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), userSkillController.upsertUserSkill);

// 複数のスキルを一括設定
router.put('/:userId', authenticateToken, authorizeSelfOrAdmin('userId'), userSkillController.setUserSkills);

// スキルを削除（skillNameまたはskillIdで削除）
router.delete('/:userId/:skillIdentifier', authenticateToken, authorizeSelfOrAdmin('userId'), userSkillController.deleteUserSkill);

module.exports = router;
