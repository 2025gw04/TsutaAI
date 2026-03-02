const GroqAdapter = require('./GroqAdapter');
const OpenAIAdapter = require('./OpenAIAdapter');
const ClaudeAdapter = require('./ClaudeAdapter');
const OllamaAdapter = require('./OllamaAdapter');
const CustomAdapter = require('./CustomAdapter');
const logger = require('../../utils/logger');

/**
 * LLMアダプターファクトリー
 * プロバイダー名に応じて適切なアダプターを生成
 */
class LLMAdapterFactory {
  /**
   * プロバイダーに応じたアダプターを生成
   * @param {string} provider - プロバイダー名 ('groq', 'openai', 'claude', 'ollama', 'custom')
   * @param {Object} config - LLM設定
   * @returns {BaseLLMAdapter} アダプターインスタンス
   */
  static create(provider, config) {
    logger.info(`LLMアダプター生成: provider=${provider}`);

    switch (provider.toLowerCase()) {
      case 'groq':
        return new GroqAdapter(config);

      case 'openai':
        return new OpenAIAdapter(config);

      case 'claude':
      case 'anthropic':
        return new ClaudeAdapter(config);

      case 'ollama':
        return new OllamaAdapter(config);

      case 'custom':
        return new CustomAdapter(config);

      default:
        logger.warn(`未知のプロバイダー: ${provider}, Groqアダプターをデフォルトとして使用します`);
        return new GroqAdapter(config);
    }
  }

  /**
   * 利用可能なプロバイダー一覧を取得
   * @returns {Array<Object>} プロバイダー情報の配列
   */
  static getAvailableProviders() {
    return [
      {
        id: 'groq',
        name: 'Groq',
        description: '高速推論を提供するGroq API（OpenAI互換）',
        requiresApiKey: true,
        defaultEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
        defaultModel: 'llama-3.3-70b-versatile',
        supportsJson: true,
        supportsFunctionCalling: true
      },
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'OpenAI公式API（GPT-4、GPT-3.5など）',
        requiresApiKey: true,
        defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o',
        supportsJson: true,
        supportsFunctionCalling: true
      },
      {
        id: 'claude',
        name: 'Claude (Anthropic)',
        description: 'Anthropic Claude API',
        requiresApiKey: true,
        defaultEndpoint: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-3-5-sonnet-20241022',
        supportsJson: true,
        supportsFunctionCalling: false, // 簡易実装のみ
        note: 'Claude APIは独自形式です。Function Callingは限定的なサポートです。'
      },
      {
        id: 'ollama',
        name: 'Ollama (ローカルLLM)',
        description: 'ローカルで実行するOllama（Llama、Mistralなど）',
        requiresApiKey: false,
        defaultEndpoint: 'http://localhost:11434/v1/chat/completions',
        defaultModel: 'llama3.2',
        supportsJson: true,
        supportsFunctionCalling: true,
        note: 'Ollamaがローカルで起動している必要があります。'
      },
      {
        id: 'custom',
        name: 'カスタム（OpenAI互換）',
        description: 'OpenAI互換APIを持つカスタムエンドポイント',
        requiresApiKey: true,
        defaultEndpoint: '',
        defaultModel: '',
        supportsJson: true,
        supportsFunctionCalling: true,
        note: 'LiteLLM、OpenRouter、その他のOpenAI互換APIサーバーに対応'
      }
    ];
  }
}

module.exports = LLMAdapterFactory;
