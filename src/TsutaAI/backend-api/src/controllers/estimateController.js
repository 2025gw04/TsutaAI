/**
 * 見積もりコントローラー
 */

const estimateService = require('../services/estimateService');
const estimatePrompts = require('../prompts/estimatePrompts');
const db = require('../services/database');

/**
 * 見積もり一覧を取得
 */
async function getEstimates(req, res, next) {
    try {
        const { projectId, status } = req.query;
        const estimates = await estimateService.getEstimates({ projectId, status });
        res.json({ success: true, data: estimates });
    } catch (error) {
        next(error);
    }
}

/**
 * 見積もり詳細を取得
 */
async function getEstimateById(req, res, next) {
    try {
        const { id } = req.params;
        const estimate = await estimateService.getEstimateById(id);

        if (!estimate) {
            return res.status(404).json({ success: false, message: '見積もりが見つかりません' });
        }

        res.json({ success: true, data: estimate });
    } catch (error) {
        next(error);
    }
}

/**
 * 見積もりを作成
 */
async function createEstimate(req, res, next) {
    try {
        const { projectId, patternType, title, description } = req.body;

        if (!patternType || !title) {
            return res.status(400).json({ success: false, message: 'パターンとタイトルは必須です' });
        }

        const result = await estimateService.createEstimate({
            projectId,
            patternType,
            title,
            description,
            createdBy: req.user?.id || 1
        });

        // 初期会話を追加
        const initialQuestion = estimatePrompts.getInitialQuestion(patternType);
        await estimateService.addConversation(result.id, 'assistant', initialQuestion);

        res.json({ success: true, data: { id: result.id } });
    } catch (error) {
        next(error);
    }
}

/**
 * 見積もりを更新
 */
async function updateEstimate(req, res, next) {
    try {
        const { id } = req.params;
        const { title, description, status } = req.body;

        const result = await estimateService.updateEstimate(id, { title, description, status });
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

/**
 * 見積もりを削除
 */
async function deleteEstimate(req, res, next) {
    try {
        const { id } = req.params;
        const result = await estimateService.deleteEstimate(id);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

/**
 * 会話履歴を取得
 */
async function getConversations(req, res, next) {
    try {
        const { id } = req.params;
        const conversations = await estimateService.getConversations(id);
        res.json({ success: true, data: conversations });
    } catch (error) {
        next(error);
    }
}

/**
 * AIとチャット（ツール呼び出し対応版）
 */
async function chat(req, res, next) {
    try {
        const { id } = req.params;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: 'メッセージは必須です' });
        }

        // 見積もり情報を取得
        const estimate = await estimateService.getEstimateById(id);
        if (!estimate) {
            return res.status(404).json({ success: false, message: '見積もりが見つかりません' });
        }

        // ユーザーメッセージを保存
        await estimateService.addConversation(id, 'user', message);

        // 現在のフェーズを取得
        const currentPhases = await estimateService.getPhases(id);

        // 会話履歴を取得（最新20件のみ）
        const conversations = await estimateService.getConversations(id);
        const history = conversations.slice(-20).map(c => ({
            role: c.role,
            content: c.content
        }));

        // 新しいチャットサービスを使用
        const estimateChatService = require('../services/estimateChatService');
        const aiResult = await estimateChatService.processEstimateChatMessage({
            userMessage: message,
            conversationHistory: history,
            currentPhases,
            estimate,
            patternType: estimate.pattern_type
        });

        // AIレスポンスを保存
        await estimateService.addConversation(id, 'assistant', aiResult.message);

        // レスポンスを返す
        res.json({
            success: true,
            data: {
                message: aiResult.message,
                preview: aiResult.preview,
                needsConfirmation: aiResult.needsConfirmation,
                toolCalls: aiResult.toolCalls
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * AI提案の変更を適用
 */
async function applyChanges(req, res, next) {
    try {
        const { id } = req.params;
        const { changes } = req.body;

        if (!changes || !Array.isArray(changes)) {
            return res.status(400).json({ success: false, message: '変更内容は必須です' });
        }

        // 見積もり情報を取得
        const estimate = await estimateService.getEstimateById(id);
        if (!estimate) {
            return res.status(404).json({ success: false, message: '見積もりが見つかりません' });
        }

        // 現在のフェーズを取得
        const currentPhases = await estimateService.getPhases(id);

        const results = [];

        for (const change of changes) {
            try {
                switch (change.type) {
                    case 'create':
                        // フェーズを作成
                        const createResult = await estimateService.savePhase(id, {
                            phaseName: change.phaseName,
                            phaseOrder: change.changes.phaseOrder || (currentPhases.length + 1),
                            effort: change.changes.effort,
                            durationDays: change.changes.durationDays,
                            teamSize: change.changes.teamSize || 1,
                            useAi: change.changes.useAi || false,
                            aiEfficiencyRatio: change.changes.aiEfficiencyRatio || 0,
                            aiEfficiencyAuto: false
                        });
                        results.push({ type: 'create', success: true, id: createResult.id });
                        break;

                    case 'update':
                        // フェーズを更新
                        const updatePhase = currentPhases.find(p => p.id === change.phaseId);
                        if (updatePhase) {
                            const updateResult = await estimateService.savePhase(id, {
                                id: change.phaseId,
                                phaseName: change.changes.phaseName || updatePhase.phase_name,
                                phaseOrder: updatePhase.phase_order,
                                effort: change.changes.effort !== undefined ? change.changes.effort : updatePhase.effort,
                                durationDays: change.changes.durationDays !== undefined ? change.changes.durationDays : updatePhase.duration_days,
                                teamSize: change.changes.teamSize !== undefined ? change.changes.teamSize : updatePhase.team_size,
                                useAi: change.changes.useAi !== undefined ? change.changes.useAi : updatePhase.use_ai,
                                aiEfficiencyRatio: change.changes.aiEfficiencyRatio !== undefined ? change.changes.aiEfficiencyRatio : updatePhase.ai_efficiency_ratio,
                                aiEfficiencyAuto: false
                            });
                            results.push({ type: 'update', success: true, id: change.phaseId });
                        }
                        break;

                    case 'delete':
                        // フェーズを削除
                        const knex = db.getKnex();
                        await knex('estimate_phases').where('id', change.phaseId).del();
                        results.push({ type: 'delete', success: true, id: change.phaseId });
                        break;

                    default:
                        results.push({ type: change.type, success: false, error: 'Unknown change type' });
                }
            } catch (error) {
                results.push({ type: change.type, success: false, error: error.message });
            }
        }

        // 更新後のフェーズを取得
        const updatedPhases = await estimateService.getPhases(id);

        res.json({
            success: true,
            data: {
                results,
                phases: updatedPhases
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * パラメータを取得
 */
async function getParameters(req, res, next) {
    try {
        const { id } = req.params;
        const parameters = await estimateService.getParameters(id);
        res.json({ success: true, data: parameters });
    } catch (error) {
        next(error);
    }
}

/**
 * パラメータを保存
 */
async function saveParameters(req, res, next) {
    try {
        const { id } = req.params;
        const parameters = req.body;

        // 各パラメータを保存
        for (const [key, value] of Object.entries(parameters)) {
            const paramType = typeof value === 'number' ? 'number' :
                Array.isArray(value) ? 'array' :
                    typeof value === 'object' ? 'object' : 'string';

            await estimateService.saveParameter(id, key, value, paramType);
        }

        res.json({ success: true, data: { saved: Object.keys(parameters).length } });
    } catch (error) {
        next(error);
    }
}

/**
 * フェーズ一覧を取得
 */
async function getPhases(req, res, next) {
    try {
        const { id } = req.params;
        const phases = await estimateService.getPhases(id);
        res.json({ success: true, data: phases });
    } catch (error) {
        next(error);
    }
}

/**
 * フェーズを保存
 */
async function savePhase(req, res, next) {
    try {
        const { id } = req.params;
        const phaseData = req.body;

        const result = await estimateService.savePhase(id, phaseData);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

/**
 * フェーズを削除
 */
async function deletePhase(req, res, next) {
    try {
        const { phaseId } = req.params;
        const result = await estimateService.deletePhase(phaseId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

/**
 * 見積もり結果を取得
 */
async function getResults(req, res, next) {
    try {
        const { id } = req.params;
        const results = await estimateService.getResults(id);
        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
}

/**
 * 見積もり結果を計算・保存
 */
async function calculateResult(req, res, next) {
    try {
        const { id } = req.params;

        // フェーズ一覧を取得
        const phases = await estimateService.getPhases(id);

        if (phases.length === 0) {
            return res.status(400).json({ success: false, message: 'フェーズが登録されていません' });
        }

        // 既存の見積もり結果を削除（再計算時に重複を防ぐ）
        await estimateService.deleteResults(id);

        // 標準、楽観、悲観の3パターンを計算
        const resultTypes = ['optimistic', 'standard', 'pessimistic'];
        const multipliers = { optimistic: 0.8, standard: 1.0, pessimistic: 1.3 };

        const results = [];

        for (const resultType of resultTypes) {
            const multiplier = multipliers[resultType];

            // AI活用を考慮した工数を計算
            const totalEffort = phases.reduce((sum, phase) => {
                const effort = phase.use_ai ? phase.effort_with_ai : phase.effort;
                return sum + (effort * multiplier);
            }, 0);

            const totalDuration = phases.reduce((sum, phase) => {
                const duration = phase.use_ai ? phase.duration_with_ai : phase.duration_days;
                return sum + (duration * multiplier);
            }, 0);

            const avgTeamSize = phases.reduce((sum, phase) => sum + (phase.team_size || 0), 0) / phases.length;

            // 内訳を作成
            const breakdown = {
                phases: phases.map(phase => ({
                    name: phase.phase_name,
                    effort: phase.use_ai ? phase.effort_with_ai : phase.effort,
                    duration: phase.use_ai ? phase.duration_with_ai : phase.duration_days,
                    useAi: phase.use_ai,
                    aiEfficiencyRatio: phase.ai_efficiency_ratio
                })),
                aiSavings: phases.reduce((sum, phase) => {
                    if (phase.use_ai) {
                        return sum + (phase.effort - phase.effort_with_ai);
                    }
                    return sum;
                }, 0)
            };

            // 結果を保存
            const resultData = {
                resultType,
                totalEffort,
                durationDays: Math.ceil(totalDuration),
                teamSize: avgTeamSize,
                confidenceLevel: resultType === 'standard' ? 0.8 : resultType === 'optimistic' ? 0.6 : 0.9,
                breakdown
            };

            await estimateService.saveResult(id, resultData);

            // フロントエンド向けにsnake_case形式で追加
            results.push({
                result_type: resultType,
                total_effort: totalEffort,
                duration_days: Math.ceil(totalDuration),
                team_size: avgTeamSize,
                confidence_level: resultData.confidenceLevel,
                breakdown
            });
        }

        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
}

/**
 * 利用可能なパターン一覧を取得
 */
async function getPatterns(req, res, next) {
    try {
        const patterns = estimatePrompts.getAllPatterns();
        res.json({ success: true, data: patterns });
    } catch (error) {
        next(error);
    }
}

/**
 * パターン詳細を取得
 */
async function getPatternInfo(req, res, next) {
    try {
        const { type } = req.params;
        const pattern = estimatePrompts.getPatternInfo(type);

        if (!pattern) {
            return res.status(404).json({ success: false, message: 'パターンが見つかりません' });
        }

        res.json({ success: true, data: pattern });
    } catch (error) {
        next(error);
    }
}

/**
 * 見積もりをWBSにエクスポート
 */
async function exportToWbs(req, res, next) {
    try {
        const { id } = req.params;
        const { projectId } = req.body;

        if (!projectId) {
            return res.status(400).json({ success: false, message: 'プロジェクトIDは必須です' });
        }

        // 見積もり情報を取得
        const estimate = await estimateService.getEstimateById(id);
        if (!estimate) {
            return res.status(404).json({ success: false, message: '見積もりが見つかりません' });
        }

        // フェーズ一覧を取得
        const phases = await estimateService.getPhases(id);
        if (phases.length === 0) {
            return res.status(400).json({ success: false, message: 'フェーズが登録されていません' });
        }

        // タスクサービスを取得
        const taskService = require('../services/taskService');
        const dateCalculator = require('../utils/dateCalculator');

        // プロジェクト情報を取得して開始日を確認
        const knex = db.getKnex();
        const project = await knex('projects').where('id', projectId).first();

        if (!project) {
            return res.status(404).json({ success: false, message: 'プロジェクトが見つかりません' });
        }

        let currentStartDate = project.start_date || new Date().toISOString().split('T')[0];
        const createdTasks = [];

        // フェーズごとにタスクを作成
        for (const phase of phases) {
            // AI効率化を考慮した工数と期間を使用
            const effort = phase.use_ai ? phase.effort_with_ai : phase.effort;
            const durationDays = phase.use_ai ? phase.duration_with_ai : phase.duration_days;

            // 開始日が営業日でない場合は次の営業日に調整
            if (!dateCalculator.isWorkingDay(currentStartDate)) {
                currentStartDate = dateCalculator.getNextWorkingDay(currentStartDate);
            }

            // 終了日を計算（営業日ベース）
            const endDate = dateCalculator.calculateEndDate(currentStartDate, durationDays);

            // タスクを作成（taskServiceはsnake_caseのパラメータを期待）
            const taskPayload = {
                project_id: projectId,
                name: phase.phase_name,
                description: `見積もりからエクスポート: ${estimate.title}`,
                assigned_to: null,
                estimated_hours: effort * 8, // 人日を時間に変換（8時間/日）
                priority: 'medium',
                status: 'todo', // DBのCHECK制約: 'todo', 'in_progress', 'completed', 'cancelled'
                progress: 0,
                due_date: endDate,
                start_date: currentStartDate,
                end_date: endDate,
                actual_start_date: null,
                actual_end_date: null,
                deliverable: null,
                parent_task_id: null,
                sort_order: phase.phase_order,
                dependencies: null,
                story_points: null
            };

            const taskResult = await taskService.createTask(taskPayload);
            createdTasks.push({
                taskId: taskResult.id,
                phaseName: phase.phase_name,
                effort: effort,
                duration: durationDays,
                useAi: phase.use_ai,
                aiEfficiencyRatio: phase.ai_efficiency_ratio
            });

            // 次のフェーズの開始日を設定（現在のフェーズの終了日の翌営業日）
            currentStartDate = dateCalculator.getNextWorkingDay(endDate);
        }

        // 見積もりのステータスを更新
        await estimateService.updateEstimate(id, { status: 'completed' });

        res.json({
            success: true,
            data: {
                projectId,
                tasksCreated: createdTasks.length,
                tasks: createdTasks
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getEstimates,
    getEstimateById,
    createEstimate,
    updateEstimate,
    deleteEstimate,
    getConversations,
    chat,
    applyChanges,
    getParameters,
    saveParameters,
    getPhases,
    savePhase,
    deletePhase,
    getResults,
    calculateResult,
    getPatterns,
    getPatternInfo,
    exportToWbs
};
