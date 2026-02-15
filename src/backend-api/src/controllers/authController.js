// 認証関連のコントローラー
const db = require('../services/database');
const { verifyPassword } = require('../utils/password');
const { generateToken } = require('../middleware/auth');

/**
 * JWT認証を使用したログイン処理
 * bcryptでパスワードをハッシュ検証し、JWTトークンを生成します
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'ユーザー名とパスワードを指定してください。'
      });
    }

    const knex = db.getKnex();
    const user = await knex('users')
      .select('id', 'username', 'full_name', 'role', 'password_hash')
      .where('username', username)
      .first();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '認証に失敗しました。'
      });
    }

    // パスワード検証（bcrypt）
    // 既存データとの互換性のため、平文パスワードもチェック
    let isPasswordValid = false;

    // まずbcryptで検証を試みる
    isPasswordValid = await verifyPassword(password, user.password_hash);

    // bcrypt検証に失敗した場合、平文パスワードチェック（後方互換性）
    if (!isPasswordValid) {
      isPasswordValid = user.password_hash === password;
    }

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '認証に失敗しました。'
      });
    }

    // JWTトークン生成
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    return res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        token: token
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login
};
