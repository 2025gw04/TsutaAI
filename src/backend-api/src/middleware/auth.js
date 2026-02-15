// JWT認証ミドルウェア
const jwt = require('jsonwebtoken');
const config = require('../config/env');

// JWT設定を環境設定から取得
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;

/**
 * JWTトークンを生成します
 * @param {Object} payload - トークンに含めるデータ（userId, role など）
 * @returns {string} JWTトークン
 */
function generateToken(payload) {
  try {
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });
    return token;
  } catch (error) {
    throw new Error(`トークン生成エラー: ${error.message}`);
  }
}

/**
 * JWTトークンを検証するミドルウェア
 * リクエストヘッダーの Authorization: Bearer <token> からトークンを取得し検証します
 */
function authenticateToken(req, res, next) {
  try {
    // Authorizationヘッダーからトークンを取得
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN" の形式

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '認証トークンが提供されていません。'
      });
    }

    // トークンを検証
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: 'トークンが無効または期限切れです。'
        });
      }

      // 検証成功: デコードされたデータをreq.userに格納
      req.user = decoded;
      next();
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `認証エラー: ${error.message}`
    });
  }
}

/**
 * オプショナル認証ミドルウェア
 * トークンがあれば検証するが、なくてもエラーにしない
 */
function optionalAuthenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        req.user = null;
      } else {
        req.user = decoded;
      }
      next();
    });
  } catch (error) {
    req.user = null;
    next();
  }
}

module.exports = {
  generateToken,
  authenticateToken,
  optionalAuthenticateToken,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
