using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// プロジェクトヘルススコア
    /// </summary>
    public class ProjectHealthScore
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("healthScore")]
        public int HealthScore { get; set; } // 0-100

        [JsonProperty("scoreDate")]
        public DateTime ScoreDate { get; set; }

        [JsonProperty("progressScore")]
        public int? ProgressScore { get; set; }

        [JsonProperty("deadlineScore")]
        public int? DeadlineScore { get; set; }

        [JsonProperty("teamMoraleScore")]
        public int? TeamMoraleScore { get; set; }

        [JsonProperty("blockerScore")]
        public int? BlockerScore { get; set; }

        [JsonProperty("velocityScore")]
        public int? VelocityScore { get; set; }

        [JsonProperty("aiAnalysis")]
        public string AiAnalysis { get; set; }

        [JsonProperty("riskFactors")]
        public string RiskFactors { get; set; }

        [JsonProperty("recommendations")]
        public string Recommendations { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// バーンダウンデータ
    /// </summary>
    public class BurndownData
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("date")]
        public DateTime Date { get; set; }

        [JsonProperty("plannedRemainingTasks")]
        public int? PlannedRemainingTasks { get; set; }

        [JsonProperty("plannedRemainingHours")]
        public double? PlannedRemainingHours { get; set; }

        [JsonProperty("actualRemainingTasks")]
        public int? ActualRemainingTasks { get; set; }

        [JsonProperty("actualRemainingHours")]
        public double? ActualRemainingHours { get; set; }

        [JsonProperty("completedTasksCount")]
        public int? CompletedTasksCount { get; set; }

        [JsonProperty("completedHours")]
        public double? CompletedHours { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// クリティカルパスタスク
    /// </summary>
    public class CriticalPathTask
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("analysisDate")]
        public DateTime AnalysisDate { get; set; }

        [JsonProperty("isCritical")]
        public bool IsCritical { get; set; }

        [JsonProperty("slackDays")]
        public int? SlackDays { get; set; }

        [JsonProperty("earliestStart")]
        public DateTime? EarliestStart { get; set; }

        [JsonProperty("latestStart")]
        public DateTime? LatestStart { get; set; }

        [JsonProperty("earliestFinish")]
        public DateTime? EarliestFinish { get; set; }

        [JsonProperty("latestFinish")]
        public DateTime? LatestFinish { get; set; }

        [JsonProperty("blockingTaskCount")]
        public int? BlockingTaskCount { get; set; }

        [JsonProperty("blockedByCount")]
        public int? BlockedByCount { get; set; }

        [JsonProperty("dependencyChainLength")]
        public int? DependencyChainLength { get; set; }

        [JsonProperty("impactAnalysis")]
        public string ImpactAnalysis { get; set; }

        [JsonProperty("riskAssessment")]
        public string RiskAssessment { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// クリティカルパス分析
    /// </summary>
    public class CriticalPathAnalysis
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("analysisDate")]
        public DateTime AnalysisDate { get; set; }

        [JsonProperty("criticalTasks")]
        public List<CriticalPathTask> CriticalTasks { get; set; }

        [JsonProperty("totalCriticalTasks")]
        public int TotalCriticalTasks { get; set; }

        [JsonProperty("longestPathDays")]
        public int LongestPathDays { get; set; }

        [JsonProperty("projectEndDate")]
        public DateTime? ProjectEndDate { get; set; }

        [JsonProperty("risks")]
        public List<string> Risks { get; set; }

        [JsonProperty("recommendations")]
        public List<string> Recommendations { get; set; }
    }
}
