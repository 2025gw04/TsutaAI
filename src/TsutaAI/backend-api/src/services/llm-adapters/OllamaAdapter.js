const BaseLLMAdapter = require('./BaseLLMAdapter');
const logger = require('../../utils/logger');

/**
 * Ollama APIアダプター
 * ローカルLLM用のアダプター（OpenAI互換API）
 */
class OllamaAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    // Ollamaのデフォルトエンドポイント（ローカル）
    if (!this.endpoint) {
      this.endpoint = 'http://localhost:11434/v1/chat/completions';
    }
    // Ollamaのデフォルトモデル
    if (!this.model) {
      this.model = 'llama3.2';
    }
    // OllamaはAPIキー不要（ローカル実行）
    if (!this.apiKey) {
      this.apiKey = 'ollama'; // ダミー値
    }
  }

  getProviderName() {
    return 'Ollama';
  }

  /**
   * Ollama APIを呼び出す
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
        // Ollamaの場合、response_formatをサポートしているバージョンとしていないバージョンがある
        // システムプロンプトに指示を追加する方式で対応
        if (messages[0] && messages[0].role === 'system') {
          messages[0].content += ' 応答は必ず完全に閉じた有効なJSON形式で返してください。Markdown記法は禁止です。';
        }
        // 新しいバージョンのOllamaはresponse_formatをサポート
        body.response_format = { type: 'json_object' };
      }

      logger.info(`Ollama API呼び出し: model=${this.model}, endpoint=${this.endpoint}, responseFormat=${options.responseFormat || 'text'}`);

      // Ollamaはローカル実行なのでAuthorizationヘッダーは不要だが、互換性のため含める
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      };

      // プロキシは使用しない（ローカル接続のため）
      // this.proxyAgentは無視

      const response = await fetch(this.endpoint, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Ollama API エラー: ${response.status} ${errorText}`);
        throw new Error(`Ollama API request failed with status ${response.status}. Ollamaが起動していることを確認してください。`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Ollama APIから有効な応答が得られませんでした');
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
   * チャット形式でOllama APIを呼び出す
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

      // Ollamaの新しいバージョンはFunction Callingをサポート
      if (tools && Array.isArray(tools) && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      logger.info(`Ollama チャット呼び出し: tools=${tools ? tools.length : 0}`);

      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      };

      const response = await fetch(this.endpoint, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Ollama API エラー: ${response.status} ${errorText}`);
        throw new Error(`Ollama API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      return {
        message: this.cleanResponseContent(choice.message.content),
        toolCalls: choice.message.tool_calls || null,
        finishReason: choice.finish_reason
      };
    } catch (error) {
      logger.error(`Ollama チャットエラー: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OllamaAdapter;
