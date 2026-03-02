/**
 * レポートアシスタントサービス
 * AIとの対話を管理し、レポート生成をサポート
 */

const aiService = require('./aiService');
const projectService = require('./projectService');
const userService = require('./userService');
const reportGenerationService = require('./reportGenerationService');
const insightExtractionService = require('./insightExtractionService');
const logger = require('../utils/logger');

/**
 * チャットメッセージを処理します
 * @param {Object} params - メッセージ、履歴、コンテキスト
 * @returns {Promise<Object>} 処理結果
 */
async function processChat(params) {
    const { message, chatHistory, context } = params;

    try {
        // コンテキストの充実化（データ取得）
        const enrichedContext = await enrichContext(context);

        // AIプロンプトを構築
        const prompt = buildChatPrompt(message, chatHistory, enrichedContext);

        // AI APIを呼び出し
        const response = await aiService.callAI(prompt, { responseFormat: 'text' });

        // レスポンスをパース
        let parsedResponse = parseChatResponse(response);

        // 特定のアクションが要求された場合の追加処理
        if (parsedResponse.nextAction === 'generate_report') {
            const reportResult = await reportGenerationService.generateReport({
                reportType: parsedResponse.metadata?.reportType || context.reportType || 'project-progress',
                projectId: context.projectId,
                userId: context.userId,
                dateRange: context.dateRange,
                audience: parsedResponse.metadata?.audience,
                purpose: parsedResponse.metadata?.purpose
            });

            if (reportResult.success) {
                parsedResponse.reportPreview = reportResult.report;
                parsedResponse.insights = reportResult.report.insights;
                parsedResponse.message = `レポートの生成が完了しました：${reportResult.report.title}\n\n${parsedResponse.message}`;
            }
        } else if (parsedResponse.nextAction === 'extract_insights' && context.projectId) {
            const insightResult = await insightExtractionService.extractProjectInsights(context.projectId);
            if (insightResult.success) {
                // insights.aiInsightsが配列であることを確認し、文字列の配列に変換
                if (Array.isArray(insightResult.insights.aiInsights)) {
                    parsedResponse.insights = insightResult.insights.aiInsights.map(i => typeof i === 'string' ? i : i.insight);
                }
                parsedResponse.message = `プロジェクトの洞察を抽出しました。以下に表示します。\n\n${parsedResponse.message}`;
            }
        }

        return {
            success: true,
            data: parsedResponse
        };
    } catch (error) {
        console.error('[processChat] エラー:', error);
        return {
            success: false,
            error: error.message,
            data: {
                message: 'エラーが発生しました。もう一度お試しください。',
                suggestions: ['最初からやり直す', 'ヘルプを見る'],
                requiresConfirmation: false
            }
        };
    }
}

/**
 * コンテキストをデータベース情報で充実させます
 */
async function enrichContext(context) {
    const enriched = { ...context };

    // 利用可能なプロジェクト一覧を取得
    try {
        const projects = await projectService.findAllProjects();
        enriched.availableProjects = projects.map(p => ({ id: p.id, name: p.name }));
    } catch (e) {
        logger.warn('プロジェクト一覧の取得に失敗:', e.message);
        enriched.availableProjects = [];
    }

    if (context.projectId) {
        try {
            const project = await projectService.findProjectById(context.projectId);
            if (project) {
                enriched.projectName = project.name;
                enriched.projectDescription = project.description;
                enriched.projectStatus = project.status;
            }
        } catch (e) {
            logger.warn('プロジェクト情報の取得に失敗:', e.message);
        }
    }

    if (context.userId) {
        try {
            const user = await userService.findUserById(context.userId);
            if (user) {
                enriched.userName = user.fullName || user.username;
            }
        } catch (e) {
            logger.warn('ユーザー情報の取得に失敗:', e.message);
        }
    }

    return enriched;
}

/**
 * 初期メッセージを取得します
 */
function getInitialMessage() {
    return {
        message: 'こんにちは！レポート作成アシスタントです。どのようなレポートを作成しますか？',
        suggestions: [
            '📊 プロジェクト進捗レポートを作成したい',
            '👥 チームパフォーマンスレポートを作成したい',
            '⚠️ リスク分析レポートを作成したい'
        ],
        requiresConfirmation: false,
        nextAction: 'select_report_type',
        metadata: {
            reportType: null,
            needsProjectSelection: false,
            needsDateRange: false
        }
    };
}

/**
 * レポートタイプに応じた次のステップを取得
 */
function getNextStepForReportType(reportType) {
    const steps = {
        'project-progress': {
            message: 'プロジェクト進捗レポートを作成します。対象プロジェクトを選択してください。',
            suggestions: [],
            requiresConfirmation: false,
            nextAction: 'select_project',
            metadata: {
                reportType: 'project-progress',
                needsProjectSelection: true,
                needsDateRange: true
            }
        },
        'team-performance': {
            message: 'チームパフォーマンスレポートを作成します。分析期間を選択してください。',
            suggestions: ['先月', '過去3ヶ月', '過去6ヶ月', 'カスタム期間'],
            requiresConfirmation: false,
            nextAction: 'select_date_range',
            metadata: {
                reportType: 'team-performance',
                needsProjectSelection: false,
                needsDateRange: true
            }
        },
        'risk-analysis': {
            message: 'リスク分析レポートを作成します。対象プロジェクトを選択してください。',
            suggestions: [],
            requiresConfirmation: false,
            nextAction: 'select_project',
            metadata: {
                reportType: 'risk-analysis',
                needsProjectSelection: true,
                needsDateRange: false
            }
        }
    };

    return steps[reportType] || getInitialMessage();
}

/**
 * AIプロンプトを構築します
 */
function buildChatPrompt(userMessage, chatHistory, context) {
    const historyText = chatHistory
        .map(msg => `${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${msg.content}`)
        .join('\n');

    const contextInfo = context ? `
【現在の状況】
- レポートタイプ: ${context.reportType || '未選択'}
- 対象プロジェクト: ${context.projectName ? `${context.projectName} (ID: ${context.projectId})` : '未選択'}
- 対象ユーザー: ${context.userName ? `${context.userName} (ID: ${context.userId})` : '未選択'}
- 期間: ${context.dateRange ? `${context.dateRange.start} 〜 ${context.dateRange.end}` : '未選択'}
- プロジェクト状態: ${context.projectStatus || '不明'}
` : '';

    return `あなたはプロフェッショナルなレポート作成アシスタントです。
ユーザーと対話しながら、最適なレポートを作成したり、データから洞察を抽出したりします。

${contextInfo}


【利用可能なプロジェクト一覧】
${context.availableProjects ? context.availableProjects.map(p => `- ${p.name} (ID: ${p.id})`).join('\n') : 'なし'}

【会話履歴】
${historyText || 'なし'}

【ユーザーの最新メッセージ】
${userMessage}

【あなたの役割と能力】
1. ユーザーの意図を理解し、適切なレポート作成を案内する
2. レポート作成に必要な情報（プロジェクト、期間、対象者など）が不足している場合は質問する
   - ユーザーがプロジェクト名を指定した場合は、上記「利用可能なプロジェクト一覧」から対応するIDを見つけて metadata.projectId に設定する
3. レポート作成の準備が整ったら \`nextAction: "generate_report"\` を指定してレポートを生成する
   - プロジェクトや期間が特定できている場合は、ユーザーへの過度な確認を省略し、積極的にレポート生成に進んでください
4. プロジェクトの状況分析を求められたら \`nextAction: "extract_insights"\` を指定して洞察を表示する
5. ユーザーの質問に答え、レポートの内容についてアドバイスする

【会話のルール】
- 簡潔で分かりやすい日本語を使う
- ユーザーに具体的なアクションを提案する
- レポート作成前には、設定内容（プロジェクトや期間など）を一度確認するのが望ましい

【出力形式】
以下のJSON形式で出力してください（JSONのみ、他のテキストは含めないでください）:
{
  "message": "ユーザーへのメッセージ（200文字以内）",
  "suggestions": ["次の質問や提案1", "提案2", "提案3"],
  "requiresConfirmation": true または false,
  "nextAction": "generate_report" | "extract_insights" | null,
  "metadata": {
    "reportType": "project-progress" | "team-performance" | "risk-analysis" | null,
    "projectId": 数値または null,
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } または null,
    "audience": "エグゼクティブ" | "開発チーム" | "顧客" 等,
    "purpose": "進捗報告" | "課題共有" | "振り返り" 等
  }
}`;
}

/**
 * AI応答をパースします
 */
function parseChatResponse(response) {
    try {
        let jsonText = response.trim();

        // コードブロックの除去
        const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1];
        } else {
            const firstBrace = jsonText.indexOf('{');
            const lastBrace = jsonText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonText = jsonText.substring(firstBrace, lastBrace + 1);
            }
        }

        const parsed = JSON.parse(jsonText);

        return {
            message: parsed.message || '承知いたしました。',
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
            requiresConfirmation: !!parsed.requiresConfirmation,
            nextAction: parsed.nextAction || null,
            metadata: parsed.metadata || {},
            reportPreview: parsed.reportPreview || null,
            insights: Array.isArray(parsed.insights) ? parsed.insights : []
        };
    } catch (error) {
        console.error('[parseChatResponse] パースエラー:', error, 'Raw response:', response);
        return {
            message: response.length > 200 ? response.substring(0, 197) + '...' : response,
            suggestions: ['もう一度説明してください', 'やり直す'],
            requiresConfirmation: false,
            nextAction: null,
            metadata: {}
        };
    }
}

module.exports = {
    processChat,
    getInitialMessage,
    getNextStepForReportType,
    buildChatPrompt,
    parseChatResponse
};
