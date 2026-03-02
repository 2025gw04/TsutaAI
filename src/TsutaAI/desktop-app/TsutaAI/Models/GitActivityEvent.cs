using System;

namespace TsutaAI.Models
{
    /// <summary>
    /// Git関連イベント（commit/push）をローカルDBに保存するモデルです。
    /// </summary>
    public class GitActivityEvent
    {
        public int Id { get; set; }

        public int UserId { get; set; }

        public string RepositoryPath { get; set; }

        /// <summary>
        /// commit / push
        /// </summary>
        public string EventType { get; set; }

        public string CommitHash { get; set; }

        public string BranchName { get; set; }

        public string Message { get; set; }

        public DateTime OccurredAt { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
