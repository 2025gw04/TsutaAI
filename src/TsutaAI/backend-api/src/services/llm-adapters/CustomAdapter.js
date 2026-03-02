const BaseLLMAdapter = require('./BaseLLMAdapter');
const logger = require('../../utils/logger');

/**
 * カスタムAPIアダプター
 * OpenAI互換のAPIを持つカスタムエンドポイント用
 * （例: LiteLLM、OpenRouter、カスタムプロキシなど）
 */
class CustomAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    // カスタムの場合、エンドポイントとモデルは必須
    if (!this.endpoint) {
      throw new Error('カスタムプロバイダーにはエンドポイントの指定が必須です');
    }
    if (!this.model) {
      this.model = 'default-model';
    }
  }

  getProviderName() {
    return 'Custom';
  }

  /**
   * カスタムAPIを呼び出す（OpenAI互換形式）
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

      logger.info(`カスタム API呼び出し: endpoint=${this.endpoint}, model=${this.model}, responseFormat=${options.responseFormat || 'text'}`);

      const response = await fetch(this.endpoint, this.buildFetchOptions(body));

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`カスタム API エラー: ${response.status} ${errorText}`);
        throw new Error(`Custom API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('カスタムAPIから有効な応答が得られませんでした');
      }

      if (options.responseFormat === 'json') {
        return this.parseJsonResponse(content);
      }

      return content.trim();
    } catch (error) {
      return this.handleError(error, options);
    }
  }

  /**
   * チャット形式でカスタムAPIを呼び出す（Function Calling対応）
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

      logger.info(`カスタム チャット呼び出し: tools=${tools ? tools.length : 0}`);

      const response = await fetch(this.endpoint, this.buildFetchOptions(body));

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`カスタム API エラー: ${response.status} ${errorText}`);
        throw new Error(`Custom API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      return {
        message: choice.message.content,
        toolCalls: choice.message.tool_calls || null,
        finishReason: choice.finish_reason
      };
    } catch (error) {
      logger.error(`カスタム チャットエラー: ${error.message}`);
      throw error;
    }
  }
}

module.exports = CustomAdapter;
