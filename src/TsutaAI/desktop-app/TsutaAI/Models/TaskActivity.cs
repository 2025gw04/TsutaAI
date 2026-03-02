using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// タスクアクティビティ（履歴）情報を表現するモデルクラスです。
    /// </summary>
    public class TaskActivity
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("userName")]
        public string UserName { get; set; } = string.Empty;

        [JsonProperty("actionType")]
        public string Action { get; set; } = string.Empty;

        [JsonProperty("oldValue")]
        public string OldValue { get; set; }

        [JsonProperty("newValue")]
        public string NewValue { get; set; }

        [JsonProperty("description")]
        public string Details { get; set; } = string.Empty;

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        /// <summary>
        /// アクティビティ作成からの経過時間を取得します。
        /// </summary>
        public string TimeAgo
        {
            get
            {
                var span = DateTime.Now - CreatedAt;
                if (span.TotalMinutes < 1) return "たった今";
                if (span.TotalMinutes < 60) return $"{(int)span.TotalMinutes}分前";
                if (span.TotalHours < 24) return $"{(int)span.TotalHours}時間前";
                if (span.TotalDays < 7) return $"{(int)span.TotalDays}日前";
                return CreatedAt.ToString("yyyy/MM/dd HH:mm");
            }
        }

        /// <summary>
        /// アクションタイプに応じたアイコン名を取得します。
        /// </summary>
        public string ActionIcon
        {
            get
            {
                switch (Action?.ToLower())
                {
                    case "created":
                        return "RegularPlus";
                    case "updated":
                    case "status_changed":
                        return "RegularEdit";
                    case "commented":
                        return "RegularComment";
                    case "attached":
                        return "RegularPaperclip";
                    case "assigned":
                        return "RegularUser";
                    case "completed":
                        return "RegularCheck";
                    default:
                        return "RegularCircle";
                }
            }
        }

        /// <summary>
        /// アクションの日本語表示名を取得します。
        /// </summary>
        public string ActionDisplayName
        {
            get
            {
                switch (Action?.ToLower())
                {
                    case "created":
                        return "作成";
                    case "updated":
                        return "更新";
                    case "status_changed":
                        return "ステータス変更";
                    case "commented":
                        return "コメント追加";
                    case "attached":
                        return "ファイル添付";
                    case "assigned":
                        return "担当者変更";
                    case "completed":
                        return "完了";
                    default:
                        return Action;
                }
            }
        }
    }
}
