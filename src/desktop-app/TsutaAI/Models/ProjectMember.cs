using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// プロジェクトメンバー情報を表すモデルです。
    /// backend-api の project_members テーブルに対応
    /// </summary>
    public class ProjectMember
    {
        /// <summary>
        /// レコードID
        /// </summary>
        [JsonProperty("id")]
        public int Id { get; set; }

        /// <summary>
        /// プロジェクトID
        /// </summary>
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        /// <summary>
        /// ユーザーID
        /// </summary>
        [JsonProperty("userId")]
        public int UserId { get; set; }

        /// <summary>
        /// プロジェクト内のロール: owner, member, viewer
        /// </summary>
        [JsonProperty("role")]
        public string Role { get; set; }

        /// <summary>
        /// プロジェクトに追加された日時
        /// </summary>
        [JsonProperty("addedAt")]
        public DateTime AddedAt { get; set; }

        /// <summary>
        /// ユーザー情報（APIレスポンスに含まれる場合）
        /// </summary>
        [JsonProperty("user")]
        public User User { get; set; }

        /// <summary>
        /// ロール表示用文字列を取得
        /// </summary>
        public string GetRoleDisplayName()
        {
            switch (Role)
            {
                case "owner":
                    return "オーナー";
                case "member":
                    return "メンバー";
                case "viewer":
                    return "閲覧者";
                default:
                    return Role;
            }
        }

        /// <summary>
        /// オーナーかどうか確認
        /// </summary>
        public bool IsOwner()
        {
            return Role == "owner";
        }

        /// <summary>
        /// 編集権限があるか確認（owner または member）
        /// </summary>
        public bool CanEdit()
        {
            return Role == "owner" || Role == "member";
        }
    }
}
