const BaseLLMAdapter = require('./BaseLLMAdapter');
const logger = require('../../utils/logger');

/**
 * OpenAI APIアダプター
 */
class OpenAIAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    // OpenAIのデフォルトエンドポイント
    if (!this.endpoint) {
      this.endpoint = 'https://api.openai.com/v1/chat/completions';
    }
    // OpenAIのデフォルトモデル
    if (!this.model) {
      this.model = 'gpt-4o';
    }
  }

  getProviderName() {
    return 'OpenAI';
  }

  /**
   * OpenAI APIを呼び出す
   * @param {string} prompt - プロンプト
   * @param {Object} options - オプション
   * @returns {Promise<string|Object>} AI応答
   */
  async call(prompt, options = {}) {
    try {
      const systemPrompt = 'あなたは日本企業のプロジェクトマネジメントを支援するアシスタントです。';
      let messages;

      if (options.messages) {
        messages = options.messages;
      } else {
        messages = this.buildMessages(systemPrompt, prompt);
      }

      const body = {
        model: this.model,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        messages
      };

      // JSON形式を要求する場合
      if (options.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
        if (messages[0] && messages[0].role === 'system') {
          messages[0].content += ' 応答は必ず完全に閉じた有効なJSON形式で返してください。';
        }
      }

      logger.info(`OpenAI API呼び出し: model=${this.model}, responseFormat=${options.responseFormat || 'text'}`);

      const response = await fetch(this.endpoint, this.buildFetchOptions(body));

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`OpenAI API エラー: ${response.status} ${errorText}`);
        throw new Error(`OpenAI API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI APIから有効な応答が得られませんでした');
      }

      if (options.responseFormat === 'json') {
        return this.parseJsonResponse(content);
      }

      return this.cleanResponseContent(content);
    } catch (error) {
      return this.handleError(error, options);
    }
  }

  /**
   * チャット形式でOpenAI APIを呼び出す（Function Calling対応）
   * @param {Object} params - チャットパラメータ
   * @returns {Promise<Object>} AI応答
   */
  async chat(params) {
    try {
      const { systemPrompt, history, userMessage, tools } = params;

      const messages = [
        { role: 'system', content: systemPrompt }
      ];

      if (history && Array.isArray(history)) {
        messages.push(...history);
      }

      messages.push({ role: 'user', content: userMessage });

      const body = {
        model: this.model,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        messages
      };

      if (tools && Array.isArray(tools) && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      logger.info(`OpenAI チャット呼び出し: tools=${tools ? tools.length : 0}`);

      const response = await fetch(this.endpoint, this.buildFetchOptions(body));

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`OpenAI API エラー: ${response.status} ${errorText}`);
        throw new Error(`OpenAI API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      return {
        message: this.cleanResponseContent(choice.message.content),
        toolCalls: choice.message.tool_calls || null,
        finishReason: choice.finish_reason
      };
    } catch (error) {
      logger.error(`OpenAI チャットエラー: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OpenAIAdapter;
