/**
 * ユーザーサービス
 * Knex.js対応版（非同期API）
 */
const fs = require('fs');
const path = require('path');
const db = require('./database');
const userSkillService = require('./userSkillService');
const logger = require('../utils/logger');
const { getInsertedId, getCurrentTimestamp } = require('../utils/dbHelpers');

const PROMPT_DIR = path.resolve(process.cwd(), '..', 'prompts');

/**
 * 全ユーザーを取得
 * @returns {Promise<Array>} ユーザー一覧
 */
async function findAllUsers() {
  const knex = db.getKnex();

  const baseUsers = await knex('users')
    .select(
      'id',
      'username',
      'email',
      'full_name as fullName',
      'role',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .orderBy('id', 'desc');

  const enrichedUsers = await Promise.all(
    baseUsers.map(async (user) => {
      try {
        return await enrichUser(knex, user);
      } catch (error) {
        logger.error(`ユーザーID ${user.id} の詳細情報取得に失敗しました: ${error.message}`);
        // 失敗した場合は基本情報のみ返す（statsなどは空）
        return {
          ...user,
          stats: { activeTasks: 0, dueSoonTasks: 0, completedThisWeek: 0, loadScore: 0, loadLabel: 'データ取得エラー', riskLevel: 'unknown' },
          tasks: [],
          prompts: [],
          skills: []
        };
      }
    })
  );

  return enrichedUsers;
}

/**
 * IDでユーザーを取得
 * @param {number} userId - ユーザーID
 * @returns {Promise<Object|null>} ユーザー情報
 */
async function findUserById(userId) {
  const knex = db.getKnex();

  const user = await knex('users')
    .select(
      'id',
      'username',
      'email',
      'full_name as fullName',
      'role',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .where('id', userId)
    .first();

  if (!user) {
    return null;
  }

  return enrichUser(knex, user);
}

/**
 * ユーザー情報を拡張（統計、タスク、プロンプト、スキル）
 * @param {Knex} knex - Knex接続
 * @param {Object} user - 基本ユーザー情報
 * @returns {Promise<Object>} 拡張されたユーザー情報
 */
async function enrichUser(knex, user) {
  const [stats, tasks, prompts, skills] = await Promise.all([
    fetchUserStats(knex, user.id),
    fetchUserTasks(knex, user.id),
    fetchUserPrompts(knex, user.id),
    userSkillService.getUserSkills(user.id)
  ]);

  return {
    ...user,
    stats,
    tasks,
    prompts,
    skills
  };
}

/**
 * ユーザーの統計情報を取得
 * @param {Knex} knex - Knex接続
 * @param {number} userId - ユーザーID
 * @returns {Promise<Object>} 統計情報
 */
async function fetchUserStats(knex, userId) {
  const dbClient = db.getDbClient();

  // SQLite固有の日時関数をDB非依存に変換
  let dateQuery;
  if (dbClient === 'better-sqlite3' || dbClient === 'sqlite3') {
    dateQuery = knex.raw(`
      SELECT
        SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END) AS activeTasks,
        SUM(
          CASE
            WHEN t.status != 'completed'
             AND t.due_date IS NOT NULL
             AND DATE(t.due_date) >= DATE('now')
             AND DATE(t.due_date) <= DATE('now', '+7 day')
            THEN 1
            ELSE 0
          END
        ) AS dueSoonTasks,
        SUM(
          CASE
            WHEN t.status = 'completed'
             AND (
               (t.updated_at IS NOT NULL AND datetime(t.updated_at) >= datetime('now', '-7 day')) OR
               (t.updated_at IS NULL AND t.created_at IS NOT NULL AND datetime(t.created_at) >= datetime('now', '-7 day'))
             )
            THEN 1
            ELSE 0
          END
        ) AS completedThisWeek,
        SUM(COALESCE(t.estimated_hours, 0)) AS totalEstimatedHours
      FROM tasks t
      WHERE t.assigned_to = ?
    `, [userId]);
  } else if (dbClient === 'mysql2') {
    dateQuery = knex.raw(`
      SELECT
        SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END) AS activeTasks,
        SUM(
          CASE
            WHEN t.status != 'completed'
             AND t.due_date IS NOT NULL
             AND DATE(t.due_date) >= CURDATE()
             AND DATE(t.due_date) <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            THEN 1
            ELSE 0
          END
        ) AS dueSoonTasks,
        SUM(
          CASE
            WHEN t.status = 'completed'
             AND (
               (t.updated_at IS NOT NULL AND t.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) OR
               (t.updated_at IS NULL AND t.created_at IS NOT NULL AND t.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
             )
            THEN 1
            ELSE 0
          END
        ) AS completedThisWeek,
        SUM(COALESCE(t.estimated_hours, 0)) AS totalEstimatedHours
      FROM tasks t
      WHERE t.assigned_to = ?
    `, [userId]);
  } else {
    // PostgreSQL / SQL Server
    dateQuery = knex.raw(`
      SELECT
        SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END) AS "activeTasks",
        SUM(
          CASE
            WHEN t.status != 'completed'
             AND t.due_date IS NOT NULL
             AND t.due_date >= CURRENT_DATE
             AND t.due_date <= CURRENT_DATE + INTERVAL '7 day'
            THEN 1
            ELSE 0
          END
        ) AS "dueSoonTasks",
        SUM(
          CASE
            WHEN t.status = 'completed'
             AND (
               (t.updated_at IS NOT NULL AND t.updated_at >= NOW() - INTERVAL '7 day') OR
               (t.updated_at IS NULL AND t.created_at IS NOT NULL AND t.created_at >= NOW() - INTERVAL '7 day')
             )
            THEN 1
            ELSE 0
          END
        ) AS "completedThisWeek",
        SUM(COALESCE(t.estimated_hours, 0)) AS "totalEstimatedHours"
      FROM tasks t
      WHERE t.assigned_to = ?
    `, [userId]);
  }

  try {
    const result = await dateQuery;
    const row = result.rows ? result.rows[0] : result[0] || {};

    const active = parseInt(row.activeTasks || row.activetasks || 0);
    const dueSoon = parseInt(row.dueSoonTasks || row.dueSoontasks || 0);
    const completed = parseInt(row.completedThisWeek || row.completedthisweek || 0);
    const loadScore = Math.max(30, Math.min(active * 25 + dueSoon * 15 - completed * 5 + 50, 140));

    let loadLabel = 'バランス良好';
    let riskLevel = 'balanced';
    if (loadScore >= 120) {
      loadLabel = '高負荷';
      riskLevel = 'critical';
    } else if (loadScore >= 90) {
      loadLabel = '要注意';
      riskLevel = 'warning';
    } else if (loadScore >= 70) {
      loadLabel = '集中対応中';
    }

    return {
      activeTasks: active,
      dueSoonTasks: dueSoon,
      completedThisWeek: completed,
      loadScore: Math.round(loadScore),
      loadLabel,
      riskLevel
    };
  } catch (error) {
    logger.error(`ユーザーID ${userId} の統計情報取得に失敗しました: ${error.message}`);
    throw error;
  }
}

/**
 * ユーザーのタスク一覧を取得
 * @param {Knex} knex - Knex接続
 * @param {number} userId - ユーザーID
 * @returns {Promise<Array>} タスク一覧
 */
async function fetchUserTasks(knex, userId) {
  const tasks = await knex('tasks as t')
    .leftJoin('projects as p', 'p.id', 't.project_id')
    .select(
      't.id',
      't.name',
      't.status',
      't.priority',
      't.due_date as dueDate',
      'p.name as projectName'
    )
    .where('t.assigned_to', userId)
    .orderByRaw(`
      CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END,
      t.due_date IS NULL,
      t.due_date
    `);

  return tasks.map((task) => ({
    ...task,
    status: task.status || 'unknown',
    priority: task.priority || 'normal'
  }));
}

/**
 * ユーザーのプロンプト一覧を取得
 * @param {Knex} knex - Knex接続
 * @param {number} userId - ユーザーID
 * @returns {Promise<Array>} プロンプト一覧
 */
async function fetchUserPrompts(knex, userId) {
  return knex('user_prompts')
    .select(
      'user_prompt_id as id',
      'prompt_name as promptName',
      'responsibility',
      'notes',
      'created_at as createdAt'
    )
    .where('user_id', userId)
    .orderBy('created_at', 'desc');
}

/**
 * ユーザーを作成
 * @param {Object} payload - ユーザー情報
 * @returns {Promise<Object>} 作成されたユーザーのID
 */
async function createUser(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  if (dbClient === 'pg') {
    const [result] = await knex('users')
      .insert({
        username: payload.username,
        email: payload.email,
        password_hash: payload.password_hash,
        full_name: payload.full_name,
        role: payload.role
      })
      .returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('users').insert({
      username: payload.username,
      email: payload.email,
      password_hash: payload.password_hash,
      full_name: payload.full_name,
      role: payload.role
    });
    return { id };
  }
}

/**
 * ユーザーを更新
 * @param {number} userId - ユーザーID
 * @param {Object} payload - 更新内容
 * @returns {Promise<void>}
 */
async function updateUser(userId, payload) {
  const knex = db.getKnex();

  const updateData = {
    email: payload.email,
    full_name: payload.full_name,
    role: payload.role,
    updated_at: knex.fn.now()
  };

  if (payload.password_hash) {
    updateData.password_hash = payload.password_hash;
  }

  await knex('users')
    .where('id', userId)
    .update(updateData);
}

/**
 * ユーザーを削除
 * @param {number} userId - ユーザーID
 * @returns {Promise<void>}
 */
async function deleteUser(userId) {
  const knex = db.getKnex();

  await knex.transaction(async (trx) => {
    // 1. user_prompts
    try {
      const deletedPrompts = await trx('user_prompts').where('user_id', userId).del();
      logger.info(`ユーザーID ${userId} の関連user_prompts ${deletedPrompts}件を削除しました`);
    } catch (e) {
      logger.warn('user_prompts削除をスキップしました: ' + e.message);
    }

    // 2. user_skills
    try {
      const deletedSkills = await trx('user_skills').where('user_id', userId).del();
      logger.info(`ユーザーID ${userId} の関連user_skills ${deletedSkills}件を削除しました`);
    } catch (e) {
      logger.warn('user_skills削除をスキップしました: ' + e.message);
    }

    // 3. vacations
    try {
      const deletedVacations = await trx('vacations').where('user_id', userId).del();
      logger.info(`ユーザーID ${userId} の関連vacations ${deletedVacations}件を削除しました`);
    } catch (e) {
      logger.warn('vacations削除をスキップしました: ' + e.message);
    }

    // 4. daily_reports
    try {
      const deletedReports = await trx('daily_reports').where('user_id', userId).del();
      logger.info(`ユーザーID ${userId} の関連daily_reports ${deletedReports}件を削除しました`);
    } catch (e) {
      logger.warn('daily_reports削除をスキップしました: ' + e.message);
    }

    // 5. notifications
    try {
      const deletedNotifications = await trx('notifications').where('user_id', userId).del();
      logger.info(`ユーザーID ${userId} の関連notifications ${deletedNotifications}件を削除しました`);
    } catch (e) {
      logger.warn('notifications削除をスキップしました: ' + e.message);
    }

    // 6. work_logs
    try {
      const deletedWorkLogs = await trx('work_logs').where('user_id', userId).del();
      logger.info(`ユーザーID ${userId} の関連work_logs ${deletedWorkLogs}件を削除しました`);
    } catch (e) {
      logger.warn('work_logs削除をスキップしました: ' + e.message);
    }

    // 7. project_members
    try {
      const deletedMembers = await trx('project_members').where('user_id', userId).del();
      logger.info(`ユーザーID ${userId} の関連project_members ${deletedMembers}件を削除しました`);
    } catch (e) {
      logger.warn('project_members削除をスキップしました: ' + e.message);
    }

    // 8. task_activity_log
    try {
      const deletedActivity = await trx('task_activity_log').where('user_id', userId).del();
      logger.info(`ユーザーID ${userId} の関連task_activity_log ${deletedActivity}件を削除しました`);
    } catch (e) {
      logger.warn('task_activity_log削除をスキップしました: ' + e.message);
    }

    // 9. task_attachments
    try {
      const deletedAttachments = await trx('task_attachments').where('uploaded_by', userId).del();
      logger.info(`ユーザーID ${userId} の関連task_attachments ${deletedAttachments}件を削除しました`);
    } catch (e) {
      logger.warn('task_attachments削除をスキップしました: ' + e.message);
    }

    // 10. task_comments
    try {
      const deletedComments = await trx('task_comments').where('user_id', userId).del();
      logger.info(`ユーザーID ${userId} の関連task_comments ${deletedComments}件を削除しました`);
    } catch (e) {
      logger.warn('task_comments削除をスキップしました: ' + e.message);
    }

    // 11. tasks（assigned_toをNULLに設定）
    try {
      const updatedTasks = await trx('tasks').where('assigned_to', userId).update({ assigned_to: null });
      logger.info(`ユーザーID ${userId} の担当タスク ${updatedTasks}件の担当者をNULLに設定しました`);
    } catch (e) {
      logger.warn('tasks更新をスキップしました: ' + e.message);
    }

    // 12. projects作成者チェック
    const projectCount = await trx('projects').where('created_by', userId).count('* as count').first();
    if (projectCount && projectCount.count > 0) {
      throw new Error(`このユーザーが作成したプロジェクトが${projectCount.count}件存在するため削除できません。先にプロジェクトを削除または作成者を変更してください。`);
    }

    // 13. users本体を削除
    const deletedUser = await trx('users').where('id', userId).del();

    if (deletedUser === 0) {
      throw new Error(`ユーザーID ${userId} が見つかりませんでした`);
    }

    logger.info(`ユーザーID ${userId} とすべての関連データを削除しました`);
  });
}

/**
 * プロンプトカタログを取得
 * @returns {Array} プロンプト一覧
 */
function listPromptCatalog() {
  if (!fs.existsSync(PROMPT_DIR)) {
    return [];
  }

  return fs
    .readdirSync(PROMPT_DIR)
    .filter((file) => file.endsWith('.txt'))
    .map((filename) => {
      const filepath = path.join(PROMPT_DIR, filename);
      let preview = '';
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
        preview = firstLine.slice(0, 120);
      } catch (error) {
        preview = '';
      }
      return {
        id: filename,
        filename,
        name: filename.replace(/\.txt$/, ''),
        preview
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * ユーザープロンプトを追加
 * @param {number} userId - ユーザーID
 * @param {Object} payload - プロンプト情報
 * @returns {Promise<Object>} 作成されたプロンプト
 */
async function addUserPrompt(userId, payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  let insertedId;
  if (dbClient === 'pg') {
    const [result] = await knex('user_prompts')
      .insert({
        user_id: userId,
        prompt_name: payload.promptName,
        responsibility: payload.responsibility || '',
        notes: payload.notes || ''
      })
      .returning('user_prompt_id');
    insertedId = result.user_prompt_id || result;
  } else {
    [insertedId] = await knex('user_prompts').insert({
      user_id: userId,
      prompt_name: payload.promptName,
      responsibility: payload.responsibility || '',
      notes: payload.notes || ''
    });
  }

  return fetchUserPromptById(knex, insertedId);
}

/**
 * ユーザープロンプトを更新
 * @param {number} userPromptId - プロンプトID
 * @param {Object} payload - 更新内容
 * @returns {Promise<Object>} 更新されたプロンプト
 */
async function updateUserPrompt(userPromptId, payload) {
  const knex = db.getKnex();

  await knex('user_prompts')
    .where('user_prompt_id', userPromptId)
    .update({
      responsibility: payload.responsibility || '',
      notes: payload.notes || ''
    });

  return fetchUserPromptById(knex, userPromptId);
}

/**
 * ユーザープロンプトを削除
 * @param {number} userPromptId - プロンプトID
 * @returns {Promise<void>}
 */
async function deleteUserPrompt(userPromptId) {
  const knex = db.getKnex();
  await knex('user_prompts').where('user_prompt_id', userPromptId).del();
}

/**
 * IDでプロンプトを取得
 * @param {Knex} knex - Knex接続
 * @param {number} userPromptId - プロンプトID
 * @returns {Promise<Object>} プロンプト情報
 */
async function fetchUserPromptById(knex, userPromptId) {
  return knex('user_prompts')
    .select(
      'user_prompt_id as id',
      'user_id as userId',
      'prompt_name as promptName',
      'responsibility',
      'notes',
      'created_at as createdAt'
    )
    .where('user_prompt_id', userPromptId)
    .first();
}

module.exports = {
  findAllUsers,
  findUserById,
  createUser,
  updateUser,
  deleteUser,
  listPromptCatalog,
  addUserPrompt,
  updateUserPrompt,
  deleteUserPrompt
};
