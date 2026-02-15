// ダッシュボード用のAIデータを扱うサービス (Knex.js対応版)
const db = require('./database');
const { getCurrentTimestamp } = require('../utils/dbHelpers');

/**
 * プロジェクトサマリーを保存または更新します
 */
async function saveProjectSummary(projectId, summaryData) {
  const knex = db.getKnex();

  // プロジェクトが存在するか確認
  const projectExists = await knex('projects').where('id', projectId).first();

  if (!projectExists) {
    throw new Error(`プロジェクトID ${projectId} が存在しません`);
  }

  await knex('project_summaries')
    .insert({
      project_id: projectId,
      progress_percentage: summaryData.progress_percentage || 0,
      current_phase: summaryData.current_phase || '',
      summary_text: summaryData.summary_text || '',
      updated_at: getCurrentTimestamp()
    })
    .onConflict('project_id')
    .merge([
      'progress_percentage',
      'current_phase',
      'summary_text',
      'updated_at'
    ]);
}

/**
 * プロジェクトサマリーを取得します
 */
async function getProjectSummary(projectId) {
  const knex = db.getKnex();

  return await knex('project_summaries')
    .select(
      'id',
      'project_id as projectId',
      'progress_percentage as progressPercentage',
      'current_phase as currentPhase',
      'summary_text as summaryText',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .where('project_id', projectId)
    .first();
}

/**
 * 全プロジェクトのサマリーを取得します
 */
async function getAllProjectSummaries() {
  const knex = db.getKnex();

  return await knex('project_summaries')
    .select(
      'id',
      'project_id as projectId',
      'progress_percentage as progressPercentage',
      'current_phase as currentPhase',
      'summary_text as summaryText',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .orderBy('updated_at', 'desc');
}

/**
 * ダッシュボードアラートを全て削除してから新しいアラートを保存します
 */
async function saveAlerts(alerts) {
  const knex = db.getKnex();

  console.log('[saveAlerts] Received alerts count:', alerts?.length || 0);
  console.log('[saveAlerts] Alerts data:', JSON.stringify(alerts, null, 2));

  if (!alerts || alerts.length === 0) {
    console.log('[saveAlerts] No alerts to save, skipping delete and insert');
    return;
  }

  await knex.transaction(async (trx) => {
    // 既存のアラートを削除
    await trx('dashboard_alerts').del();
    console.log('[saveAlerts] Deleted existing alerts');

    // 新しいアラートを追加
    for (const alert of alerts) {
      let projectId = null;
      let relatedTaskId = null;

      // projectIdが指定されている場合、そのプロジェクトが存在するか確認
      if (alert.projectId != null && alert.projectId !== '') {
        const numericProjectId = Number(alert.projectId);
        if (!isNaN(numericProjectId)) {
          const projectExists = await trx('projects').where('id', numericProjectId).first();
          if (projectExists) {
            projectId = numericProjectId;
          }
        }
      }

      // relatedTaskIdが指定されている場合、そのタスクが存在するか確認
      if (alert.relatedTaskId != null && alert.relatedTaskId !== '') {
        const numericTaskId = Number(alert.relatedTaskId);
        if (!isNaN(numericTaskId)) {
          const taskExists = await trx('tasks').where('id', numericTaskId).first();
          if (taskExists) {
            relatedTaskId = numericTaskId;
          }
        }
      }

      await trx('dashboard_alerts').insert({
        project_id: projectId,
        severity: alert.severity || 'medium',
        type: alert.type || 'warning',
        is_read: alert.isRead || false,
        title: alert.title || null,
        message: alert.message || '',
        related_task_id: relatedTaskId
      });
      console.log('[saveAlerts] Inserted alert:', alert.title || alert.message?.slice(0, 30));
    }
  });
  console.log('[saveAlerts] Transaction completed successfully');
}

/**
 * 単一のアラートを取得します
 */
async function getAlertById(alertId) {
  const knex = db.getKnex();

  const alert = await knex('dashboard_alerts as a')
    .select(
      'a.id',
      'a.project_id as projectId',
      'a.severity',
      'a.type',
      'a.is_read as isRead',
      'a.title',
      'a.message',
      'a.related_task_id as relatedTaskId',
      'a.created_at as createdAt',
      'p.name as projectName',
      't.name as taskTitle'
    )
    .leftJoin('projects as p', 'a.project_id', 'p.id')
    .leftJoin('tasks as t', 'a.related_task_id', 't.id')
    .where('a.id', alertId)
    .first();

  return alert;
}

/**
 * アラートを既読/未読に更新します
 */
async function markAlertAsRead(alertId, isRead) {
  const knex = db.getKnex();

  await knex('dashboard_alerts')
    .where('id', alertId)
    .update({ is_read: isRead });
}

/**
 * 複数のアラートを既読/未読に更新します
 */
async function markAlertsAsRead(alertIds, isRead) {
  const knex = db.getKnex();

  await knex('dashboard_alerts')
    .whereIn('id', alertIds)
    .update({ is_read: isRead });
}

/**
 * 全てのアラートを既読にします
 */
async function markAllAlertsAsRead() {
  const knex = db.getKnex();

  await knex('dashboard_alerts')
    .update({ is_read: true });
}

/**
 * 全てのダッシュボードアラートを取得します（フィルタリング対応）
 */
async function getAllAlerts(filters = {}) {
  const knex = db.getKnex();

  let query = knex('dashboard_alerts as a')
    .select(
      'a.id',
      'a.project_id as projectId',
      'a.severity',
      'a.type',
      'a.is_read as isRead',
      'a.title',
      'a.message',
      'a.related_task_id as relatedTaskId',
      'a.created_at as createdAt',
      'p.name as projectName',
      't.name as taskTitle'
    )
    .leftJoin('projects as p', 'a.project_id', 'p.id')
    .leftJoin('tasks as t', 'a.related_task_id', 't.id');

  // フィルタリング
  if (filters.severity) {
    query = query.where('a.severity', filters.severity);
  }
  if (filters.type) {
    query = query.where('a.type', filters.type);
  }
  if (filters.isRead !== undefined) {
    query = query.where('a.is_read', filters.isRead);
  }
  if (filters.projectId) {
    query = query.where('a.project_id', filters.projectId);
  }

  return await query
    .orderByRaw(`
      CASE a.severity
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END
    `)
    .orderBy('a.created_at', 'desc');
}

/**
 * センチメント分析結果を保存または更新します
 */
async function saveSentiment(sentimentData) {
  const knex = db.getKnex();

  await knex.transaction(async (trx) => {
    // 既存のレコードを全て削除
    await trx('sentiment_analysis').del();

    // 新しいデータを挿入
    await trx('sentiment_analysis').insert({
      overall_score: sentimentData.overall_score ?? 0,
      summary: sentimentData.summary ?? '',
      positive_keywords: JSON.stringify(sentimentData.positive_keywords ?? []),
      negative_keywords: JSON.stringify(sentimentData.negative_keywords ?? []),
      comments_json: sentimentData.comments_json ?? '[]',
      updated_at: getCurrentTimestamp()
    });
  });
}

/**
 * 最新のセンチメント分析結果を取得します
 */
async function getSentiment() {
  const knex = db.getKnex();

  const result = await knex('sentiment_analysis')
    .select(
      'id',
      'overall_score as overallScore',
      'summary',
      'positive_keywords as positiveKeywords',
      'negative_keywords as negativeKeywords',
      'comments_json as commentsJson',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )
    .orderBy('updated_at', 'desc')
    .first();

  if (result) {
    // positive_keywords と negative_keywords の処理
    try {
      result.positiveKeywords = JSON.parse(result.positiveKeywords || '[]');
    } catch (e) {
      result.positiveKeywords = result.positiveKeywords
        ? result.positiveKeywords.split(',').map(k => k.trim()).filter(k => k)
        : [];
    }

    try {
      result.negativeKeywords = JSON.parse(result.negativeKeywords || '[]');
    } catch (e) {
      result.negativeKeywords = result.negativeKeywords
        ? result.negativeKeywords.split(',').map(k => k.trim()).filter(k => k)
        : [];
    }
  }
  return result;
}

module.exports = {
  saveProjectSummary,
  getProjectSummary,
  getAllProjectSummaries,
  saveAlerts,
  getAllAlerts,
  getAlertById,
  markAlertAsRead,
  markAlertsAsRead,
  markAllAlertsAsRead,
  saveSentiment,
  getSentiment
};
