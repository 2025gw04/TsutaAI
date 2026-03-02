using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// スキル成長履歴
    /// </summary>
    public class SkillGrowthHistory
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("skillName")]
        public string SkillName { get; set; }

        [JsonProperty("skillLevel")]
        public int SkillLevel { get; set; }

        [JsonProperty("recordedDate")]
        public DateTime RecordedDate { get; set; }

        [JsonProperty("changeReason")]
        public string ChangeReason { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// パフォーマンスメトリクス
    /// </summary>
    public class PerformanceMetrics
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("metricDate")]
        public DateTime MetricDate { get; set; }

        [JsonProperty("taskCompletionRate")]
        public double? TaskCompletionRate { get; set; }

        [JsonProperty("bugRate")]
        public double? BugRate { get; set; }

        [JsonProperty("helpCount")]
        public int? HelpCount { get; set; }

        [JsonProperty("focusLevelAvg")]
        public double? FocusLevelAvg { get; set; }

        [JsonProperty("tasksCompleted")]
        public int? TasksCompleted { get; set; }

        [JsonProperty("tasksTotal")]
        public int? TasksTotal { get; set; }

        [JsonProperty("estimatedVsActualRatio")]
        public double? EstimatedVsActualRatio { get; set; }

        [JsonProperty("avgTaskDurationHours")]
        public double? AvgTaskDurationHours { get; set; }

        [JsonProperty("teamAvgDurationHours")]
        public double? TeamAvgDurationHours { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// メンバー貢献記録
    /// </summary>
    public class MemberContribution
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("contributionDate")]
        public DateTime ContributionDate { get; set; }

        [JsonProperty("contributionType")]
        public string ContributionType { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("impactLevel")]
        public string ImpactLevel { get; set; }

        [JsonProperty("projectId")]
        public int? ProjectId { get; set; }

        [JsonProperty("taskId")]
        public int? TaskId { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// 成長目標
    /// </summary>
    public class GrowthGoal
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("goalTitle")]
        public string GoalTitle { get; set; }

        [JsonProperty("goalDescription")]
        public string GoalDescription { get; set; }

        [JsonProperty("targetSkill")]
        public string TargetSkill { get; set; }

        [JsonProperty("targetLevel")]
        public int? TargetLevel { get; set; }

        [JsonProperty("estimatedDurationWeeks")]
        public int? EstimatedDurationWeeks { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("progress")]
        public int Progress { get; set; }

        [JsonProperty("aiGenerated")]
        public bool AiGenerated { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public DateTime UpdatedAt { get; set; }

        [JsonProperty("completedAt")]
        public DateTime? CompletedAt { get; set; }
    }

    /// <summary>
    /// 成長レポート
    /// </summary>
    public class GrowthReport
    {
        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("skillGrowth")]
        public SkillGrowthData SkillGrowth { get; set; }

        [JsonProperty("performanceMetrics")]
        public List<PerformanceMetrics> PerformanceMetrics { get; set; }

        [JsonProperty("contributions")]
        public List<MemberContribution> Contributions { get; set; }

        [JsonProperty("goals")]
        public List<GrowthGoal> Goals { get; set; }
    }

    public class SkillGrowthData
    {
        [JsonProperty("history")]
        public List<SkillGrowthHistory> History { get; set; }
    }

    /// <summary>
    /// 強み分析結果
    /// </summary>
    public class StrengthsAnalysis
    {
        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("topStrengths")]
        public List<StrengthItem> TopStrengths { get; set; }

        [JsonProperty("summary")]
        public string Summary { get; set; }

        [JsonProperty("recommendations")]
        public List<string> Recommendations { get; set; }
    }

    /// <summary>
    /// 強み項目
    /// </summary>
    public class StrengthItem
    {
        [JsonProperty("skillName")]
        public string SkillName { get; set; }

        [JsonProperty("level")]
        public int Level { get; set; }

        [JsonProperty("evidence")]
        public string Evidence { get; set; }

        [JsonProperty("score")]
        public double Score { get; set; }
    }

    /// <summary>
    /// 成長機会
    /// </summary>
    public class GrowthOpportunity
    {
        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("skillToImprove")]
        public string SkillToImprove { get; set; }

        [JsonProperty("currentLevel")]
        public int CurrentLevel { get; set; }

        [JsonProperty("targetLevel")]
        public int TargetLevel { get; set; }

        [JsonProperty("estimatedWeeks")]
        public int EstimatedWeeks { get; set; }

        [JsonProperty("reasoning")]
        public string Reasoning { get; set; }

        [JsonProperty("priority")]
        public string Priority { get; set; }
    }

    /// <summary>
    /// 目標提案
    /// </summary>
    public class GoalSuggestion
    {
        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("targetSkill")]
        public string TargetSkill { get; set; }

        [JsonProperty("targetLevel")]
        public int TargetLevel { get; set; }

        [JsonProperty("estimatedDurationWeeks")]
        public int EstimatedDurationWeeks { get; set; }

        [JsonProperty("reasoning")]
        public string Reasoning { get; set; }

        [JsonProperty("milestones")]
        public List<string> Milestones { get; set; }
    }

    /// <summary>
    /// 1on1レポート
    /// </summary>
    public class OneOnOneReport
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

        [JsonProperty("accomplishments")]
        public List<string> Accomplishments { get; set; }

        [JsonProperty("challenges")]
        public List<string> Challenges { get; set; }

        [JsonProperty("skillProgress")]
        public List<SkillProgressItem> SkillProgress { get; set; }

        [JsonProperty("performanceSummary")]
        public string PerformanceSummary { get; set; }

        [JsonProperty("suggestedDiscussionPoints")]
        public List<string> SuggestedDiscussionPoints { get; set; }

        [JsonProperty("careerDevelopmentNotes")]
        public string CareerDevelopmentNotes { get; set; }
    }

    /// <summary>
    /// スキル進捗項目
    /// </summary>
    public class SkillProgressItem
    {
        [JsonProperty("skillName")]
        public string SkillName { get; set; }

        [JsonProperty("previousLevel")]
        public int PreviousLevel { get; set; }

        [JsonProperty("currentLevel")]
        public int CurrentLevel { get; set; }

        [JsonProperty("change")]
        public int Change { get; set; }

        [JsonProperty("notes")]
        public string Notes { get; set; }
    }

    /// <summary>
    /// 評価シート
    /// </summary>
    public class EvaluationSheet
    {
        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("userName")]
        public string UserName { get; set; }

        [JsonProperty("evaluationDate")]
        public DateTime EvaluationDate { get; set; }

        [JsonProperty("periodStart")]
        public DateTime PeriodStart { get; set; }

        [JsonProperty("periodEnd")]
        public DateTime PeriodEnd { get; set; }

        [JsonProperty("overallRating")]
        public double OverallRating { get; set; }

        [JsonProperty("technicalSkillsRating")]
        public double TechnicalSkillsRating { get; set; }

        [JsonProperty("collaborationRating")]
        public double CollaborationRating { get; set; }

        [JsonProperty("productivityRating")]
        public double ProductivityRating { get; set; }

        [JsonProperty("keyAccomplishments")]
        public List<string> KeyAccomplishments { get; set; }

        [JsonProperty("areasForImprovement")]
        public List<string> AreasForImprovement { get; set; }

        [JsonProperty("skillAssessment")]
        public List<SkillAssessmentItem> SkillAssessment { get; set; }

        [JsonProperty("goalsForNextPeriod")]
        public List<string> GoalsForNextPeriod { get; set; }

        [JsonProperty("managerComments")]
        public string ManagerComments { get; set; }
    }

    /// <summary>
    /// スキル評価項目
    /// </summary>
    public class SkillAssessmentItem
    {
        [JsonProperty("skillName")]
        public string SkillName { get; set; }

        [JsonProperty("level")]
        public int Level { get; set; }

        [JsonProperty("rating")]
        public double Rating { get; set; }

        [JsonProperty("comments")]
        public string Comments { get; set; }
    }

    /// <summary>
    /// 成長分析リクエスト
    /// </summary>
    public class GrowthAnalysisRequest
    {
        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("months")]
        public int Months { get; set; }
    }
}
