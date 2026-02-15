const BaseLLMAdapter = require('./BaseLLMAdapter');
const logger = require('../../utils/logger');

/**
 * Claude (Anthropic) APIアダプター
 * Anthropic独自のAPI形式を使用
 */
class ClaudeAdapter extends BaseLLMAdapter {
  constructor(config) {
    super(config);
    // Claudeのデフォルトエンドポイント
    if (!this.endpoint) {
      this.endpoint = 'https://api.anthropic.com/v1/messages';
    }
    // Claudeのデフォルトモデル
    if (!this.model) {
      this.model = 'claude-3-5-sonnet-20241022';
    }
    // Claudeのデフォルト最大トークン数（Claudeは必須パラメータ）
    if (!this.maxTokens || this.maxTokens > 8192) {
      this.maxTokens = 8192; // Claudeの最大値
    }
  }

  getProviderName() {
    return 'Claude';
  }

  /**
   * Claude APIを呼び出す
   * @param {string} prompt - プロンプト
   * @param {Object} options - オプション
   * @returns {Promise<string|Object>} AI応答
   */
  async call(prompt, options = {}) {
    try {
      const systemPrompt = 'あなたは日本企業のプロジェクトマネジメントを支援するアシスタントです。';

      // Claudeのメッセージ形式（systemは別パラメータ）
      let messages;
      let system = systemPrompt;

      if (options.messages) {
        // カスタムメッセージの場合、systemメッセージを分離
        messages = options.messages.filter(m => m.role !== 'system');
        const systemMessage = options.messages.find(m => m.role === 'system');
        if (systemMessage) {
          system = systemMessage.content;
        }
      } else {
        messages = [{ role: 'user', content: prompt }];
      }

      const body = {
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system,
        messages
      };

      // JSON形式を要求する場合（システムプロンプトに追加）
      if (options.responseFormat === 'json') {
        body.system += ' 応答は必ず完全に閉じた有効なJSON形式で返してください。Markdown記法は禁止です。途中で停止せず、必ず最後まで生成してください。';
      }

      logger.info(`Claude API呼び出し: model=${this.model}, responseFormat=${options.responseFormat || 'text'}`);

      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      };

      if (this.proxyAgent) {
        fetchOptions.dispatcher = this.proxyAgent;
      }

      const response = await fetch(this.endpoint, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Claude API エラー: ${response.status} ${errorText}`);
        throw new Error(`Claude API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const content = data?.content?.[0]?.text;

      if (!content) {
        throw new Error('Claude APIから有効な応答が得られませんでした');
      }

      // JSON形式の場合はパース
      if (options.responseFormat === 'json') {
        return this.parseJsonResponse(content);
      }

      return content.trim();
    } catch (error) {
      return this.handleError(error, options);
    }
  }

  /**
   * チャット形式でClaude APIを呼び出す
   * 注意: ClaudeはFunction Callingを直接サポートしていないため、
   * ツール定義をプロンプトに埋め込む方式で対応
   * @param {Object} params - チャットパラメータ
   * @returns {Promise<Object>} AI応答
   */
  async chat(params) {
    try {
      const { systemPrompt, history, userMessage, tools } = params;

      let system = systemPrompt;

      // ツールが指定されている場合、システムプロンプトに追加
      if (tools && Array.isArray(tools) && tools.length > 0) {
        system += '\n\n利用可能なツール:\n';
        tools.forEach(tool => {
          system += `\n- ${tool.function.name}: ${tool.function.description}\n`;
          system += `  パラメータ: ${JSON.stringify(tool.function.parameters, null, 2)}\n`;
        });
        system += '\nツールを使用する場合は、以下のJSON形式で応答してください:\n';
        system += '{"tool_name": "ツール名", "arguments": {...}}\n';
      }

      // メッセージを構築（systemは別パラメータ）
      const messages = [];

      if (history && Array.isArray(history)) {
        messages.push(...history.filter(m => m.role !== 'system'));
      }

      messages.push({ role: 'user', content: userMessage });

      const body = {
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system,
        messages
      };

      logger.info(`Claude チャット呼び出し: tools=${tools ? tools.length : 0}`);

      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      };

      if (this.proxyAgent) {
        fetchOptions.dispatcher = this.proxyAgent;
      }

      const response = await fetch(this.endpoint, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Claude API エラー: ${response.status} ${errorText}`);
        throw new Error(`Claude API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const content = data?.content?.[0]?.text;

      if (!content) {
        throw new Error('Claude APIから有効な応答が得られませんでした');
      }

      // ツール呼び出しの検出（簡易実装）
      let toolCalls = null;
      if (tools && content.includes('tool_name')) {
        try {
          const toolCall = JSON.parse(content);
          if (toolCall.tool_name && toolCall.arguments) {
            toolCalls = [{
              function: {
                name: toolCall.tool_name,
                arguments: JSON.stringify(toolCall.arguments)
              }
            }];
          }
        } catch (e) {
          // JSON解析失敗の場合は通常のメッセージとして扱う
        }
      }

      return {
        message: content.trim(),
        toolCalls,
        finishReason: data.stop_reason
      };
    } catch (error) {
      logger.error(`Claude チャットエラー: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ClaudeAdapter;
