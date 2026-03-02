using System;
using System.Globalization;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// タスク情報を表現するモデルクラスです。
    /// </summary>
    public class TaskItem
    {
        private string _priority = string.Empty;
        private string _status = string.Empty;

        [JsonProperty("id")]
        public int Id { get; set; }

        public int TaskId
        {
            get => Id;
            set => Id = value;
        }

        // backend-apiは"name"フィールドを返す
        [JsonProperty("name")]
        public string Title { get; set; } = string.Empty;

        // "name"がない場合の互換性のため"title"もサポート
        [JsonProperty("title")]
        private string TitleCompat
        {
            set
            {
                if (string.IsNullOrEmpty(Title))
                {
                    Title = value;
                }
            }
        }

        [JsonProperty("description")]
        public string Description { get; set; } = string.Empty;

        [JsonProperty("projectId")]
        public int ProjectId { get; set; }

        [JsonProperty("project_id")]
        private int ProjectIdCompat
        {
            set { if (ProjectId == 0) ProjectId = value; }
        }

        [JsonProperty("projectName")]
        public string ProjectName { get; set; } = string.Empty;

        [JsonProperty("project_name")]
        private string ProjectNameCompat
        {
            set { if (string.IsNullOrEmpty(ProjectName)) ProjectName = value; }
        }

        // backend-apiは"assignedTo"（camelCase）を返す
        [JsonProperty("assignedTo")]
        public int AssigneeUserId { get; set; }

        // 担当者名
        [JsonProperty("assigneeName")]
        public string AssigneeName { get; set; } = string.Empty;

        // "assigned_to"（snake_case）もサポート
        [JsonProperty("assigned_to")]
        private int AssigneeUserIdCompat
        {
            set
            {
                if (AssigneeUserId == 0)
                {
                    AssigneeUserId = value;
                }
            }
        }

        public DateTime? PlannedStart { get; set; }

        public DateTime? PlannedEnd { get; set; }

        public DateTime? ActualStart { get; set; }

        public DateTime? ActualEnd { get; set; }

        // エイリアスプロパティ（他のコードとの互換性のため）
        public DateTime? StartDate
        {
            get => PlannedStart;
            set => PlannedStart = value;
        }

        public DateTime? DueDate
        {
            get => PlannedEnd;
            set => PlannedEnd = value;
        }

        public DateTime? EndDate
        {
            get => ActualEnd;
            set => ActualEnd = value;
        }

        [JsonProperty("estimated_minutes")]
        public int EstimatedMinutes { get; set; }

        // backend-apiは"estimatedHours"を返す
        [JsonProperty("estimatedHours")]
        public double EstimatedHours
        {
            get => EstimatedMinutes > 0 ? EstimatedMinutes / 60.0 : 0;
            set => EstimatedMinutes = (int)Math.Round(value * 60);
        }

        // "estimated_hours"（snake_case）もサポート
        [JsonProperty("estimated_hours")]
        private double EstimatedHoursCompat
        {
            set
            {
                if (EstimatedMinutes == 0)
                {
                    EstimatedMinutes = (int)Math.Round(value * 60);
                }
            }
        }

        // backend-apiは"actualHours"を返す
        [JsonProperty("actualHours")]
        public double ActualHours { get; set; }

        // ActualMinutesプロパティ（ActualHoursから計算）
        public int ActualMinutes
        {
            get => (int)Math.Round(ActualHours * 60);
            set => ActualHours = value / 60.0;
        }

        // "actual_hours"（snake_case）もサポート
        [JsonProperty("actual_hours")]
        private double ActualHoursCompat
        {
            set
            {
                if (ActualHours == 0)
                {
                    ActualHours = value;
                }
            }
        }

        [JsonProperty("parentTaskId")]
        public int? ParentTaskId { get; set; }

        [JsonProperty("parent_task_id")]
        private int? ParentTaskIdCompat
        {
            set { if (ParentTaskId == null) ParentTaskId = value; }
        }

        [JsonProperty("sortOrder")]
        public int SortOrder { get; set; }

        [JsonProperty("sort_order")]
        private int SortOrderCompat
        {
            set { if (SortOrder == 0) SortOrder = value; }
        }

        [JsonProperty("dependencies")]
        public string Dependencies { get; set; } = string.Empty;

        [JsonProperty("taskKey")]
        public string TaskKey { get; set; } = string.Empty;

        [JsonProperty("priority")]
        public string Priority
        {
            get => _priority;
            set => _priority = NormalizePriority(value);
        }

        public int Progress { get; set; }

        public bool IsCompleted { get; set; }

        [JsonProperty("is_completed")]
        private int IsCompletedRaw
        {
            set => IsCompleted = value == 1;
        }

        [JsonProperty("status")]
        public string Status
        {
            get => _status;
            set
            {
                // backend-apiのステータス値を正規化
                _status = NormalizeStatus(value);
                if (!string.IsNullOrEmpty(_status))
                {
                    IsCompleted = string.Equals(_status, "completed", StringComparison.OrdinalIgnoreCase) ||
                                  string.Equals(_status, "done", StringComparison.OrdinalIgnoreCase);
                }
            }
        }

        private static string NormalizeStatus(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "not-started";
            }

            var normalized = value.Trim().ToLowerInvariant();
            switch (normalized)
            {
                // backend-api形式 → desktop-app形式
                case "todo":
                    return "not-started";
                case "in_progress":
                case "in-progress":
                    return "in-progress";
                case "completed":
                case "done":
                    return "done";
                case "cancelled":
                case "on-hold":
                case "on_hold":
                    return "on-hold";
                default:
                    return normalized;
            }
        }

        // 管理者による変更を追跡するためのプロパティ
        [JsonProperty("updated_at")]
        public string UpdatedAt { get; set; }

        // 未読の変更があるかどうか（ローカルでのみ使用）
        [JsonIgnore]
        public bool HasUnreadChanges { get; set; }

        public bool IsCurrent { get; set; }

        [JsonProperty("start_date")]
        private string StartDateRaw
        {
            set => PlannedStart = ParseDate(value);
        }

        [JsonProperty("due_date")]
        private string DueDateRaw
        {
            set => PlannedEnd = ParseDate(value);
        }

        [JsonProperty("end_date")]
        private string EndDateRaw
        {
            set
            {
                // end_dateは計画終了日として扱う（due_dateと同義）
                if (PlannedEnd == null)
                {
                    PlannedEnd = ParseDate(value);
                }
            }
        }

        [JsonProperty("actual_start_date")]
        private string ActualStartDateRaw
        {
            set => ActualStart = ParseDate(value);
        }

        [JsonProperty("actual_end_date")]
        private string ActualEndDateRaw
        {
            set => ActualEnd = ParseDate(value);
        }

        [JsonProperty("deliverable")]
        public string Deliverable { get; set; } = string.Empty;

        private static string NormalizePriority(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "Medium"; // デフォルト値
            }

            var normalized = value.Trim().ToLowerInvariant();
            switch (normalized)
            {
                case "high":
                case "urgent":
                    return "High";
                case "medium":
                case "normal":
                    return "Medium";
                case "low":
                    return "Low";
                default:
                    // 不明な値の場合は最初の文字を大文字に
                    return char.ToUpperInvariant(normalized[0]) + normalized.Substring(1);
            }
        }

        private static DateTime? ParseDate(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var result))
            {
                return result;
            }

            return null;
        }
    }
}
