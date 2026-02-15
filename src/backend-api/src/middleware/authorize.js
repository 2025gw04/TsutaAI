// 権限管理ミドルウェア

/**
 * 指定されたロールを持つユーザーのみアクセスを許可するミドルウェア
 * @param  {...string} allowedRoles - 許可するロール（'admin', 'manager', 'member' など）
 * @returns {Function} Expressミドルウェア関数
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    try {
      // authenticateTokenミドルウェアで設定されたreq.userを確認
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '認証が必要です。'
        });
      }

      const userRole = req.user.role;

      // ロールチェック
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'この操作を実行する権限がありません。'
        });
      }

      // 権限OK
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `権限チェックエラー: ${error.message}`
      });
    }
  };
}

/**
 * 管理者のみアクセスを許可するミドルウェア
 */
function authorizeAdmin(req, res, next) {
  return authorize('admin')(req, res, next);
}

/**
 * 管理者またはマネージャーのみアクセスを許可するミドルウェア
 */
function authorizeManager(req, res, next) {
  return authorize('admin', 'manager')(req, res, next);
}

/**
 * 本人または管理者のみアクセスを許可するミドルウェア
 * @param {string} userIdParam - リクエストパラメータ名（デフォルト: 'id'）
 */
function authorizeSelfOrAdmin(userIdParam = 'id') {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '認証が必要です。'
        });
      }

      const requestedUserId = parseInt(req.params[userIdParam], 10);
      const currentUserId = req.user.userId;
      const userRole = req.user.role;

      // 本人または管理者の場合OK
      if (currentUserId === requestedUserId || userRole === 'admin') {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: 'この操作を実行する権限がありません。'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `権限チェックエラー: ${error.message}`
      });
    }
  };
}

module.exports = {
  authorize,
  authorizeAdmin,
  authorizeManager,
  authorizeSelfOrAdmin
};
