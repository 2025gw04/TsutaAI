using System;

namespace TsutaAI.Models
{
    /// <summary>
    /// 作業セッションサマリー（プライバシーに配慮）
    /// プロジェクト/タスク単位の作業記録のみをサーバーに送信
    /// </summary>
    public class WorkSessionSummary
    {
        public int? SessionId { get; set; }
        public int UserId { get; set; }
        public int? ProjectId { get; set; }
        public int? TaskId { get; set; }
        public DateTime SessionStart { get; set; }
        public DateTime SessionEnd { get; set; }
        public int WorkDurationSeconds { get; set; }
        public int ProgressPercentage { get; set; }
        public int CommitsCount { get; set; }
        public int FilesChanged { get; set; }
        public string SessionNotes { get; set; }
        public string SessionType { get; set; } = "work";
        public DateTime CreatedAt { get; set; }

        // AI分析用（詳細データ）
        // これらのデータはサーバー側でAI分析に使用された後、破棄されるか統計情報としてのみ保存されます
        public int MouseClicks { get; set; }
        public int KeyPresses { get; set; }
        public int MouseWheelScrolls { get; set; }
        public string TopWindows { get; set; } // JSON string

        // 表示用プロパティ
        public string ProjectName { get; set; }
        public string TaskTitle { get; set; }
    }
}
