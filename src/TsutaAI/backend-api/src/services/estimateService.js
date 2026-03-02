/**
 * 見積もりサービス (Knex.js対応版)
 * 見積もりのCRUD操作とAI対話を管理
 */

const db = require('./database');
const { getCurrentTimestamp } = require('../utils/dbHelpers');
const aiEfficiencyCalculator = require('./estimate/aiEfficiencyCalculator');

/**
 * 見積もり一覧を取得
 */
async function getEstimates(filters = {}) {
  const knex = db.getKnex();
  const { projectId, status } = filters;

  let query = knex('estimates').select('*');

  if (projectId) {
    query = query.where('project_id', projectId);
  }

  if (status) {
    query = query.where('status', status);
  }

  return await query.orderBy('created_at', 'desc');
}

/**
 * 見積もり詳細を取得
 */
async function getEstimateById(estimateId) {
  const knex = db.getKnex();
  return await knex('estimates').where('id', estimateId).first();
}

/**
 * 見積もりを作成
 */
async function createEstimate(data) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const {
    projectId = null,
    patternType,
    title,
    description = '',
    createdBy = 1
  } = data;

  const insertData = {
    project_id: projectId,
    pattern_type: patternType,
    title: title,
    description: description,
    created_by: createdBy,
    status: 'draft'
  };

  if (dbClient === 'pg') {
    const [result] = await knex('estimates').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('estimates').insert(insertData);
    return { id };
  }
}

/**
 * 見積もりを更新
 */
async function updateEstimate(estimateId, data) {
  const knex = db.getKnex();
  const { title, description, status } = data;

  const updateData = {};

  if (title !== undefined) {
    updateData.title = title;
  }

  if (description !== undefined) {
    updateData.description = description;
  }

  if (status !== undefined) {
    updateData.status = status;

    if (status === 'completed') {
      updateData.completed_at = getCurrentTimestamp();
    }
  }

  updateData.updated_at = getCurrentTimestamp();

  const result = await knex('estimates')
    .where('id', estimateId)
    .update(updateData);

  return { changes: result };
}

/**
 * 見積もりを削除
 */
async function deleteEstimate(estimateId) {
  const knex = db.getKnex();
  const result = await knex('estimates').where('id', estimateId).del();
  return { changes: result };
}

/**
 * 会話履歴を追加
 */
async function addConversation(estimateId, role, content, metadata = null) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const insertData = {
    estimate_id: estimateId,
    role: role,
    content: content,
    metadata: JSON.stringify(metadata)
  };

  if (dbClient === 'pg') {
    const [result] = await knex('estimate_conversations').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('estimate_conversations').insert(insertData);
    return { id };
  }
}

/**
 * 会話履歴を取得
 */
async function getConversations(estimateId) {
  const knex = db.getKnex();

  const rows = await knex('estimate_conversations')
    .where('estimate_id', estimateId)
    .orderBy('created_at', 'asc');

  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
  }));
}

/**
 * パラメータを保存
 */
async function saveParameter(estimateId, paramKey, paramValue, paramType = 'string') {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  // 既存のパラメータを削除
  await knex('estimate_parameters')
    .where('estimate_id', estimateId)
    .andWhere('param_key', paramKey)
    .del();

  // 新しいパラメータを挿入
  const valueStr = typeof paramValue === 'object' ? JSON.stringify(paramValue) : String(paramValue);

  const insertData = {
    estimate_id: estimateId,
    param_key: paramKey,
    param_value: valueStr,
    param_type: paramType
  };

  if (dbClient === 'pg') {
    const [result] = await knex('estimate_parameters').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('estimate_parameters').insert(insertData);
    return { id };
  }
}

/**
 * パラメータを取得
 */
async function getParameters(estimateId) {
  const knex = db.getKnex();

  const rows = await knex('estimate_parameters').where('estimate_id', estimateId);

  const params = {};
  rows.forEach(row => {
    let value = row.param_value;
    if (row.param_type === 'number') {
      value = parseFloat(value);
    } else if (row.param_type === 'object' || row.param_type === 'array') {
      value = JSON.parse(value);
    }
    params[row.param_key] = value;
  });
  return params;
}

/**
 * フェーズを作成/更新（AI効率化対応）
 */
async function savePhase(estimateId, phaseData) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const {
    id = null,
    phaseName,
    phaseOrder,
    effort,
    durationDays,
    teamSize,
    startDate = null,
    endDate = null,
    dependencies = null,
    useAi = false,
    aiEfficiencyRatio = null,
    aiEfficiencyAuto = true
  } = phaseData;

  // AI効率化比率の自動計算
  let finalAiRatio = aiEfficiencyRatio;
  if (useAi && aiEfficiencyAuto && !aiEfficiencyRatio) {
    finalAiRatio = aiEfficiencyCalculator.calculatePhaseAiEfficiencyRatio(phaseName);
  }

  // AI利用時の工数・期間を計算
  const effortWithAi = useAi ? aiEfficiencyCalculator.calculateEffortWithAi(effort, finalAiRatio) : effort;
  const durationWithAi = useAi ? aiEfficiencyCalculator.calculateDurationWithAi(durationDays, finalAiRatio) : durationDays;

  if (id) {
    // 更新
    const result = await knex('estimate_phases')
      .where('id', id)
      .update({
        phase_name: phaseName,
        phase_order: phaseOrder,
        effort: effort,
        duration_days: durationDays,
        team_size: teamSize,
        start_date: startDate,
        end_date: endDate,
        dependencies: JSON.stringify(dependencies),
        use_ai: useAi ? 1 : 0,
        ai_efficiency_ratio: finalAiRatio,
        ai_efficiency_auto: aiEfficiencyAuto ? 1 : 0,
        effort_with_ai: effortWithAi,
        duration_with_ai: durationWithAi
      });

    return { id, changes: result };
  } else {
    // 新規作成
    const insertData = {
      estimate_id: estimateId,
      phase_name: phaseName,
      phase_order: phaseOrder,
      effort: effort,
      duration_days: durationDays,
      team_size: teamSize,
      start_date: startDate,
      end_date: endDate,
      dependencies: JSON.stringify(dependencies),
      use_ai: useAi ? 1 : 0,
      ai_efficiency_ratio: finalAiRatio,
      ai_efficiency_auto: aiEfficiencyAuto ? 1 : 0,
      effort_with_ai: effortWithAi,
      duration_with_ai: durationWithAi
    };

    if (dbClient === 'pg') {
      const [result] = await knex('estimate_phases').insert(insertData).returning('id');
      return { id: result.id || result };
    } else {
      const [insertedId] = await knex('estimate_phases').insert(insertData);
      return { id: insertedId };
    }
  }
}

/**
 * フェーズ一覧を取得
 */
async function getPhases(estimateId) {
  const knex = db.getKnex();

  const rows = await knex('estimate_phases')
    .where('estimate_id', estimateId)
    .orderBy('phase_order', 'asc');

  return rows.map(row => ({
    ...row,
    dependencies: row.dependencies ? JSON.parse(row.dependencies) : null,
    use_ai: Boolean(row.use_ai),
    ai_efficiency_auto: Boolean(row.ai_efficiency_auto)
  }));
}

/**
 * 全フェーズを削除（再生成前にクリア）
 */
async function deleteAllPhases(estimateId) {
  const knex = db.getKnex();
  const result = await knex('estimate_phases').where('estimate_id', estimateId).del();
  return { changes: result };
}

/**
 * 特定のフェーズを削除
 */
async function deletePhase(phaseId) {
  const knex = db.getKnex();
  const result = await knex('estimate_phases').where('id', phaseId).del();
  return { changes: result };
}

/**
 * 見積もり結果を削除（再計算前にクリア）
 */
async function deleteResults(estimateId) {
  const knex = db.getKnex();
  const result = await knex('estimate_results').where('estimate_id', estimateId).del();
  return { changes: result };
}

/**
 * 見積もり結果を保存
 */
async function saveResult(estimateId, resultData) {
  const knex = db.getKnex();
  const dbClient = db.getDbClient();

  const {
    resultType = 'standard',
    totalEffort,
    durationDays,
    teamSize,
    totalCost = null,
    confidenceLevel = 0.8,
    breakdown = null,
    recommendations = null
  } = resultData;

  const insertData = {
    estimate_id: estimateId,
    result_type: resultType,
    total_effort: totalEffort,
    duration_days: durationDays,
    team_size: teamSize,
    total_cost: totalCost,
    confidence_level: confidenceLevel,
    breakdown: JSON.stringify(breakdown),
    recommendations: JSON.stringify(recommendations)
  };

  if (dbClient === 'pg') {
    const [result] = await knex('estimate_results').insert(insertData).returning('id');
    return { id: result.id || result };
  } else {
    const [id] = await knex('estimate_results').insert(insertData);
    return { id };
  }
}

/**
 * 見積もり結果を取得
 */
async function getResults(estimateId) {
  const knex = db.getKnex();

  const rows = await knex('estimate_results')
    .where('estimate_id', estimateId)
    .orderBy('created_at', 'desc');

  return rows.map(row => ({
    ...row,
    breakdown: row.breakdown ? JSON.parse(row.breakdown) : null,
    recommendations: row.recommendations ? JSON.parse(row.recommendations) : null
  }));
}

module.exports = {
  getEstimates,
  getEstimateById,
  createEstimate,
  updateEstimate,
  deleteEstimate,
  addConversation,
  getConversations,
  saveParameter,
  getParameters,
  savePhase,
  getPhases,
  deleteAllPhases,
  deletePhase,
  deleteResults,
  saveResult,
  getResults
};
