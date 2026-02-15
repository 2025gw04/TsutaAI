/**
 * 共通エラーハンドラーミドルウェア
 * 本番環境では機密情報を除外し、適切なログを記録します
 */

const logger = require('../utils/logger');
const config = require('../config/env');

/**
 * グローバルエラーハンドラー
 * @param {Error} err - エラーオブジェクト
 * @param {Object} req - Expressリクエストオブジェクト
 * @param {Object} res - Expressレスポンスオブジェクト
 * @param {Function} next - 次のミドルウェアへの関数
 */
module.exports = function errorHandler(err, req, res, next) {
  // エラー情報をログに記録
  logger.error('エラーが発生しました', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.userId,
    body: logger.sanitizeLogData(req.body),
    query: req.query,
    params: req.params
  });

  // ステータスコードの決定
  const statusCode = err.statusCode || err.status || 500;

  // レスポンスの基本構造
  const response = {
    success: false,
    message: 'サーバーエラーが発生しました。'
  };

  // 開発環境では詳細なエラー情報を返す
  if (config.nodeEnv !== 'production') {
    response.message = err.message || 'サーバーエラーが発生しました。';
    response.error = err.message;
    response.stack = err.stack;
    response.details = {
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    };
  } else {
    // 本番環境では一般的なメッセージのみ返す
    // ただし、4xx系のクライアントエラーの場合は元のメッセージを使用
    if (statusCode >= 400 && statusCode < 500) {
      response.message = err.message || 'リクエストの処理に失敗しました。';
    } else {
      // 5xx系のサーバーエラーの場合は一般的なメッセージのみ
      response.message = 'サーバーエラーが発生しました。しばらくしてから再試行してください。';
    }

    // エラーIDを生成して返す（サポート問い合わせ時に使用）
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    response.errorId = errorId;

    // エラーIDをログに記録
    logger.error(`エラーID: ${errorId}`);
  }

  // レスポンスを返す
  res.status(statusCode).json(response);
};

/**
 * 404エラーハンドラー
 * ルートが見つからない場合のハンドラー
 */
function notFoundHandler(req, res, next) {
  logger.warn('存在しないルートへのアクセス', {
    url: req.url,
    method: req.method,
    ip: req.ip || req.connection.remoteAddress
  });

  res.status(404).json({
    success: false,
    message: '指定されたリソースが見つかりません。',
    path: req.url
  });
}

module.exports.notFoundHandler = notFoundHandler;
