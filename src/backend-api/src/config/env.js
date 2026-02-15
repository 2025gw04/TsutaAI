// 環境変数を読み込む設定モジュール
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// .envファイルの絶対パスを判定
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// 定数をまとめてエクスポート
const proxyEnabled = typeof process.env.PROXY_ENABLED === 'string'
  ? process.env.PROXY_ENABLED.trim().toLowerCase() === 'true'
  : false;

// DBクライアント種別の判定
// 有効な値: 'sqlite', 'mysql', 'postgresql', 'mssql', 'development'
const dbClient = process.env.DB_CLIENT || 'development';

module.exports = {
  // 環境設定
  nodeEnv: process.env.NODE_ENV || 'development',

  // サーバーポート番号
  port: process.env.PORT || 3000,

  // HTTPS設定
  https: {
    enabled: process.env.ENABLE_HTTPS === 'true',
    keyPath: process.env.SSL_KEY_PATH || './ssl/server.key',
    certPath: process.env.SSL_CERT_PATH || './ssl/server.cert'
  },

  // JWT設定
  jwt: {
    secret: process.env.JWT_SECRET || 'tsutaai-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },

  // データベース設定
  dbClient: dbClient,
  databasePath: process.env.DATABASE_PATH || path.resolve(process.cwd(), '..', 'database', 'tsutaai.db'),
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: process.env.DB_PORT,
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME || 'tsutaai',
  dbEncrypt: process.env.DB_ENCRYPT === 'true',
  dbTrustServerCert: process.env.DB_TRUST_SERVER_CERT === 'true',

  // Groq API設定
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqEndpoint: process.env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions',

  // プロキシ設定
  proxy: {
    enabled: proxyEnabled,
    url: process.env.PROXY_URL || '',
    username: process.env.PROXY_USERNAME || '',
    password: process.env.PROXY_PASSWORD || ''
  },

  // ログ設定
  log: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs'
  },

  // レート制限設定
  rateLimit: {
    login: {
      max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 5,
      windowMs: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS) || 900000
    },
    api: {
      max: parseInt(process.env.RATE_LIMIT_API_MAX) || 100,
      windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS) || 900000
    }
  },

  // セキュリティ設定
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || 'change-this-to-a-strong-random-key-in-production'
  }
};
