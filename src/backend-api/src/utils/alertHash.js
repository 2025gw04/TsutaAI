/**
 * アラートハッシュ生成ユーティリティ
 * アラートの重複を防ぐためのハッシュ値を生成
 */

const crypto = require('crypto');

/**
 * アラートのハッシュ値を生成
 * @param {Object} alert - アラートオブジェクト
 * @param {number|null} alert.projectId - プロジェクトID
 * @param {string} alert.severity - 重要度 (high/medium/low)
 * @param {string} alert.type - 種類 (risk/suggestion/warning)
 * @param {string} alert.message - メッセージ
 * @returns {string} SHA-256ハッシュ値（64文字の16進数文字列）
 */
function generateAlertHash(alert) {
    // メッセージを正規化（数値を{N}に置換）
    const normalizedMessage = normalizeMessage(alert.message);

    // ハッシュ生成の入力文字列を作成
    const hashInput = [
        alert.projectId || 'global',
        alert.severity,
        alert.type,
        normalizedMessage
    ].join('|');

    // SHA-256ハッシュを生成
    return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * メッセージを正規化
 * 数値や日付などの可変部分を置換して、本質的に同じメッセージを同一視する
 * @param {string} message - 元のメッセージ
 * @returns {string} 正規化されたメッセージ
 */
function normalizeMessage(message) {
    if (!message) return '';

    return message
        // 数値を{N}に置換
        .replace(/\d+/g, '{N}')
        // 日付パターンを{DATE}に置換
        .replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g, '{DATE}')
        // 連続する空白を1つに
        .replace(/\s+/g, ' ')
        // 前後の空白を削除
        .trim();
}

/**
 * 複数のアラートのハッシュ値を一括生成
 * @param {Array<Object>} alerts - アラートの配列
 * @returns {Array<Object>} ハッシュ値を含むアラートの配列
 */
function generateAlertHashes(alerts) {
    return alerts.map(alert => ({
        ...alert,
        alert_hash: generateAlertHash(alert)
    }));
}

/**
 * アラートが重複しているか確認
 * @param {string} hash - チェックするハッシュ値
 * @param {Set<string>} existingHashes - 既存のハッシュ値のセット
 * @returns {boolean} 重複している場合true
 */
function isDuplicateAlert(hash, existingHashes) {
    return existingHashes.has(hash);
}

module.exports = {
    generateAlertHash,
    normalizeMessage,
    generateAlertHashes,
    isDuplicateAlert
};
