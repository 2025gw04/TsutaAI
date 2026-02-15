using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// ヘルプリクエストを表すモデルクラス
    /// </summary>
    public class HelpRequest
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("requesterId")]
        public int RequesterId { get; set; }

        [JsonProperty("requestTitle")]
        public string RequestTitle { get; set; }

        [JsonProperty("requestDescription")]
        public string RequestDescription { get; set; }

        [JsonProperty("urgency")]
        public string Urgency { get; set; } // low, medium, high, critical

        [JsonProperty("aiContextSummary")]
        public string AiContextSummary { get; set; }

        [JsonProperty("problemType")]
        public string ProblemType { get; set; }

        [JsonProperty("detectedIssues")]
        public string DetectedIssues { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // open, assigned, in_progress, resolved, cancelled

        [JsonProperty("assignedTo")]
        public int? AssignedTo { get; set; }

        [JsonProperty("assignedAt")]
        public DateTime? AssignedAt { get; set; }

        [JsonProperty("resolvedAt")]
        public DateTime? ResolvedAt { get; set; }

        [JsonProperty("resolutionNotes")]
        public string ResolutionNotes { get; set; }

        [JsonProperty("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public DateTime? UpdatedAt { get; set; }

        // 追加情報（JOIN結果用）
        [JsonProperty("taskName")]
        public string TaskName { get; set; }

        [JsonProperty("requesterName")]
        public string RequesterName { get; set; }

        [JsonProperty("helperName")]
        public string HelperName { get; set; }
    }

    /// <summary>
    /// ヘルプリクエスト作成用リクエスト
    /// </summary>
    public class CreateHelpRequestRequest
    {
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("requesterId")]
        public int RequesterId { get; set; }

        [JsonProperty("requestTitle")]
        public string RequestTitle { get; set; }

        [JsonProperty("requestDescription")]
        public string RequestDescription { get; set; }

        [JsonProperty("urgency")]
        public string Urgency { get; set; } = "medium";

        [JsonProperty("generateContext")]
        public bool GenerateContext { get; set; } = true;

        // Preview flow additions
        [JsonProperty("assignedTo")]
        public int? AssignedTo { get; set; }

        [JsonProperty("generateSuggestions")]
        public bool GenerateSuggestions { get; set; } = false;

        [JsonProperty("aiContextSummary")]
        public string AiContextSummary { get; set; }

        [JsonProperty("problemType")]
        public string ProblemType { get; set; }

        [JsonProperty("detectedIssues")]
        public string DetectedIssues { get; set; }
    }

    public class PreviewHelpRequestResponse
    {
        [JsonProperty("aiContext")]
        public AiContext AiContext { get; set; }

        [JsonProperty("suggestions")]
        public List<HelperSuggestion> Suggestions { get; set; }
    }

    public class AiContext
    {
        [JsonProperty("contextSummary")]
        public string ContextSummary { get; set; }

        [JsonProperty("problemType")]
        public string ProblemType { get; set; }

        [JsonProperty("detectedIssues")]
        public string DetectedIssues { get; set; }
    }

    /// <summary>
    /// ヘルパー推奨情報
    /// </summary>
    public class HelperSuggestion
    {
        [JsonProperty("userId")]
        public int UserId { get; set; }

        [JsonProperty("fullName")]
        public string FullName { get; set; }

        [JsonProperty("username")]
        public string Username { get; set; }

        [JsonProperty("matchScores")]
        public MatchScores MatchScores { get; set; }

        [JsonProperty("suggestionRank")]
        public int SuggestionRank { get; set; }

        [JsonProperty("reasoning")]
        public string Reasoning { get; set; }

        [JsonProperty("recommendedApproach")]
        public string RecommendedApproach { get; set; }

        [JsonProperty("strengths")]
        public List<string> Strengths { get; set; }

        [JsonProperty("potentialConcerns")]
        public List<string> PotentialConcerns { get; set; }

        [JsonProperty("recommendationLevel")]
        public string RecommendationLevel { get; set; }
    }

    public class MatchScores
    {
        [JsonProperty("skillMatchScore")]
        public double SkillMatchScore { get; set; }

        [JsonProperty("availabilityScore")]
        public double AvailabilityScore { get; set; }

        [JsonProperty("experienceScore")]
        public double ExperienceScore { get; set; }

        [JsonProperty("totalMatchScore")]
        public double TotalMatchScore { get; set; }
    }
}
