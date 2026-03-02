const aiChatService = require('../services/aiChatService');
const logger = require('../utils/logger');

/**
 * WBS AIチャットメッセージを処理
 */
async function handleWbsChat(req, res) {
  try {
    const {
      mode,
      message,
      history,
      currentTasks,
      projectContext,
      users,
      memberContext
    } = req.body;

    // 入力検証
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'メッセージが必要です'
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'メッセージは5000文字以内にしてください'
      });
    }

    // モードに応じて処理を分岐
    let aiResponse;

    if (mode === 'member-assistant') {
      // メンバー向けアシスタントモード
      if (!memberContext) {
        return res.status(400).json({
          success: false,
          error: 'メンバーコンテキスト情報が必要です'
        });
      }

      aiResponse = await aiChatService.processMemberAssistantMessage({
        userMessage: message,
        conversationHistory: history || [],
        tasks: currentTasks || [],
        project: projectContext || {},
        memberContext
      });
    } else {
      // WBS管理者モード（デフォルト）
      if (!currentTasks || !Array.isArray(currentTasks)) {
        return res.status(400).json({
          success: false,
          error: '現在のタスク情報が必要です'
        });
      }

      aiResponse = await aiChatService.processWbsChatMessage({
        userMessage: message,
        conversationHistory: history || [],
        tasks: currentTasks,
        project: projectContext || {},
        teamMembers: users || []
      });
    }

    res.json({
      success: true,
      data: {
        message: aiResponse.message,
        toolCalls: aiResponse.toolCalls,
        preview: aiResponse.preview,
        needsConfirmation: aiResponse.needsConfirmation
      }
    });

  } catch (error) {
    logger.error('WBS AI chat error:', error);

    // ユーザーフレンドリーなエラーメッセージ
    let userMessage = 'AIサービスでエラーが発生しました。';

    if (error.message.includes('API key')) {
      userMessage = 'AI APIキーが設定されていません。管理者に連絡してください。';
    } else if (error.message.includes('rate limit')) {
      userMessage = 'APIの利用制限に達しました。しばらく待ってから再試行してください。';
    } else if (error.message.includes('timeout')) {
      userMessage = 'リクエストがタイムアウトしました。もう一度お試しください。';
    }

    res.status(500).json({
      success: false,
      error: userMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  handleWbsChat
};
