const BaseLLMAdapter = require('./BaseLLMAdapter');
const logger = require('../../utils/logger');

/**
 * Groq APIアダプター
 * OpenAI互換のAPI形式を使用
 */
class GroqAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    // Groqのデフォルトエンドポイント
    if (!this.endpoint) {
      this.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    }
    // Groqのデフォルトモデル
    if (!this.model) {
      this.model = 'llama-3.3-70b-versatile';
    }
    // Groq推論モデルかどうか判定 (qwenなど <think> ブロックを返すモデル)
    this.isReasoningModel = this._detectReasoningModel();
  }

  /**
   * 推論モデルかどうかを判定する
   * @returns {boolean}
   */
  _detectReasoningModel() {
    const model = (this.model || '').toLowerCase();
    return model.includes('qwen') || model.includes('deepseek-r') || model.includes('reasoning');
  }

  getProviderName() {
    return 'Groq';
  }

  /**
   * Groq APIを呼び出す
   * @param {string} prompt - プロンプト
   * @param {Object} options - オプション
   * @returns {Promise<string|Object>} AI応答
   */
  async call(prompt, options = {}) {
    try {
      const systemPrompt = 'あなたは日本企業のプロジェクトマネジメントを支援するアシスタントです。';
      let messages;

      if (options.messages) {
        // カスタムメッセージが指定されている場合
        messages = options.messages;
      } else {
        // デフォルトのメッセージ構築
        messages = this.buildMessages(systemPrompt, prompt);
      }

      const body = {
        model: this.model,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        messages
      };

      // 推論モデルの場合、<think>ブロックを非表示にする（最終回答のみ返す）
      if (this.isReasoningModel) {
        body.reasoning_effort = 'default';
        body.reasoning_format = 'hidden';
      }

      // JSON形式を要求する場合
      if (options.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
        // システムプロンプトにJSON形式の指示を追加
        if (messages[0] && messages[0].role === 'system') {
          messages[0].content += ' 応答は必ず完全に閉じた有効なJSON形式で返してください。Markdown記法は禁止です。途中で停止せず、必ず最後まで生成してください。';
        }
      }

      logger.info(`Groq API呼び出し: model=${this.model}, responseFormat=${options.responseFormat || 'text'}`);

      const response = await fetch(this.endpoint, this.buildFetchOptions(body));

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Groq API エラー: ${response.status} ${errorText}`);
        throw new Error(`Groq API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Groq APIから有効な応答が得られませんでした');
      }

      // JSON形式の場合はパース
      if (options.responseFormat === 'json') {
        return this.parseJsonResponse(content);
      }

      return this.cleanResponseContent(content);
    } catch (error) {
      return this.handleError(error, options);
    }
  }

  /**
   * チャット形式でGroq APIを呼び出す（Function Calling対応）
   * @param {Object} params - チャットパラメータ
   * @returns {Promise<Object>} AI応答
   */
  async chat(params) {
    try {
      const { systemPrompt, history, userMessage, tools } = params;

      // メッセージを構築
      const messages = [
        { role: 'system', content: systemPrompt }
      ];

      // 会話履歴を追加
      if (history && Array.isArray(history)) {
        messages.push(...history);
      }

      // ユーザーメッセージを追加
      messages.push({ role: 'user', content: userMessage });

      const body = {
        model: this.model,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        messages
      };

      // 推論モデルの場合、<think>ブロックを非表示にする（最終回答のみ返す）
      if (this.isReasoningModel) {
        body.reasoning_effort = 'default';
        body.reasoning_format = 'hidden';
      }

      // ツールが指定されている場合（Function Calling）
      if (tools && Array.isArray(tools) && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      logger.info(`Groq チャット呼び出し: tools=${tools ? tools.length : 0}`);

      const response = await fetch(this.endpoint, this.buildFetchOptions(body));

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Groq API エラー: ${response.status} ${errorText}`);
        throw new Error(`Groq API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      return {
        message: this.cleanResponseContent(choice.message.content),
        toolCalls: choice.message.tool_calls || null,
        finishReason: choice.finish_reason
      };
    } catch (error) {
      logger.error(`Groq チャットエラー: ${error.message}`);
      throw error;
    }
  }
}

module.exports = GroqAdapter;
