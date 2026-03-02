using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// AI から返却される日報フィードバックの構造化データ。
    /// </summary>
    public class DailyReportAiFeedback
    {
        [JsonProperty("summary")]
        public string Summary { get; set; } = string.Empty;

        [JsonProperty("insights")]
        public List<string> Insights { get; set; } = new List<string>();

        [JsonProperty("tomorrow")]
        public List<string> Tomorrow { get; set; } = new List<string>();

        [JsonProperty("encouragement")]
        public string Encouragement { get; set; } = string.Empty;

        // Draft API用プロパティ
        [JsonProperty("achievements")]
        public List<string> Achievements { get; set; } = new List<string>();

        [JsonProperty("issues")]
        public List<string> Issues { get; set; } = new List<string>();

        [JsonProperty("learnings")]
        public List<string> Learnings { get; set; } = new List<string>();

        [JsonProperty("next_plan")]
        public List<string> NextPlan { get; set; } = new List<string>();

        [JsonProperty("draft_feedback")]
        public string DraftFeedback { get; set; } = string.Empty;

        /// <summary>
        /// 十分な情報がパースできたかを確認します。
        /// </summary>
        public bool HasContent()
        {
            return !string.IsNullOrWhiteSpace(Summary)
                   || (Insights?.Count > 0)
                   || (Tomorrow?.Count > 0)
                   || (Achievements?.Count > 0)
                   || (Issues?.Count > 0)
                   || (Learnings?.Count > 0)
                   || (NextPlan?.Count > 0)
                   || !string.IsNullOrWhiteSpace(Encouragement)
                   || !string.IsNullOrWhiteSpace(DraftFeedback);
        }
    }
}
