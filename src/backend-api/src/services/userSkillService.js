// ユーザースキルを扱うサービス (Knex.js対応版)
const db = require('./database');
const growthTrackingService = require('./growthTrackingService');

/**
 * ユーザーのスキル一覧を取得します
 * @param {number} userId - ユーザーID
 * @returns {Array} スキル一覧
 */
async function getUserSkills(userId) {
  const knex = db.getKnex();

  return await knex('user_skills')
    .select(
      'skill_id as id',
      'user_id as userId',
      'skill_name as skillName',
      'skill_level as skillLevel',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .where('user_id', userId)
    .orderBy('skill_name', 'asc');
}

/**
 * スキルを追加または更新します
 * @param {number} userId - ユーザーID
 * @param {string} skillName - スキル名
 * @param {number} skillLevel - スキルレベル（0-10）
 */
async function upsertUserSkill(userId, skillName, skillLevel) {
  const knex = db.getKnex();

  const insertData = {
    user_id: userId,
    skill_name: skillName,
    skill_level: skillLevel
  };

  // Try upsert
  try {
    await knex('user_skills')
      .insert(insertData)
      .onConflict(['user_id', 'skill_name'])
      .merge({
        skill_level: skillLevel,
        updated_at: knex.fn.now()
      });
  } catch (err) {
    // Fallback for databases that don't support onConflict
    const existing = await knex('user_skills')
      .where({ user_id: userId, skill_name: skillName })
      .first();

    if (existing) {
      await knex('user_skills')
        .where({ user_id: userId, skill_name: skillName })
        .update({
          skill_level: skillLevel,
          updated_at: knex.fn.now()
        });
    } else {
      await knex('user_skills').insert(insertData);
    }
  }

  // スキル成長履歴を記録（成長トラッキング連携）
  try {
    await growthTrackingService.recordSkillGrowth(
      userId,
      skillName,
      skillLevel,
      'manual_update',
      'スキルが更新されました'
    );
  } catch (error) {
    // 成長トラッキング機能がまだ有効でない場合は無視
    console.warn('Growth tracking not available:', error.message);
  }

  return { success: true };
}

/**
 * スキルをIDで削除します
 * @param {number} userId - ユーザーID
 * @param {number} skillId - スキルID
 */
async function deleteUserSkillById(userId, skillId) {
  const knex = db.getKnex();

  return await knex('user_skills')
    .where('skill_id', skillId)
    .where('user_id', userId)
    .del();
}

/**
 * スキルを名前で削除します
 * @param {number} userId - ユーザーID
 * @param {string} skillName - スキル名
 */
async function deleteUserSkillByName(userId, skillName) {
  const knex = db.getKnex();

  return await knex('user_skills')
    .where('user_id', userId)
    .where('skill_name', skillName)
    .del();
}

/**
 * 複数のスキルを一括で設定します（既存のスキルは削除）
 * @param {number} userId - ユーザーID
 * @param {Array} skills - スキル配列 [{name, level}, ...]
 */
async function setUserSkills(userId, skills) {
  const knex = db.getKnex();

  await knex.transaction(async (trx) => {
    // Delete all existing skills for this user
    await trx('user_skills').where('user_id', userId).del();

    // Insert new skills
    for (const skill of skills) {
      await trx('user_skills').insert({
        user_id: userId,
        skill_name: skill.name,
        skill_level: skill.level
      });
    }
  });

  // 各スキルの成長履歴を記録（成長トラッキング連携）
  try {
    for (const skill of skills) {
      await growthTrackingService.recordSkillGrowth(
        userId,
        skill.name,
        skill.level,
        'bulk_update',
        'スキルが一括更新されました'
      );
    }
  } catch (error) {
    // 成長トラッキング機能がまだ有効でない場合は無視
    console.warn('Growth tracking not available:', error.message);
  }

  return { success: true };
}

module.exports = {
  getUserSkills,
  upsertUserSkill,
  deleteUserSkillById,
  deleteUserSkillByName,
  setUserSkills
};
