using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// 進捗予測
    /// </summary>
    public class ProgressPrediction
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("predictionDate")]
        public DateTime PredictionDate { get; set; }

        [JsonProperty("currentProgress")]
        public int CurrentProgress { get; set; } // 0-100

        [JsonProperty("predictedCompletionDate")]
        public DateTime? PredictedCompletionDate { get; set; }

        [JsonProperty("completionProbability")]
        public double? CompletionProbability { get; set; } // 0.0-1.0

        [JsonProperty("riskLevel")]
        public string RiskLevel { get; set; } // low, medium, high

        [JsonProperty("avgActivityScore")]
        public double? AvgActivityScore { get; set; }

        [JsonProperty("totalWorkHours")]
        public double? TotalWorkHours { get; set; }

        [JsonProperty("dailyProgressRate")]
        public double? DailyProgressRate { get; set; }

        [JsonProperty("aiSuggestion")]
        public string AiSuggestion { get; set; }

        [JsonProperty("bottleneckAnalysis")]
        public string BottleneckAnalysis { get; set; }

        [JsonProperty("resourceRecommendation")]
        public string ResourceRecommendation { get; set; }

        [JsonProperty("confidenceScore")]
        public double? ConfidenceScore { get; set; } // 0.0-1.0

        [JsonProperty("isOnTrack")]
        public bool? IsOnTrack { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// プロジェクト進捗予測サマリー
    /// </summary>
    public class ProjectPredictionSummary
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("totalTasks")]
        public int TotalTasks { get; set; }

        [JsonProperty("completedTasks")]
        public int CompletedTasks { get; set; }

        [JsonProperty("onTrackTasks")]
        public int OnTrackTasks { get; set; }

        [JsonProperty("atRiskTasks")]
        public int AtRiskTasks { get; set; }

        [JsonProperty("delayedTasks")]
        public int DelayedTasks { get; set; }

        [JsonProperty("overallCompletionProbability")]
        public double? OverallCompletionProbability { get; set; }

        [JsonProperty("predictedCompletionDate")]
        public DateTime? PredictedCompletionDate { get; set; }

        [JsonProperty("plannedCompletionDate")]
        public DateTime? PlannedCompletionDate { get; set; }

        [JsonProperty("delayDays")]
        public int? DelayDays { get; set; }

        [JsonProperty("highRiskTaskIds")]
        public List<int> HighRiskTaskIds { get; set; }

        [JsonProperty("recommendations")]
        public List<string> Recommendations { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// 納期分析
    /// </summary>
    public class DeadlineAnalysis
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("analysisDate")]
        public DateTime AnalysisDate { get; set; }

        [JsonProperty("plannedEndDate")]
        public DateTime PlannedEndDate { get; set; }

        [JsonProperty("predictedEndDate")]
        public DateTime? PredictedEndDate { get; set; }

        [JsonProperty("daysUntilDeadline")]
        public int DaysUntilDeadline { get; set; }

        [JsonProperty("delayRisk")]
        public string DelayRisk { get; set; } // low, medium, high, critical

        [JsonProperty("confidenceLevel")]
        public double? ConfidenceLevel { get; set; } // 0.0-1.0

        [JsonProperty("completionProbability")]
        public double? CompletionProbability { get; set; } // 0.0-1.0

        [JsonProperty("criticalTasks")]
        public List<TaskPredictionInfo> CriticalTasks { get; set; }

        [JsonProperty("bottlenecks")]
        public List<string> Bottlenecks { get; set; }

        [JsonProperty("recommendations")]
        public List<string> Recommendations { get; set; }

        [JsonProperty("requiredVelocityIncrease")]
        public double? RequiredVelocityIncrease { get; set; }

        [JsonProperty("additionalResourcesNeeded")]
        public int? AdditionalResourcesNeeded { get; set; }

        [JsonProperty("feasibilityScore")]
        public double? FeasibilityScore { get; set; } // 0.0-1.0

        [JsonProperty("aiAnalysis")]
        public string AiAnalysis { get; set; }
    }

    /// <summary>
    /// タスク予測情報
    /// </summary>
    public class TaskPredictionInfo
    {
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("taskTitle")]
        public string TaskTitle { get; set; }

        [JsonProperty("assignedTo")]
        public int? AssignedTo { get; set; }

        [JsonProperty("currentProgress")]
        public int CurrentProgress { get; set; }

        [JsonProperty("predictedCompletionDate")]
        public DateTime? PredictedCompletionDate { get; set; }

        [JsonProperty("riskLevel")]
        public string RiskLevel { get; set; }

        [JsonProperty("isBlocking")]
        public bool IsBlocking { get; set; }

        [JsonProperty("blockedTasksCount")]
        public int BlockedTasksCount { get; set; }
    }
}
