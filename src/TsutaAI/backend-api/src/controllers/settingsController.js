const db = require('../services/database');
const logger = require('../utils/logger');
const { encrypt, decrypt, shouldEncrypt } = require('../utils/encryption');
const settingsService = require('../services/settingsService');
const rateLimitMiddleware = require('../middleware/rateLimit');
const { exec } = require('child_process');
const fs = require('fs');

const path = require('path');
const LLMAdapterFactory = require('../services/llm-adapters');
const aiService = require('../services/aiService');

const MASKED_SECRET_PATTERN = /^\*+$/;

function isMaskedSecretValue(value) {
  return typeof value === 'string' && value.trim().length > 0 && MASKED_SECRET_PATTERN.test(value.trim());
}

function hasStoredSecretValue(value) {
  return typeof value === 'string' ? value.length > 0 : Boolean(value);
}

/**
 * システム設定を全取得
 */
async function getAllSettings(req, res, next) {
  try {
    const knex = db.getKnex();
    const settings = await knex('system_settings').select('*').orderBy('setting_key');

    // 設定をkey-valueオブジェクトに変換
    const settingsObj = {};
    settings.forEach(setting => {
      let value = setting.setting_value;

      // 暗号化された設定の場合、セキュリティのために値をマスクする
      if (shouldEncrypt(setting.setting_key)) {
        value = hasStoredSecretValue(setting.setting_value) ? '********' : '';
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

      settingsObj[setting.setting_key] = {
        value,
        type: setting.setting_type,
        description: setting.description
      };
    });

    res.json({ success: true, data: settingsObj });
  } catch (error) {
    logger.error('Failed to get settings:', error);
    next(error);
  }
}

/**
 * 特定の設定を取得
 */
async function getSetting(req, res, next) {
  try {
    const { key } = req.params;
    const knex = db.getKnex();
    const setting = await knex('system_settings').where('setting_key', key).first();

    if (!setting) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    // 暗号化された設定の場合、値をマスクする
    if (shouldEncrypt(setting.setting_key)) {
      setting.setting_value = hasStoredSecretValue(setting.setting_value) ? '********' : '';
    }

    res.json({ success: true, data: setting });
  } catch (error) {
    logger.error('Failed to get setting:', error);
    next(error);
  }
}

/**
 * 設定を更新または作成
 */
async function upsertSetting(req, res, next) {
  try {
    const { key, value, type = 'string', description = '' } = req.body;

    if (!key) {
      return res.status(400).json({ success: false, error: 'Setting key is required' });
    }

    // 値を文字列に変換
    let valueStr = value;
    if (type === 'json' && typeof value === 'object') {
      valueStr = JSON.stringify(value);
    } else if (type === 'boolean') {
      valueStr = value ? 'true' : 'false';
    } else if (type === 'number') {
      valueStr = String(value);
    }

    const knex = db.getKnex();
    const existing = await knex('system_settings').where('setting_key', key).first();

    // マスクされた値の場合は更新をスキップ（既存の値を維持）
    if (shouldEncrypt(key) && isMaskedSecretValue(valueStr)) {
      if (existing) {
        // メタデータのみ更新
        await knex('system_settings')
          .where('setting_key', key)
          .update({
            // setting_valueは更新しない
            setting_type: type,
            description: description,
            updated_at: knex.fn.now()
          });
      }
    } else {
      // 機密情報を暗号化
      if (shouldEncrypt(key)) {
        try {
          valueStr = encrypt(valueStr);
        } catch (error) {
          logger.error(`Failed to encrypt setting: ${key}`, error);
          return res.status(500).json({ success: false, error: 'Failed to encrypt sensitive data' });
        }
      }

      if (existing) {
        await knex('system_settings')
          .where('setting_key', key)
          .update({
            setting_value: valueStr,
            setting_type: type,
            description: description,
            updated_at: knex.fn.now()
          });
      } else {
        await knex('system_settings').insert({
          setting_key: key,
          setting_value: valueStr,
          setting_type: type,
          description: description
        });
      }
    }

    // キャッシュを無効化（次回のAI呼び出し時に新しい設定が使われる）
    settingsService.invalidateCache();

    res.json({ success: true, message: 'Setting saved successfully' });
  } catch (error) {
    logger.error('Failed to upsert setting:', error);
    next(error);
  }
}

/**
 * 複数の設定を一括更新
 */
async function bulkUpdateSettings(req, res, next) {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Settings object is required' });
    }

    const knex = db.getKnex();

    await knex.transaction(async (trx) => {
      for (const [key, config] of Object.entries(settings)) {
        const { value, type = 'string', description = '' } = config;

        // 値を文字列に変換
        let valueStr = value;
        if (type === 'json' && typeof value === 'object') {
          valueStr = JSON.stringify(value);
        } else if (type === 'boolean') {
          valueStr = value ? 'true' : 'false';
        } else if (type === 'number') {
          valueStr = String(value);
        }

        const existing = await trx('system_settings').where('setting_key', key).first();

        // マスクされた値の場合は更新をスキップ（既存の値を維持）
        if (shouldEncrypt(key) && isMaskedSecretValue(valueStr)) {
          if (existing) {
            // メタデータのみ更新
            await trx('system_settings')
              .where('setting_key', key)
              .update({
                // setting_valueは更新しない
                setting_type: type,
                description: description,
                updated_at: trx.fn.now()
              });
          }
        } else {
          // 機密情報を暗号化
          if (shouldEncrypt(key)) {
            try {
              valueStr = encrypt(valueStr);
            } catch (error) {
              logger.error(`Failed to encrypt setting: ${key}`, error);
              throw new Error(`Failed to encrypt sensitive data: ${key}`);
            }
          }

          if (existing) {
            await trx('system_settings')
              .where('setting_key', key)
              .update({
                setting_value: valueStr,
                setting_type: type,
                description: description,
                updated_at: trx.fn.now()
              });
          } else {
            await trx('system_settings').insert({
              setting_key: key,
              setting_value: valueStr,
              setting_type: type,
              description: description
            });
          }
        }
      }
    });

    // キャッシュを無効化（次回のAI呼び出し時に新しい設定が使われる）
    settingsService.invalidateCache();

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    logger.error('Failed to bulk update settings:', error);
    next(error);
  }
}

/**
 * 設定を削除
 */
async function deleteSetting(req, res, next) {
  try {
    const { key } = req.params;
    const knex = db.getKnex();

    const changes = await knex('system_settings').where('setting_key', key).del();

    if (changes === 0) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    res.json({ success: true, message: 'Setting deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete setting:', error);
    next(error);
  }
}

/**
   * データベース初期化（デモ用）
   */
async function initDatabase(req, res, next) {
  try {
    logger.warn(`Database initialization requested by user: ${req.user.username}`);

    const scriptPath = path.join(__dirname, '../../scripts/init-database.js');

    // スクリプトを実行
    // 注意: Windows環境などでファイルがロックされている場合、削除に失敗する可能性がありますが、
    // init-database.js側でハンドリングして続行するように作られています。
    const INIT_TIMEOUT_MS = 10 * 60 * 1000; // 10分

    exec(`node "${scriptPath}"`, {
      cwd: path.join(__dirname, '../../'), // プロジェクトルートで実行
      maxBuffer: 1024 * 1024 * 20, // 20MBバッファ
      timeout: INIT_TIMEOUT_MS
    }, (error, stdout, stderr) => {
      if (error) {
        const timedOut = error.killed || error.code === null;
        const detailMessage = timedOut
          ? `Database initialization timed out after ${Math.floor(INIT_TIMEOUT_MS / 1000)} seconds`
          : (stderr || stdout || error.message || '').trim();
        const normalizedDetails = (detailMessage || 'Unknown initialization error').substring(0, 4000);
        const normalizedMessage = timedOut
          ? 'Database initialization timed out'
          : 'Database initialization failed';

        logger.error(`Database initialization execution error: ${error.message}`);
        logger.error(`Stderr: ${stderr}`);
        return res.status(500).json({
          success: false,
          message: normalizedMessage,
          error: normalizedMessage,
          details: normalizedDetails
        });
      }

      logger.info(`Database initialized successfully.`);
      if (stdout) logger.info(`Init script output: ${stdout.substring(0, 200)}...`);

      // DBが再作成されたので、設定キャッシュを無効化
      settingsService.invalidateCache();

      res.json({
        success: true,
        message: 'Database initialized successfully'
      });
    });

  } catch (error) {
    logger.error('Failed to initiate database initialization:', error);
    next(error);
  }
}

/**
 * ログイン不具合（ログインできない問題）を解消する
 * - レート制限の解除（サーバー内部で直接実行）
 * - 一時ファイルの削除
 */
async function fixLoginIssues(req, res, next) {
  try {
    logger.info(`Login fix requested by user: ${req.user.username}, IP: ${req.ip}`);

    // 1. レート制限を直接リセット（別プロセスのスクリプトでは効果がないため）
    // ローカルIPアドレスとよく使われるIP形式に対してリセット
    const ipsToReset = ['::1', '127.0.0.1', 'localhost', '::ffff:127.0.0.1'];

    // さらに、リクエスト元のIPもリセット
    if (req.ip && !ipsToReset.includes(req.ip)) {
      ipsToReset.push(req.ip);
    }

    let resetCount = 0;
    const limiters = [
      { name: 'loginLimiter', limiter: rateLimitMiddleware.loginLimiter },
      { name: 'apiLimiter', limiter: rateLimitMiddleware.apiLimiter },
      { name: 'globalLimiter', limiter: rateLimitMiddleware.globalLimiter },
      { name: 'aiLimiter', limiter: rateLimitMiddleware.aiLimiter },
      { name: 'uploadLimiter', limiter: rateLimitMiddleware.uploadLimiter }
    ];

    for (const { name, limiter } of limiters) {
      if (limiter && typeof limiter.resetKey === 'function') {
        for (const ip of ipsToReset) {
          try {
            limiter.resetKey(ip);
            logger.info(`Reset ${name} for IP: ${ip}`);
            resetCount++;
          } catch (e) {
            logger.warn(`Failed to reset ${name} for ${ip}: ${e.message}`);
          }
        }
      }
    }

    logger.info(`Rate limits reset: ${resetCount} entries cleared.`);

    // 2. アップロードフォルダの一時ファイル削除
    // "ファイルが残ってしまった" というユーザーの懸念に対応
    const uploadsDir = path.join(__dirname, '../../uploads');
    let deletedFileCount = 0;

    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);

      for (const file of files) {
        if (file === '.gitkeep' || file === 'README.md') continue;

        try {
          fs.unlinkSync(path.join(uploadsDir, file));
          deletedFileCount++;
        } catch (e) {
          logger.warn(`Failed to delete file ${file}: ${e.message}`);
        }
      }
      logger.info(`Deleted ${deletedFileCount} files from uploads directory.`);
    }

    res.json({
      success: true,
      message: `ログイン不具合の解消処理が完了しました。（レート制限リセット: ${resetCount}件、一時ファイル削除: ${deletedFileCount}件）`
    });

  } catch (error) {
    logger.error('Failed to fix login issues:', error);
    next(error);
  }
}

/**
 * LLM APIの接続テストを行う
 */
async function testLlmConnection(req, res, next) {
  try {
    const { provider, apiKey, endpoint, model } = req.body;

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: 'プロバイダーを指定してください。'
      });
    }

    // 実際のAPIキーを決定（マスクされている場合はDBから取得）
    let effectiveApiKey = apiKey;
    const shouldUseSavedKey = isMaskedSecretValue(apiKey);
    if (shouldUseSavedKey) {
      const aiConfig = await settingsService.getAIConfig();
      effectiveApiKey = aiConfig.apiKey;
    }

    if (!effectiveApiKey && provider !== 'ollama') {
      return res.status(400).json({
        success: false,
        error: 'APIキーが設定されていないか、取得できませんでした。'
      });
    }

    logger.info(`LLM API test requested: provider=${provider}, model=${model} (API Key: ${shouldUseSavedKey ? 'using saved key' : 'using provided key'})`);

    // 簡単な疎通確認
    const startTime = Date.now();
    const result = await aiService.testConnection({
      provider,
      apiKey: effectiveApiKey,
      endpoint,
      model,
      temperature: 0.3,
      maxTokens: 100
    });
    const duration = Date.now() - startTime;

    // アダプター内部でキャッチされてエラーメッセージが文字列として返ってきている場合をチェック
    if (typeof result === 'string' && (result.includes('エラーが発生しました') || result.includes('利用できません'))) {
      logger.error(`LLM API test failed with message: ${result}`);
      return res.status(500).json({
        success: false,
        error: '接続テストに失敗しました。',
        details: result
      });
    }

    logger.info(`LLM API test success (${duration}ms): ${result.substring(0, 50)}...`);

    res.json({
      success: true,
      message: '接続テストに成功しました！',
      response: result,
      duration: duration
    });
  } catch (error) {
    logger.error('LLM API test failed:', error);
    res.status(500).json({
      success: false,
      error: '接続テストに失敗しました。',
      details: error.message
    });
  }
}

module.exports = {
  getAllSettings,
  getSetting,
  upsertSetting,
  bulkUpdateSettings,
  deleteSetting,
  initDatabase,
  fixLoginIssues,
  testLlmConnection
};
