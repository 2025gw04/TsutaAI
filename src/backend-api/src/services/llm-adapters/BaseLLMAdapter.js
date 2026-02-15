const logger = require('../../utils/logger');

/**
 * LLMアダプターの基底クラス
 * すべてのLLMプロバイダーはこのクラスを継承して実装する
 */
class BaseLLMAdapter {
  /**
   * @param {Object} config - LLM設定
   * @param {string} config.apiKey - APIキー
   * @param {string} config.endpoint - APIエンドポイント
   * @param {string} config.model - モデル名
   * @param {number} config.temperature - 温度設定
   * @param {number} config.maxTokens - 最大トークン数
   * @param {Object} config.proxyAgent - プロキシエージェント（オプション）
   */
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this.model = config.model;
    this.temperature = config.temperature || 0.3;
    this.maxTokens = config.maxTokens || 65536;
    this.proxyAgent = config.proxyAgent || null;
  }

  /**
   * プロバイダー名を取得
   * @returns {string} プロバイダー名
   */
  getProviderName() {
    throw new Error('getProviderName() must be implemented by subclass');
  }

  /**
   * LLM APIを呼び出す
   * @param {string} prompt - プロンプト
   * @param {Object} options - オプション
   * @param {string} options.responseFormat - 'text' or 'json'
   * @param {Array} options.messages - メッセージ配列（カスタムメッセージを使用する場合）
   * @returns {Promise<string|Object>} AI応答
   */
  async call(prompt, options = {}) {
    throw new Error('call() must be implemented by subclass');
  }

  /**
   * チャット形式でLLM APIを呼び出す
   * @param {Object} params - チャットパラメータ
   * @param {string} params.systemPrompt - システムプロンプト
   * @param {Array} params.history - 会話履歴
   * @param {string} params.userMessage - ユーザーメッセージ
   * @param {Array} params.tools - ツール定義（Function Calling用、オプション）
   * @returns {Promise<Object>} AI応答
   */
  async chat(params) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * メッセージを構築（共通処理）
   * @param {string} systemPrompt - システムプロンプト
   * @param {string} userPrompt - ユーザープロンプト
   * @returns {Array} メッセージ配列
   */
  buildMessages(systemPrompt, userPrompt) {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * fetch オプションを構築（共通処理）
   * @param {Object} body - リクエストボディ
   * @returns {Object} fetch オプション
   */
  buildFetchOptions(body) {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    };

    if (this.proxyAgent) {
      options.dispatcher = this.proxyAgent;
    }

    return options;
  }

  /**
   * JSONレスポンスをパース・修復
   * @param {string} content - AIが生成したコンテンツ
   * @returns {Object} パースされたJSON
   */
  parseJsonResponse(content) {
    let jsonStr = content.trim();

    // Markdownコードブロックの除去
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // 最初の { から最後の } までを抽出
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(jsonStr);
    } catch (parseError) {
      logger.warn(`JSON解析エラー: ${parseError.message}`);
      // 簡易修復を試みる
      try {
        const repaired = this.repairJson(jsonStr);
        if (repaired) {
          logger.info('JSON修復に成功しました');
          return repaired;
        }
      } catch (repairError) {
        logger.error(`JSON修復失敗: ${repairError.message}`);
      }
      throw new Error(`JSONの解析に失敗しました: ${parseError.message}`);
    }
  }

  /**
   * JSONの簡易修復
   * @param {string} jsonStr - JSON文字列
   * @returns {Object|null} 修復されたオブジェクト
   */
  repairJson(jsonStr) {
    let fixed = jsonStr;

    // 末尾の余分なカンマを削除
    fixed = fixed.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

    // 閉じ括弧の不足を補完
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      fixed += '}'.repeat(openBraces - closeBraces);
    }

    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/]/g) || []).length;
    if (openBrackets > closeBrackets) {
      fixed += ']'.repeat(openBrackets - closeBrackets);
    }

    try {
      return JSON.parse(fixed);
    } catch (e) {
      return null;
    }
  }

  /**
   * エラーハンドリング（共通処理）
   * @param {Error} error - エラーオブジェクト
   * @param {Object} options - オプション
   * @returns {string|Object} フォールバック応答
   */
  handleError(error, options = {}) {
    logger.error(`${this.getProviderName()} API呼び出しエラー: ${error.message}`);

    if (options.responseFormat === 'json') {
      return { stub: true, error: error.message };
    }
    return 'AIサービス呼び出し中にエラーが発生しました。詳細はログを確認してください。';
  }
}

module.exports = BaseLLMAdapter;
