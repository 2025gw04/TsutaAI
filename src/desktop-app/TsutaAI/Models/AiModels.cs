using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// WBS生成リクエスト
    /// </summary>
    public class WbsRequest
    {
        [JsonProperty("projectName")]
        public string ProjectName { get; set; }

        [JsonProperty("projectDescription")]
        public string ProjectDescription { get; set; }

        [JsonProperty("startDate")]
        public DateTime StartDate { get; set; }

        [JsonProperty("endDate")]
        public DateTime EndDate { get; set; }
    }

    /// <summary>
    /// WBS生成結果
    /// </summary>
    public class WbsResult
    {
        [JsonProperty("wbs")]
        public List<TaskItem> Wbs { get; set; }
    }

    /// <summary>
    /// タスク分解リクエスト
    /// </summary>
    public class TaskDecomposeRequest
    {
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("taskTitle")]
        public string TaskTitle { get; set; }

        [JsonProperty("taskDescription")]
        public string TaskDescription { get; set; }

        [JsonProperty("numberOfSubtasks")]
        public int NumberOfSubtasks { get; set; }
    }

    /// <summary>
    /// WBS精緻化リクエスト
    /// </summary>
    public class WbsRefineRequest
    {
        [JsonProperty("tasks")]
        public List<TaskItem> Tasks { get; set; }

        [JsonProperty("focusArea")]
        public string FocusArea { get; set; }
    }

    /// <summary>
    /// WBS精緻化結果
    /// </summary>
    public class WbsRefineResult
    {
        [JsonProperty("refinedTasks")]
        public List<TaskItem> RefinedTasks { get; set; }

        [JsonProperty("suggestions")]
        public List<string> Suggestions { get; set; }
    }

    /// <summary>
    /// WBSサニティチェック結果
    /// </summary>
    public class SanityCheckResult
    {
        [JsonProperty("isValid")]
        public bool IsValid { get; set; }

        [JsonProperty("issues")]
        public List<SanityCheckIssue> Issues { get; set; }

        [JsonProperty("warnings")]
        public List<string> Warnings { get; set; }

        [JsonProperty("score")]
        public int Score { get; set; }
    }

    /// <summary>
    /// サニティチェックの問題
    /// </summary>
    public class SanityCheckIssue
    {
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("taskTitle")]
        public string TaskTitle { get; set; }

        [JsonProperty("severity")]
        public string Severity { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }
    }

    /// <summary>
    /// プロジェクトサマリー
    /// </summary>
    public class ProjectSummary
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("progressPercentage")]
        public int ProgressPercentage { get; set; }

        [JsonProperty("currentPhase")]
        public string CurrentPhase { get; set; }

        [JsonProperty("summaryText")]
        public string SummaryText { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// ダッシュボードアラート
    /// </summary>
    public class DashboardAlert
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("severity")]
        public string Severity { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// センチメント分析結果
    /// </summary>
    public class SentimentAnalysis
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("overallScore")]
        public double OverallScore { get; set; }

        [JsonProperty("summary")]
        public string Summary { get; set; }

        [JsonProperty("positiveKeywords")]
        public string PositiveKeywords { get; set; }

        [JsonProperty("negativeKeywords")]
        public string NegativeKeywords { get; set; }

        [JsonProperty("commentsJson")]
        public string CommentsJson { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// センチメント分析リクエスト
    /// </summary>
    public class SentimentAnalysisRequest
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("days")]
        public int Days { get; set; }
    }

    /// <summary>
    /// タスク提案
    /// </summary>
    public class TaskSuggestion
    {
        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("priority")]
        public string Priority { get; set; }

        [JsonProperty("estimatedHours")]
        public int EstimatedHours { get; set; }

        [JsonProperty("suggestedAssignee")]
        public int? SuggestedAssignee { get; set; }

        [JsonProperty("reasoning")]
        public string Reasoning { get; set; }
    }

    /// <summary>
    /// リスク検出結果
    /// </summary>
    public class RiskDetection
    {
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("taskTitle")]
        public string TaskTitle { get; set; }

        [JsonProperty("riskLevel")]
        public string RiskLevel { get; set; }

        [JsonProperty("riskType")]
        public string RiskType { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("mitigation")]
        public string Mitigation { get; set; }

        [JsonProperty("impact")]
        public string Impact { get; set; }
    }

    /// <summary>
    /// リスケジュール提案リクエスト
    /// </summary>
    public class RescheduleRequest
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("constraints")]
        public List<string> Constraints { get; set; }
    }

    /// <summary>
    /// リスケジュール提案
    /// </summary>
    public class RescheduleProposal
    {
        [JsonProperty("taskChanges")]
        public List<TaskReschedule> TaskChanges { get; set; }

        [JsonProperty("summary")]
        public string Summary { get; set; }

        [JsonProperty("impact")]
        public string Impact { get; set; }

        [JsonProperty("newDeadline")]
        public DateTime? NewDeadline { get; set; }
    }

    /// <summary>
    /// タスクのリスケジュール詳細
    /// </summary>
    public class TaskReschedule
    {
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("taskTitle")]
        public string TaskTitle { get; set; }

        [JsonProperty("oldStartDate")]
        public DateTime OldStartDate { get; set; }

        [JsonProperty("newStartDate")]
        public DateTime NewStartDate { get; set; }

        [JsonProperty("oldEndDate")]
        public DateTime OldEndDate { get; set; }

        [JsonProperty("newEndDate")]
        public DateTime NewEndDate { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }
    }

    /// <summary>
    /// 自動タスク割り当てリクエスト
    /// </summary>
    public class AutoAssignRequest
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("taskIds")]
        public List<int> TaskIds { get; set; }
    }

    /// <summary>
    /// 自動タスク割り当て結果
    /// </summary>
    public class AutoAssignResult
    {
        [JsonProperty("assignments")]
        public List<TaskAssignment> Assignments { get; set; }

        [JsonProperty("reasoning")]
        public string Reasoning { get; set; }

        [JsonProperty("workloadBalance")]
        public Dictionary<int, int> WorkloadBalance { get; set; }
    }

    /// <summary>
    /// タスク割り当て
    /// </summary>
    public class TaskAssignment
    {
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("taskTitle")]
        public string TaskTitle { get; set; }

        [JsonProperty("assignedTo")]
        public int AssignedTo { get; set; }

        [JsonProperty("assignedToName")]
        public string AssignedToName { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("confidence")]
        public double Confidence { get; set; }
    }

    /// <summary>
    /// 自動期間調整リクエスト
    /// </summary>
    public class AutoDurationRequest
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("taskIds")]
        public List<int> TaskIds { get; set; }
    }

    /// <summary>
    /// 自動期間調整結果
    /// </summary>
    public class AutoDurationResult
    {
        [JsonProperty("adjustments")]
        public List<DurationAdjustment> Adjustments { get; set; }

        [JsonProperty("reasoning")]
        public string Reasoning { get; set; }
    }

    /// <summary>
    /// 期間調整
    /// </summary>
    public class DurationAdjustment
    {
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("taskTitle")]
        public string TaskTitle { get; set; }

        [JsonProperty("oldEstimatedHours")]
        public int OldEstimatedHours { get; set; }

        [JsonProperty("newEstimatedHours")]
        public int NewEstimatedHours { get; set; }

        [JsonProperty("reason")]
        public string Reason { get; set; }

        [JsonProperty("confidence")]
        public double Confidence { get; set; }
    }

    /// <summary>
    /// プロジェクトフィールド生成リクエスト
    /// </summary>
    public class GenerateProjectFieldsRequest
    {
        [JsonProperty("projectName")]
        public string ProjectName { get; set; }

        [JsonProperty("projectDescription")]
        public string ProjectDescription { get; set; }
    }

    /// <summary>
    /// プロジェクトフィールド生成結果
    /// </summary>
    public class GenerateProjectFieldsResult
    {
        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("suggestedStartDate")]
        public DateTime? SuggestedStartDate { get; set; }

        [JsonProperty("suggestedEndDate")]
        public DateTime? SuggestedEndDate { get; set; }

        [JsonProperty("suggestedMilestones")]
        public List<string> SuggestedMilestones { get; set; }
    }

    /// <summary>
    /// アラート生成リクエスト
    /// </summary>
    public class GenerateAlertsRequest
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }
    }

    /// <summary>
    /// アラート生成結果
    /// </summary>
    public class GenerateAlertsResult
    {
        [JsonProperty("alerts")]
        public List<DashboardAlert> Alerts { get; set; }
    }
}
