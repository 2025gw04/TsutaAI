// ダッシュボード用のAIデータを扱うサービス (Knex.js対応版)
const db = require('./database');
const { getCurrentTimestamp } = require('../utils/dbHelpers');
const { generateAlertHash } = require('../utils/alertHash');

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
 * ダッシュボードアラートを履歴維持しながら保存します
 * - 既存履歴は削除しない
 * - 同一ハッシュのアクティブアラートは内容差分がある場合のみ更新
 * - 新規ハッシュのみ追加
 */
async function saveAlerts(alerts) {
  const knex = db.getKnex();
  const stats = {
    inserted: 0,
    updated: 0,
    unchanged: 0
  };

  console.log('[saveAlerts] Received alerts count:', alerts?.length || 0);
  console.log('[saveAlerts] Alerts data:', JSON.stringify(alerts, null, 2));

  if (!alerts || alerts.length === 0) {
    console.log('[saveAlerts] No alerts to save, skipping');
    return stats;
  }

  await knex.transaction(async (trx) => {
    // 新しいアラートを保存（履歴維持）
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

      const normalizedAlert = {
        projectId,
        severity: alert.severity || 'medium',
        type: alert.type || 'warning',
        title: alert.title || null,
        message: alert.message || '',
        details: alert.details || null,
        relatedTaskId
      };
      const alertHash = generateAlertHash({
        projectId: normalizedAlert.projectId,
        severity: normalizedAlert.severity,
        type: normalizedAlert.type,
        message: normalizedAlert.message
      });

      const existing = await trx('dashboard_alerts')
        .select(
          'id',
          'project_id as projectId',
          'severity',
          'type',
          'title',
          'message',
          'details',
          'related_task_id as relatedTaskId'
        )
        .where('alert_hash', alertHash)
        .where((qb) => qb.where('status', 'active').orWhereNull('status'))
        .first();

      if (existing) {
        const hasChanges =
          normalizeNullableNumber(existing.projectId) !== normalizeNullableNumber(normalizedAlert.projectId) ||
          normalizeText(existing.severity, 'medium') !== normalizeText(normalizedAlert.severity, 'medium') ||
          normalizeText(existing.type, 'warning') !== normalizeText(normalizedAlert.type, 'warning') ||
          normalizeNullableText(existing.title) !== normalizeNullableText(normalizedAlert.title) ||
          normalizeText(existing.message) !== normalizeText(normalizedAlert.message) ||
          normalizeNullableText(existing.details) !== normalizeNullableText(normalizedAlert.details) ||
          normalizeNullableNumber(existing.relatedTaskId) !==
            normalizeNullableNumber(normalizedAlert.relatedTaskId);

        if (hasChanges) {
          await trx('dashboard_alerts')
            .where('id', existing.id)
            .update({
              project_id: normalizedAlert.projectId,
              severity: normalizedAlert.severity,
              type: normalizedAlert.type,
              title: normalizedAlert.title,
              message: normalizedAlert.message,
              details: normalizedAlert.details,
              related_task_id: normalizedAlert.relatedTaskId,
              status: 'active',
              resolved_at: null,
              auto_resolved: false
            });
          stats.updated++;
          console.log('[saveAlerts] Updated existing alert:', existing.id);
        } else {
          stats.unchanged++;
        }
        continue;
      }

      await trx('dashboard_alerts').insert({
        project_id: normalizedAlert.projectId,
        severity: normalizedAlert.severity,
        type: normalizedAlert.type,
        is_read: alert.isRead || false,
        title: normalizedAlert.title,
        message: normalizedAlert.message,
        details: normalizedAlert.details,
        related_task_id: normalizedAlert.relatedTaskId,
        alert_hash: alertHash,
        status: 'active',
        auto_resolved: false
      });
      stats.inserted++;
      console.log('[saveAlerts] Inserted alert:', normalizedAlert.title || normalizedAlert.message.slice(0, 30));
    }
  });
  console.log('[saveAlerts] Transaction completed successfully', stats);
  return stats;
}

function normalizeText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeNullableText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function normalizeNullableNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const normalized = Number(value);
  return Number.isNaN(normalized) ? null : normalized;
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
      'a.details',
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
      'a.details',
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
