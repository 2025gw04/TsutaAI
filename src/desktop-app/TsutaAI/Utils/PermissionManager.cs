using System;
using TsutaAI.Models;

namespace TsutaAI.Utils
{
    /// <summary>
    /// ロールベースの権限管理
    /// backend-apiの権限体系に合わせた権限チェック機能を提供
    /// </summary>
    public static class PermissionManager
    {
        // ロール定義
        public const string RoleAdmin = "admin";
        public const string RoleManager = "manager";
        public const string RoleMember = "member";

        /// <summary>
        /// プロジェクト管理権限（作成・更新・削除）
        /// </summary>
        public static bool CanManageProjects(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// ユーザー管理権限（作成・更新・削除）
        /// </summary>
        public static bool CanManageUsers(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin;
        }

        /// <summary>
        /// タスク作成権限
        /// </summary>
        public static bool CanCreateTasks(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// タスク削除権限
        /// </summary>
        public static bool CanDeleteTasks(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// タスク更新権限（自分が担当しているタスクは全員更新可能）
        /// </summary>
        public static bool CanUpdateTask(User user, int? assignedToUserId)
        {
            if (user == null) return false;

            // 管理者・マネージャーは全タスク更新可能
            if (user.Role == RoleAdmin || user.Role == RoleManager)
            {
                return true;
            }

            // 自分が担当しているタスクは更新可能
            if (assignedToUserId.HasValue && assignedToUserId.Value == user.Id)
            {
                return true;
            }

            return false;
        }

        /// <summary>
        /// 成長レポート閲覧権限
        /// </summary>
        public static bool CanViewGrowthReports(User user, int targetUserId)
        {
            if (user == null) return false;

            // 管理者は全員のレポート閲覧可能
            if (user.Role == RoleAdmin)
            {
                return true;
            }

            // 本人のレポートは閲覧可能
            if (user.Id == targetUserId)
            {
                return true;
            }

            return false;
        }

        /// <summary>
        /// スプリント管理権限
        /// </summary>
        public static bool CanManageSprints(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// 休暇管理権限
        /// </summary>
        public static bool CanManageVacations(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// ユーザー情報更新権限
        /// </summary>
        public static bool CanUpdateUser(User currentUser, int targetUserId)
        {
            if (currentUser == null) return false;

            // 管理者は全員更新可能
            if (currentUser.Role == RoleAdmin)
            {
                return true;
            }

            // 本人の情報は更新可能
            if (currentUser.Id == targetUserId)
            {
                return true;
            }

            return false;
        }

        /// <summary>
        /// プロジェクトメンバー管理権限
        /// </summary>
        public static bool CanManageProjectMembers(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// レポート生成権限
        /// </summary>
        public static bool CanGenerateReports(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// AI機能実行権限
        /// </summary>
        public static bool CanUseAiFeatures(User user)
        {
            if (user == null) return false;
            // 全ユーザーがAI機能を使用可能
            return true;
        }

        /// <summary>
        /// メンタルヘルスログ閲覧権限（チーム全体）
        /// </summary>
        public static bool CanViewTeamMentalHealth(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// アクティビティログ閲覧権限
        /// </summary>
        public static bool CanViewActivityLogs(User currentUser, int targetUserId)
        {
            if (currentUser == null) return false;

            // 管理者は全員のログ閲覧可能
            if (currentUser.Role == RoleAdmin)
            {
                return true;
            }

            // 本人のログは閲覧可能
            if (currentUser.Id == targetUserId)
            {
                return true;
            }

            return false;
        }

        /// <summary>
        /// プロジェクトダッシュボード閲覧権限
        /// </summary>
        public static bool CanViewProjectDashboard(User user)
        {
            if (user == null) return false;
            // 全ユーザーがプロジェクトダッシュボードを閲覧可能
            return true;
        }

        /// <summary>
        /// データクリーンアップ実行権限
        /// </summary>
        public static bool CanCleanupData(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin;
        }

        /// <summary>
        /// ヘルプリクエスト割り当て権限
        /// </summary>
        public static bool CanAssignHelpRequests(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// ロール名表示用文字列取得
        /// </summary>
        public static string GetRoleDisplayName(string role)
        {
            switch (role)
            {
                case RoleAdmin:
                    return "管理者";
                case RoleManager:
                    return "マネージャー";
                case RoleMember:
                    return "メンバー";
                default:
                    return "不明";
            }
        }

        /// <summary>
        /// ユーザーが指定したロールを持っているか確認
        /// </summary>
        public static bool HasRole(User user, string role)
        {
            if (user == null || string.IsNullOrEmpty(role)) return false;
            return user.Role == role;
        }

        /// <summary>
        /// ユーザーが管理者またはマネージャーか確認
        /// </summary>
        public static bool IsAdminOrManager(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin || user.Role == RoleManager;
        }

        /// <summary>
        /// ユーザーが管理者か確認
        /// </summary>
        public static bool IsAdmin(User user)
        {
            if (user == null) return false;
            return user.Role == RoleAdmin;
        }
    }
}
