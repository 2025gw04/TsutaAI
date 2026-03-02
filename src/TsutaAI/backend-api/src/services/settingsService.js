// 設定サービス (Knex.js対応版)
const db = require('./database');
const logger = require('../utils/logger');
const { decrypt, shouldEncrypt } = require('../utils/encryption');
const config = require('../config/env');

/**
 * 設定のメモリキャッシュ
 * パフォーマンスのため、復号化された設定をメモリに保持
 */
let settingsCache = null;
let lastLoadTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5分間キャッシュ

/**
 * データベースから設定を読み込み、復号化してメモリにキャッシュ
 * @param {boolean} forceReload - 強制的に再読み込みするか
 * @returns {Object} 復号化された設定オブジェクト
 */
async function loadSettings(forceReload = false) {
  const now = Date.now();

  // キャッシュが有効な場合は再利用
  if (!forceReload && settingsCache && lastLoadTime && (now - lastLoadTime < CACHE_TTL)) {
    return settingsCache;
  }

  try {
    const knex = db.getKnex();
    const settings = await knex('system_settings').select('*');

    const settingsObj = {};

    settings.forEach(setting => {
      let value = setting.setting_value;

      // 暗号化された設定を復号化
      if (shouldEncrypt(setting.setting_key)) {
        try {
          value = decrypt(value);
        } catch (error) {
          logger.warn(`Failed to decrypt setting: ${setting.setting_key} - データベース内の暗号化データと現在のENCRYPTION_KEYが一致しない可能性があります。環境変数を使用するか、設定を再登録してください。`);
          // 環境変数から取得を試みる（fallback）
          if (setting.setting_key === 'groq_api_key' || setting.setting_key === 'llm_api_key') {
            value = process.env.GROQ_API_KEY || process.env.LLM_API_KEY || '';
            if (value) {
              logger.info('API KEYを環境変数から読み込みました。');
            }
          } else {
            value = '';
          }
        }
      }

      // 型に応じて変換
      switch (setting.setting_type) {
        case 'number':
          value = parseFloat(value);
          break;
        case 'boolean':
          value = value === 'true' || value === '1';
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch (e) {
            logger.warn(`Failed to parse JSON setting: ${setting.setting_key}`);
          }
          break;
      }

      settingsObj[setting.setting_key] = value;
    });

    // キャッシュを更新
    settingsCache = settingsObj;
    lastLoadTime = now;

    logger.info('Settings loaded from database and cached in memory');
    return settingsObj;
  } catch (error) {
    logger.error('Failed to load settings from database:', error);
    // エラー時は空のオブジェクトを返す
    return {};
  }
}

/**
 * 特定の設定値を取得（環境変数 > データベース の優先順位）
 * @param {string} key - 設定キー
 * @param {*} defaultValue - デフォルト値
 * @returns {*} 設定値
 */
async function getSetting(key, defaultValue = null) {
  // 環境変数マッピング
  const envMapping = {
    'groq_api_key': 'groqApiKey',
    'groq_endpoint': 'groqEndpoint',
    'proxy_enabled': 'proxy.enabled',
    'proxy_url': 'proxy.url',
    'proxy_username': 'proxy.username',
    'proxy_password': 'proxy.password'
  };

  // 環境変数を優先
  const envKey = envMapping[key];
  if (envKey) {
    const envValue = getNestedValue(config, envKey);
    if (envValue !== undefined && envValue !== null && envValue !== '') {
      return envValue;
    }
  }

  // データベースから取得
  const settings = await loadSettings();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

/**
 * ネストされたオブジェクトから値を取得
 * @param {Object} obj - オブジェクト
 * @param {string} path - パス（例: 'proxy.enabled'）
 * @returns {*} 値
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * AI API設定を取得（LLMプロバイダー対応版）
 * @returns {Object} AI API設定
 */
async function getAIConfig() {
  // 新しいLLM設定を優先的に取得
  let provider = await getSetting('llm_provider', 'groq');
  let apiKey = await getSetting('llm_api_key', null);
  let endpoint = await getSetting('llm_endpoint', null);
  let model = await getSetting('llm_model', null);

  // 後方互換性: 新しい設定がない場合は旧設定を使用
  if (!apiKey) {
    apiKey = await getSetting('groq_api_key', config.groqApiKey);
  }
  if (!endpoint) {
    endpoint = await getSetting('groq_endpoint', config.groqEndpoint || 'https://api.groq.com/openai/v1/chat/completions');
  }
  if (!model) {
    model = await getSetting('ai_model', config.aiModel || 'llama-3.3-70b-versatile');
  }

  return {
    provider,
    apiKey,
    endpoint,
    model,
    temperature: parseFloat(await getSetting('ai_temperature', '0.3')),
    maxTokens: parseInt(await getSetting('ai_max_tokens', '65536'))
  };
}

/**
 * プロキシ設定を取得
 * @returns {Object} プロキシ設定
 */
async function getProxyConfig() {
  return {
    enabled: await getSetting('proxy_enabled', config.proxy?.enabled || false),
    url: await getSetting('proxy_url', config.proxy?.url),
    username: await getSetting('proxy_username', config.proxy?.username),
    password: await getSetting('proxy_password', config.proxy?.password)
  };
}

/**
 * 設定キャッシュを無効化（設定変更時に呼び出す）
 */
function invalidateCache() {
  settingsCache = null;
  lastLoadTime = null;
  logger.info('Settings cache invalidated');
}

/**
 * 設定を強制的に再読み込み
 */
async function reloadSettings() {
  return await loadSettings(true);
}

module.exports = {
  loadSettings,
  getSetting,
  getAIConfig,
  getProxyConfig,
  invalidateCache,
  reloadSettings
};
