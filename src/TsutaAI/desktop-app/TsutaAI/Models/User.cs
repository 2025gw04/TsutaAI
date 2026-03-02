using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// ユーザー情報を表すモデルクラスです。
    /// </summary>
    public class User
    {
        /// <summary>
        /// ユーザーID (主キー)。
        /// </summary>
        [JsonProperty("id")]
        public int Id { get; set; }

        /// <summary>
        /// API 互換用のエイリアス。設定すると Id に転送します。
        /// </summary>
        [JsonIgnore]
        public int UserId
        {
            get => Id;
            set => Id = value;
        }

        /// <summary>
        /// ログイン用ユーザー名。
        /// </summary>
        [JsonProperty("username")]
        public string Username { get; set; } = string.Empty;

        /// <summary>
        /// 表示名として利用するフルネーム。
        /// </summary>
        [JsonProperty("fullName")]
        public string FullName { get; set; } = string.Empty;

        /// <summary>
        /// 連絡用メールアドレス。
        /// </summary>
        [JsonProperty("email")]
        public string Email { get; set; } = string.Empty;

        /// <summary>
        /// ユーザーの権限ロール。
        /// </summary>
        [JsonProperty("role")]
        public string Role { get; set; } = "member";

        /// <summary>
        /// 認証トークン。
        /// </summary>
        [JsonProperty("token")]
        public string Token { get; set; } = string.Empty;

        /// <summary>
        /// レコード作成日時。
        /// </summary>
        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// レコード更新日時。
        /// </summary>
        [JsonProperty("updatedAt")]
        public DateTime? UpdatedAt { get; set; }
    }
}
