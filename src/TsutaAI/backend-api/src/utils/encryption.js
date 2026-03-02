const crypto = require('crypto');
const logger = require('./logger');
const config = require('../config/env');

// 暗号化アルゴリズム
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 初期化ベクトルの長さ
const AUTH_TAG_LENGTH = 16; // 認証タグの長さ
const SALT_LENGTH = 64; // ソルトの長さ

/**
 * 環境設定から暗号化キーを取得
 * 環境変数が設定されていない場合は、警告を出す
 */
function getEncryptionKey() {
    const envKey = config.security.encryptionKey;

    // デフォルト値をチェック
    const weakKeys = [
        'change-this-to-a-strong-random-key-in-production',
        'your-encryption-key-min-32-characters-CHANGE-THIS'
    ];

    if (!envKey || weakKeys.includes(envKey)) {
        logger.warn('ENCRYPTION_KEY is not set or using default value. This is NOT secure for production!');
        logger.warn('Please set a strong encryption key in .env file.');
        // 開発環境用の一時的なキー（本番環境では必ず.envに設定すること）
        return crypto.scryptSync('temporary-dev-key-change-in-production', 'tsutaai-salt', 32);
    }

    // 環境変数のキーから32バイトのキーを生成
    return crypto.scryptSync(envKey, 'tsutaai-salt-v1', 32);
}

/**
 * データを暗号化
 * @param {string} text - 暗号化する平文
 * @returns {string} - 暗号化されたデータ（base64エンコード）
 */
function encrypt(text) {
    if (!text) {
        return '';
    }

    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // IV + 認証タグ + 暗号化データを結合してBase64エンコード
        const combined = Buffer.concat([
            iv,
            authTag,
            Buffer.from(encrypted, 'hex')
        ]);

        return combined.toString('base64');
    } catch (error) {
        logger.error('Encryption failed:', error);
        throw new Error('データの暗号化に失敗しました');
    }
}

/**
 * データを復号化
 * @param {string} encryptedData - 暗号化されたデータ（base64エンコード）
 * @returns {string} - 復号化された平文
 */
function decrypt(encryptedData) {
    if (!encryptedData) {
        return '';
    }

    try {
        const key = getEncryptionKey();
        const combined = Buffer.from(encryptedData, 'base64');

        // IV、認証タグ、暗号化データを分離
        const iv = combined.slice(0, IV_LENGTH);
        const authTag = combined.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = combined.slice(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, null, 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        logger.error('Decryption failed:', error);
        throw new Error('データの復号化に失敗しました');
    }
}

/**
 * 暗号化が必要な設定キーかどうかを判定
 * @param {string} key - 設定キー
 * @returns {boolean}
 */
function shouldEncrypt(key) {
    // 完全一致で暗号化が必要なキー
    const exactSensitiveKeys = [
        'groq_api_key',
        'llm_api_key',
        'proxy_password',
        'api_key',
        'private_key'
    ];

    // 末尾一致で暗号化が必要なサフィックス（_tokenなど、max_tokensは除外）
    const sensitiveSuffixes = [
        '_secret',
        '_password',
        '_token',
        '_key'
    ];

    // 除外するキー（明らかに暗号化不要なもの）
    const excludeKeys = [
        'ai_max_tokens'
    ];

    const lowerKey = key.toLowerCase();

    // 除外リストにある場合は暗号化しない
    if (excludeKeys.includes(lowerKey)) {
        return false;
    }

    // 完全一致チェック
    if (exactSensitiveKeys.includes(lowerKey)) {
        return true;
    }

    // 末尾一致チェック（_tokenで終わるが、_tokensは含まない）
    return sensitiveSuffixes.some(suffix => lowerKey.endsWith(suffix));
}

module.exports = {
    encrypt,
    decrypt,
    shouldEncrypt
};
