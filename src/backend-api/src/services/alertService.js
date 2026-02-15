/**
 * アラートサービス（改善版）
 * 差分更新とスナップショット比較によるアラート管理
 * + AI予測分析機能
 */

const dbModule = require('./database');
const db = dbModule.getConnection(); // レガシーAPI使用
const { generateAlertHash, isDuplicateAlert } = require('../utils/alertHash');
const snapshotService = require('./snapshotService');
const aiPredictionService = require('./aiPredictionService');

/**
 * アラートを更新（差分更新方式）
 * @param {Array<Object>} projects - プロジェクト一覧
 * @param {boolean} forceFullRefresh - 強制的に全プロジェクトを再分析
 * @returns {Promise<Object>} 更新統計
 */
async function refreshAlerts(projects, forceFullRefresh = false) {
    const stats = {
        newAlertsCount: 0,
        resolvedAlertsCount: 0,
        unchangedAlertsCount: 0,
        processedProjects: 0,
        skippedProjects: 0
    };

    try {
        // 1. 前回のスナップショットを取得
        const previousSnapshots = snapshotService.getLatestSnapshots();
        const previousSnapshotMap = new Map(
            previousSnapshots.map(ps => [ps.project_id, ps])
        );

        // 2. 変更があったプロジェクトを検出
        const changedProjects = [];

        for (const project of projects) {
            const currentSnapshot = snapshotService.createSnapshot(project);
            const previousSnapshot = previousSnapshotMap.get(project.id);

            if (!previousSnapshot || forceFullRefresh) {
                // 新規プロジェクトまたは強制更新
                changedProjects.push({
                    project,
                    changes: previousSnapshot ? ['forced_refresh'] : ['new_project']
                });
                stats.processedProjects++;
            } else {
                // 変更検知
                const currentHash = snapshotService.hashSnapshot(currentSnapshot);
                const previousHash = previousSnapshot.snapshot_hash;

                if (currentHash !== previousHash) {
                    const changes = snapshotService.detectChanges(
                        currentSnapshot,
                        JSON.parse(previousSnapshot.snapshot_data)
                    );

                    if (changes.length > 0) {
                        changedProjects.push({ project, changes });
                        stats.processedProjects++;
                    } else {
                        stats.skippedProjects++;
                    }
                } else {
                    stats.skippedProjects++;
                }
            }
        }

        console.log(`[refreshAlerts] 変更検知: ${changedProjects.length}件のプロジェクトを処理`);

        // 3. 新しいアラートを生成
        const newAlerts = [];

        // ルールベースアラート生成
        for (const { project, changes } of changedProjects) {
            const ruleAlerts = generateRuleBasedAlerts(project, changes);
            newAlerts.push(...ruleAlerts);
        }

        // AI予測アラート生成（変更が重要な場合のみ）
        for (const { project, changes } of changedProjects) {
            if (aiPredictionService.shouldUseAI(changes)) {
                console.log(`[refreshAlerts] AI分析実行: ${project.name}`);

                try {
                    // 過去のスナップショットを取得（過去30日分）
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                    const historicalSnapshots = db.prepare(`
                        SELECT * FROM project_snapshots
                        WHERE project_id = ?
                        AND created_at >= ?
                        ORDER BY created_at DESC
                    `).all(project.id, thirtyDaysAgo.toISOString());

                    // 過去データから傾向を計算
                    const historicalData = {
                        averageProgressRate: aiPredictionService.calculateAverageProgressRate(historicalSnapshots),
                        teamVelocity: aiPredictionService.calculateTeamVelocity(project.id, db)
                    };

                    // 現在のメトリクスを取得
                    const currentMetrics = aiPredictionService.getCurrentMetrics(project, db);

                    // AI予測を実行
                    const prediction = await aiPredictionService.predictProjectRisk({
                        project,
                        changes,
                        historicalData,
                        currentMetrics
                    });

                    // 予測結果をアラートに変換
                    if (prediction && prediction.confidence >= 0.6) {
                        const aiAlert = {
                            projectId: project.id,
                            severity: prediction.severity,
                            type: 'ai-prediction',
                            title: `🔮 ${prediction.title}`,
                            message: prediction.message,
                            details: `【AI予測分析】
${prediction.analysis}

【信頼度】${Math.round(prediction.confidence * 100)}%
【予測される遅延】${prediction.predictedDelayDays}日
【影響予測日】${prediction.predictedImpactDate || '不明'}

【リスク要因】
${prediction.riskFactors.map((r, i) => `${i + 1}. ${r}`).join('\n')}

【推奨アクション】
${prediction.recommendedActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

【分析根拠】
${prediction.reasoning}`
                        };

                        newAlerts.push(aiAlert);
                        console.log(`[refreshAlerts] AI予測アラート生成: ${aiAlert.title}`);
                    }
                } catch (error) {
                    console.error(`[refreshAlerts] AI分析エラー (${project.name}):`, error);
                    // AI失敗時はスキップ（ルールベースアラートのみ使用）
                }
            }
        }

        console.log(`[refreshAlerts] ${newAlerts.length}件の新規アラートを生成`);

        // 4. 重複チェックと保存
        const existingAlerts = getActiveAlertHashes();
        const existingHashes = new Set(existingAlerts.map(a => a.alert_hash).filter(Boolean));

        for (const alert of newAlerts) {
            const hash = generateAlertHash(alert);

            if (!isDuplicateAlert(hash, existingHashes)) {
                saveAlert({
                    ...alert,
                    alert_hash: hash,
                    status: 'active'
                });
                stats.newAlertsCount++;
                existingHashes.add(hash); // 追加したハッシュをセットに追加
            } else {
                stats.unchangedAlertsCount++;
            }
        }

        // 5. 既存アラートの自動解決チェック
        const resolvedCount = autoResolveAlerts(projects);
        stats.resolvedAlertsCount = resolvedCount;

        // 6. スナップショット保存
        for (const project of projects) {
            const snapshot = snapshotService.createSnapshot(project);
            snapshotService.saveSnapshot(project.id, snapshot);
        }

        console.log('[refreshAlerts] 完了:', stats);
        return stats;

    } catch (error) {
        console.error('[refreshAlerts] エラー:', error);
        throw error;
    }
}

/**
 * ルールベースアラート生成
 * @param {Object} project - プロジェクト
 * @param {Array} changes - 変更内容
 * @returns {Array<Object>} 生成されたアラート
 */
function generateRuleBasedAlerts(project, changes) {
    const newAlerts = [];
    const today = new Date();

    // ステータスに基づくアラート
    if (project.status === 'at-risk' || project.status === 'on-hold') {
        newAlerts.push({
            projectId: project.id,
            severity: 'high',
            type: 'risk',
            title: 'プロジェクトステータス警告',
            message: `プロジェクトが「${project.status}」状態です。早急な対応が必要です。`,
            details: `プロジェクト「${project.name}」は現在、${project.status === 'at-risk' ? 'リスク状態' : '保留状態'}にあります。プロジェクトマネージャーに連絡し、状況を確認してください。`
        });
    }

    // 終了日が近づいているプロジェクト
    if (project.end_date || project.endDate) {
        const endDate = new Date(project.end_date || project.endDate);
        const daysRemaining = Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
            newAlerts.push({
                projectId: project.id,
                severity: 'high',
                type: 'warning',
                title: '期限超過',
                message: `プロジェクトの終了日（${project.end_date || project.endDate}）を過ぎています。`,
                details: `プロジェクト「${project.name}」は予定終了日を${Math.abs(daysRemaining)}日超過しています。スケジュールの見直しが必要です。`
            });
        } else if (daysRemaining <= 7) {
            newAlerts.push({
                projectId: project.id,
                severity: daysRemaining <= 3 ? 'high' : 'medium',
                type: 'warning',
                title: '期限間近',
                message: `プロジェクトの終了日まで${daysRemaining}日です。早めに完了させましょう。`,
                details: `プロジェクト「${project.name}」の終了予定日は${project.end_date || project.endDate}です。残り${daysRemaining}日以内に完了できるよう、タスクの優先順位を確認してください。`
            });
        }
    }

    // 説明が空のプロジェクト
    if (!project.description || project.description.trim() === '') {
        newAlerts.push({
            projectId: project.id,
            severity: 'low',
            type: 'suggestion',
            title: 'プロジェクト説明の追加推奨',
            message: 'プロジェクトの説明が未入力です。詳細情報を追加してください。',
            details: `プロジェクト「${project.name}」には説明が設定されていません。チームメンバーがプロジェクトの目的を理解しやすくするため、説明を追加することをお勧めします。`
        });
    }

    return newAlerts;
}

/**
 * アクティブなアラートのハッシュ値を取得
 * @returns {Array} アラートハッシュの配列
 */
function getActiveAlertHashes() {
    const query = "SELECT alert_hash FROM dashboard_alerts WHERE status = 'active' OR status IS NULL";
    return db.prepare(query).all();
}

/**
 * アラートを保存
 * @param {Object} alert - アラートデータ
 * @returns {number} 挿入されたレコードのID
 */
function saveAlert(alert) {
    const query = `
      INSERT INTO dashboard_alerts (
        project_id, severity, type, title, message, details,
        related_task_id, alert_hash, status, is_read, auto_resolved
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        alert.projectId || null,
        alert.severity || 'medium',
        alert.type || 'warning',
        alert.title || null,
        alert.message || '',
        alert.details || null,
        alert.relatedTaskId || null,
        alert.alert_hash || null,
        alert.status || 'active',
        alert.isRead || false,
        alert.auto_resolved || false
    ];

    const result = db.prepare(query).run(...params);
    return result.lastInsertRowid;
}

/**
 * 既存アラートの自動解決チェック
 * @param {Array<Object>} projects - プロジェクト一覧
 * @returns {number} 解決されたアラート数
 */
function autoResolveAlerts(projects) {
    const query = "SELECT * FROM dashboard_alerts WHERE status = 'active' OR status IS NULL";
    const activeAlerts = db.prepare(query).all();

    let resolvedCount = 0;

    for (const alert of activeAlerts) {
        const shouldResolve = checkAutoResolveCondition(alert, projects);

        if (shouldResolve) {
            resolveAlert(alert.id, true);
            resolvedCount++;
        }
    }

    return resolvedCount;
}

/**
 * 自動解決条件チェック
 * @param {Object} alert - アラート
 * @param {Array<Object>} projects - プロジェクト一覧
 * @returns {boolean} 解決すべき場合true
 */
function checkAutoResolveCondition(alert, projects) {
    const project = projects.find(p => p.id === alert.project_id);
    if (!project) return false;

    // アラートタイプごとの解決条件
    if (alert.type === 'warning' && alert.message && alert.message.includes('期限超過')) {
        // 期限が延長されたか確認
        const endDate = new Date(project.end_date || project.endDate);
        const today = new Date();
        return endDate > today;
    }

    if (alert.type === 'risk' && alert.message && alert.message.includes('at-risk')) {
        // ステータスが改善されたか確認
        return project.status !== 'at-risk';
    }

    if (alert.type === 'risk' && alert.message && alert.message.includes('on-hold')) {
        // ステータスが改善されたか確認
        return project.status !== 'on-hold';
    }

    return false;
}

/**
 * アラートを解決済みにする
 * @param {number} alertId - アラートID
 * @param {boolean} autoResolved - 自動解決フラグ
 * @returns {void}
 */
function resolveAlert(alertId, autoResolved = false) {
    const query = `
      UPDATE dashboard_alerts 
      SET status = 'resolved', 
          resolved_at = CURRENT_TIMESTAMP,
          auto_resolved = ?
      WHERE id = ?
    `;

    db.prepare(query).run(autoResolved ? 1 : 0, alertId);
}

module.exports = {
    refreshAlerts,
    generateRuleBasedAlerts,
    saveAlert,
    resolveAlert,
    autoResolveAlerts
};
