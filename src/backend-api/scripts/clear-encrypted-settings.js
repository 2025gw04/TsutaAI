/**
 * データベースから暗号化された設定をクリアするスクリプト
 * ENCRYPTION_KEYを変更した場合、古い暗号化データは復号化できなくなります。
 * このスクリプトで暗号化された設定をクリアし、環境変数から読み込むようにします。
 */

require('dotenv').config();
const db = require('../src/services/database');
const logger = require('../src/utils/logger');

async function clearEncryptedSettings() {
  try {
    const knex = db.getKnex();

    // 暗号化が必要な設定キーのリスト
    const encryptedKeys = [
      'groq_api_key',
      'smtp_password',
      'database_password',
      'oauth_client_secret'
    ];

    logger.info('暗号化された設定をクリアしています...');

    for (const key of encryptedKeys) {
      const result = await knex('system_settings')
        .where('setting_key', key)
        .del();

      if (result > 0) {
        logger.info(`削除しました: ${key}`);
      }
    }

    logger.info('暗号化された設定のクリアが完了しました。');
    logger.info('次回起動時は環境変数から設定が読み込まれます。');

    process.exit(0);
  } catch (error) {
    logger.error('設定のクリア中にエラーが発生しました:', error);
    process.exit(1);
  }
}

clearEncryptedSettings();
