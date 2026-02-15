using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// プロジェクト情報を表すモデルです。
    /// backend-api の projects テーブルに対応
    /// </summary>
    public class Project
    {
        /// <summary>
        /// プロジェクトID（データベースの主キー）
        /// </summary>
        [JsonProperty("id")]
        public int Id { get; set; }

        /// <summary>
        /// プロジェクト名
        /// </summary>
        [JsonProperty("name")]
        public string Name { get; set; }

        /// <summary>
        /// プロジェクト説明
        /// </summary>
        [JsonProperty("description")]
        public string Description { get; set; }

        /// <summary>
        /// 開始日
        /// </summary>
        [JsonProperty("start_date")]
        public DateTime StartDate { get; set; }

        /// <summary>
        /// 終了日
        /// </summary>
        [JsonProperty("end_date")]
        public DateTime EndDate { get; set; }

        /// <summary>
        /// ステータス: planning, active, completed, cancelled
        /// </summary>
        [JsonProperty("status")]
        public string Status { get; set; }

        /// <summary>
        /// 作成者のユーザーID
        /// </summary>
        [JsonProperty("created_by")]
        public int CreatedBy { get; set; }

        /// <summary>
        /// ヘルススコア（0-100）
        /// </summary>
        [JsonProperty("health_score")]
        public int? HealthScore { get; set; }

        /// <summary>
        /// ヘルススコア最終更新日時
        /// </summary>
        [JsonProperty("last_health_score_update")]
        public DateTime? LastHealthScoreUpdate { get; set; }

        /// <summary>
        /// 現在のスプリントID
        /// </summary>
        [JsonProperty("current_sprint_id")]
        public int? CurrentSprintId { get; set; }

        /// <summary>
        /// 作成日時
        /// </summary>
        [JsonProperty("created_at")]
        public DateTime CreatedAt { get; set; }

        /// <summary>
        /// 更新日時
        /// </summary>
        [JsonProperty("updated_at")]
        public DateTime UpdatedAt { get; set; }

        /// <summary>
        /// ステータス表示用文字列を取得
        /// </summary>
        public string GetStatusDisplayName()
        {
            switch (Status)
            {
                case "planning":
                    return "計画中";
                case "active":
                    return "進行中";
                case "completed":
                    return "完了";
                case "cancelled":
                    return "中止";
                default:
                    return Status;
            }
        }

        /// <summary>
        /// プロジェクトが進行中か確認
        /// </summary>
        public bool IsActive()
        {
            return Status == "active";
        }

        /// <summary>
        /// プロジェクトが完了しているか確認
        /// </summary>
        public bool IsCompleted()
        {
            return Status == "completed";
        }
    }
}