/**
 * レポート生成サービス
 * AIを使用してレポートの構成を決定し、データを整形してレポートを生成
 */

const aiService = require('./aiService');
const projectService = require('./projectService');
const taskService = require('./taskService');
const db = require('./database');

/**
 * レポートを自動生成
 * @param {Object} config - レポート設定
 * @returns {Promise<Object>} 生成されたレポート
 */
async function generateReport(config) {
    const { reportType, projectId, userId, dateRange, audience, purpose } = config;

    try {
        // 1. データ収集
        console.log('[generateReport] データ収集開始:', reportType);
        const data = await collectData({ reportType, projectId, userId, dateRange });

        // 2. レポート構成をAIで決定
        console.log('[generateReport] AI構成決定開始');
        const structure = await determineStructure({
            purpose: purpose || reportType,
            audience: audience || 'general',
            data
        });

        // 3. レポート本文を生成
        console.log('[generateReport] レポート本文生成開始');
        const content = await generateContent(structure, data);

        // 4. 洞察を抽出
        console.log('[generateReport] AI洞察抽出開始');
        const insights = await extractInsights(data);

        return {
            success: true,
            report: {
                title: structure.title,
                summary: structure.summary,
                sections: content.sections,
                insights,
                metadata: {
                    generatedAt: new Date().toISOString(),
                    reportType,
                    projectId,
                    userId,
                    dateRange
                }
            }
        };
    } catch (error) {
        console.error('[generateReport] エラー:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * データ収集
 */
async function collectData({ reportType, projectId, userId, dateRange }) {
    const data = {};

    if (reportType === 'project-progress' || reportType === 'project_progress') {
        // プロジェクト進捗レポート用データ
        const project = await projectService.findProjectById(projectId);
        const { data: tasks } = await taskService.findTasks({ projectId });

        // 過去のスナップショット（トレンド分析用）
        const dbConn = db.getConnection();
        const snapshots = dbConn.prepare(`
            SELECT * FROM project_snapshots
            WHERE project_id = ?
            ORDER BY created_at DESC
            LIMIT 30
        `).all(projectId);

        // アラート情報
        const alerts = dbConn.prepare(`
            SELECT * FROM dashboard_alerts
            WHERE project_id = ?
            AND status = 'active'
            ORDER BY created_at DESC
        `).all(projectId);

        data.project = project;
        data.tasks = tasks;
        data.snapshots = snapshots;
        data.alerts = alerts;

        // タスク統計
        data.statistics = calculateTaskStatistics(tasks);
    } else if (reportType === 'team-performance') {
        // チームパフォーマンスレポート用データ
        const dbConn = db.getConnection();

        // 全ユーザー
        const users = dbConn.prepare('SELECT * FROM users').all();

        // 作業ログ
        const worklogs = dbConn.prepare(`
            SELECT * FROM work_logs
            WHERE date >= ? AND date <= ?
            ORDER BY date DESC
        `).all(dateRange?.start || '2024-01-01', dateRange?.end || new Date().toISOString());

        data.users = users;
        data.worklogs = worklogs;
        data.statistics = calculateTeamStatistics(users, worklogs);
    } else if (reportType === 'risk-analysis') {
        // リスク分析レポート用データ
        const project = await projectService.findProjectById(projectId);
        const { data: tasks } = await taskService.findTasks({ projectId });

        const dbConn = db.getConnection();
        const alerts = dbConn.prepare(`
            SELECT * FROM dashboard_alerts
            WHERE project_id = ?
            ORDER BY created_at DESC
        `).all(projectId);

        data.project = project;
        data.tasks = tasks;
        data.alerts = alerts;
        data.risks = identifyRisks(project, tasks, alerts);
    }

    return data;
}

/**
 * タスク統計を計算
 */
function calculateTaskStatistics(tasks) {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed' || t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'in-progress').length;
    const notStarted = tasks.filter(t => t.status === 'not_started' || t.status === 'todo').length;
    const overdue = tasks.filter(t => {
        if (!t.due_date) return false;
        return new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'done';
    }).length;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
        total,
        completed,
        inProgress,
        notStarted,
        overdue,
        completionRate
    };
}

/**
 * チーム統計を計算
 */
function calculateTeamStatistics(users, worklogs) {
    const totalHours = worklogs.reduce((sum, log) => sum + (log.hours || 0), 0);
    const avgHoursPerUser = users.length > 0 ? totalHours / users.length : 0;

    return {
        totalMembers: users.length,
        totalHours: Math.round(totalHours * 10) / 10,
        avgHoursPerUser: Math.round(avgHoursPerUser * 10) / 10
    };
}

/**
 * リスクを特定
 */
function identifyRisks(project, tasks, alerts) {
    const risks = [];

    // 期限超過タスク
    const overdueTasks = tasks.filter(t => {
        if (!t.due_date) return false;
        return new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'done';
    });

    if (overdueTasks.length > 0) {
        risks.push({
            type: 'overdue_tasks',
            severity: 'high',
            title: '期限超過タスク',
            description: `${overdueTasks.length}件のタスクが期限を超過しています`,
            count: overdueTasks.length
        });
    }

    // 進捗遅延
    if (project.progress < 50 && project.status === 'in_progress') {
        risks.push({
            type: 'slow_progress',
            severity: 'medium',
            title: '進捗遅延',
            description: `進捗率が${project.progress}%と低い状態です`
        });
    }

    // アクティブなアラート
    if (alerts.length > 0) {
        const highAlerts = alerts.filter(a => a.severity === 'high');
        if (highAlerts.length > 0) {
            risks.push({
                type: 'active_alerts',
                severity: 'high',
                title: '重大なアラート',
                description: `${highAlerts.length}件の重大なアラートが発生しています`,
                count: highAlerts.length
            });
        }
    }

    return risks;
}

/**
 * レポート構成をAIで決定
 */
async function determineStructure({ purpose, audience, data }) {
    const prompt = `あなたはプロフェッショナルなレポート作成の専門家です。
以下の情報から最適なレポート構成を決定してください。

【目的】${purpose}
【対象者】${audience}
【データサマリー】
${JSON.stringify(data.statistics || {}, null, 2)}

【指示】
1. この目的と対象者に最も適切なレポート構成を決定
2. 重要度の高い情報を優先
3. 対象者に合わせた表現レベルを選択
4. 具体的な数値とビジュアル化を提案

【出力形式】
以下のJSON形式で出力してください（JSONのみ、他のテキストは含めないでください）:
{
  "title": "レポートタイトル",
  "summary": "エグゼクティブサマリー（3-5文、200文字以内）",
  "sections": [
    {
      "title": "セクションタイトル",
      "type": "metrics|analysis|timeline|risks",
      "priority": "high|medium|low",
      "description": "セクションの説明"
    }
  ],
  "keyMetrics": [
    {
      "name": "メトリクス名",
      "importance": "high|medium|low"
    }
  ]
}`;

    try {
        const response = await aiService.callAI(prompt, { responseFormat: 'text' });
        return parseStructureResponse(response);
    } catch (error) {
        console.error('[determineStructure] エラー:', error);
        // フォールバック: デフォルト構成
        return getDefaultStructure(purpose);
    }
}

/**
 * AI応答をパース
 */
function parseStructureResponse(response) {
    try {
        let jsonText = response.trim();

        // コードブロックで囲まれている場合は抽出
        const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1];
        }

        // 最初の { から最後の } までを抽出
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1);
        }

        return JSON.parse(jsonText);
    } catch (error) {
        console.error('[parseStructureResponse] パースエラー:', error);
        throw new Error('レポート構成の解析に失敗しました');
    }
}

/**
 * デフォルト構成を取得
 */
function getDefaultStructure(purpose) {
    return {
        title: `${purpose}レポート`,
        summary: 'プロジェクトの現状をまとめたレポートです。',
        sections: [
            {
                title: '概要',
                type: 'metrics',
                priority: 'high',
                description: '主要メトリクスの概要'
            },
            {
                title: '詳細分析',
                type: 'analysis',
                priority: 'medium',
                description: 'データの詳細分析'
            }
        ],
        keyMetrics: [
            { name: '進捗率', importance: 'high' },
            { name: '完了タスク数', importance: 'high' }
        ]
    };
}

/**
 * レポート本文を生成
 */
async function generateContent(structure, data) {
    const sections = [];

    for (const sectionDef of structure.sections) {
        const section = {
            title: sectionDef.title,
            type: sectionDef.type,
            content: ''
        };

        // セクションタイプに応じて内容を生成
        if (sectionDef.type === 'metrics') {
            section.content = generateMetricsSection(data);
        } else if (sectionDef.type === 'analysis') {
            section.content = await generateAnalysisSection(data);
        } else if (sectionDef.type === 'risks') {
            section.content = generateRisksSection(data);
        }

        sections.push(section);
    }

    return { sections };
}

/**
 * メトリクスセクションを生成
 */
function generateMetricsSection(data) {
    if (data.statistics) {
        const stats = data.statistics;
        return `
## 主要メトリクス

- **総タスク数**: ${stats.total || 0}件
- **完了タスク**: ${stats.completed || 0}件
- **進行中**: ${stats.inProgress || 0}件
- **未着手**: ${stats.notStarted || 0}件
- **期限超過**: ${stats.overdue || 0}件
- **完了率**: ${stats.completionRate || 0}%
`;
    }
    return '統計情報がありません。';
}

/**
 * 分析セクションを生成（AI使用）
 */
async function generateAnalysisSection(data) {
    const prompt = `以下のデータを分析して、重要なポイントを3-5点にまとめてください。

【データ】
${JSON.stringify(data.statistics, null, 2)}

【指示】
- 簡潔に（各ポイント50文字以内）
- 具体的な数値を含める
- ポジティブな点とネガティブな点の両方を含める

【出力形式】
箇条書きで出力してください。`;

    try {
        const response = await aiService.callAI(prompt, { responseFormat: 'text' });
        return `## 分析\n\n${response}`;
    } catch (error) {
        console.error('[generateAnalysisSection] エラー:', error);
        return '## 分析\n\n分析情報の生成に失敗しました。';
    }
}

/**
 * リスクセクションを生成
 */
function generateRisksSection(data) {
    if (data.risks && data.risks.length > 0) {
        let content = '## リスク\n\n';
        data.risks.forEach((risk, index) => {
            const icon = risk.severity === 'high' ? '🔴' : risk.severity === 'medium' ? '🟡' : '🟢';
            content += `${index + 1}. ${icon} **${risk.title}**: ${risk.description}\n`;
        });
        return content;
    }
    return '## リスク\n\n現時点で重大なリスクは検出されていません。';
}

/**
 * 洞察を抽出
 */
async function extractInsights(data) {
    const prompt = `以下のデータから重要な洞察を3つ抽出してください。

【データ】
${JSON.stringify(data.statistics, null, 2)}

【指示】
- 各洞察は1文で簡潔に（50文字以内）
- アクション可能な洞察を優先
- 数値を含める

【出力形式】
JSON配列で出力してください:
["洞察1", "洞察2", "洞察3"]`;

    try {
        const response = await aiService.callAI(prompt, { responseFormat: 'text' });

        // JSON配列を抽出
        const jsonMatch = response.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return [];
    } catch (error) {
        console.error('[extractInsights] エラー:', error);
        return [];
    }
}

module.exports = {
    generateReport,
    collectData,
    determineStructure,
    generateContent,
    extractInsights
};
