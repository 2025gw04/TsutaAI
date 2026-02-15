using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// メンタルヘルスログを表すモデルクラス
    /// </summary>
    public class MentalHealthLog
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("reportDate")]
        public string ReportDate { get; set; }

        [JsonProperty("mood")]
        public int? Mood { get; set; } // 1-5: 1=very bad, 5=very good

        [JsonProperty("stressLevel")]
        public int? StressLevel { get; set; } // 1-5: 1=very low, 5=very high

        [JsonProperty("hasBlocker")]
        public bool HasBlocker { get; set; }

        [JsonProperty("blockerDetails")]
        public string BlockerDetails { get; set; }

        [JsonProperty("needSupport")]
        public bool NeedSupport { get; set; }

        [JsonProperty("supportDetails")]
        public string SupportDetails { get; set; }

        [JsonProperty("aiAdvice")]
        public string AiAdvice { get; set; }

        [JsonProperty("managerComment")]
        public string ManagerComment { get; set; }

        [JsonProperty("managerId")]
        public int? ManagerId { get; set; }

        [JsonProperty("commentedAt")]
        public DateTime? CommentedAt { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public DateTime? UpdatedAt { get; set; }

        // 追加情報（JOIN結果用）
        [JsonProperty("managerName")]
        public string ManagerName { get; set; }
    }

    /// <summary>
    /// メンタルヘルスログ作成用リクエスト
    /// </summary>
    public class CreateMentalHealthLogRequest
    {
        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("reportDate")]
        public string ReportDate { get; set; }

        [JsonProperty("mood")]
        public int? Mood { get; set; }

        [JsonProperty("stressLevel")]
        public int? StressLevel { get; set; }

        [JsonProperty("hasBlocker")]
        public bool HasBlocker { get; set; }

        [JsonProperty("blockerDetails")]
        public string BlockerDetails { get; set; }

        [JsonProperty("needSupport")]
        public bool NeedSupport { get; set; }

        [JsonProperty("supportDetails")]
        public string SupportDetails { get; set; }
    }

    /// <summary>
    /// メンタルヘルスログ作成レスポンス
    /// </summary>
    public class CreateMentalHealthLogResponse
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("aiAdvice")]
        public string AiAdvice { get; set; }
    }
    
    // APIレスポンス用の中間クラス（snake_caseで返ってくる場合に対応）
    public class CreateMentalHealthLogResult
    {
        public int id { get; set; }
        public string ai_advice { get; set; }
        
        public CreateMentalHealthLogResponse ToResponse()
        {
            return new CreateMentalHealthLogResponse
            {
                Id = id,
                AiAdvice = ai_advice
            };
        }
    }
}
