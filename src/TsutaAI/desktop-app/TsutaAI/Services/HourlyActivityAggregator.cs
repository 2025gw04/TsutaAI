using System;
using System.Collections.Generic;
using System.Linq;
using System.Timers;
using Newtonsoft.Json;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// 1時間ごとの活動データ集計サービス
    /// </summary>
    public class HourlyActivityAggregator : IDisposable
    {
        private readonly LocalDatabaseService _localDatabaseService;
        private readonly ApiService _apiService;
        private readonly ActivityMonitorService _activityMonitor;
        private readonly WindowSessionTracker _windowTracker;
        private readonly FileDiffService _fileDiffService;
        private readonly SystemPerformanceMonitor _performanceMonitor;
        private readonly Timer _hourlyTimer;

        private int _userId;
        private DateTime _currentHourStart;
        private bool _isRunning;

        public HourlyActivityAggregator(
            LocalDatabaseService localDatabaseService,
            ApiService apiService,
            ActivityMonitorService activityMonitor,
            WindowSessionTracker windowTracker,
            FileDiffService fileDiffService,
            SystemPerformanceMonitor performanceMonitor)
        {
            _localDatabaseService = localDatabaseService;
            _apiService = apiService;
            _activityMonitor = activityMonitor;
            _windowTracker = windowTracker;
            _fileDiffService = fileDiffService;
            _performanceMonitor = performanceMonitor;

            // 1時間ごとのタイマー
            _hourlyTimer = new Timer(3600000); // 3600000ms = 1時間
            _hourlyTimer.Elapsed += OnHourlyTick;
        }

        /// <summary>
        /// 集計を開始します
        /// </summary>
        public void Start(int userId)
        {
            if (_isRunning)
                return;

            _userId = userId;
            _currentHourStart = DateTime.Now;
            _isRunning = true;

            _hourlyTimer.Start();
            Logger.Info($"時間単位集計を開始しました (開始時刻: {_currentHourStart:yyyy-MM-dd HH:mm:ss})");
        }

        /// <summary>
        /// 集計を停止します
        /// </summary>
        public void Stop()
        {
            if (!_isRunning)
                return;

            _hourlyTimer.Stop();

            // 最後の集計を実行
            AggregateAndSave();

            _isRunning = false;
            Logger.Info("時間単位集計を停止しました");
        }

        /// <summary>
        /// 1時間ごとのタイマーイベント
        /// </summary>
        private void OnHourlyTick(object sender, ElapsedEventArgs e)
        {
            try
            {
                Logger.Info($"時間単位集計を実行します ({_currentHourStart:HH:mm} - {DateTime.Now:HH:mm})");
                AggregateAndSave();
            }
            catch (Exception ex)
            {
                Logger.Error($"時間単位集計エラー: {ex.Message}\n{ex.StackTrace}");
            }
        }

        /// <summary>
        /// データを集計してデータベースに保存し、AI分析をトリガーします
        /// </summary>
        private void AggregateAndSave()
        {
            try
            {
                var hourEnd = DateTime.Now;
                if (hourEnd <= _currentHourStart)
                {
                    return;
                }

                // 各種データを集計
                var summary = new HourlyActivitySummary
                {
                    UserId = _userId,
                    HourStart = _currentHourStart,
                    HourEnd = hourEnd,
                    CreatedAt = DateTime.Now
                };

                // 1. マウス・キーボード入力データ
                var activityStats = _activityMonitor.GetHourlyStats();
                summary.MouseClicks = activityStats.MouseClicks;
                summary.KeyPresses = activityStats.KeyPresses;
                summary.MouseWheelScrolls = activityStats.MouseWheelScrolls;
                summary.TotalActiveSeconds = activityStats.TotalActiveSeconds;

                // 2. トップ5ウィンドウ
                var topWindows = _windowTracker.GetHourlySummary(_currentHourStart, hourEnd);
                summary.TopWindows = JsonConvert.SerializeObject(topWindows);

                // 3. ファイル変更統計
                var fileDiffStats = GetFileDiffStats(_currentHourStart, hourEnd);
                summary.FileChangesCount = fileDiffStats.FileChangesCount;
                summary.LinesAdded = fileDiffStats.LinesAdded;
                summary.LinesRemoved = fileDiffStats.LinesRemoved;

                // 4. システムパフォーマンス平均
                var (avgCpu, avgMemory) = _performanceMonitor.GetAveragePerformance(_currentHourStart, hourEnd);
                summary.AvgCpuUsage = avgCpu;
                summary.AvgMemoryMB = avgMemory;

                // 5. 活動強度を判定
                summary.ActivityIntensity = DetermineActivityIntensity(summary);

                // 6. AI分析ステータス（初期値）
                summary.AiAnalysisStatus = "pending";

                // ローカルデータベースに保存
                int summaryId = _localDatabaseService.SaveHourlyActivitySummary(summary);
                Logger.Info($"時間単位サマリー保存完了 (LocalID: {summaryId})");

                // 7. backend-apiにデータを送信（非同期）
                SendToBackendAsync(summary);

                // 8. 各サービスの累積データをリセット
                _activityMonitor.ResetHourlyStats();
                _windowTracker.ClearCompletedSessions();
                _performanceMonitor.ResetHourlyAccumulation();
                _currentHourStart = hourEnd;

                Logger.Info($"時間単位集計完了: MouseClicks={summary.MouseClicks}, KeyPresses={summary.KeyPresses}, " +
                            $"FileChanges={summary.FileChangesCount}, Intensity={summary.ActivityIntensity}");
            }
            catch (Exception ex)
            {
                Logger.Error($"集計・保存エラー: {ex.Message}\n{ex.StackTrace}");
            }
        }

        private int? _currentProjectId;
        private int? _currentTaskId;

        /// <summary>
        /// 現在のタスク情報を設定します
        /// タスクが切り替わった場合、これまでの活動を集計して保存し、新しいセッションを開始します
        /// </summary>
        public void SetCurrentTask(int? projectId, int? taskId)
        {
            // プロジェクトやタスクが変わっていない場合は何もしない
            if (_currentProjectId == projectId && _currentTaskId == taskId)
            {
                return;
            }

            // 既に実行中の場合、前のセッションを集計して保存
            if (_isRunning)
            {
                Logger.Info($"タスク切り替えのため集計を実行します (旧タスクID: {_currentTaskId} -> 新タスクID: {taskId})");
                AggregateAndSave();
                
                // 次のセッション開始時刻を現在時刻に設定
                _currentHourStart = DateTime.Now;
                
                // タイマーをリセット
                _hourlyTimer.Stop();
                _hourlyTimer.Start();
            }

            _currentProjectId = projectId;
            _currentTaskId = taskId;
        }

        /// <summary>
        /// backend-apiにデータの要約を送信します（非同期）
        /// プライバシーに配慮し、詳細な操作ログではなく作業セッションのサマリーのみを送信します
        /// </summary>
        private async void SendToBackendAsync(HourlyActivitySummary summary)
        {
            try
            {
                Logger.Info("backend-apiに作業セッションデータを送信します");
                var gitStats = GetGitActivityStats(summary.HourStart, summary.HourEnd);
                var normalizedProjectId = NormalizeEntityId(_currentProjectId);
                var normalizedTaskId = NormalizeEntityId(_currentTaskId);
                var sessionType = normalizedTaskId.HasValue ? "work" : "personal";

                // WorkSessionSummaryを作成
                var workSession = new WorkSessionSummary
                {
                    UserId = summary.UserId,
                    ProjectId = normalizedProjectId,
                    TaskId = normalizedTaskId,
                    SessionStart = summary.HourStart,
                    SessionEnd = summary.HourEnd,
                    WorkDurationSeconds = summary.TotalActiveSeconds,
                    ProgressPercentage = 0, // 進捗率は別途取得する必要があるが、一旦0
                    CommitsCount = gitStats.CommitCount,
                    FilesChanged = summary.FileChangesCount,
                    SessionNotes = BuildSessionNotes(summary, gitStats.CommitCount, gitStats.PushCount),
                    SessionType = sessionType,
                    CreatedAt = DateTime.Now,
                    // AI分析用詳細データ
                    MouseClicks = summary.MouseClicks,
                    KeyPresses = summary.KeyPresses,
                    MouseWheelScrolls = summary.MouseWheelScrolls,
                    TopWindows = summary.TopWindows
                };

                // API経由で送信
                var response = await _apiService.CreateWorkSessionSummaryAsync(workSession);

                if (response.IsSuccess)
                {
                    Logger.Info($"backend-apiへの送信成功 (SessionId: {response.SessionId})");
                }
                else
                {
                    Logger.Error($"backend-apiへの送信失敗: {response.ErrorMessage}");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"backend-apiへの送信エラー: {ex.Message}");
            }
        }

        private static int? NormalizeEntityId(int? id)
        {
            if (!id.HasValue || id.Value <= 0)
            {
                return null;
            }
            return id.Value;
        }

        private (int CommitCount, int PushCount) GetGitActivityStats(DateTime start, DateTime end)
        {
            try
            {
                var events = _localDatabaseService.GetGitActivityEvents(_userId, start, end);
                int commitCount = events.Count(e => string.Equals(e.EventType, "commit", StringComparison.OrdinalIgnoreCase));
                int pushCount = events.Count(e => string.Equals(e.EventType, "push", StringComparison.OrdinalIgnoreCase));
                return (commitCount, pushCount);
            }
            catch (Exception ex)
            {
                Logger.Error($"Git活動統計取得エラー: {ex.Message}");
                return (0, 0);
            }
        }

        private static string BuildSessionNotes(HourlyActivitySummary summary, int commitCount, int pushCount)
        {
            var notes = new List<string>();
            notes.Add($"[hourly] mouse={summary.MouseClicks}, keyboard={summary.KeyPresses}, wheel={summary.MouseWheelScrolls}, active_seconds={summary.TotalActiveSeconds}");
            notes.Add($"[hourly] file_changes={summary.FileChangesCount}, lines_added={summary.LinesAdded}, lines_removed={summary.LinesRemoved}");
            notes.Add($"[hourly] git_commits={commitCount}, git_pushes={pushCount}");

            notes.Add($"[hourly] intensity={summary.ActivityIntensity}, avg_cpu={summary.AvgCpuUsage:F1}, avg_memory_mb={summary.AvgMemoryMB}");
            return string.Join("\n", notes);
        }

        /// <summary>
        /// ファイル変更統計を取得します
        /// </summary>
        private (int FileChangesCount, int LinesAdded, int LinesRemoved) GetFileDiffStats(DateTime start, DateTime end)
        {
            try
            {
                var fileDiffs = _localDatabaseService.GetFileDiffs(_userId, start, end);

                int fileChangesCount = fileDiffs.Count;
                int linesAdded = fileDiffs.Sum(f => f.LinesAdded);
                int linesRemoved = fileDiffs.Sum(f => f.LinesRemoved);

                return (fileChangesCount, linesAdded, linesRemoved);
            }
            catch (Exception ex)
            {
                Logger.Error($"ファイル変更統計取得エラー: {ex.Message}");
                return (0, 0, 0);
            }
        }

        /// <summary>
        /// 活動強度を判定します（high / medium / low）
        /// </summary>
        private string DetermineActivityIntensity(HourlyActivitySummary summary)
        {
            // 判定基準:
            // - キー入力数
            // - マウスクリック数
            // - ファイル変更数
            // - コード追加行数

            int score = 0;

            // キー入力（1000回以上 = 10点、500-1000 = 5点、500未満 = 0点）
            if (summary.KeyPresses >= 1000) score += 10;
            else if (summary.KeyPresses >= 500) score += 5;

            // マウスクリック（500回以上 = 5点、200-500 = 3点、200未満 = 0点）
            if (summary.MouseClicks >= 500) score += 5;
            else if (summary.MouseClicks >= 200) score += 3;

            // ファイル変更（10個以上 = 10点、5-10 = 5点、5未満 = 0点）
            if (summary.FileChangesCount >= 10) score += 10;
            else if (summary.FileChangesCount >= 5) score += 5;

            // コード追加行数（100行以上 = 10点、50-100 = 5点、50未満 = 0点）
            if (summary.LinesAdded >= 100) score += 10;
            else if (summary.LinesAdded >= 50) score += 5;

            // スコアに基づいて判定
            if (score >= 20) return "high";
            if (score >= 10) return "medium";
            return "low";
        }

        /// <summary>
        /// 手動で集計を実行します（テスト用）
        /// </summary>
        public void ManualAggregate()
        {
            Logger.Info("手動集計を実行します");
            AggregateAndSave();
        }

        public void Dispose()
        {
            Stop();
            _hourlyTimer?.Dispose();
        }
    }
}
