using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using TsutaAI.Models;

namespace TsutaAI.Services
{
    /// <summary>
    /// ローカルPC上に保存する個人データ専用のデータベースサービスです。
    /// 保存場所: [exeフォルダ]/database/tsutaai.db
    ///
    /// 管理するテーブル:
    /// - activity_sessions: アクティビティセッション
    /// - file_diffs: ファイル変更履歴
    /// - system_performance: システムパフォーマンス
    /// - hourly_activity_summary: 1時間単位活動集計
    /// - ai_chat_history: AIチャット履歴
    /// - git_activity_events: Git活動イベント（commit / push）
    /// - daily_report_feedback_history: 日報AIフィードバック履歴
    ///
    /// 注意: ユーザー、プロジェクト、タスク、作業ログなどの共有データは
    /// ApiService を通じて backend-api 経由で管理してください。
    /// </summary>
    public class LocalDatabaseService : IDisposable
    {
        private static LocalDatabaseService _instance;
        private static readonly object _lock = new object();
        private readonly SQLiteConnection _connection;

        #region テーブル作成SQL

        private const string CreateActivitySessionsTableSql = @"
            CREATE TABLE IF NOT EXISTS activity_sessions (
                session_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                window_title TEXT,
                process_name TEXT,
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration_seconds INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
        ";

        private const string CreateFileDiffsTableSql = @"
            CREATE TABLE IF NOT EXISTS file_diffs (
                diff_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                change_type TEXT,
                diff_content TEXT,
                lines_added INTEGER DEFAULT 0,
                lines_removed INTEGER DEFAULT 0,
                timestamp TEXT DEFAULT (datetime('now', 'localtime'))
            );
        ";

        private const string CreateSystemPerformanceTableSql = @"
            CREATE TABLE IF NOT EXISTS system_performance (
                perf_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                cpu_usage REAL,
                memory_usage_mb INTEGER,
                timestamp TEXT DEFAULT (datetime('now', 'localtime'))
            );
        ";

        private const string CreateHourlyActivitySummaryTableSql = @"
            CREATE TABLE IF NOT EXISTS hourly_activity_summary (
                summary_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                hour_start TEXT NOT NULL,
                hour_end TEXT NOT NULL,
                mouse_clicks INTEGER DEFAULT 0,
                key_presses INTEGER DEFAULT 0,
                mouse_wheel_scrolls INTEGER DEFAULT 0,
                total_active_seconds INTEGER DEFAULT 0,
                top_windows TEXT,
                file_changes_count INTEGER DEFAULT 0,
                lines_added INTEGER DEFAULT 0,
                lines_removed INTEGER DEFAULT 0,
                activity_intensity TEXT,
                avg_cpu_usage REAL,
                avg_memory_mb INTEGER,
                ai_analysis_status TEXT DEFAULT 'pending',
                ai_analysis_result TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
        ";

        private const string CreateAiChatHistoryTableSql = @"
            CREATE TABLE IF NOT EXISTS ai_chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                message_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                preview_json TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
        ";

        private const string CreateGitActivityEventsTableSql = @"
            CREATE TABLE IF NOT EXISTS git_activity_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                repository_path TEXT,
                event_type TEXT NOT NULL,
                commit_hash TEXT,
                branch_name TEXT,
                message TEXT,
                occurred_at TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
        ";

        private const string CreateDailyReportFeedbackHistoryTableSql = @"
            CREATE TABLE IF NOT EXISTS daily_report_feedback_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                report_date TEXT NOT NULL,
                feedback_text TEXT,
                feedback_json TEXT,
                request_snapshot TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
        ";

        private const string CreateIndexesSql = @"
            CREATE INDEX IF NOT EXISTS idx_activity_sessions_user_time ON activity_sessions(user_id, start_time);
            CREATE INDEX IF NOT EXISTS idx_file_diffs_user_time ON file_diffs(user_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_system_performance_user_time ON system_performance(user_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_hourly_summary_user_hour ON hourly_activity_summary(user_id, hour_start);
            CREATE INDEX IF NOT EXISTS idx_ai_chat_user_created ON ai_chat_history(user_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_git_activity_user_time ON git_activity_events(user_id, occurred_at);
            CREATE INDEX IF NOT EXISTS idx_git_activity_user_type_time ON git_activity_events(user_id, event_type, occurred_at);
            CREATE INDEX IF NOT EXISTS idx_daily_feedback_user_date ON daily_report_feedback_history(user_id, report_date);
            CREATE INDEX IF NOT EXISTS idx_daily_feedback_user_created ON daily_report_feedback_history(user_id, created_at);
        ";

        #endregion

        /// <summary>
        /// シングルトンインスタンスを取得します。
        /// </summary>
        public static LocalDatabaseService Instance
        {
            get
            {
                if (_instance == null)
                {
                    lock (_lock)
                    {
                        if (_instance == null)
                        {
                            _instance = new LocalDatabaseService();
                        }
                    }
                }
                return _instance;
            }
        }

        /// <summary>
        /// データベースパスを取得します。
        /// exeフォルダ内の database/tsutaai.db を使用します。
        /// </summary>
        public static string GetDatabasePath()
        {
            string exeDir = Path.GetDirectoryName(
                System.Reflection.Assembly.GetExecutingAssembly().Location);
            string dbDir = Path.Combine(exeDir, "database");

            if (!Directory.Exists(dbDir))
            {
                Directory.CreateDirectory(dbDir);
            }

            return Path.Combine(dbDir, "tsutaai.db");
        }

        private LocalDatabaseService()
        {
            string dbPath = GetDatabasePath();
            string connectionString = $"Data Source={dbPath};Version=3;Foreign Keys=True;";
            _connection = new SQLiteConnection(connectionString);
            _connection.Open();

            InitializeSchema();
        }

        private void InitializeSchema()
        {
            foreach (var statement in new[]
            {
                CreateActivitySessionsTableSql,
                CreateFileDiffsTableSql,
                CreateSystemPerformanceTableSql,
                CreateHourlyActivitySummaryTableSql,
                CreateAiChatHistoryTableSql,
                CreateGitActivityEventsTableSql,
                CreateDailyReportFeedbackHistoryTableSql
            })
            {
                ExecuteNonQuery(statement);
            }

            // インデックス作成（複数のCREATE INDEX文を分割して実行）
            var indexStatements = CreateIndexesSql.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var indexSql in indexStatements)
            {
                if (!string.IsNullOrWhiteSpace(indexSql))
                {
                    ExecuteNonQuery(indexSql.Trim() + ";");
                }
            }
        }

        private void ExecuteNonQuery(string sql, SQLiteTransaction transaction = null)
        {
            using (var command = transaction == null
                ? new SQLiteCommand(sql, _connection)
                : new SQLiteCommand(sql, _connection, transaction))
            {
                command.ExecuteNonQuery();
            }
        }

        #region ActivitySession CRUD

        /// <summary>
        /// ActivitySessionをデータベースに保存します
        /// </summary>
        public int SaveActivitySession(ActivitySession session)
        {
            string sql = @"INSERT INTO activity_sessions
                (user_id, window_title, process_name, start_time, end_time, duration_seconds)
                VALUES (@userId, @windowTitle, @processName, @startTime, @endTime, @durationSeconds)";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", session.UserId);
                command.Parameters.AddWithValue("@windowTitle", session.WindowTitle ?? string.Empty);
                command.Parameters.AddWithValue("@processName", session.ProcessName ?? string.Empty);
                command.Parameters.AddWithValue("@startTime", session.StartTime.ToString("o"));
                command.Parameters.AddWithValue("@endTime", session.EndTime?.ToString("o") ?? (object)DBNull.Value);
                command.Parameters.AddWithValue("@durationSeconds", session.DurationSeconds);

                command.ExecuteNonQuery();
            }

            using (var command = new SQLiteCommand("SELECT last_insert_rowid()", _connection))
            {
                return Convert.ToInt32(command.ExecuteScalar());
            }
        }

        /// <summary>
        /// 指定期間のActivitySessionsを取得します
        /// </summary>
        public List<ActivitySession> GetActivitySessions(int userId, DateTime startTime, DateTime endTime)
        {
            var sessions = new List<ActivitySession>();
            string sql = @"SELECT * FROM activity_sessions
                WHERE user_id = @userId
                AND start_time >= @startTime
                AND start_time <= @endTime
                ORDER BY start_time";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                command.Parameters.AddWithValue("@startTime", startTime.ToString("o"));
                command.Parameters.AddWithValue("@endTime", endTime.ToString("o"));

                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        sessions.Add(new ActivitySession
                        {
                            SessionId = Convert.ToInt32(reader["session_id"]),
                            UserId = Convert.ToInt32(reader["user_id"]),
                            WindowTitle = reader["window_title"].ToString(),
                            ProcessName = reader["process_name"].ToString(),
                            StartTime = DateTime.Parse(reader["start_time"].ToString()),
                            EndTime = reader["end_time"] != DBNull.Value
                                ? DateTime.Parse(reader["end_time"].ToString())
                                : (DateTime?)null,
                            DurationSeconds = Convert.ToInt32(reader["duration_seconds"]),
                            CreatedAt = DateTime.Parse(reader["created_at"].ToString())
                        });
                    }
                }
            }

            return sessions;
        }

        #endregion

        #region FileDiff CRUD

        /// <summary>
        /// FileDiffをデータベースに保存します
        /// </summary>
        public int SaveFileDiff(FileDiff fileDiff)
        {
            string sql = @"INSERT INTO file_diffs
                (user_id, file_path, change_type, diff_content, lines_added, lines_removed)
                VALUES (@userId, @filePath, @changeType, @diffContent, @linesAdded, @linesRemoved)";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", fileDiff.UserId);
                command.Parameters.AddWithValue("@filePath", fileDiff.FilePath ?? string.Empty);
                command.Parameters.AddWithValue("@changeType", fileDiff.ChangeType ?? string.Empty);
                command.Parameters.AddWithValue("@diffContent", fileDiff.DiffContent ?? string.Empty);
                command.Parameters.AddWithValue("@linesAdded", fileDiff.LinesAdded);
                command.Parameters.AddWithValue("@linesRemoved", fileDiff.LinesRemoved);

                command.ExecuteNonQuery();
            }

            using (var command = new SQLiteCommand("SELECT last_insert_rowid()", _connection))
            {
                return Convert.ToInt32(command.ExecuteScalar());
            }
        }

        /// <summary>
        /// 指定期間のFileDiffsを取得します
        /// </summary>
        public List<FileDiff> GetFileDiffs(int userId, DateTime startTime, DateTime endTime)
        {
            var diffs = new List<FileDiff>();
            string sql = @"SELECT * FROM file_diffs
                WHERE user_id = @userId
                AND timestamp >= @startTime
                AND timestamp <= @endTime
                ORDER BY timestamp";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                command.Parameters.AddWithValue("@startTime", startTime.ToString("o"));
                command.Parameters.AddWithValue("@endTime", endTime.ToString("o"));

                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        diffs.Add(new FileDiff
                        {
                            DiffId = Convert.ToInt32(reader["diff_id"]),
                            UserId = Convert.ToInt32(reader["user_id"]),
                            FilePath = reader["file_path"].ToString(),
                            ChangeType = reader["change_type"].ToString(),
                            DiffContent = reader["diff_content"].ToString(),
                            LinesAdded = Convert.ToInt32(reader["lines_added"]),
                            LinesRemoved = Convert.ToInt32(reader["lines_removed"]),
                            Timestamp = DateTime.Parse(reader["timestamp"].ToString())
                        });
                    }
                }
            }

            return diffs;
        }

        #endregion

        #region SystemPerformance CRUD

        /// <summary>
        /// SystemPerformanceをデータベースに保存します
        /// </summary>
        public int SaveSystemPerformance(SystemPerformance performance)
        {
            string sql = @"INSERT INTO system_performance
                (user_id, cpu_usage, memory_usage_mb)
                VALUES (@userId, @cpuUsage, @memoryUsageMb)";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", performance.UserId);
                command.Parameters.AddWithValue("@cpuUsage", performance.CpuUsage);
                command.Parameters.AddWithValue("@memoryUsageMb", performance.MemoryUsageMB);

                command.ExecuteNonQuery();
            }

            using (var command = new SQLiteCommand("SELECT last_insert_rowid()", _connection))
            {
                return Convert.ToInt32(command.ExecuteScalar());
            }
        }

        /// <summary>
        /// 指定期間のSystemPerformancesを取得します
        /// </summary>
        public List<SystemPerformance> GetSystemPerformances(int userId, DateTime startTime, DateTime endTime)
        {
            var performances = new List<SystemPerformance>();
            string sql = @"SELECT * FROM system_performance
                WHERE user_id = @userId
                AND timestamp >= @startTime
                AND timestamp <= @endTime
                ORDER BY timestamp";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                command.Parameters.AddWithValue("@startTime", startTime.ToString("o"));
                command.Parameters.AddWithValue("@endTime", endTime.ToString("o"));

                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        performances.Add(new SystemPerformance
                        {
                            PerfId = Convert.ToInt32(reader["perf_id"]),
                            UserId = Convert.ToInt32(reader["user_id"]),
                            CpuUsage = Convert.ToSingle(reader["cpu_usage"]),
                            MemoryUsageMB = Convert.ToInt64(reader["memory_usage_mb"]),
                            Timestamp = DateTime.Parse(reader["timestamp"].ToString())
                        });
                    }
                }
            }

            return performances;
        }

        #endregion

        #region HourlyActivitySummary CRUD

        /// <summary>
        /// HourlyActivitySummaryをデータベースに保存します
        /// </summary>
        public int SaveHourlyActivitySummary(HourlyActivitySummary summary)
        {
            string sql = @"INSERT INTO hourly_activity_summary
                (user_id, hour_start, hour_end, mouse_clicks, key_presses, mouse_wheel_scrolls,
                total_active_seconds, top_windows, file_changes_count, lines_added, lines_removed,
                activity_intensity, avg_cpu_usage, avg_memory_mb, ai_analysis_status)
                VALUES (@userId, @hourStart, @hourEnd, @mouseClicks, @keyPresses, @mouseWheelScrolls,
                @totalActiveSeconds, @topWindows, @fileChangesCount, @linesAdded, @linesRemoved,
                @activityIntensity, @avgCpuUsage, @avgMemoryMb, @aiAnalysisStatus)";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", summary.UserId);
                command.Parameters.AddWithValue("@hourStart", summary.HourStart.ToString("o"));
                command.Parameters.AddWithValue("@hourEnd", summary.HourEnd.ToString("o"));
                command.Parameters.AddWithValue("@mouseClicks", summary.MouseClicks);
                command.Parameters.AddWithValue("@keyPresses", summary.KeyPresses);
                command.Parameters.AddWithValue("@mouseWheelScrolls", summary.MouseWheelScrolls);
                command.Parameters.AddWithValue("@totalActiveSeconds", summary.TotalActiveSeconds);
                command.Parameters.AddWithValue("@topWindows", summary.TopWindows ?? string.Empty);
                command.Parameters.AddWithValue("@fileChangesCount", summary.FileChangesCount);
                command.Parameters.AddWithValue("@linesAdded", summary.LinesAdded);
                command.Parameters.AddWithValue("@linesRemoved", summary.LinesRemoved);
                command.Parameters.AddWithValue("@activityIntensity", summary.ActivityIntensity ?? "low");
                command.Parameters.AddWithValue("@avgCpuUsage", summary.AvgCpuUsage);
                command.Parameters.AddWithValue("@avgMemoryMb", summary.AvgMemoryMB);
                command.Parameters.AddWithValue("@aiAnalysisStatus", summary.AiAnalysisStatus ?? "pending");

                command.ExecuteNonQuery();
            }

            using (var command = new SQLiteCommand("SELECT last_insert_rowid()", _connection))
            {
                return Convert.ToInt32(command.ExecuteScalar());
            }
        }

        /// <summary>
        /// HourlyActivitySummaryのAI分析結果を更新します
        /// </summary>
        public void UpdateHourlyActivitySummaryAIResult(int summaryId, string aiAnalysisResult)
        {
            string sql = @"UPDATE hourly_activity_summary
                SET ai_analysis_result = @aiAnalysisResult,
                    ai_analysis_status = 'completed'
                WHERE summary_id = @summaryId";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@summaryId", summaryId);
                command.Parameters.AddWithValue("@aiAnalysisResult", aiAnalysisResult ?? string.Empty);

                command.ExecuteNonQuery();
            }
        }

        /// <summary>
        /// 指定期間のHourlyActivitySummariesを取得します
        /// </summary>
        public List<HourlyActivitySummary> GetHourlyActivitySummaries(int userId, DateTime startDate, DateTime endDate)
        {
            var summaries = new List<HourlyActivitySummary>();

            try
            {
                string sql = @"SELECT * FROM hourly_activity_summary
                    WHERE user_id = @userId
                    AND hour_start >= @startDate
                    AND hour_start <= @endDate
                    ORDER BY hour_start DESC";

                using (var command = new SQLiteCommand(sql, _connection))
                {
                    command.Parameters.AddWithValue("@userId", userId);
                    command.Parameters.AddWithValue("@startDate", startDate.ToString("o"));
                    command.Parameters.AddWithValue("@endDate", endDate.ToString("o"));

                    using (var reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            try
                            {
                                summaries.Add(new HourlyActivitySummary
                                {
                                    SummaryId = Convert.ToInt32(reader["summary_id"]),
                                    UserId = Convert.ToInt32(reader["user_id"]),
                                    HourStart = DateTime.Parse(reader["hour_start"]?.ToString() ?? DateTime.Now.ToString()),
                                    HourEnd = DateTime.Parse(reader["hour_end"]?.ToString() ?? DateTime.Now.ToString()),
                                    MouseClicks = reader["mouse_clicks"] == DBNull.Value ? 0 : Convert.ToInt32(reader["mouse_clicks"]),
                                    KeyPresses = reader["key_presses"] == DBNull.Value ? 0 : Convert.ToInt32(reader["key_presses"]),
                                    MouseWheelScrolls = reader["mouse_wheel_scrolls"] == DBNull.Value ? 0 : Convert.ToInt32(reader["mouse_wheel_scrolls"]),
                                    TotalActiveSeconds = reader["total_active_seconds"] == DBNull.Value ? 0 : Convert.ToInt32(reader["total_active_seconds"]),
                                    TopWindows = reader["top_windows"] == DBNull.Value ? "" : reader["top_windows"].ToString(),
                                    FileChangesCount = reader["file_changes_count"] == DBNull.Value ? 0 : Convert.ToInt32(reader["file_changes_count"]),
                                    LinesAdded = reader["lines_added"] == DBNull.Value ? 0 : Convert.ToInt32(reader["lines_added"]),
                                    LinesRemoved = reader["lines_removed"] == DBNull.Value ? 0 : Convert.ToInt32(reader["lines_removed"]),
                                    ActivityIntensity = reader["activity_intensity"] == DBNull.Value ? "" : reader["activity_intensity"].ToString(),
                                    AvgCpuUsage = reader["avg_cpu_usage"] == DBNull.Value ? 0 : Convert.ToSingle(reader["avg_cpu_usage"]),
                                    AvgMemoryMB = reader["avg_memory_mb"] == DBNull.Value ? 0 : Convert.ToInt64(reader["avg_memory_mb"]),
                                    AiAnalysisStatus = reader["ai_analysis_status"] == DBNull.Value ? "pending" : reader["ai_analysis_status"].ToString(),
                                    AiAnalysisResult = reader["ai_analysis_result"] == DBNull.Value ? "" : reader["ai_analysis_result"].ToString(),
                                    CreatedAt = reader["created_at"] == DBNull.Value ? DateTime.Now : DateTime.Parse(reader["created_at"].ToString())
                                });
                            }
                            catch (Exception ex)
                            {
                                System.Diagnostics.Debug.WriteLine($"Error parsing activity summary record: {ex.Message}");
                                continue;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error fetching activity summaries: {ex.Message}");
            }

            return summaries;
        }

        #endregion

        #region AiChatHistory CRUD

        /// <summary>
        /// AIチャット履歴を保存します
        /// </summary>
        public void SaveAiChatHistory(AiChatHistory history)
        {
            string sql = @"INSERT INTO ai_chat_history
                (user_id, message_id, role, content, preview_json, created_at)
                VALUES (@userId, @messageId, @role, @content, @previewJson, @createdAt)";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", history.UserId);
                command.Parameters.AddWithValue("@messageId", history.MessageId ?? Guid.NewGuid().ToString());
                command.Parameters.AddWithValue("@role", history.Role ?? "user");
                command.Parameters.AddWithValue("@content", history.Content ?? string.Empty);
                command.Parameters.AddWithValue("@previewJson", history.PreviewJson ?? (object)DBNull.Value);
                command.Parameters.AddWithValue("@createdAt", history.CreatedAt.ToString("o"));

                command.ExecuteNonQuery();
            }
        }

        /// <summary>
        /// 指定ユーザーのAIチャット履歴を取得します
        /// </summary>
        public List<AiChatHistory> GetAiChatHistory(int userId, int limit = 50)
        {
            var history = new List<AiChatHistory>();
            string sql = @"SELECT * FROM ai_chat_history
                WHERE user_id = @userId
                ORDER BY created_at DESC
                LIMIT @limit";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                command.Parameters.AddWithValue("@limit", limit);

                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        history.Add(new AiChatHistory
                        {
                            Id = Convert.ToInt32(reader["id"]),
                            UserId = Convert.ToInt32(reader["user_id"]),
                            MessageId = reader["message_id"].ToString(),
                            Role = reader["role"].ToString(),
                            Content = reader["content"].ToString(),
                            PreviewJson = reader["preview_json"] == DBNull.Value ? null : reader["preview_json"].ToString(),
                            CreatedAt = DateTime.Parse(reader["created_at"].ToString())
                        });
                    }
                }
            }

            // 時系列順に並び替え（古い順）
            history.Reverse();
            return history;
        }

        /// <summary>
        /// 指定ユーザーのAIチャット履歴をクリアします
        /// </summary>
        public void ClearAiChatHistory(int userId)
        {
            string sql = "DELETE FROM ai_chat_history WHERE user_id = @userId";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                command.ExecuteNonQuery();
            }
        }

        #endregion

        #region GitActivityEvents CRUD

        /// <summary>
        /// Gitイベント（commit / push）を保存します
        /// </summary>
        public int SaveGitActivityEvent(GitActivityEvent gitEvent)
        {
            string sql = @"INSERT INTO git_activity_events
                (user_id, repository_path, event_type, commit_hash, branch_name, message, occurred_at)
                VALUES (@userId, @repositoryPath, @eventType, @commitHash, @branchName, @message, @occurredAt)";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", gitEvent.UserId);
                command.Parameters.AddWithValue("@repositoryPath", gitEvent.RepositoryPath ?? string.Empty);
                command.Parameters.AddWithValue("@eventType", gitEvent.EventType ?? string.Empty);
                command.Parameters.AddWithValue("@commitHash", string.IsNullOrWhiteSpace(gitEvent.CommitHash) ? (object)DBNull.Value : gitEvent.CommitHash);
                command.Parameters.AddWithValue("@branchName", string.IsNullOrWhiteSpace(gitEvent.BranchName) ? (object)DBNull.Value : gitEvent.BranchName);
                command.Parameters.AddWithValue("@message", gitEvent.Message ?? string.Empty);
                command.Parameters.AddWithValue("@occurredAt", gitEvent.OccurredAt.ToString("o"));
                command.ExecuteNonQuery();
            }

            using (var command = new SQLiteCommand("SELECT last_insert_rowid()", _connection))
            {
                return Convert.ToInt32(command.ExecuteScalar());
            }
        }

        /// <summary>
        /// 指定期間のGitイベントを取得します
        /// </summary>
        public List<GitActivityEvent> GetGitActivityEvents(int userId, DateTime startTime, DateTime endTime)
        {
            var events = new List<GitActivityEvent>();
            string sql = @"SELECT * FROM git_activity_events
                WHERE user_id = @userId
                AND occurred_at >= @startTime
                AND occurred_at <= @endTime
                ORDER BY occurred_at ASC";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                command.Parameters.AddWithValue("@startTime", startTime.ToString("o"));
                command.Parameters.AddWithValue("@endTime", endTime.ToString("o"));

                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        events.Add(new GitActivityEvent
                        {
                            Id = Convert.ToInt32(reader["id"]),
                            UserId = Convert.ToInt32(reader["user_id"]),
                            RepositoryPath = reader["repository_path"] == DBNull.Value ? string.Empty : reader["repository_path"].ToString(),
                            EventType = reader["event_type"] == DBNull.Value ? string.Empty : reader["event_type"].ToString(),
                            CommitHash = reader["commit_hash"] == DBNull.Value ? string.Empty : reader["commit_hash"].ToString(),
                            BranchName = reader["branch_name"] == DBNull.Value ? string.Empty : reader["branch_name"].ToString(),
                            Message = reader["message"] == DBNull.Value ? string.Empty : reader["message"].ToString(),
                            OccurredAt = DateTime.Parse(reader["occurred_at"].ToString()),
                            CreatedAt = reader["created_at"] == DBNull.Value ? DateTime.Now : DateTime.Parse(reader["created_at"].ToString())
                        });
                    }
                }
            }

            return events;
        }

        #endregion

        #region DailyReportFeedbackHistory CRUD

        /// <summary>
        /// 日報AIフィードバック履歴を保存します
        /// </summary>
        public int SaveDailyReportFeedbackHistory(DailyReportFeedbackHistory history)
        {
            string sql = @"INSERT INTO daily_report_feedback_history
                (user_id, report_date, feedback_text, feedback_json, request_snapshot)
                VALUES (@userId, @reportDate, @feedbackText, @feedbackJson, @requestSnapshot)";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", history.UserId);
                command.Parameters.AddWithValue("@reportDate", history.ReportDate.ToString("yyyy-MM-dd"));
                command.Parameters.AddWithValue("@feedbackText", history.FeedbackText ?? string.Empty);
                command.Parameters.AddWithValue("@feedbackJson", history.FeedbackJson ?? string.Empty);
                command.Parameters.AddWithValue("@requestSnapshot", history.RequestSnapshot ?? string.Empty);
                command.ExecuteNonQuery();
            }

            using (var command = new SQLiteCommand("SELECT last_insert_rowid()", _connection))
            {
                return Convert.ToInt32(command.ExecuteScalar());
            }
        }

        /// <summary>
        /// 指定期間の日報AIフィードバック履歴を取得します
        /// </summary>
        public List<DailyReportFeedbackHistory> GetDailyReportFeedbackHistory(int userId, DateTime startDate, int limit = 10)
        {
            var histories = new List<DailyReportFeedbackHistory>();
            string sql = @"SELECT * FROM daily_report_feedback_history
                WHERE user_id = @userId
                AND report_date >= @startDate
                ORDER BY report_date DESC, id DESC
                LIMIT @limit";

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                command.Parameters.AddWithValue("@startDate", startDate.ToString("yyyy-MM-dd"));
                command.Parameters.AddWithValue("@limit", limit);

                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        histories.Add(new DailyReportFeedbackHistory
                        {
                            Id = Convert.ToInt32(reader["id"]),
                            UserId = Convert.ToInt32(reader["user_id"]),
                            ReportDate = DateTime.Parse(reader["report_date"].ToString()),
                            FeedbackText = reader["feedback_text"] == DBNull.Value ? string.Empty : reader["feedback_text"].ToString(),
                            FeedbackJson = reader["feedback_json"] == DBNull.Value ? string.Empty : reader["feedback_json"].ToString(),
                            RequestSnapshot = reader["request_snapshot"] == DBNull.Value ? string.Empty : reader["request_snapshot"].ToString(),
                            CreatedAt = reader["created_at"] == DBNull.Value ? DateTime.Now : DateTime.Parse(reader["created_at"].ToString())
                        });
                    }
                }
            }

            return histories;
        }

        #endregion

        #region データクリーンアップ

        /// <summary>
        /// 指定日数より古いデータを削除します
        /// </summary>
        public void CleanupOldData(int daysToKeep = 90)
        {
            var cutoffDate = DateTime.Now.AddDays(-daysToKeep).ToString("o");

            using (var transaction = _connection.BeginTransaction())
            {
                try
                {
                    // activity_sessions
                    using (var cmd = new SQLiteCommand("DELETE FROM activity_sessions WHERE start_time < @cutoffDate", _connection, transaction))
                    {
                        cmd.Parameters.AddWithValue("@cutoffDate", cutoffDate);
                        cmd.ExecuteNonQuery();
                    }

                    // file_diffs
                    using (var cmd = new SQLiteCommand("DELETE FROM file_diffs WHERE timestamp < @cutoffDate", _connection, transaction))
                    {
                        cmd.Parameters.AddWithValue("@cutoffDate", cutoffDate);
                        cmd.ExecuteNonQuery();
                    }

                    // system_performance
                    using (var cmd = new SQLiteCommand("DELETE FROM system_performance WHERE timestamp < @cutoffDate", _connection, transaction))
                    {
                        cmd.Parameters.AddWithValue("@cutoffDate", cutoffDate);
                        cmd.ExecuteNonQuery();
                    }

                    // hourly_activity_summary
                    using (var cmd = new SQLiteCommand("DELETE FROM hourly_activity_summary WHERE hour_start < @cutoffDate", _connection, transaction))
                    {
                        cmd.Parameters.AddWithValue("@cutoffDate", cutoffDate);
                        cmd.ExecuteNonQuery();
                    }

                    // git_activity_events
                    using (var cmd = new SQLiteCommand("DELETE FROM git_activity_events WHERE occurred_at < @cutoffDate", _connection, transaction))
                    {
                        cmd.Parameters.AddWithValue("@cutoffDate", cutoffDate);
                        cmd.ExecuteNonQuery();
                    }

                    // daily_report_feedback_history
                    using (var cmd = new SQLiteCommand("DELETE FROM daily_report_feedback_history WHERE report_date < @cutoffDate", _connection, transaction))
                    {
                        cmd.Parameters.AddWithValue("@cutoffDate", DateTime.Now.AddDays(-daysToKeep).ToString("yyyy-MM-dd"));
                        cmd.ExecuteNonQuery();
                    }

                    transaction.Commit();
                }
                catch
                {
                    transaction.Rollback();
                    throw;
                }
            }
        }

        #endregion

        public void Dispose()
        {
            _connection?.Close();
            _connection?.Dispose();
        }
    }
}
