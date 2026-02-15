/**
 * AI予測分析サービス
 * プロジェクトの遅延リスクを予測し、予測的アラートを生成
 */

const aiService = require('./aiService');

/**
 * プロジェクトの遅延リスクを予測
 * @param {Object} context - 分析コンテキスト
 * @returns {Promise<Object>} AI予測結果
 */
async function predictProjectRisk(context) {
    const { project, changes, historicalData, currentMetrics } = context;

    // 残り日数を計算
    const daysRemaining = calculateDaysRemaining(project.endDate || project.end_date);

    // AIプロンプトを構築
    const prompt = buildPredictivePrompt({
        project,
        changes,
        historicalData,
        currentMetrics,
        daysRemaining
    });

    try {
        // AI APIを呼び出し
        const response = await aiService.callAI(prompt, { responseFormat: 'text' });

        // レスポンスをパース
        const prediction = parseAIPrediction(response);

        return prediction;
    } catch (error) {
        console.error('[predictProjectRisk] AI分析エラー:', error);
        // AI失敗時はnullを返す（ルールベースアラートのみ使用）
        return null;
    }
}

/**
 * 予測プロンプトを構築
 */
function buildPredictivePrompt({ project, changes, historicalData, currentMetrics, daysRemaining }) {
    const changesText = changes.map(c =>
        `- ${c.field}: ${c.oldValue} → ${c.newValue} (優先度: ${c.priority})`
    ).join('\n');

    return `あなたはプロジェクト管理のエキスパートAIです。
以下のデータから、プロジェクトの遅延リスクを予測してください。

【プロジェクト情報】
- 名前: ${project.name}
- 現在の進捗: ${project.progress || 0}%
- 残り日数: ${daysRemaining}日
- ステータス: ${project.status}
- 開始日: ${project.start_date || project.startDate}
- 終了予定日: ${project.end_date || project.endDate}

【最近の変更】
${changesText || 'なし'}

【過去の傾向】
- 平均進捗速度: ${historicalData.averageProgressRate || 'データ不足'}%/週
- チームの作業速度: ${historicalData.teamVelocity || 'データ不足'}タスク/週

【現在の問題】
- 期限超過タスク: ${currentMetrics.overdueTasks || 0}件
- ブロックされているタスク: ${currentMetrics.blockedTasks || 0}件
- チーム平均稼働率: ${currentMetrics.teamWorkload || 'データ不足'}%

【質問】
1. このプロジェクトは予定通り完了しますか？
2. 遅延する場合、何日遅れると予測されますか？
3. 主なリスク要因は何ですか？
4. 今すぐ取るべきアクションは何ですか？

【重要な指示】
- 確信度が60%未満の予測は行わないでください
- 具体的な数値と根拠を示してください
- 楽観的すぎる予測は避けてください

【出力形式】
以下のJSON形式で出力してください（JSONのみ、他のテキストは含めないでください）:
{
  "willDelayed": true または false,
  "predictedDelayDays": 数値（遅延しない場合は0）,
  "confidence": 0.0から1.0の数値,
  "severity": "high" または "medium" または "low",
  "title": "簡潔なタイトル（30文字以内）",
  "message": "1行の要約（80文字以内）",
  "analysis": "詳細な分析（200文字以内）",
  "riskFactors": ["リスク要因1", "リスク要因2"],
  "recommendedActions": ["推奨アクション1", "推奨アクション2"],
  "reasoning": "予測の根拠（150文字以内）",
  "predictedImpactDate": "影響が出る予測日（YYYY-MM-DD形式）"
}`;
}

/**
 * AI予測結果をパース
 */
function parseAIPrediction(aiResponse) {
    try {
        // AIレスポンスからJSONを抽出
        let jsonText = aiResponse;

        // コードブロックで囲まれている場合は抽出
        const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1];
        }

        // JSONをパース
        const prediction = JSON.parse(jsonText);

        // バリデーション
        if (typeof prediction.confidence !== 'number' ||
            prediction.confidence < 0 ||
            prediction.confidence > 1) {
            throw new Error('Invalid confidence value');
        }

        // 信頼度が低い場合はnullを返す
        if (prediction.confidence < 0.6) {
            console.log('[parseAIPrediction] 信頼度が低いため予測を破棄:', prediction.confidence);
            return null;
        }

        return prediction;
    } catch (error) {
        console.error('[parseAIPrediction] パースエラー:', error);
        console.error('AI Response:', aiResponse);
        return null;
    }
}

/**
 * 残り日数を計算
 */
function calculateDaysRemaining(endDate) {
    if (!endDate) return null;

    const end = new Date(endDate);
    const today = new Date();
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}

/**
 * 過去データから平均進捗速度を計算
 */
function calculateAverageProgressRate(snapshots) {
    if (!snapshots || snapshots.length < 2) {
        return null;
    }

    // 最新と最古のスナップショットを比較
    const latest = snapshots[0];
    const oldest = snapshots[snapshots.length - 1];

    const latestData = JSON.parse(latest.snapshot_data);
    const oldestData = JSON.parse(oldest.snapshot_data);

    const progressDiff = (latestData.progress || 0) - (oldestData.progress || 0);
    const timeDiff = new Date(latest.created_at) - new Date(oldest.created_at);
    const weeks = timeDiff / (1000 * 60 * 60 * 24 * 7);

    if (weeks === 0) return null;

    return Math.round((progressDiff / weeks) * 10) / 10;
}

/**
 * チームの作業速度を計算
 */
function calculateTeamVelocity(projectId, db) {
    try {
        // 過去2週間で完了したタスク数を取得
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const query = `
            SELECT COUNT(*) as count
            FROM tasks
            WHERE project_id = ?
            AND status IN ('completed', 'done')
            AND updated_at >= ?
        `;

        const result = db.prepare(query).get(projectId, twoWeeksAgo.toISOString());
        const tasksPerTwoWeeks = result?.count || 0;

        return Math.round((tasksPerTwoWeeks / 2) * 10) / 10; // 週あたり
    } catch (error) {
        console.error('[calculateTeamVelocity] エラー:', error);
        return null;
    }
}

/**
 * 現在のメトリクスを取得
 */
function getCurrentMetrics(project, db) {
    try {
        const today = new Date().toISOString().split('T')[0];

        // 期限超過タスク
        const overdueQuery = `
            SELECT COUNT(*) as count
            FROM tasks
            WHERE project_id = ?
            AND due_date < ?
            AND status NOT IN ('completed', 'done', 'cancelled')
        `;
        const overdueResult = db.prepare(overdueQuery).get(project.id, today);

        // ブロックされているタスク（依存関係で未完了のものがある）
        const blockedQuery = `
            SELECT COUNT(*) as count
            FROM tasks
            WHERE project_id = ?
            AND status NOT IN ('completed', 'done', 'cancelled')
            AND dependencies IS NOT NULL
            AND dependencies != '[]'
        `;
        const blockedResult = db.prepare(blockedQuery).get(project.id);

        return {
            overdueTasks: overdueResult?.count || 0,
            blockedTasks: blockedResult?.count || 0,
            teamWorkload: null // TODO: 実装
        };
    } catch (error) {
        console.error('[getCurrentMetrics] エラー:', error);
        return {
            overdueTasks: 0,
            blockedTasks: 0,
            teamWorkload: null
        };
    }
}

/**
 * AI分析が必要か判断
 */
function shouldUseAI(changes) {
    if (!changes || changes.length === 0) {
        return false;
    }

    // 高優先度の変更がある場合
    const hasHighPriorityChange = changes.some(c => c.priority === 'high');

    // 複数の変更が同時に発生した場合
    const hasMultipleChanges = changes.length >= 2;

    // 進捗率の大幅な変化
    const hasSignificantProgressChange = changes.some(
        c => c.field === 'progress' && Math.abs((c.newValue || 0) - (c.oldValue || 0)) >= 15
    );

    return hasHighPriorityChange || hasMultipleChanges || hasSignificantProgressChange;
}

module.exports = {
    predictProjectRisk,
    calculateAverageProgressRate,
    calculateTeamVelocity,
    getCurrentMetrics,
    shouldUseAI
};
