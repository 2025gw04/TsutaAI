/**
 * 洞察抽出サービス
 * データから重要な洞察を自動的に抽出
 */

const aiService = require('./aiService');
const db = require('./database');

/**
 * プロジェクトの洞察を抽出
 * @param {number} projectId - プロジェクトID
 * @returns {Promise<Object>} 抽出された洞察
 */
async function extractProjectInsights(projectId) {
    try {
        const dbConn = db.getConnection();

        // データ収集
        const project = dbConn.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        const tasks = dbConn.prepare('SELECT * FROM tasks WHERE project_id = ?').all(projectId);
        const snapshots = dbConn.prepare(`
            SELECT * FROM project_snapshots
            WHERE project_id = ?
            ORDER BY created_at DESC
            LIMIT 30
        `).all(projectId);

        // 各種分析を実行
        const [trends, anomalies, patterns, predictions] = await Promise.all([
            analyzeTrends(project, tasks, snapshots),
            detectAnomalies(project, tasks),
            recognizePatterns(tasks, snapshots),
            generatePredictions(project, tasks, snapshots)
        ]);

        // AI統合分析
        const aiInsights = await generateAIInsights({
            project,
            tasks,
            trends,
            anomalies,
            patterns,
            predictions
        });

        return {
            success: true,
            insights: {
                trends,
                anomalies,
                patterns,
                predictions,
                aiInsights
            }
        };
    } catch (error) {
        console.error('[extractProjectInsights] エラー:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * トレンド分析
 */
async function analyzeTrends(project, tasks, snapshots) {
    const trends = [];

    // 進捗トレンド
    if (snapshots.length >= 2) {
        const recentSnapshots = snapshots.slice(0, 7); // 直近7日
        const progressChanges = [];

        for (let i = 0; i < recentSnapshots.length - 1; i++) {
            const current = recentSnapshots[i];
            const previous = recentSnapshots[i + 1];
            const change = (current.progress || 0) - (previous.progress || 0);
            progressChanges.push(change);
        }

        const avgChange = progressChanges.reduce((sum, c) => sum + c, 0) / progressChanges.length;

        if (avgChange > 0) {
            trends.push({
                type: 'progress_acceleration',
                severity: 'positive',
                title: '進捗加速',
                description: `過去7日間で平均${avgChange.toFixed(1)}%/日のペースで進捗しています`,
                value: avgChange,
                unit: '%/日'
            });
        } else if (avgChange < 0) {
            trends.push({
                type: 'progress_deceleration',
                severity: 'warning',
                title: '進捗減速',
                description: `進捗ペースが低下しています（${avgChange.toFixed(1)}%/日）`,
                value: avgChange,
                unit: '%/日'
            });
        }
    }

    // タスク完了トレンド
    const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'done');
    const totalTasks = tasks.length;
    const completionRate = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0;

    if (completionRate > 75) {
        trends.push({
            type: 'high_completion',
            severity: 'positive',
            title: '高い完了率',
            description: `タスクの${completionRate.toFixed(0)}%が完了しています`,
            value: completionRate,
            unit: '%'
        });
    } else if (completionRate < 25) {
        trends.push({
            type: 'low_completion',
            severity: 'warning',
            title: '低い完了率',
            description: `完了率が${completionRate.toFixed(0)}%と低い状態です`,
            value: completionRate,
            unit: '%'
        });
    }

    return trends;
}

/**
 * 異常検知
 */
async function detectAnomalies(project, tasks) {
    const anomalies = [];

    // 期限超過タスクの異常検知
    const overdueTasks = tasks.filter(t => {
        if (!t.due_date) return false;
        return new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'done';
    });

    if (overdueTasks.length > tasks.length * 0.2) {
        anomalies.push({
            type: 'excessive_overdue',
            severity: 'critical',
            title: '異常な期限超過',
            description: `${overdueTasks.length}件（${((overdueTasks.length / tasks.length) * 100).toFixed(0)}%）のタスクが期限超過`,
            count: overdueTasks.length,
            affectedTasks: overdueTasks.slice(0, 5).map(t => ({
                id: t.id,
                name: t.name,
                dueDate: t.due_date
            }))
        });
    }

    // ブロックされたタスクの検知
    const blockedTasks = tasks.filter(t => t.status === 'blocked');
    if (blockedTasks.length > 0) {
        anomalies.push({
            type: 'blocked_tasks',
            severity: 'high',
            title: 'ブロックされたタスク',
            description: `${blockedTasks.length}件のタスクがブロックされています`,
            count: blockedTasks.length,
            affectedTasks: blockedTasks.map(t => ({
                id: t.id,
                name: t.name
            }))
        });
    }

    // 工数超過の検知
    const tasksWithEstimate = tasks.filter(t => t.estimated_hours && t.actual_hours);
    const overbudgetTasks = tasksWithEstimate.filter(t => t.actual_hours > t.estimated_hours * 1.5);

    if (overbudgetTasks.length > tasksWithEstimate.length * 0.3) {
        anomalies.push({
            type: 'budget_overrun',
            severity: 'high',
            title: '工数超過の傾向',
            description: `${overbudgetTasks.length}件のタスクで見積もりの150%以上の工数を消費`,
            count: overbudgetTasks.length
        });
    }

    return anomalies;
}

/**
 * パターン認識
 */
async function recognizePatterns(tasks, snapshots) {
    const patterns = [];

    // 曜日別のパターン
    const tasksByDay = {};
    tasks.forEach(t => {
        if (t.actual_end_date) {
            const day = new Date(t.actual_end_date).getDay();
            tasksByDay[day] = (tasksByDay[day] || 0) + 1;
        }
    });

    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const maxDay = Object.entries(tasksByDay).reduce((max, [day, count]) =>
        count > (tasksByDay[max] || 0) ? day : max, 0);

    if (Object.keys(tasksByDay).length > 0) {
        patterns.push({
            type: 'day_of_week_pattern',
            title: '曜日別パターン',
            description: `${dayNames[maxDay]}曜日に最も多くのタスクが完了しています`,
            data: Object.entries(tasksByDay).map(([day, count]) => ({
                day: dayNames[day],
                count
            }))
        });
    }

    // 月末集中パターン
    const endOfMonthTasks = tasks.filter(t => {
        if (!t.actual_end_date) return false;
        const date = new Date(t.actual_end_date);
        return date.getDate() >= 25;
    });

    if (endOfMonthTasks.length > tasks.length * 0.3) {
        patterns.push({
            type: 'end_of_month_rush',
            title: '月末集中パターン',
            description: `タスクの${((endOfMonthTasks.length / tasks.length) * 100).toFixed(0)}%が月末に集中しています`,
            severity: 'warning'
        });
    }

    return patterns;
}

/**
 * 予測生成
 */
async function generatePredictions(project, tasks, snapshots) {
    const predictions = [];

    // 完了日予測
    if (snapshots.length >= 3) {
        const recentSnapshots = snapshots.slice(0, 7);
        const progressChanges = [];

        for (let i = 0; i < recentSnapshots.length - 1; i++) {
            const current = recentSnapshots[i];
            const previous = recentSnapshots[i + 1];
            const change = (current.progress || 0) - (previous.progress || 0);
            progressChanges.push(change);
        }

        const avgProgressPerDay = progressChanges.reduce((sum, c) => sum + c, 0) / progressChanges.length;
        const currentProgress = project.progress || 0;
        const remainingProgress = 100 - currentProgress;

        if (avgProgressPerDay > 0) {
            const daysToComplete = Math.ceil(remainingProgress / avgProgressPerDay);
            const predictedDate = new Date();
            predictedDate.setDate(predictedDate.getDate() + daysToComplete);

            // 計画完了日との比較
            let comparison = '';
            if (project.end_date) {
                const plannedDate = new Date(project.end_date);
                const diffDays = Math.ceil((predictedDate - plannedDate) / (1000 * 60 * 60 * 24));

                if (diffDays < 0) {
                    comparison = `予定より${Math.abs(diffDays)}日早く完了する見込み`;
                } else if (diffDays > 0) {
                    comparison = `予定より${diffDays}日遅れる見込み`;
                } else {
                    comparison = '予定通りに完了する見込み';
                }
            }

            predictions.push({
                type: 'completion_date',
                title: '完了日予測',
                predictedDate: predictedDate.toISOString().split('T')[0],
                daysRemaining: daysToComplete,
                confidence: calculateConfidence(progressChanges),
                comparison,
                assumptions: [
                    '現在の進捗ペースが維持される',
                    '新たな大きな障害が発生しない',
                    'チーム構成が変わらない'
                ]
            });
        }
    }

    // リスク予測
    const overdueTasks = tasks.filter(t => {
        if (!t.due_date) return false;
        return new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'done';
    });

    if (overdueTasks.length > 0) {
        predictions.push({
            type: 'delay_risk',
            title: '遅延リスク',
            severity: overdueTasks.length > 5 ? 'high' : 'medium',
            description: `${overdueTasks.length}件の期限超過タスクにより、プロジェクト全体の遅延リスクがあります`,
            recommendation: '優先度の見直しとリソースの再配分を推奨'
        });
    }

    return predictions;
}

/**
 * 信頼度を計算
 */
function calculateConfidence(progressChanges) {
    if (progressChanges.length < 3) return 0.5;

    // 変動の標準偏差を計算
    const mean = progressChanges.reduce((sum, c) => sum + c, 0) / progressChanges.length;
    const variance = progressChanges.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / progressChanges.length;
    const stdDev = Math.sqrt(variance);

    // 標準偏差が小さいほど信頼度が高い
    const confidence = Math.max(0, Math.min(1, 1 - (stdDev / 10)));
    return Math.round(confidence * 100) / 100;
}

/**
 * AI統合分析
 */
async function generateAIInsights(data) {
    const { project, tasks, trends, anomalies, patterns, predictions } = data;

    const prompt = `以下のプロジェクトデータを総合的に分析し、最も重要な洞察を3つ抽出してください。

【プロジェクト情報】
- 名前: ${project.name}
- 進捗率: ${project.progress}%
- ステータス: ${project.status}

【タスク統計】
- 総タスク数: ${tasks.length}
- 完了: ${tasks.filter(t => t.status === 'completed' || t.status === 'done').length}
- 進行中: ${tasks.filter(t => t.status === 'in_progress').length}
- 期限超過: ${tasks.filter(t => {
        if (!t.due_date) return false;
        return new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'done';
    }).length}

【検出されたトレンド】
${JSON.stringify(trends, null, 2)}

【検出された異常】
${JSON.stringify(anomalies, null, 2)}

【検出されたパターン】
${JSON.stringify(patterns, null, 2)}

【予測】
${JSON.stringify(predictions, null, 2)}

【指示】
1. 最も重要な洞察を3つ選択
2. 各洞察は具体的で実行可能なものにする
3. ポジティブな点とネガティブな点の両方を含める
4. 各洞察は1文で簡潔に（50文字以内）

【出力形式】
JSON配列で出力してください:
[
  {
    "type": "positive|warning|critical",
    "insight": "洞察の内容",
    "action": "推奨アクション"
  }
]`;

    try {
        const response = await aiService.callAI(prompt, { responseFormat: 'text' });

        // JSON配列を抽出
        const jsonMatch = response.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return [];
    } catch (error) {
        console.error('[generateAIInsights] エラー:', error);
        return [];
    }
}

module.exports = {
    extractProjectInsights,
    analyzeTrends,
    detectAnomalies,
    recognizePatterns,
    generatePredictions
};
