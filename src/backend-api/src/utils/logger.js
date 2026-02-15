/**
 * Winstonベースのロガー
 * 本番環境とすべての環境で適切なログ出力を行います
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

// ログディレクトリの作成
const logDir = config.log.dir || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// カスタムフォーマット: タイムスタンプ + レベル + メッセージ
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
    let msg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // スタックトレースがある場合は追加（開発環境のみ）
    if (stack && config.nodeEnv !== 'production') {
      msg += `\n${stack}`;
    }

    // 追加のメタデータがある場合は表示
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }

    return msg;
  })
);

// JSON形式のフォーマット（ファイル出力用）
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// トランスポート（出力先）の設定
const transports = [];

// ファイル出力: エラーログ
transports.push(
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: jsonFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 5, // 最大5ファイルまで保持
    tailable: true
  })
);

// ファイル出力: 統合ログ
transports.push(
  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    format: jsonFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 10, // 最大10ファイルまで保持
    tailable: true
  })
);

// コンソール出力（開発環境のみ、または本番環境でもLOG_TO_CONSOLE=trueの場合）
if (config.nodeEnv !== 'production' || process.env.LOG_TO_CONSOLE === 'true') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    })
  );
}

// Winstonロガーの作成
const logger = winston.createLogger({
  level: config.log.level || 'info',
  format: customFormat,
  transports: transports,
  // 未処理の例外やPromise拒否をログに記録
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      format: jsonFormat
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      format: jsonFormat
    })
  ],
  // 本番環境では終了せずにログを記録
  exitOnError: false
});

/**
 * 機密情報を除外するヘルパー関数
 * パスワード、トークン、APIキーなどをログから除外
 * @param {Object} obj - フィルタリングするオブジェクト
 * @returns {Object} - フィルタリングされたオブジェクト
 */
function sanitizeLogData(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sensitiveKeys = [
    'password',
    'token',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
    'cookie',
    'session'
  ];

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sensitiveKey =>
        lowerKey.includes(sensitiveKey)
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitized[key] = sanitizeLogData(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    }
  }

  return sanitized;
}

/**
 * HTTPリクエストのログを記録
 * @param {Object} req - Expressリクエストオブジェクト
 * @param {Object} res - Expressレスポンスオブジェクト
 * @param {number} duration - リクエスト処理時間（ミリ秒）
 */
function logHttpRequest(req, res, duration) {
  const logData = {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    userId: req.user?.userId || 'anonymous'
  };

  // ステータスコードに応じてログレベルを変更
  if (res.statusCode >= 500) {
    logger.error('HTTP Request Error', sanitizeLogData(logData));
  } else if (res.statusCode >= 400) {
    logger.warn('HTTP Request Warning', sanitizeLogData(logData));
  } else {
    logger.info('HTTP Request', sanitizeLogData(logData));
  }
}

// 既存のコードとの互換性のために、従来のメソッドも保持
module.exports = logger;

// ヘルパー関数もエクスポート
module.exports.sanitizeLogData = sanitizeLogData;
module.exports.logHttpRequest = logHttpRequest;
