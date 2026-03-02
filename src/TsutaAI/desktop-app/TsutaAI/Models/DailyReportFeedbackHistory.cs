using System;

namespace TsutaAI.Models
{
    /// <summary>
    /// 日報AIフィードバック履歴（ローカルDB保存用）です。
    /// </summary>
    public class DailyReportFeedbackHistory
    {
        public int Id { get; set; }

        public int UserId { get; set; }

        public DateTime ReportDate { get; set; }

        public string FeedbackText { get; set; }

        public string FeedbackJson { get; set; }

        public string RequestSnapshot { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
