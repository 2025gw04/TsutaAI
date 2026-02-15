/**
 * セキュリティヘッダーミドルウェア
 * Helmetを使用して各種セキュリティヘッダーを設定します
 */

const helmet = require('helmet');
const config = require('../config/env');

/**
 * セキュリティヘッダーを設定するミドルウェア
 * @param {Object} app - Expressアプリケーション
 */
function setupSecurityHeaders(app) {
  // Helmetの基本設定を適用
  app.use(helmet({
    // Content Security Policy (CSP)
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Svelteのインラインスタイルに対応
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },

    // HTTP Strict Transport Security (HSTS)
    // HTTPSを強制し、ブラウザにHTTPSのみでアクセスするよう指示
    hsts: config.https.enabled ? {
      maxAge: 31536000, // 1年間
      includeSubDomains: true,
      preload: true
    } : false,

    // X-Frame-Options
    // クリックジャッキング攻撃を防止
    frameguard: {
      action: 'deny'
    },

    // X-Content-Type-Options
    // MIMEタイプスニッフィングを防止
    noSniff: true,

    // X-XSS-Protection
    // XSS攻撃からの保護（古いブラウザ向け）
    xssFilter: true,

    // Referrer-Policy
    // リファラー情報の送信を制限
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },

    // X-Powered-By ヘッダーを削除
    // サーバー情報の漏洩を防止
    hidePoweredBy: true,

    // X-Download-Options
    // IEでのダウンロード時の動作を制限
    ieNoOpen: true,

    // X-DNS-Prefetch-Control
    // DNSプリフェッチを制御
    dnsPrefetchControl: {
      allow: false
    },

    // Permissions-Policy
    // ブラウザの機能（カメラ、マイク等）へのアクセスを制限
    permissionsPolicy: {
      features: {
        camera: ["'none'"],
        microphone: ["'none'"],
        geolocation: ["'none'"],
        payment: ["'none'"]
      }
    }
  }));

  // CORS設定（既存のcors()の代わりに詳細設定）
  app.use((req, res, next) => {
    // 開発環境では緩い設定、本番環境では厳格な設定
    if (config.nodeEnv === 'development') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      // 本番環境では特定のオリジンのみ許可
      // 必要に応じて環境変数で設定可能にする
      const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['https://tsutaai.example.com'];

      const origin = req.headers.origin;
      if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Preflight リクエストへの対応
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
  });
}

module.exports = setupSecurityHeaders;
