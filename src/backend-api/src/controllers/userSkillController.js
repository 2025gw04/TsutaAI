// ユーザースキルAPIのコントローラー
const userSkillService = require('../services/userSkillService');

/**
 * ユーザーのスキル一覧を取得します
 */
async function getUserSkills(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const skills = await userSkillService.getUserSkills(userId);
    res.json({ success: true, data: skills });
  } catch (error) {
    next(error);
  }
}

/**
 * スキルを追加または更新します
 */
async function upsertUserSkill(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const { skillName, skillLevel } = req.body;

    if (!skillName || skillLevel === undefined) {
      return res.status(400).json({
        success: false,
        message: 'skillNameとskillLevelは必須です'
      });
    }

    if (skillLevel < 0 || skillLevel > 10) {
      return res.status(400).json({
        success: false,
        message: 'skillLevelは0から10の範囲で指定してください'
      });
    }

    await userSkillService.upsertUserSkill(userId, skillName, skillLevel);
    res.json({ success: true, message: 'スキルを保存しました' });
  } catch (error) {
    next(error);
  }
}

/**
 * スキルを削除します（skillNameまたはskillIdで削除）
 */
async function deleteUserSkill(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const skillIdentifier = req.params.skillIdentifier;

    // 数値ならskillId、そうでなければskillName
    if (!isNaN(skillIdentifier)) {
      const skillId = Number(skillIdentifier);
      await userSkillService.deleteUserSkillById(userId, skillId);
    } else {
      await userSkillService.deleteUserSkillByName(userId, decodeURIComponent(skillIdentifier));
    }

    res.json({ success: true, message: 'スキルを削除しました' });
  } catch (error) {
    next(error);
  }
}

/**
 * 複数のスキルを一括で設定します
 */
async function setUserSkills(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const { skills } = req.body;

    if (!Array.isArray(skills)) {
      return res.status(400).json({
        success: false,
        message: 'skillsは配列で指定してください'
      });
    }

    // バリデーション
    for (const skill of skills) {
      if (!skill.name || skill.level === undefined) {
        return res.status(400).json({
          success: false,
          message: 'すべてのスキルにnameとlevelが必要です'
        });
      }
      if (skill.level < 0 || skill.level > 10) {
        return res.status(400).json({
          success: false,
          message: 'skill levelは0から10の範囲で指定してください'
        });
      }
    }

    await userSkillService.setUserSkills(userId, skills);
    res.json({ success: true, message: 'スキルを保存しました' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUserSkills,
  upsertUserSkill,
  deleteUserSkill,
  setUserSkills
};
