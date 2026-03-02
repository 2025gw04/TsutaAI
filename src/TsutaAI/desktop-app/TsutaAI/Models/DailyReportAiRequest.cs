using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// AI に日報生成を依頼する際の入力値。
    /// </summary>
    public class DailyReportAiRequest
    {
        [JsonProperty("user_id")]
        public int UserId { get; set; }

        [JsonProperty("user_name")]
        public string UserName { get; set; } = string.Empty;

        [JsonProperty("report_date")]
        public string ReportDate { get; set; } = string.Empty;

        [JsonProperty("task_list")]
        public string TaskList { get; set; } = string.Empty;

        [JsonProperty("achievements")]
        public string Achievements { get; set; } = string.Empty;

        [JsonProperty("issues")]
        public string Issues { get; set; } = string.Empty;

        [JsonProperty("learnings")]
        public string Learnings { get; set; } = string.Empty;

        [JsonProperty("next_plan")]
        public string NextPlan { get; set; } = string.Empty;

        [JsonProperty("monitoring_context")]
        public string MonitoringContext { get; set; } = string.Empty;

        [JsonProperty("three_day_context")]
        public string ThreeDayContext { get; set; } = string.Empty;

        [JsonProperty("recent_feedback_context")]
        public string RecentFeedbackContext { get; set; } = string.Empty;
    }
}
