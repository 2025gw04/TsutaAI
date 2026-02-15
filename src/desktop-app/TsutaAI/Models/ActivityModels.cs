using System;
using System.Collections.Generic;

namespace TsutaAI.Models
{
    /// <summary>
    /// アクティブウィンドウセッション
    /// </summary>
    public class ActivitySession
    {
        public int SessionId { get; set; }
        public int UserId { get; set; }
        public string WindowTitle { get; set; }
        public string ProcessName { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime? EndTime { get; set; }
        public int DurationSeconds { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// ファイル差分情報
    /// </summary>
    public class FileDiff
    {
        public int DiffId { get; set; }
        public int UserId { get; set; }
        public string FilePath { get; set; }
        public string ChangeType { get; set; } // 'added', 'modified', 'deleted'
        public string DiffContent { get; set; } // Git diff形式
        public int LinesAdded { get; set; }
        public int LinesRemoved { get; set; }
        public DateTime Timestamp { get; set; }
    }

    /// <summary>
    /// システムパフォーマンス情報
    /// </summary>
    public class SystemPerformance
    {
        public int PerfId { get; set; }
        public int UserId { get; set; }
        public float CpuUsage { get; set; }
        public long MemoryUsageMB { get; set; }
        public DateTime Timestamp { get; set; }
    }

    /// <summary>
    /// 時間単位の活動サマリー
    /// </summary>
    public class HourlyActivitySummary
    {
        public int SummaryId { get; set; }
        public int UserId { get; set; }
        public DateTime HourStart { get; set; }
        public DateTime HourEnd { get; set; }
        public int MouseClicks { get; set; }
        public int KeyPresses { get; set; }
        public int MouseWheelScrolls { get; set; }
        public int TotalActiveSeconds { get; set; }
        public string TopWindows { get; set; } // JSON形式
        public int FileChangesCount { get; set; }
        public int LinesAdded { get; set; }
        public int LinesRemoved { get; set; }
        public string ActivityIntensity { get; set; } // 'high', 'medium', 'low'
        public float AvgCpuUsage { get; set; }
        public long AvgMemoryMB { get; set; }
        public string AiAnalysisStatus { get; set; } // 'pending', 'analyzing', 'completed', 'failed'
        public string AiAnalysisResult { get; set; } // JSON形式
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// AI分析結果
    /// </summary>
    public class AIAnalysisResult
    {
        public int ConcentrationScore { get; set; }
        public int ProgressScore { get; set; }
        public int EfficiencyScore { get; set; }
        public string ActivityIntensity { get; set; }
        public List<string> Issues { get; set; }
        public List<string> Recommendations { get; set; }
        public string Summary { get; set; }
    }

    /// <summary>
    /// ウィンドウ使用時間情報（トップ5用）
    /// </summary>
    public class WindowUsageInfo
    {
        public string WindowTitle { get; set; }
        public string ProcessName { get; set; }
        public int DurationSeconds { get; set; }
    }
}
