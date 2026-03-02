// プロジェクト情報を扱うサービス (Knex.js対応版)
const db = require('./database');
const { getInsertedId, getCurrentTimestamp } = require('../utils/dbHelpers');
const { applyPagination, applySorting, applySearch } = require('../utils/pagination');

/** 全プロジェクトを取得します。 */
async function findAllProjects() {
  const knex = db.getKnex();
  return await knex('projects')
    .select(
      'id',
      'name',
      'description',
      'start_date as startDate',
      'end_date as endDate',
      'status',
      'created_by as createdBy',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .orderBy('id', 'desc');
}

/** IDを指定してプロジェクトを取得します。 */
async function findProjectById(projectId) {
  const knex = db.getKnex();
  return await knex('projects')
    .select(
      'id',
      'name',
      'description',
      'start_date as startDate',
      'end_date as endDate',
      'status',
      'created_by as createdBy',
      'main_deliverable as mainDeliverable',
      'milestone',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .where('id', projectId)
    .first();
}

/** フィルター条件に応じてプロジェクト一覧を取得します（ページネーション対応） */
async function findProjects(filter = {}) {
  const knex = db.getKnex();

  // ベースクエリを構築
  let baseQuery = knex('projects');

  // フィルタ条件を適用
  if (filter.status) {
    if (Array.isArray(filter.status)) {
      baseQuery = baseQuery.whereIn('status', filter.status);
    } else {
      baseQuery = baseQuery.where('status', filter.status);
    }
  }

  if (filter.createdBy) {
    baseQuery = baseQuery.where('created_by', filter.createdBy);
  }

  // 検索キーワード
  if (filter.search || filter.searchKeyword) {
    const searchTerm = filter.search || filter.searchKeyword;
    baseQuery = applySearch(baseQuery, searchTerm, ['name', 'description']);
  }

  // 総件数を取得（ページネーション用）
  const countQuery = baseQuery.clone().count('* as count');
  const [{ count }] = await countQuery;
  const total = parseInt(count) || 0;

  // データクエリ
  let dataQuery = baseQuery
    .select(
      'id',
      'name',
      'description',
      'start_date as startDate',
      'end_date as endDate',
      'status',
      'created_by as createdBy',
      'created_at as createdAt',
      'updated_at as updatedAt'
    );

  // ソート適用
  const allowedSortFields = ['id', 'name', 'status', 'createdAt', 'updatedAt', 'startDate', 'endDate'];
  dataQuery = applySorting(dataQuery, filter.sortBy, '-id', allowedSortFields);

  // ページネーション適用
  if (filter.pagination) {
    const { limit, offset } = filter.pagination;
    dataQuery = applyPagination(dataQuery, { limit, offset });
  }

  const data = await dataQuery;

  if (filter.includeTaskStats && data.length > 0) {
    const projectIds = data.map((project) => project.id);
    const taskStatsMap = await getTaskStatsByProjectIds(knex, projectIds);

    const enrichedData = data.map((project) => {
      const stats = taskStatsMap.get(project.id) || {
        total: 0,
        completed: 0,
        inProgress: 0,
        overdue: 0
      };

      const derivedProgress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

      return {
        ...project,
        total_tasks: stats.total,
        completed_tasks: stats.completed,
        in_progress_tasks: stats.inProgress,
        overdue_tasks: stats.overdue,
        progress: derivedProgress,
        taskStats: {
          total: stats.total,
          completed: stats.completed,
          inProgress: stats.inProgress,
          overdue: stats.overdue
        }
      };
    });

    return { data: enrichedData, total };
  }

  return { data, total };
}

/**
 * プロジェクトID群ごとのタスク統計を取得
 * @param {Object} knex - Knexインスタンス
 * @param {number[]} projectIds - プロジェクトID配列
 * @returns {Promise<Map<number, {total: number, completed: number, inProgress: number, overdue: number}>>}
 */
async function getTaskStatsByProjectIds(knex, projectIds) {
  const rows = await knex('tasks as t')
    .select('t.project_id as projectId')
    .count('* as totalTasks')
    .sum({
      completedTasks: knex.raw("CASE WHEN t.status IN ('completed', 'done') THEN 1 ELSE 0 END")
    })
    .sum({
      inProgressTasks: knex.raw("CASE WHEN t.status IN ('in_progress', 'in-progress') THEN 1 ELSE 0 END")
    })
    .sum({
      overdueTasks: knex.raw(`
        CASE
          WHEN t.due_date IS NOT NULL
           AND t.due_date < CURRENT_TIMESTAMP
           AND t.status NOT IN ('completed', 'done')
          THEN 1 ELSE 0
        END
      `)
    })
    .whereIn('t.project_id', projectIds)
    .groupBy('t.project_id');

  const statsMap = new Map();
  for (const row of rows) {
    statsMap.set(Number(row.projectId), {
      total: Number(row.totalTasks || 0),
      completed: Number(row.completedTasks || 0),
      inProgress: Number(row.inProgressTasks || 0),
      overdue: Number(row.overdueTasks || 0)
    });
  }

  return statsMap;
}

/** プロジェクトを新規登録します。 */
async function createProject(payload) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    name: payload.name,
    description: payload.description,
    start_date: payload.startDate,
    end_date: payload.endDate,
    status: payload.status,
    created_by: payload.createdBy,
    main_deliverable: payload.mainDeliverable || '',
    milestone: payload.milestone || ''
  };

  if (dbClient === 'pg') {
    const [result] = await knex('projects').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('projects').insert(insertData);
    return { id };
  }
}

/** プロジェクト情報を更新します。 */
async function updateProject(projectId, payload) {
  const knex = db.getKnex();

  const updateData = {
    name: payload.name,
    description: payload.description,
    start_date: payload.startDate,
    end_date: payload.endDate,
    status: payload.status,
    updated_at: getCurrentTimestamp()
  };

  // main_deliverableとmilestoneが提供されている場合のみ更新
  if (payload.mainDeliverable !== undefined) {
    updateData.main_deliverable = payload.mainDeliverable;
  }
  if (payload.milestone !== undefined) {
    updateData.milestone = payload.milestone;
  }

  await knex('projects')
    .where('id', projectId)
    .update(updateData);
}

/** プロジェクトを削除します（関連データも全て削除）。 */
async function deleteProject(projectId) {
  const knex = db.getKnex();
  const logger = require('../utils/logger');

  await knex.transaction(async (trx) => {
    logger.info(`プロジェクトID ${projectId} の削除処理を開始`);

    // 1. タスクに関連するデータを削除（tasksを削除する前に削除する必要がある）

    // 1-1. work_logs
    try {
      const taskIds = await trx('tasks').where('project_id', projectId).pluck('id');
      if (taskIds.length > 0) {
        const deletedWorkLogs = await trx('work_logs').whereIn('task_id', taskIds).del();
        logger.info(`プロジェクトID ${projectId} の関連work_logs ${deletedWorkLogs}件を削除しました`);
      }
    } catch (e) {
      logger.warn('work_logs削除をスキップしました: ' + e.message);
    }

    // 1-2. task_comments
    try {
      const taskIds = await trx('tasks').where('project_id', projectId).pluck('id');
      if (taskIds.length > 0) {
        const deletedComments = await trx('task_comments').whereIn('task_id', taskIds).del();
        logger.info(`プロジェクトID ${projectId} の関連task_comments ${deletedComments}件を削除しました`);
      }
    } catch (e) {
      logger.warn('task_comments削除をスキップしました: ' + e.message);
    }

    // 1-3. task_attachments
    try {
      const taskIds = await trx('tasks').where('project_id', projectId).pluck('id');
      if (taskIds.length > 0) {
        const deletedAttachments = await trx('task_attachments').whereIn('task_id', taskIds).del();
        logger.info(`プロジェクトID ${projectId} の関連task_attachments ${deletedAttachments}件を削除しました`);
      }
    } catch (e) {
      logger.warn('task_attachments削除をスキップしました: ' + e.message);
    }

    // 1-4. task_activity_log
    try {
      const taskIds = await trx('tasks').where('project_id', projectId).pluck('id');
      if (taskIds.length > 0) {
        const deletedActivity = await trx('task_activity_log').whereIn('task_id', taskIds).del();
        logger.info(`プロジェクトID ${projectId} の関連task_activity_log ${deletedActivity}件を削除しました`);
      }
    } catch (e) {
      logger.warn('task_activity_log削除をスキップしました: ' + e.message);
    }

    // 1-5. parent_task_idをNULLに設定（自己参照の解除）
    try {
      const updatedTasks = await trx('tasks')
        .where('project_id', projectId)
        .update({ parent_task_id: null });
      logger.info(`プロジェクトID ${projectId} のタスク ${updatedTasks}件のparent_task_idをNULLに設定しました`);
    } catch (e) {
      logger.warn('parent_task_id更新をスキップしました: ' + e.message);
    }

    // 2. プロジェクトに関連するタスクを削除
    const deletedTasksResult = await trx('tasks').where('project_id', projectId).del();
    logger.info(`プロジェクトID ${projectId} の関連タスク ${deletedTasksResult}件を削除しました`);

    // 3. AI予測を削除
    try {
      const deletedAIPredictions = await trx('ai_predictions').where('project_id', projectId).del();
      logger.info(`プロジェクトID ${projectId} のAI予測 ${deletedAIPredictions}件を削除しました`);
    } catch (e) {
      logger.warn('ai_predictions削除をスキップしました: ' + e.message);
    }

    // 4. プロジェクトメンバーを削除
    try {
      await trx('project_members').where('project_id', projectId).del();
    } catch (e) {
      logger.warn('project_members削除をスキップしました: ' + e.message);
    }

    // 5. プロジェクトマイルストーンを削除
    try {
      await trx('project_milestones').where('project_id', projectId).del();
    } catch (e) {
      logger.warn('project_milestones削除をスキップしました: ' + e.message);
    }

    // 6. プロジェクトサマリを削除
    try {
      await trx('project_summaries').where('project_id', projectId).del();
    } catch (e) {
      logger.warn('project_summaries削除をスキップしました: ' + e.message);
    }

    // 7. ダッシュボードアラートを削除
    try {
      await trx('dashboard_alerts').where('project_id', projectId).del();
    } catch (e) {
      logger.warn('dashboard_alerts削除をスキップしました: ' + e.message);
    }

    // 8. プロジェクトを削除
    const deletedProjectResult = await trx('projects').where('id', projectId).del();

    if (deletedProjectResult === 0) {
      throw new Error(`プロジェクトID ${projectId} が見つかりませんでした`);
    }

    logger.info(`プロジェクトID ${projectId} とすべての関連データを削除しました`);
  });
}

/**
 * プロジェクトと全タスクを一括作成（トランザクション処理）
 * @param {Object} projectData - プロジェクト情報
 * @param {Array} tasks - タスク配列（階層構造）
 * @returns {Object} 作成されたプロジェクトIDとタスクID一覧
 */
async function createProjectWithTasks(projectData, tasks) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();
  const logger = require('../utils/logger');

  return await knex.transaction(async (trx) => {
    // 1. プロジェクトを作成
    const projectInsertData = {
      name: projectData.name,
      description: projectData.description || '',
      start_date: projectData.startDate || null,
      end_date: projectData.endDate || null,
      status: projectData.status || 'planning',
      created_by: projectData.createdBy || null
    };

    let projectId;
    if (dbClient === 'pg') {
      const [result] = await trx('projects').insert(projectInsertData).returning('id');
      projectId = result.id || result;
    } else {
      const [id] = await trx('projects').insert(projectInsertData);
      projectId = id;
    }

    logger.info(`プロジェクトを作成しました: ID=${projectId}, name=${projectData.name}`);

    // 2. タスクを階層的に作成
    const createdTaskIds = [];
    const taskIdMap = new Map(); // 一時IDから実際のIDへのマッピング

    // 再帰的にタスクを作成
    async function createTaskRecursive(task, parentTaskId = null, sortOrder = 0) {
      const taskInsertData = {
        project_id: projectId,
        name: task.name,
        description: task.description || '',
        assigned_to: task.assignedTo || task.assigned_to || null,
        estimated_hours: task.estimatedHours || task.estimated_hours || (task.effortDays ? task.effortDays * 8 : null),
        priority: task.priority || 'medium',
        status: task.status || 'todo',
        progress: task.progress || 0,
        due_date: task.dueDate || task.due_date || null,
        start_date: task.startDate || task.start_date || null,
        end_date: task.endDate || task.end_date || null,
        actual_start_date: task.actualStartDate || task.actual_start_date || null,
        actual_end_date: task.actualEndDate || task.actual_end_date || null,
        deliverable: task.deliverable || '',
        parent_task_id: parentTaskId,
        sort_order: sortOrder,
        dependencies: task.dependencies ? JSON.stringify(task.dependencies) : '[]'
      };

      let taskId;
      if (dbClient === 'pg') {
        const [result] = await trx('tasks').insert(taskInsertData).returning('id');
        taskId = result.id || result;
      } else {
        const [id] = await trx('tasks').insert(taskInsertData);
        taskId = id;
      }

      createdTaskIds.push(taskId);

      // 一時IDがあればマッピング（依存関係の解決用）
      if (task.id) {
        taskIdMap.set(task.id, taskId);
      }

      // 子タスクを再帰的に作成
      if (task.children && Array.isArray(task.children)) {
        for (let i = 0; i < task.children.length; i++) {
          await createTaskRecursive(task.children[i], taskId, i);
        }
      }

      return taskId;
    }

    // ルートタスクから順に作成
    for (let i = 0; i < tasks.length; i++) {
      await createTaskRecursive(tasks[i], null, i);
    }

    logger.info(`${createdTaskIds.length}件のタスクを作成しました`);

    return {
      projectId: projectId,
      taskIds: createdTaskIds,
      taskCount: createdTaskIds.length
    };
  });
}

/** プロジェクトメンバーを取得します */
async function getProjectMembers(projectId) {
  const knex = db.getKnex();

  const rows = await knex('project_members as pm')
    .join('users as u', 'pm.user_id', 'u.id')
    .select(
      'pm.id',
      'pm.project_id',
      'pm.user_id',
      'pm.role',
      'pm.added_at',
      'u.id as u_id',
      'u.username',
      'u.full_name',
      'u.email',
      'u.role as u_role',
      'u.created_at as u_created_at'
    )
    .where('pm.project_id', projectId);

  return rows.map(row => ({
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    addedAt: row.added_at,
    user: {
      id: row.u_id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      role: row.u_role,
      createdAt: row.u_created_at
    }
  }));
}

/** プロジェクトメンバーを更新します（洗い替え） */
async function updateProjectMembers(projectId, membersOrUserIds) {
  const knex = db.getKnex();
  const logger = require('../utils/logger');

  await knex.transaction(async (trx) => {
    // 既存のメンバーを削除
    await trx('project_members').where('project_id', projectId).del();

    const validRoles = ['owner', 'member', 'viewer'];

    // 新しいメンバーを追加（有効なユーザーIDのみ）
    let addedCount = 0;
    for (const entry of membersOrUserIds || []) {
      let userId;
      let role = 'member';

      if (typeof entry === 'number') {
        userId = entry;
      } else if (typeof entry === 'string') {
        userId = Number(entry);
      } else if (entry && typeof entry === 'object') {
        userId = Number(entry.userId || entry.id);
        role = String(entry.role || 'member');
      }

      if (!userId) {
        logger.warn('無効なメンバーエントリをスキップしました');
        continue;
      }

      if (!validRoles.includes(role)) {
        role = 'member';
      }

      // ユーザーIDが存在するか確認
      const userExists = await trx('users').where('id', userId).first();
      if (userExists) {
        await trx('project_members').insert({
          project_id: projectId,
          user_id: userId,
          role
        });
        addedCount++;
      } else {
        logger.warn(`ユーザーID ${userId} が存在しないためスキップしました`);
      }
    }

    logger.info(`プロジェクトID ${projectId} のメンバーを更新しました（${addedCount}名）`);
  });
}

module.exports = {
  findAllProjects,
  findProjects,
  findProjectById,
  createProject,
  updateProject,
  deleteProject,
  createProjectWithTasks,
  getProjectMembers,
  updateProjectMembers
};
