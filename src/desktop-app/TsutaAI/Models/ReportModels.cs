using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// レポートオプション
    /// </summary>
    public class ReportOptions
    {
        [JsonProperty("startDate")]
        public DateTime? StartDate { get; set; }

        [JsonProperty("endDate")]
        public DateTime? EndDate { get; set; }

        [JsonProperty("includeDetails")]
        public bool IncludeDetails { get; set; }

        [JsonProperty("includeMetrics")]
        public bool IncludeMetrics { get; set; }

        [JsonProperty("includeCharts")]
        public bool IncludeCharts { get; set; }
    }

    /// <summary>
    /// プロジェクトレポート
    /// </summary>
    public class ProjectReport
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("projectName")]
        public string ProjectName { get; set; }

        [JsonProperty("reportDate")]
        public DateTime ReportDate { get; set; }

        [JsonProperty("periodStart")]
        public DateTime PeriodStart { get; set; }

        [JsonProperty("periodEnd")]
        public DateTime PeriodEnd { get; set; }

        [JsonProperty("summary")]
        public ProjectSummaryReport Summary { get; set; }

        [JsonProperty("tasks")]
        public List<TaskReport> Tasks { get; set; }

        [JsonProperty("metrics")]
        public ProjectMetricsReport Metrics { get; set; }

        [JsonProperty("teamPerformance")]
        public List<TeamMemberPerformance> TeamPerformance { get; set; }

        [JsonProperty("risks")]
        public List<string> Risks { get; set; }

        [JsonProperty("recommendations")]
        public List<string> Recommendations { get; set; }
    }

    /// <summary>
    /// プロジェクトサマリーレポート
    /// </summary>
    public class ProjectSummaryReport
    {
        [JsonProperty("totalTasks")]
        public int TotalTasks { get; set; }

        [JsonProperty("completedTasks")]
        public int CompletedTasks { get; set; }

        [JsonProperty("inProgressTasks")]
        public int InProgressTasks { get; set; }

        [JsonProperty("blockedTasks")]
        public int BlockedTasks { get; set; }

        [JsonProperty("overallProgress")]
        public double OverallProgress { get; set; }

        [JsonProperty("healthScore")]
        public int? HealthScore { get; set; }

        [JsonProperty("daysElapsed")]
        public int DaysElapsed { get; set; }

        [JsonProperty("daysRemaining")]
        public int DaysRemaining { get; set; }

        [JsonProperty("isOnTrack")]
        public bool IsOnTrack { get; set; }
    }

    /// <summary>
    /// タスクレポート
    /// </summary>
    public class TaskReport
    {
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("progress")]
        public int Progress { get; set; }

        [JsonProperty("assignedTo")]
        public string AssignedTo { get; set; }

        [JsonProperty("estimatedHours")]
        public double? EstimatedHours { get; set; }

        [JsonProperty("actualHours")]
        public double? ActualHours { get; set; }

        [JsonProperty("dueDate")]
        public DateTime? DueDate { get; set; }

        [JsonProperty("completedDate")]
        public DateTime? CompletedDate { get; set; }

        [JsonProperty("isDelayed")]
        public bool IsDelayed { get; set; }
    }

    /// <summary>
    /// プロジェクトメトリクスレポート
    /// </summary>
    public class ProjectMetricsReport
    {
        [JsonProperty("completionRate")]
        public double CompletionRate { get; set; }

        [JsonProperty("averageVelocity")]
        public double AverageVelocity { get; set; }

        [JsonProperty("totalWorkHours")]
        public double TotalWorkHours { get; set; }

        [JsonProperty("averageTaskDuration")]
        public double AverageTaskDuration { get; set; }

        [JsonProperty("delayedTasksPercentage")]
        public double DelayedTasksPercentage { get; set; }

        [JsonProperty("blockerCount")]
        public int BlockerCount { get; set; }

        [JsonProperty("teamMoraleScore")]
        public double? TeamMoraleScore { get; set; }
    }

    /// <summary>
    /// チームメンバーパフォーマンス
    /// </summary>
    public class TeamMemberPerformance
    {
        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("userName")]
        public string UserName { get; set; }

        [JsonProperty("completedTasks")]
        public int CompletedTasks { get; set; }

        [JsonProperty("totalWorkHours")]
        public double TotalWorkHours { get; set; }

        [JsonProperty("averageTaskCompletionTime")]
        public double AverageTaskCompletionTime { get; set; }

        [JsonProperty("velocity")]
        public double Velocity { get; set; }

        [JsonProperty("contributionPercentage")]
        public double ContributionPercentage { get; set; }
    }

    /// <summary>
    /// 全プロジェクトレポート
    /// </summary>
    public class AllProjectsReport
    {
        [JsonProperty("reportDate")]
        public DateTime ReportDate { get; set; }

        [JsonProperty("periodStart")]
        public DateTime PeriodStart { get; set; }

        [JsonProperty("periodEnd")]
        public DateTime PeriodEnd { get; set; }

        [JsonProperty("totalProjects")]
        public int TotalProjects { get; set; }

        [JsonProperty("activeProjects")]
        public int ActiveProjects { get; set; }

        [JsonProperty("completedProjects")]
        public int CompletedProjects { get; set; }

        [JsonProperty("projects")]
        public List<ProjectReport> Projects { get; set; }

        [JsonProperty("overallMetrics")]
        public ProjectMetricsReport OverallMetrics { get; set; }

        [JsonProperty("topPerformers")]
        public List<TeamMemberPerformance> TopPerformers { get; set; }

        [JsonProperty("risks")]
        public List<string> Risks { get; set; }
    }

    /// <summary>
    /// ユーザー作業レポート
    /// </summary>
    public class UserWorkReport
    {
        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("userName")]
        public string UserName { get; set; }

        [JsonProperty("reportDate")]
        public DateTime ReportDate { get; set; }

        [JsonProperty("periodStart")]
        public DateTime PeriodStart { get; set; }

        [JsonProperty("periodEnd")]
        public DateTime PeriodEnd { get; set; }

        [JsonProperty("completedTasks")]
        public int CompletedTasks { get; set; }

        [JsonProperty("totalWorkHours")]
        public double TotalWorkHours { get; set; }

        [JsonProperty("projects")]
        public List<UserProjectWork> Projects { get; set; }

        [JsonProperty("skills")]
        public List<string> Skills { get; set; }

        [JsonProperty("contributions")]
        public List<string> Contributions { get; set; }

        [JsonProperty("performance")]
        public UserPerformanceMetrics Performance { get; set; }
    }

    /// <summary>
    /// ユーザープロジェクト作業
    /// </summary>
    public class UserProjectWork
    {
        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("projectName")]
        public string ProjectName { get; set; }

        [JsonProperty("tasksCompleted")]
        public int TasksCompleted { get; set; }

        [JsonProperty("workHours")]
        public double WorkHours { get; set; }

        [JsonProperty("contributionPercentage")]
        public double ContributionPercentage { get; set; }
    }

    /// <summary>
    /// ユーザーパフォーマンスメトリクス
    /// </summary>
    public class UserPerformanceMetrics
    {
        [JsonProperty("averageVelocity")]
        public double AverageVelocity { get; set; }

        [JsonProperty("averageTaskCompletionTime")]
        public double AverageTaskCompletionTime { get; set; }

        [JsonProperty("qualityScore")]
        public double? QualityScore { get; set; }

        [JsonProperty("focusLevelAvg")]
        public double? FocusLevelAvg { get; set; }

        [JsonProperty("helpCount")]
        public int HelpCount { get; set; }
    }
}
