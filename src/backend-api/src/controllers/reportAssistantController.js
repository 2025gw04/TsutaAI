// レポートアシスタントAPIのコントローラー
const reportAssistantService = require('../services/reportAssistantService');
const projectService = require('../services/projectService');

/**
 * チャットメッセージを処理
 */
async function processChat(req, res, next) {
    try {
        const { message, chatHistory, context } = req.body;

        // バリデーション
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'メッセージが必要です'
            });
        }

        // チャット履歴のバリデーション
        const validatedHistory = Array.isArray(chatHistory) ? chatHistory : [];

        // サービスを呼び出し
        const result = await reportAssistantService.processChat({
            message,
            chatHistory: validatedHistory,
            context: context || {}
        });

        res.json(result);
    } catch (error) {
        console.error('[processChat] エラー:', error);
        next(error);
    }
}

/**
 * 初期メッセージを取得
 */
function getInitialMessage(req, res, next) {
    try {
        const initialMessage = reportAssistantService.getInitialMessage();

        res.json({
            success: true,
            data: initialMessage
        });
    } catch (error) {
        console.error('[getInitialMessage] エラー:', error);
        next(error);
    }
}

/**
 * プロジェクト一覧を取得（レポート作成用）
 */
async function getProjectsForReport(req, res, next) {
    try {
        // プロジェクト一覧を取得
        const projects = await projectService.findAllProjects();

        // レポート用に整形
        const formattedProjects = projects.map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            progress: p.progress || 0,
            startDate: p.start_date || p.startDate,
            endDate: p.end_date || p.endDate
        }));

        res.json({
            success: true,
            data: formattedProjects
        });
    } catch (error) {
        console.error('[getProjectsForReport] エラー:', error);
        next(error);
    }
}

/**
 * レポートタイプに応じた次のステップを取得
 */
function getNextStep(req, res, next) {
    try {
        const { reportType } = req.body;

        if (!reportType) {
            return res.status(400).json({
                success: false,
                error: 'レポートタイプが必要です'
            });
        }

        const nextStep = reportAssistantService.getNextStepForReportType(reportType);

        res.json({
            success: true,
            data: nextStep
        });
    } catch (error) {
        console.error('[getNextStep] エラー:', error);
        next(error);
    }
}

/**
 * レポートを生成
 */
async function generateReport(req, res, next) {
    try {
        const reportGenerationService = require('../services/reportGenerationService');
        const config = req.body;

        // バリデーション
        if (!config.reportType) {
            return res.status(400).json({
                success: false,
                error: 'レポートタイプが必要です'
            });
        }

        // レポート生成
        const result = await reportGenerationService.generateReport(config);

        res.json(result);
    } catch (error) {
        console.error('[generateReport] エラー:', error);
        next(error);
    }
}

/**
 * プロジェクトの洞察を抽出
 */
async function extractInsights(req, res, next) {
    try {
        const insightExtractionService = require('../services/insightExtractionService');
        const { projectId } = req.params;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                error: 'プロジェクトIDが必要です'
            });
        }

        // 洞察抽出
        const result = await insightExtractionService.extractProjectInsights(parseInt(projectId));

        res.json(result);
    } catch (error) {
        console.error('[extractInsights] エラー:', error);
        next(error);
    }
}

module.exports = {
    processChat,
    getInitialMessage,
    getProjectsForReport,
    getNextStep,
    generateReport,
    extractInsights
};
