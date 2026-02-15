using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// タスクコメント情報を表現するモデルクラスです。
    /// </summary>
    public class TaskComment
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("content")]
        public string Content { get; set; } = string.Empty;

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("userName")]
        public string UserName { get; set; } = string.Empty;

        /// <summary>
        /// コメント作成からの経過時間を取得します。
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
    }
}
