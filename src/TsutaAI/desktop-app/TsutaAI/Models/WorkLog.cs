using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// 作業ログを記録するモデルです。
    /// </summary>
    public class WorkLog
    {
        /// <summary>
        /// ログID（データベースの主キー）。
        /// </summary>
        [JsonProperty("id")]
        public int Id { get; set; }

        /// <summary>
        /// 関連するタスクのID。
        /// </summary>
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        /// <summary>
        /// 作業を実施したユーザーのID。
        /// </summary>
        [JsonProperty("userId")]
        public int UserId { get; set; }

        /// <summary>
        /// 作業開始時刻 (UTC)。
        /// </summary>
        [JsonProperty("startTime")]
        public DateTime StartTime { get; set; }

        /// <summary>
        /// API 互換のためのエイリアス。
        /// </summary>
        public DateTime StartedAt
        {
            get => StartTime;
            set => StartTime = value;
        }

        /// <summary>
        /// 作業終了時刻 (UTC)。
        /// </summary>
        [JsonProperty("endTime")]
        public DateTime EndTime { get; set; }

        /// <summary>
        /// API 互換のためのエイリアス。
        /// </summary>
        public DateTime EndedAt
        {
            get => EndTime;
            set => EndTime = value;
        }

        /// <summary>
        /// 作業時間（分）。
        /// </summary>
        [JsonProperty("durationMinutes")]
        public int DurationMinutes { get; set; }

        /// <summary>
        /// 作業種別（「作業」「会議」「休憩」など）。
        /// </summary>
        [JsonProperty("activityType")]
        public string ActivityType { get; set; } = "作業";

        /// <summary>
        /// 備考やメモ（監視サービスの情報を含む詳細な作業内容）。
        /// </summary>
        [JsonProperty("notes")]
        public string Notes { get; set; } = string.Empty;

        /// <summary>
        /// API互換のためのエイリアス。
        /// </summary>
        public string Note
        {
            get => Notes;
            set => Notes = value;
        }
    }
}
