/**
 * HTTPSリダイレクトミドルウェア
 * HTTPリクエストを自動的にHTTPSにリダイレクトします
 */

const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * HTTPからHTTPSへのリダイレクトを強制するミドルウェア
 * @param {Object} req - Expressリクエストオブジェクト
 * @param {Object} res - Expressレスポンスオブジェクト
 * @param {Function} next - 次のミドルウェアへの関数
 */
function enforceHttps(req, res, next) {
  // 本番環境かつHTTPS有効時のみ動作
  if (config.nodeEnv === 'production' && config.https.enabled) {
    // プロキシ経由の場合（X-Forwarded-Proto ヘッダーを確認）
    const forwardedProto = req.headers['x-forwarded-proto'];

    // HTTPの場合はHTTPSにリダイレクト
    if (req.protocol === 'http' || forwardedProto === 'http') {
      const httpsUrl = `https://${req.headers.host}${req.url}`;
      logger.info(`HTTPからHTTPSへリダイレクト: ${req.url} -> ${httpsUrl}`);
      return res.redirect(301, httpsUrl);
    }
  }

  next();
}

/**
 * Strict-Transport-Security (HSTS) ヘッダーを設定するミドルウェア
 * ブラウザに対してHTTPSのみでアクセスするよう指示します
 * @param {Object} req - Expressリクエストオブジェクト
 * @param {Object} res - Expressレスポンスオブジェクト
 * @param {Function} next - 次のミドルウェアへの関数
 */
function setHstsHeader(req, res, next) {
  // HTTPS有効時のみHSTSヘッダーを設定
  if (config.https.enabled && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
    // 1年間（31536000秒）HTTPSを強制
    // includeSubDomains: サブドメインにも適用
    // preload: ブラウザのHSTSプリロードリストに登録可能
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

module.exports = {
  enforceHttps,
  setHstsHeader
};
