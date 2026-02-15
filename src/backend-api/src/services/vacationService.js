// 休暇管理サービス (Knex.js対応版) - メンバーの休暇日程とWBS調整提案を管理
const db = require('./database');

/**
 * 休暇情報を新規登録します
 * @param {object} vacation - 休暇情報
 * @returns {object} 登録結果
 */
async function createVacation(vacation) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    user_id: vacation.user_id,
    start_date: vacation.start_date,
    end_date: vacation.end_date,
    vacation_type: vacation.vacation_type || '有給休暇',
    notes: vacation.notes || ''
  };

  if (dbClient === 'pg') {
    const [result] = await knex('vacations').insert(insertData).returning('id');
    return {
      id: result.id || result,
      ...vacation
    };
  } else {
    const [id] = await knex('vacations').insert(insertData);
    return {
      id,
      ...vacation
    };
  }
}

/**
 * ユーザーの休暇一覧を取得します
 * @param {number} userId - ユーザーID
 * @param {object} options - フィルタリングオプション
 * @returns {Array} 休暇一覧
 */
async function findVacationsByUser(userId, options = {}) {
  const knex = db.getKnex();

  let query = knex('vacations')
    .select('*')
    .where('user_id', userId);

  if (options.startDate) {
    query = query.where('end_date', '>=', options.startDate);
  }

  if (options.endDate) {
    query = query.where('start_date', '<=', options.endDate);
  }

  return await query.orderBy('start_date', 'asc');
}

/**
 * 全ユーザーの休暇一覧を取得します
 * @param {object} options - フィルタリングオプション
 * @returns {Array} 休暇一覧（ユーザー情報含む）
 */
async function findAllVacations(options = {}) {
  const knex = db.getKnex();

  let query = knex('vacations as v')
    .leftJoin('users as u', 'v.user_id', 'u.id')
    .select(
      'v.*',
      'u.full_name as user_name',
      'u.role'
    );

  if (options.startDate) {
    query = query.where('v.end_date', '>=', options.startDate);
  }

  if (options.endDate) {
    query = query.where('v.start_date', '<=', options.endDate);
  }

  return await query.orderBy('v.start_date', 'asc');
}

/**
 * 休暇情報を更新します
 * @param {number} vacationId - 休暇ID
 * @param {object} updates - 更新内容
 */
async function updateVacation(vacationId, updates) {
  const knex = db.getKnex();

  const updateData = {};

  if (updates.start_date !== undefined) {
    updateData.start_date = updates.start_date;
  }
  if (updates.end_date !== undefined) {
    updateData.end_date = updates.end_date;
  }
  if (updates.vacation_type !== undefined) {
    updateData.vacation_type = updates.vacation_type;
  }
  if (updates.notes !== undefined) {
    updateData.notes = updates.notes;
  }

  if (Object.keys(updateData).length === 0) return;

  await knex('vacations')
    .where('id', vacationId)
    .update(updateData);
}

/**
 * 休暇情報を削除します
 * @param {number} vacationId - 休暇ID
 */
async function deleteVacation(vacationId) {
  const knex = db.getKnex();
  await knex('vacations').where('id', vacationId).del();
}

/**
 * 指定期間におけるメンバーの休暇影響を分析します
 * @param {string} startDate - 分析開始日
 * @param {string} endDate - 分析終了日
 * @returns {Array} 影響分析結果
 */
async function analyzeVacationImpact(startDate, endDate) {
  // 期間内の休暇を取得
  const vacations = await findAllVacations({ startDate, endDate });

  // ユーザーごとに休暇日数を集計
  const userImpactMap = new Map();

  for (const vacation of vacations) {
    const userId = vacation.user_id;
    const userName = vacation.user_name || `ユーザー${userId}`;
    const role = vacation.role || '未設定';

    // 休暇日数を計算（簡易版: 日数差分）
    const start = new Date(vacation.start_date);
    const end = new Date(vacation.end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    if (!userImpactMap.has(userId)) {
      userImpactMap.set(userId, {
        userId,
        userName,
        role,
        totalVacationDays: 0,
        vacations: []
      });
    }

    const impact = userImpactMap.get(userId);
    impact.totalVacationDays += days;
    impact.vacations.push({
      id: vacation.id,
      startDate: vacation.start_date,
      endDate: vacation.end_date,
      type: vacation.vacation_type,
      days
    });
  }

  return Array.from(userImpactMap.values());
}

/**
 * 休暇による影響を受けるタスクを取得します
 * @param {number} userId - ユーザーID
 * @param {string} startDate - 休暇開始日
 * @param {string} endDate - 休暇終了日
 * @returns {Array} 影響を受けるタスク一覧
 */
async function findAffectedTasks(userId, startDate, endDate) {
  const knex = db.getKnex();

  return await knex('tasks as t')
    .leftJoin('projects as p', 't.project_id', 'p.id')
    .select(
      't.*',
      'p.name as project_name'
    )
    .where('t.assigned_to', userId)
    .whereNotIn('t.status', ['done', 'completed'])
    .andWhere(function () {
      this.where(function () {
        this.where('t.due_date', '>=', startDate)
          .andWhere('t.due_date', '<=', endDate);
      })
        .orWhere(function () {
          this.where('t.start_date', '>=', startDate)
            .andWhere('t.start_date', '<=', endDate);
        })
        .orWhere(function () {
          this.where('t.start_date', '<=', startDate)
            .andWhere('t.due_date', '>=', endDate);
        });
    })
    .orderBy('t.due_date', 'asc');
}

module.exports = {
  createVacation,
  findVacationsByUser,
  findAllVacations,
  updateVacation,
  deleteVacation,
  analyzeVacationImpact,
  findAffectedTasks
};
