// パスワードハッシュ化ユーティリティ
const bcrypt = require('bcrypt');

// ソルトラウンド数（10が推奨値）
const SALT_ROUNDS = 10;

/**
 * パスワードをハッシュ化します
 * @param {string} plainPassword - 平文パスワード
 * @returns {Promise<string>} ハッシュ化されたパスワード
 */
async function hashPassword(plainPassword) {
  try {
    const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    return hashedPassword;
  } catch (error) {
    throw new Error(`パスワードハッシュ化エラー: ${error.message}`);
  }
}

/**
 * パスワードを検証します
 * @param {string} plainPassword - 平文パスワード
 * @param {string} hashedPassword - ハッシュ化されたパスワード
 * @returns {Promise<boolean>} 一致する場合true
 */
async function verifyPassword(plainPassword, hashedPassword) {
  try {
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    // bcrypt検証に失敗した場合（ハッシュが無効な形式など）はfalseを返す
    // 呼び出し元で平文パスワードチェックを行うため
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword
};
