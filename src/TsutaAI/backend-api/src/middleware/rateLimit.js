/**
 * レート制限ミドルウェア
 * ブルートフォース攻撃やDDoS攻撃から保護します
 */

const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * レート制限超過時のカスタムハンドラー
 * @param {Object} req - Expressリクエストオブジェクト
 * @param {Object} res - Expressレスポンスオブジェクト
 */
function rateLimitHandler(req, res) {
  logger.warn(`レート制限超過: ${req.ip} - ${req.path}`);
  res.status(429).json({
    success: false,
    message: 'リクエストが多すぎます。しばらくしてから再試行してください。',
    retryAfter: res.getHeader('Retry-After')
  });
}

/**
 * ログインエンドポイント用のレート制限（厳しい制限）
 * ブルートフォース攻撃を防止します
 */
const loginLimiter = rateLimit({
  windowMs: config.rateLimit.login.windowMs, // デフォルト: 15分
  max: config.rateLimit.login.max, // デフォルト: 5回
  message: 'ログイン試行回数が多すぎます。15分後に再試行してください。',
  standardHeaders: 'draft-7', // RateLimit-* ヘッダーを返す（IPv6対応）
  legacyHeaders: false, // X-RateLimit-* ヘッダーを無効化
  handler: rateLimitHandler,
  // デフォルトのkeyGeneratorを使用（IPv6対応）
  // ログイン成功時にカウンタをリセット（オプション）
  skipSuccessfulRequests: false,
  // 失敗したリクエストのみカウント（オプション）
  skipFailedRequests: false
});

/**
 * 一般API用のレート制限（緩い制限）
 * 過度なAPI呼び出しを防止します
 */
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.api.windowMs, // デフォルト: 15分
  max: config.rateLimit.api.max, // デフォルト: 100回
  message: 'リクエストが多すぎます。しばらくしてから再試行してください。',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler
  // デフォルトのkeyGeneratorを使用（IPv6対応）
});

/**
 * AI API用のレート制限（中程度の制限）
 * AIエンドポイントは処理が重いため、やや厳しめの制限
 */
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 30, // 30回
  message: 'AI APIの呼び出しが多すぎます。しばらくしてから再試行してください。',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req, res) => {
    // 認証済みユーザーの場合はユーザーIDベースで制限
    if (req.user && req.user.userId) {
      return `user-${req.user.userId}`;
    }
    // IPv6対応のデフォルトkeyGeneratorを使用
    return undefined; // デフォルトのIPベースの識別に戻す
  }
});

/**
 * パスワードリセット用のレート制限（厳しい制限）
 * メール送信などのリソース消費を抑制
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1時間
  max: 3, // 3回
  message: 'パスワードリセットの試行回数が多すぎます。1時間後に再試行してください。',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler
  // デフォルトのkeyGeneratorを使用（IPv6対応）
});

/**
 * ファイルアップロード用のレート制限（厳しい制限）
 * サーバーリソースを保護
 */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 10, // 10回
  message: 'ファイルアップロードの回数が多すぎます。しばらくしてから再試行してください。',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req, res) => {
    // 認証済みユーザーの場合はユーザーIDベースで制限
    if (req.user && req.user.userId) {
      return `user-${req.user.userId}`;
    }
    // IPv6対応のデフォルトkeyGeneratorを使用
    return undefined; // デフォルトのIPベースの識別に戻す
  }
});

/**
 * グローバルレート制限（全エンドポイント）
 * 極端な大量リクエストを防止
 */
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分
  max: 200, // 200回
  message: 'リクエストが多すぎます。しばらくしてから再試行してください。',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler,
  // デフォルトのkeyGeneratorを使用（IPv6対応）
  // ヘルスチェックエンドポイントはスキップ
  skip: (req) => {
    return req.path === '/health' || req.path === '/health/readiness';
  }
});

module.exports = {
  loginLimiter,
  apiLimiter,
  aiLimiter,
  passwordResetLimiter,
  uploadLimiter,
  globalLimiter
};
