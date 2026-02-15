using System;
using System.Collections.Generic;
using System.Linq;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// タスクの変更を検出し、管理者による更新を追跡するサービス
    /// </summary>
    public class TaskChangeDetectionService
    {
        private Dictionary<int, TaskSnapshot> _taskSnapshots;

        public TaskChangeDetectionService()
        {
            _taskSnapshots = new Dictionary<int, TaskSnapshot>();
        }

        /// <summary>
        /// タスクのスナップショットを保存します
        /// </summary>
        public void SaveTaskSnapshots(IEnumerable<TaskItem> tasks)
        {
            try
            {
                foreach (var task in tasks)
                {
                    var snapshot = new TaskSnapshot
                    {
                        TaskId = task.TaskId,
                        Title = task.Title,
                        Description = task.Description,
                        PlannedStart = task.PlannedStart,
                        PlannedEnd = task.PlannedEnd,
                        EstimatedMinutes = task.EstimatedMinutes,
                        Priority = task.Priority,
                        Status = task.Status,
                        UpdatedAt = task.UpdatedAt,
                        LastCheckedAt = DateTime.Now
                    };

                    _taskSnapshots[task.TaskId] = snapshot;
                }

                Logger.Info($"タスクスナップショットを保存しました: {tasks.Count()}件");
            }
            catch (Exception ex)
            {
                Logger.Error($"タスクスナップショット保存中にエラーが発生しました: {ex.Message}");
            }
        }

        /// <summary>
        /// タスクの変更を検出します
        /// </summary>
        public List<TaskChangeInfo> DetectChanges(IEnumerable<TaskItem> currentTasks)
        {
            var changes = new List<TaskChangeInfo>();

            try
            {
                foreach (var task in currentTasks)
                {
                    if (!_taskSnapshots.ContainsKey(task.TaskId))
                    {
                        continue;
                    }

                    var snapshot = _taskSnapshots[task.TaskId];
                    var changeInfo = new TaskChangeInfo
                    {
                        TaskId = task.TaskId,
                        TaskTitle = task.Title,
                        Changes = new List<string>()
                    };

                    // 更新日時をチェック
                    if (!string.IsNullOrEmpty(task.UpdatedAt) && 
                        !string.IsNullOrEmpty(snapshot.UpdatedAt) &&
                        task.UpdatedAt != snapshot.UpdatedAt)
                    {
                        // 各フィールドの変更を検出
                        if (task.Title != snapshot.Title)
                        {
                            changeInfo.Changes.Add($"タスク名: \"{snapshot.Title}\" → \"{task.Title}\"");
                        }

                        if (task.Description != snapshot.Description)
                        {
                            changeInfo.Changes.Add("説明が変更されました");
                        }

                        if (task.PlannedStart != snapshot.PlannedStart)
                        {
                            var oldDate = snapshot.PlannedStart?.ToString("yyyy/MM/dd") ?? "未設定";
                            var newDate = task.PlannedStart?.ToString("yyyy/MM/dd") ?? "未設定";
                            changeInfo.Changes.Add($"開始日: {oldDate} → {newDate}");
                        }

                        if (task.PlannedEnd != snapshot.PlannedEnd)
                        {
                            var oldDate = snapshot.PlannedEnd?.ToString("yyyy/MM/dd") ?? "未設定";
                            var newDate = task.PlannedEnd?.ToString("yyyy/MM/dd") ?? "未設定";
                            changeInfo.Changes.Add($"終了日: {oldDate} → {newDate}");
                        }

                        if (task.EstimatedMinutes != snapshot.EstimatedMinutes)
                        {
                            var oldHours = snapshot.EstimatedMinutes / 60.0;
                            var newHours = task.EstimatedMinutes / 60.0;
                            changeInfo.Changes.Add($"見積時間: {oldHours:F1}時間 → {newHours:F1}時間");
                        }

                        if (task.Priority != snapshot.Priority)
                        {
                            changeInfo.Changes.Add($"優先度: {snapshot.Priority} → {task.Priority}");
                        }

                        if (task.Status != snapshot.Status)
                        {
                            changeInfo.Changes.Add($"ステータス: {snapshot.Status} → {task.Status}");
                        }

                        if (changeInfo.Changes.Any())
                        {
                            changeInfo.UpdatedAt = task.UpdatedAt;
                            changes.Add(changeInfo);
                            task.HasUnreadChanges = true;
                        }
                    }
                }

                if (changes.Any())
                {
                    Logger.Info($"タスク変更を検出しました: {changes.Count}件");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク変更検出中にエラーが発生しました: {ex.Message}");
            }

            return changes;
        }

        /// <summary>
        /// タスクの変更を既読にします
        /// </summary>
        public void MarkAsRead(int taskId)
        {
            if (_taskSnapshots.ContainsKey(taskId))
            {
                _taskSnapshots[taskId].LastCheckedAt = DateTime.Now;
            }
        }

        /// <summary>
        /// すべてのタスク変更を既読にします
        /// </summary>
        public void MarkAllAsRead(IEnumerable<TaskItem> tasks)
        {
            foreach (var task in tasks)
            {
                task.HasUnreadChanges = false;
                MarkAsRead(task.TaskId);
            }
        }
    }

    /// <summary>
    /// タスクのスナップショット情報
    /// </summary>
    public class TaskSnapshot
    {
        public int TaskId { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public DateTime? PlannedStart { get; set; }
        public DateTime? PlannedEnd { get; set; }
        public int EstimatedMinutes { get; set; }
        public string Priority { get; set; }
        public string Status { get; set; }
        public string UpdatedAt { get; set; }
        public DateTime LastCheckedAt { get; set; }
    }

    /// <summary>
    /// タスク変更情報
    /// </summary>
    public class TaskChangeInfo
    {
        public int TaskId { get; set; }
        public string TaskTitle { get; set; }
        public List<string> Changes { get; set; }
        public string UpdatedAt { get; set; }
    }
}
