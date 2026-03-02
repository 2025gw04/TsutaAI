/**
 * AI効率化計算サービス
 * タスクやフェーズの特性に基づいて、AI利用時の効率化比率を自動判断する
 */

/**
 * タスクの複雑度とタイプに基づいてAI効率化比率を自動計算
 * @param {Object} task - タスク情報
 * @param {string} task.name - タスク名
 * @param {string} task.description - タスク説明
 * @param {string} task.complexity - 複雑度 ('low', 'medium', 'high')
 * @param {string} task.type - タスクタイプ（任意）
 * @returns {number} 効率化比率 (0-1, 例: 0.3 = 30%削減)
 */
function calculateAiEfficiencyRatio(task) {
    const { name = '', description = '', complexity = 'medium', type = '' } = task;

    const taskText = `${name} ${description} ${type}`.toLowerCase();

    // AI効率化が高いタスクのキーワード
    const highEfficiencyKeywords = [
        'コーディング', 'プログラミング', '実装', 'コード',
        'テストケース', 'テストコード', '単体テスト',
        'ドキュメント', '文書作成', 'マニュアル',
        'レビュー', 'コードレビュー',
        'リファクタリング', 'バグ修正',
        'データ分析', 'レポート作成'
    ];

    // AI効率化が中程度のタスクのキーワード
    const mediumEfficiencyKeywords = [
        '設計', 'デザイン', 'アーキテクチャ',
        '調査', 'リサーチ', '検証',
        '要件定義', '仕様書',
        'テスト', '結合テスト'
    ];

    // AI効率化が低いタスクのキーワード
    const lowEfficiencyKeywords = [
        'ミーティング', '会議', '打ち合わせ',
        'ヒアリング', 'インタビュー',
        '承認', '確認', 'レビュー会',
        '環境構築', 'インフラ', 'デプロイ'
    ];

    let baseRatio = 0.2; // デフォルト20%削減

    // キーワードマッチング
    const hasHighKeyword = highEfficiencyKeywords.some(kw => taskText.includes(kw));
    const hasMediumKeyword = mediumEfficiencyKeywords.some(kw => taskText.includes(kw));
    const hasLowKeyword = lowEfficiencyKeywords.some(kw => taskText.includes(kw));

    if (hasHighKeyword) {
        baseRatio = 0.35; // 35%削減
    } else if (hasMediumKeyword) {
        baseRatio = 0.25; // 25%削減
    } else if (hasLowKeyword) {
        baseRatio = 0.10; // 10%削減
    }

    // 複雑度による調整
    const complexityMultiplier = {
        'low': 0.8,    // 簡単なタスクはAI効率化が低い
        'medium': 1.0, // 標準
        'high': 1.2    // 複雑なタスクはAI効率化が高い
    };

    const multiplier = complexityMultiplier[complexity] || 1.0;
    const finalRatio = Math.min(baseRatio * multiplier, 0.5); // 最大50%削減

    return Math.round(finalRatio * 100) / 100; // 小数点2桁
}

/**
 * フェーズ名に基づいてAI効率化比率を自動計算
 * @param {string} phaseName - フェーズ名
 * @returns {number} 効率化比率 (0-1)
 */
function calculatePhaseAiEfficiencyRatio(phaseName) {
    const phaseText = phaseName.toLowerCase();

    // フェーズ別の標準効率化比率
    const phaseRatios = {
        '要件定義': 0.15,
        '基本設計': 0.20,
        '詳細設計': 0.25,
        '実装': 0.40,
        '開発': 0.40,
        'コーディング': 0.40,
        '単体テスト': 0.35,
        '結合テスト': 0.25,
        'システムテスト': 0.20,
        'ドキュメント作成': 0.30,
        'レビュー': 0.25,
        '運用準備': 0.15
    };

    // 完全一致を探す
    for (const [phase, ratio] of Object.entries(phaseRatios)) {
        if (phaseText.includes(phase.toLowerCase())) {
            return ratio;
        }
    }

    // デフォルト
    return 0.20;
}

/**
 * AI利用時の工数を計算
 * @param {number} originalEffort - 元の工数（人日）
 * @param {number} efficiencyRatio - 効率化比率 (0-1)
 * @returns {number} AI利用時の工数
 */
function calculateEffortWithAi(originalEffort, efficiencyRatio) {
    const reduction = originalEffort * efficiencyRatio;
    const effortWithAi = originalEffort - reduction;
    return Math.max(effortWithAi, originalEffort * 0.3); // 最低でも30%は残す
}

/**
 * AI利用時の期間を計算（営業日ベース）
 * @param {number} originalDurationDays - 元の期間（日数）
 * @param {number} efficiencyRatio - 効率化比率 (0-1)
 * @returns {number} AI利用時の期間
 */
function calculateDurationWithAi(originalDurationDays, efficiencyRatio) {
    const reduction = originalDurationDays * efficiencyRatio;
    const durationWithAi = originalDurationDays - reduction;
    return Math.max(Math.ceil(durationWithAi), Math.ceil(originalDurationDays * 0.5)); // 最低でも50%は残す
}

/**
 * AI効率化の推奨事項を生成
 * @param {Array} tasks - タスクリスト
 * @returns {Array} 推奨事項
 */
function generateAiEfficiencyRecommendations(tasks) {
    const recommendations = [];

    const aiEnabledTasks = tasks.filter(t => t.use_ai);
    const totalEffort = tasks.reduce((sum, t) => sum + (t.effort || 0), 0);
    const aiEffort = aiEnabledTasks.reduce((sum, t) => sum + (t.effort_with_ai || t.effort || 0), 0);
    const savedEffort = totalEffort - aiEffort;

    if (aiEnabledTasks.length > 0) {
        const savingPercentage = ((savedEffort / totalEffort) * 100).toFixed(1);
        recommendations.push({
            type: 'summary',
            message: `AI活用により、全体で約${savingPercentage}%（${savedEffort.toFixed(1)}人日）の工数削減が見込まれます。`
        });
    }

    // 高効率化が期待できるタスクを抽出
    const highPotentialTasks = tasks.filter(t => {
        if (t.use_ai) return false;
        const potentialRatio = calculateAiEfficiencyRatio(t);
        return potentialRatio >= 0.3;
    });

    if (highPotentialTasks.length > 0) {
        recommendations.push({
            type: 'suggestion',
            message: `以下のタスクでAIを活用すると、さらに効率化できる可能性があります: ${highPotentialTasks.map(t => t.name).join(', ')}`
        });
    }

    return recommendations;
}

module.exports = {
    calculateAiEfficiencyRatio,
    calculatePhaseAiEfficiencyRatio,
    calculateEffortWithAi,
    calculateDurationWithAi,
    generateAiEfficiencyRecommendations
};
