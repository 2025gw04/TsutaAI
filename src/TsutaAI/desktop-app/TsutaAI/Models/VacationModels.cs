using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// 休暇
    /// </summary>
    public class Vacation
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("startDate")]
        public DateTime StartDate { get; set; }

        [JsonProperty("endDate")]
        public DateTime EndDate { get; set; }

        [JsonProperty("vacationType")]
        public string VacationType { get; set; } // 有給休暇, 病気休暇 など

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// 休暇影響分析
    /// </summary>
    public class VacationAnalysis
    {
        [JsonProperty("affectedTasksCount")]
        public int AffectedTasksCount { get; set; }

        [JsonProperty("affectedTasks")]
        public List<TaskItem> AffectedTasks { get; set; }

        [JsonProperty("projectImpacts")]
        public List<ProjectImpact> ProjectImpacts { get; set; }

        [JsonProperty("recommendation")]
        public string Recommendation { get; set; }
    }

    /// <summary>
    /// プロジェクト影響
    /// </summary>
    public class ProjectImpact
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("projectName")]
        public string ProjectName { get; set; }

        [JsonProperty("affectedTasksCount")]
        public int AffectedTasksCount { get; set; }

        [JsonProperty("impactLevel")]
        public string ImpactLevel { get; set; } // low, medium, high
    }
}
