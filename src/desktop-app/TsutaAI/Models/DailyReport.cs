using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// 日報情報を保持するモデルです。
    /// </summary>
    public class DailyReport
    {
        /// <summary>
        /// 日報ID
        /// </summary>
        [JsonProperty("report_id")]
        public int ReportId { get; set; }

        /// <summary>
        /// 日報対象の日付
        /// </summary>
        [JsonProperty("report_date")]
        public DateTime ReportDate { get; set; }

        /// <summary>
        /// 記録したユーザーID
        /// </summary>
        [JsonProperty("user_id")]
        public int UserId { get; set; }

        /// <summary>
        /// AIが生成したサマリー文章
        /// </summary>
        [JsonProperty("summary")]
        public string GeneratedSummary { get; set; }

        /// <summary>
        /// ユーザーが編集した最終本文
        /// </summary>
        [JsonProperty("comment")]
        public string EditedContent { get; set; }

        /// <summary>
        /// 自己評価スコア（0-5想定）
        /// </summary>
        [JsonProperty("self_score")]
        public int SelfScore { get; set; }

        /// <summary>
        /// 満足度（1-5の範囲）
        /// </summary>
        [JsonProperty("satisfaction_level")]
        public int SatisfactionLevel { get; set; }

        /// <summary>
        /// 達成度（0-100の範囲）
        /// </summary>
        [JsonProperty("achievement_rate")]
        public int AchievementRate { get; set; }

        /// <summary>
        /// 集中度（0-100の範囲）
        /// </summary>
        [JsonProperty("focus_level")]
        public int FocusLevel { get; set; }

        /// <summary>
        /// 難易度（0-100の範囲）
        /// </summary>
        [JsonProperty("difficulty_level")]
        public int DifficultyLevel { get; set; }

        /// <summary>
        /// 学び度（0-100の範囲）
        /// </summary>
        [JsonProperty("learning_level")]
        public int LearningLevel { get; set; }

        /// <summary>
        /// 満足度（絵文字などを想定）
        /// </summary>
        [JsonProperty("satisfaction")]
        public string Satisfaction { get; set; }

        /// <summary>
        /// 報告送信済みかどうか
        /// </summary>
        [JsonProperty("is_submitted")]
        public bool IsSubmitted { get; set; }

        /// <summary>
        /// AI生成フラグ
        /// </summary>
        [JsonProperty("ai_generated")]
        public bool AiGenerated { get; set; }

        /// <summary>
        /// 登録日時
        /// </summary>
        [JsonProperty("created_at")]
        public DateTime CreatedAt { get; set; }

        /// <summary>
        /// 更新日時
        /// </summary>
        [JsonProperty("updated_at")]
        public DateTime UpdatedAt { get; set; }
    }
}
