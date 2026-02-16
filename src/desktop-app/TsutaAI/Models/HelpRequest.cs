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

        // Some AI models return score fields at top-level instead of matchScores.
        [JsonProperty("skillMatchScore")]
        public double? SkillMatchScore { get; set; }

        [JsonProperty("skill_match_score")]
        private double? SkillMatchScoreSnakeCase { set => SkillMatchScore = value; }

        [JsonProperty("availabilityScore")]
        public double? AvailabilityScore { get; set; }

        [JsonProperty("availability_score")]
        private double? AvailabilityScoreSnakeCase { set => AvailabilityScore = value; }

        [JsonProperty("experienceScore")]
        public double? ExperienceScore { get; set; }

        [JsonProperty("experience_score")]
        private double? ExperienceScoreSnakeCase { set => ExperienceScore = value; }

        [JsonProperty("totalMatchScore")]
        public double? TotalMatchScore { get; set; }

        [JsonProperty("total_match_score")]
        private double? TotalMatchScoreSnakeCase { set => TotalMatchScore = value; }

        // Legacy compatibility for older prompt outputs.
        [JsonProperty("overallScore")]
        public double? OverallScore { get; set; }

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

        [JsonIgnore]
        public double EffectiveTotalMatchScore =>
            ResolveEffectiveTotalMatchScore();

        private double ResolveEffectiveTotalMatchScore()
        {
            // Prefer nested score if it looks populated.
            if (MatchScores != null)
            {
                if (MatchScores.TotalMatchScore > 0d)
                {
                    return MatchScores.TotalMatchScore;
                }

                var weightedFromNested =
                    (MatchScores.SkillMatchScore * 0.45d)
                    + (MatchScores.AvailabilityScore * 0.35d)
                    + (MatchScores.ExperienceScore * 0.20d);

                if (weightedFromNested > 0d)
                {
                    return Math.Round(weightedFromNested, 1);
                }
            }

            if (TotalMatchScore.HasValue && TotalMatchScore.Value > 0d)
            {
                return TotalMatchScore.Value;
            }

            if (OverallScore.HasValue && OverallScore.Value > 0d)
            {
                return OverallScore.Value;
            }

            var weightedFromTopLevel =
                ((SkillMatchScore ?? 0d) * 0.45d)
                + ((AvailabilityScore ?? 0d) * 0.35d)
                + ((ExperienceScore ?? 0d) * 0.20d);

            if (weightedFromTopLevel > 0d)
            {
                return Math.Round(weightedFromTopLevel, 1);
            }

            return 0d;
        }
    }

    public class MatchScores
    {
        [JsonProperty("skillMatchScore")]
        public double SkillMatchScore { get; set; }

        [JsonProperty("skill_match_score")]
        private double SkillMatchScoreSnakeCase { set => SkillMatchScore = value; }

        [JsonProperty("availabilityScore")]
        public double AvailabilityScore { get; set; }

        [JsonProperty("availability_score")]
        private double AvailabilityScoreSnakeCase { set => AvailabilityScore = value; }

        [JsonProperty("experienceScore")]
        public double ExperienceScore { get; set; }

        [JsonProperty("experience_score")]
        private double ExperienceScoreSnakeCase { set => ExperienceScore = value; }

        [JsonProperty("totalMatchScore")]
        public double TotalMatchScore { get; set; }

        [JsonProperty("total_match_score")]
        private double TotalMatchScoreSnakeCase { set => TotalMatchScore = value; }
    }
}
