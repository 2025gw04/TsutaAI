using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// スプリント
    /// </summary>
    public class Sprint
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("sprintName")]
        public string SprintName { get; set; }

        [JsonProperty("sprintNumber")]
        public int? SprintNumber { get; set; }

        [JsonProperty("startDate")]
        public DateTime StartDate { get; set; }

        [JsonProperty("endDate")]
        public DateTime EndDate { get; set; }

        [JsonProperty("goalDescription")]
        public string GoalDescription { get; set; }

        [JsonProperty("targetStoryPoints")]
        public int? TargetStoryPoints { get; set; }

        [JsonProperty("targetTaskCount")]
        public int? TargetTaskCount { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // planning, active, completed, cancelled

        [JsonProperty("actualStoryPoints")]
        public int? ActualStoryPoints { get; set; }

        [JsonProperty("actualTaskCount")]
        public int? ActualTaskCount { get; set; }

        [JsonProperty("completedStoryPoints")]
        public int? CompletedStoryPoints { get; set; }

        [JsonProperty("completedTaskCount")]
        public int? CompletedTaskCount { get; set; }

        [JsonProperty("achievabilityScore")]
        public double? AchievabilityScore { get; set; }

        [JsonProperty("aiAnalysis")]
        public string AiAnalysis { get; set; }

        [JsonProperty("createdBy")]
        public int? CreatedBy { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// スプリント進捗
    /// </summary>
    public class SprintProgress
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("sprintId")]
        public int SprintId { get; set; }

        [JsonProperty("progressDate")]
        public DateTime ProgressDate { get; set; }

        [JsonProperty("completedStoryPoints")]
        public int? CompletedStoryPoints { get; set; }

        [JsonProperty("completedTasks")]
        public int? CompletedTasks { get; set; }

        [JsonProperty("remainingStoryPoints")]
        public int? RemainingStoryPoints { get; set; }

        [JsonProperty("remainingTasks")]
        public int? RemainingTasks { get; set; }

        [JsonProperty("dailyVelocity")]
        public double? DailyVelocity { get; set; }

        [JsonProperty("momentumScore")]
        public double? MomentumScore { get; set; }

        [JsonProperty("trend")]
        public string Trend { get; set; } // accelerating, steady, slowing, stalled

        [JsonProperty("predictedCompletionDate")]
        public DateTime? PredictedCompletionDate { get; set; }

        [JsonProperty("onTrack")]
        public bool? OnTrack { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// スプリントパフォーマンス
    /// </summary>
    public class SprintPerformance
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("sprintId")]
        public int SprintId { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("completedTasks")]
        public int? CompletedTasks { get; set; }

        [JsonProperty("completedStoryPoints")]
        public int? CompletedStoryPoints { get; set; }

        [JsonProperty("totalWorkHours")]
        public double? TotalWorkHours { get; set; }

        [JsonProperty("avgTaskCompletionTime")]
        public double? AvgTaskCompletionTime { get; set; }

        [JsonProperty("contributionPercentage")]
        public double? ContributionPercentage { get; set; }

        [JsonProperty("velocity")]
        public double? Velocity { get; set; }

        [JsonProperty("reopenedTasks")]
        public int? ReopenedTasks { get; set; }

        [JsonProperty("blockedTasks")]
        public int? BlockedTasks { get; set; }

        [JsonProperty("performanceRank")]
        public int? PerformanceRank { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// スプリント統計
    /// </summary>
    public class SprintStats
    {
        [JsonProperty("sprintId")]
        public int SprintId { get; set; }

        [JsonProperty("totalTasks")]
        public int TotalTasks { get; set; }

        [JsonProperty("completedTasks")]
        public int CompletedTasks { get; set; }

        [JsonProperty("completionRate")]
        public double CompletionRate { get; set; }

        [JsonProperty("totalStoryPoints")]
        public int TotalStoryPoints { get; set; }

        [JsonProperty("completedStoryPoints")]
        public int CompletedStoryPoints { get; set; }

        [JsonProperty("averageVelocity")]
        public double AverageVelocity { get; set; }

        [JsonProperty("teamMembers")]
        public int TeamMembers { get; set; }

        [JsonProperty("daysElapsed")]
        public int DaysElapsed { get; set; }

        [JsonProperty("daysRemaining")]
        public int DaysRemaining { get; set; }

        [JsonProperty("isOnTrack")]
        public bool IsOnTrack { get; set; }
    }

    /// <summary>
    /// スプリント分析
    /// </summary>
    public class SprintAnalysis
    {
        [JsonProperty("sprintId")]
        public int SprintId { get; set; }

        [JsonProperty("achievabilityScore")]
        public double AchievabilityScore { get; set; }

        [JsonProperty("analysis")]
        public string Analysis { get; set; }

        [JsonProperty("risks")]
        public List<string> Risks { get; set; }

        [JsonProperty("recommendations")]
        public List<string> Recommendations { get; set; }

        [JsonProperty("predictedCompletionDate")]
        public DateTime? PredictedCompletionDate { get; set; }

        [JsonProperty("confidenceLevel")]
        public string ConfidenceLevel { get; set; }
    }
}
