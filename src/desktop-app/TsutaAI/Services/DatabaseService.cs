﻿using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SQLite;
using System.IO;
using TsutaAI.Models;

namespace TsutaAI.Services
{
    public class DatabaseService : IDisposable
    {
        private readonly SQLiteConnection _connection;
        private const string CreateUsersTableSql = @"
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
        ";

        private const string CreateProjectsTableSql = @"
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('planning', 'active', 'completed', 'cancelled')),
                created_by INTEGER,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            );
        ";

        private const string CreateTasksTableSql = @"
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                assigned_to INTEGER,
                assignee_role TEXT DEFAULT '',
                estimated_hours REAL,
                actual_hours REAL DEFAULT 0,
                priority TEXT CHECK(priority IN ('low', 'medium', 'high')),
                status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'completed', 'cancelled')),
                progress INTEGER DEFAULT 0,
                due_date TEXT,
                start_date TEXT,
                end_date TEXT,
                actual_start_date TEXT,
                actual_end_date TEXT,
                deliverable TEXT DEFAULT '',
                parent_task_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                dependencies TEXT,
                task_key TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL
            );
        ";

        private const string CreateWorkLogsTableSql = @"
            CREATE TABLE IF NOT EXISTS work_logs (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration_minutes INTEGER,
                activity_type TEXT,
                notes TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        ";

        // AI監視機能用テーブル（Phase 1追加）
        private const string CreateActivitySessionsTableSql = @"
            CREATE TABLE IF NOT EXISTS activity_sessions (
                session_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                window_title TEXT,
                process_name TEXT,
                start_time TEXT NOT NULL,
                end_time TEXT,
                duration_seconds INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        ";

        private const string CreateFileDiffsTableSql = @"
            CREATE TABLE IF NOT EXISTS file_diffs (
                diff_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                change_type TEXT, -- 'added', 'modified', 'deleted'
                diff_content TEXT, -- Git diff形式
                lines_added INTEGER DEFAULT 0,
                lines_removed INTEGER DEFAULT 0,
                timestamp TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        ";

        private const string CreateSystemPerformanceTableSql = @"
            CREATE TABLE IF NOT EXISTS system_performance (
                perf_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                cpu_usage REAL,
                memory_usage_mb INTEGER,
                timestamp TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
                top_windows TEXT, -- JSON形式でトップ5ウィンドウ
                file_changes_count INTEGER DEFAULT 0,
                lines_added INTEGER DEFAULT 0,
                lines_removed INTEGER DEFAULT 0,
                activity_intensity TEXT, -- 'high', 'medium', 'low'
                avg_cpu_usage REAL,
                avg_memory_mb INTEGER,
                ai_analysis_status TEXT DEFAULT 'pending', -- 'pending', 'analyzing', 'completed', 'failed'
                ai_analysis_result TEXT, -- AI分析結果（JSON）
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        ";

        // AIアシスタントチャット履歴テーブル
        private const string CreateAiChatHistoryTableSql = @"
            CREATE TABLE IF NOT EXISTS ai_chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                message_id TEXT NOT NULL,
                role TEXT NOT NULL, -- 'user' or 'assistant'
                content TEXT NOT NULL,
                preview_json TEXT, -- 変更プレビューのJSON
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        ";

        public DatabaseService(string dbPath)
        {
            string fullPath = Path.GetFullPath(dbPath);
            string directory = Path.GetDirectoryName(fullPath);

            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            bool needsInitialization = !File.Exists(fullPath);
            string connectionString = $"Data Source={fullPath};Version=3;";
            _connection = new SQLiteConnection(connectionString);
            _connection.Open();

            InitializeSchema(); // テーブルが存在しない場合は作成
            EnsureSchemaCompatibility(); // 既存テーブルのスキーマを最新化
            //EnsureSampleData();
        }

        private void InitializeSchema()
        {
            foreach (var statement in new[]
                     {
                         CreateUsersTableSql,
                         CreateProjectsTableSql,
                         CreateTasksTableSql,
                         CreateWorkLogsTableSql,
                         CreateActivitySessionsTableSql,
                         CreateFileDiffsTableSql,
                         CreateSystemPerformanceTableSql,
                         CreateHourlyActivitySummaryTableSql,
                         CreateAiChatHistoryTableSql
                     })
            {
                using (var command = new SQLiteCommand(statement, _connection))
                {
                    command.ExecuteNonQuery();
                }
            }
        }

        private void EnsureSchemaCompatibility()
        {
            EnsureUsersSchema();
            EnsureProjectsSchema();
            EnsureTasksSchema();
            EnsureWorkLogsSchema();
            EnsureActivitySessionsSchema();
            EnsureFileDiffsSchema();
            EnsureSystemPerformanceSchema();
            EnsureHourlyActivitySummarySchema();
            EnsureAiChatHistorySchema();
        }

        private void EnsureAiChatHistorySchema()
        {
            if (!TableExists("ai_chat_history"))
            {
                ExecuteNonQuery(CreateAiChatHistoryTableSql);
            }
        }

        private void EnsureUsersSchema()
        {
            if (!TableExists("users"))
            {
                ExecuteNonQuery(CreateUsersTableSql);
                return;
            }

            // 既存のカラムを取得
            var existingColumns = GetColumnNames("users");

            // idカラムが存在しない場合は、テーブルを再作成
            if (!existingColumns.Contains("id"))
            {
                bool legacyHasUserId = existingColumns.Contains("user_id");
                bool legacyHasEmail = existingColumns.Contains("email");
                bool legacyHasCreatedAt = existingColumns.Contains("created_at");

                using (var transaction = _connection.BeginTransaction())
                {
                    try
                    {
                        ExecuteNonQuery("DROP TABLE IF EXISTS users_legacy;", transaction);
                        ExecuteNonQuery("ALTER TABLE users RENAME TO users_legacy;", transaction);
                        ExecuteNonQuery(CreateUsersTableSql, transaction);

                        // idカラムの変換: user_idが存在すればそれを使用、なければROWIDを使用
                        string idExpression = legacyHasUserId ? "user_id" : "CAST(ROWID AS INTEGER)";
                        string emailColumn = legacyHasEmail ? "email" : "NULL";
                        string createdAtColumn = legacyHasCreatedAt ? "COALESCE(created_at, datetime('now'))" : "datetime('now')";

                        ExecuteNonQuery($@"
                        INSERT INTO users (id, username, full_name, email, created_at)
                        SELECT
                            {idExpression},
                            username,
                            full_name,
                            {emailColumn},
                            {createdAtColumn}
                        FROM users_legacy;
                    ", transaction);
                        ExecuteNonQuery("DROP TABLE users_legacy;", transaction);
                        transaction.Commit();
                    }
                    catch
                    {
                        transaction.Rollback();
                        throw;
                    }
                }
                return;
            }

            // emailカラムが存在しない場合は追加
            if (!existingColumns.Contains("email"))
            {
                ExecuteNonQuery("ALTER TABLE users ADD COLUMN email TEXT;");
            }

            // created_atカラムが存在しない場合は追加
            if (!existingColumns.Contains("created_at"))
            {
                ExecuteNonQuery("ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));");
            }
        }

        private void EnsureProjectsSchema()
        {
            if (!TableExists("projects"))
            {
                ExecuteNonQuery(CreateProjectsTableSql);
                return;
            }

            if (TableHasColumn("projects", "id") && TableHasColumn("projects", "name"))
            {
                return;
            }

            using (var transaction = _connection.BeginTransaction())
            {
                try
                {
                    ExecuteNonQuery("DROP TABLE IF EXISTS projects_legacy;", transaction);
                    ExecuteNonQuery("ALTER TABLE projects RENAME TO projects_legacy;", transaction);
                    ExecuteNonQuery(CreateProjectsTableSql, transaction);
                    ExecuteNonQuery(@"
                        INSERT INTO projects (id, name)
                        SELECT 
                            project_id,
                            project_name
                        FROM projects_legacy;
                    ", transaction);
                    ExecuteNonQuery("DROP TABLE projects_legacy;", transaction);
                    transaction.Commit();
                }
                catch
                {
                    transaction.Rollback();
                    throw;
                }
            }
        }
        
        private void EnsureTasksSchema()
        {
            if (!TableExists("tasks"))
            {
                ExecuteNonQuery(CreateTasksTableSql);
                return;
            }

            // 新しいスキーマに必要なカラムが全て存在するかチェック
            var columns = GetColumnNames("tasks");
            bool needsMigration = !columns.Contains("assigned_to") ||
                                  !columns.Contains("estimated_hours") ||
                                  !columns.Contains("status") ||
                                  columns.Contains("assignee_user_id") ||
                                  columns.Contains("estimated_minutes") ||
                                  columns.Contains("is_completed");

            if (!needsMigration)
            {
                return;
            }

            var legacyColumns = GetColumnNames("tasks");

            // idカラムの変換
            string idExpression = legacyColumns.Contains("id")
                ? "id"
                : legacyColumns.Contains("task_id")
                    ? "task_id"
                    : "CAST(ROWID AS INTEGER)";

            // nameカラムの変換
            string nameExpression = legacyColumns.Contains("name")
                ? "COALESCE(name, '')"
                : legacyColumns.Contains("title")
                    ? "COALESCE(title, '')"
                    : legacyColumns.Contains("task_name")
                        ? "COALESCE(task_name, '')"
                        : "''";

            // project_idはそのまま
            string projectExpression = legacyColumns.Contains("project_id") ? "project_id" : "NULL";

            // descriptionカラムの変換
            string descriptionExpression = legacyColumns.Contains("description") ? "description" : "NULL";

            // assigned_toカラムの変換 (assignee_user_idから)
            string assignedToExpression = legacyColumns.Contains("assigned_to")
                ? "assigned_to"
                : legacyColumns.Contains("assignee_user_id")
                    ? "assignee_user_id"
                    : "NULL";

            // estimated_hoursカラムの変換 (estimated_minutesから)
            string estimatedHoursExpression = legacyColumns.Contains("estimated_hours")
                ? "COALESCE(estimated_hours, 0.0)"
                : legacyColumns.Contains("estimated_minutes")
                    ? "CAST(COALESCE(estimated_minutes, 0) AS REAL) / 60.0"
                    : "0.0";

            // actual_hoursカラムの変換
            string actualHoursExpression = legacyColumns.Contains("actual_hours") ? "actual_hours" : "0.0";

            // priorityカラムの変換 (INTEGERからTEXTへ)
            string priorityExpression = legacyColumns.Contains("priority")
                ? @"CASE
                        WHEN typeof(priority) IN ('text') THEN priority
                        WHEN CAST(priority AS INTEGER) = 3 THEN 'high'
                        WHEN CAST(priority AS INTEGER) = 2 THEN 'medium'
                        WHEN CAST(priority AS INTEGER) = 1 THEN 'low'
                        ELSE NULL
                   END"
                : "NULL";

            // statusカラムの変換 (is_completedから)
            string statusExpression = legacyColumns.Contains("status")
                ? "status"
                : legacyColumns.Contains("is_completed")
                    ? @"CASE WHEN COALESCE(is_completed, 0) IN (1, '1', 'true', 'TRUE') THEN 'completed' ELSE 'todo' END"
                    : "'todo'";

            // 日付カラムの変換
            string dueDateExpression = legacyColumns.Contains("due_date") ? "due_date" : "NULL";
            string startDateExpression = legacyColumns.Contains("start_date") ? "start_date" : "NULL";
            string endDateExpression = legacyColumns.Contains("end_date") ? "end_date" : "NULL";

            // 階層構造カラムの変換
            string parentTaskIdExpression = legacyColumns.Contains("parent_task_id") ? "parent_task_id" : "NULL";
            string sortOrderExpression = legacyColumns.Contains("sort_order") ? "sort_order" : "0";
            string dependenciesExpression = legacyColumns.Contains("dependencies") ? "dependencies" : "NULL";

            // タイムスタンプカラムの変換
            string createdAtExpression = legacyColumns.Contains("created_at") ? "created_at" : "datetime('now', 'localtime')";
            string updatedAtExpression = legacyColumns.Contains("updated_at") ? "updated_at" : "datetime('now', 'localtime')";

            using (var transaction = _connection.BeginTransaction())
            {
                try
                {
                    ExecuteNonQuery("DROP TABLE IF EXISTS tasks_legacy;", transaction);
                    ExecuteNonQuery("ALTER TABLE tasks RENAME TO tasks_legacy;", transaction);
                    ExecuteNonQuery(CreateTasksTableSql, transaction);
                    string insertSql = $@"
                        INSERT INTO tasks (
                            id, project_id, name, description, assigned_to,
                            estimated_hours, actual_hours, priority, status,
                            due_date, start_date, end_date,
                            parent_task_id, sort_order, dependencies,
                            created_at, updated_at
                        )
                        SELECT
                            {idExpression},
                            {projectExpression},
                            {nameExpression},
                            {descriptionExpression},
                            {assignedToExpression},
                            {estimatedHoursExpression},
                            {actualHoursExpression},
                            {priorityExpression},
                            {statusExpression},
                            {dueDateExpression},
                            {startDateExpression},
                            {endDateExpression},
                            {parentTaskIdExpression},
                            {sortOrderExpression},
                            {dependenciesExpression},
                            {createdAtExpression},
                            {updatedAtExpression}
                        FROM tasks_legacy;";
                    ExecuteNonQuery(insertSql, transaction);
                    ExecuteNonQuery("DROP TABLE tasks_legacy;", transaction);
                    transaction.Commit();
                }
                catch
                {
                    transaction.Rollback();
                    throw;
                }
            }

            // actual_start_date と actual_end_date カラムを追加（既存のテーブルに対して）
            var currentColumns = GetColumnNames("tasks");
            if (!currentColumns.Contains("actual_start_date"))
            {
                ExecuteNonQuery("ALTER TABLE tasks ADD COLUMN actual_start_date TEXT;");
            }
            if (!currentColumns.Contains("actual_end_date"))
            {
                ExecuteNonQuery("ALTER TABLE tasks ADD COLUMN actual_end_date TEXT;");
            }
            if (!currentColumns.Contains("deliverable"))
            {
                ExecuteNonQuery("ALTER TABLE tasks ADD COLUMN deliverable TEXT DEFAULT '';");
            }
        }

        private void EnsureWorkLogsSchema()
        {
            if (!TableExists("work_logs"))
            {
                ExecuteNonQuery(CreateWorkLogsTableSql);
                return;
            }

            // 新しいカラムを追加
            if (!TableHasColumn("work_logs", "activity_type"))
            {
                ExecuteNonQuery("ALTER TABLE work_logs ADD COLUMN activity_type TEXT;");
            }

            if (!TableHasColumn("work_logs", "notes"))
            {
                ExecuteNonQuery("ALTER TABLE work_logs ADD COLUMN notes TEXT;");
            }

            if (!TableHasColumn("work_logs", "created_at"))
            {
                ExecuteNonQuery("ALTER TABLE work_logs ADD COLUMN created_at TEXT DEFAULT (datetime('now', 'localtime'));");
            }

            // idカラムが存在する場合、log_idに変換
            if (TableHasColumn("work_logs", "id") && !TableHasColumn("work_logs", "log_id"))
            {
                using (var transaction = _connection.BeginTransaction())
                {
                    try
                    {
                        ExecuteNonQuery("DROP TABLE IF EXISTS work_logs_legacy;", transaction);
                        ExecuteNonQuery("ALTER TABLE work_logs RENAME TO work_logs_legacy;", transaction);
                        ExecuteNonQuery(CreateWorkLogsTableSql, transaction);
                        ExecuteNonQuery(@"
                            INSERT INTO work_logs (log_id, task_id, user_id, start_time, end_time, duration_minutes, activity_type, notes, created_at)
                            SELECT
                                id,
                                task_id,
                                user_id,
                                start_time,
                                end_time,
                                duration_minutes,
                                activity_type,
                                notes,
                                COALESCE(created_at, datetime('now', 'localtime'))
                            FROM work_logs_legacy;
                        ", transaction);
                        ExecuteNonQuery("DROP TABLE work_logs_legacy;", transaction);
                        transaction.Commit();
                    }
                    catch
                    {
                        transaction.Rollback();
                        throw;
                    }
                }
            }
        }

        // AI監視機能用テーブルのスキーマ確認（Phase 1追加）
        private void EnsureActivitySessionsSchema()
        {
            if (!TableExists("activity_sessions"))
            {
                ExecuteNonQuery(CreateActivitySessionsTableSql);
            }
        }

        private void EnsureFileDiffsSchema()
        {
            if (!TableExists("file_diffs"))
            {
                ExecuteNonQuery(CreateFileDiffsTableSql);
            }
        }

        private void EnsureSystemPerformanceSchema()
        {
            if (!TableExists("system_performance"))
            {
                ExecuteNonQuery(CreateSystemPerformanceTableSql);
            }
        }

        private void EnsureHourlyActivitySummarySchema()
        {
            if (!TableExists("hourly_activity_summary"))
            {
                ExecuteNonQuery(CreateHourlyActivitySummaryTableSql);
            }
        }

        private bool TableExists(string tableName)
        {
            const string sql = "SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name = @name;";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@name", tableName);
                return Convert.ToInt32(command.ExecuteScalar()) > 0;
            }
        }

        private bool TableHasColumn(string tableName, string columnName)
        {
            using (var command = new SQLiteCommand($"PRAGMA table_info({tableName});", _connection))
            using (var reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    var name = reader["name"]?.ToString();
                    if (string.Equals(name, columnName, StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }
            }
            return false;
        }

        private HashSet<string> GetColumnNames(string tableName)
        {
            var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var command = new SQLiteCommand($"PRAGMA table_info({tableName});", _connection))
            using (var reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    var name = reader["name"]?.ToString();
                    if (!string.IsNullOrEmpty(name))
                    {
                        result.Add(name);
                    }
                }
            }
            return result;
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

        private void EnsureSampleData()
        {
            using (var transaction = _connection.BeginTransaction())
            {
                try
                {
                    int userCount = Convert.ToInt32(new SQLiteCommand("SELECT COUNT(*) FROM users", _connection, transaction).ExecuteScalar());
                    if (userCount == 0)
                    {
                        using (var command = new SQLiteCommand("INSERT INTO users (username, full_name, email, created_at) VALUES (@username, @fullName, @email, @createdAt)", _connection, transaction))
                        {
                            command.Parameters.AddWithValue("@username", "demo_user");
                            command.Parameters.AddWithValue("@fullName", "デモ ユーザー");
                            command.Parameters.AddWithValue("@email", "demo@example.com");
                            command.Parameters.AddWithValue("@createdAt", DateTime.UtcNow.ToString("o"));
                            command.ExecuteNonQuery();
                        }
                    }

                    int projectCount = Convert.ToInt32(new SQLiteCommand("SELECT COUNT(*) FROM projects", _connection, transaction).ExecuteScalar());
                    if (projectCount == 0)
                    {
                        using (var command = new SQLiteCommand("INSERT INTO projects (name) VALUES (@name)", _connection, transaction))
                        {
                            command.Parameters.AddWithValue("@name", "デモプロジェクト");
                            command.ExecuteNonQuery();
                        }
                    }

                    int defaultUserId = Convert.ToInt32(new SQLiteCommand("SELECT id FROM users ORDER BY id LIMIT 1", _connection, transaction).ExecuteScalar());
                    int defaultProjectId = Convert.ToInt32(new SQLiteCommand("SELECT id FROM projects ORDER BY id LIMIT 1", _connection, transaction).ExecuteScalar());

                    int taskCount = Convert.ToInt32(new SQLiteCommand("SELECT COUNT(*) FROM tasks", _connection, transaction).ExecuteScalar());
                    if (taskCount == 0)
                    {
                        var insertTaskSql = @"
                            INSERT INTO tasks (
                                id, project_id, name, description, assigned_to,
                                estimated_hours, actual_hours, priority, status,
                                due_date, start_date, end_date,
                                parent_task_id, sort_order, dependencies
                            )
                            VALUES (
                                @id, @projectId, @name, @description, @assignedTo,
                                @estimatedHours, @actualHours, @priority, @status,
                                @dueDate, @startDate, @endDate,
                                @parentTaskId, @sortOrder, @dependencies
                            )";
                        using (var command = new SQLiteCommand(insertTaskSql, _connection, transaction))
                        {
                            command.Parameters.Add("@id", DbType.Int32);
                            command.Parameters.Add("@projectId", DbType.Int32);
                            command.Parameters.Add("@name", DbType.String);
                            command.Parameters.Add("@description", DbType.String);
                            command.Parameters.Add("@assignedTo", DbType.Int32);
                            command.Parameters.Add("@estimatedHours", DbType.Double);
                            command.Parameters.Add("@actualHours", DbType.Double);
                            command.Parameters.Add("@priority", DbType.String);
                            command.Parameters.Add("@status", DbType.String);
                            command.Parameters.Add("@dueDate", DbType.String);
                            command.Parameters.Add("@startDate", DbType.String);
                            command.Parameters.Add("@endDate", DbType.String);
                            command.Parameters.Add("@parentTaskId", DbType.Int32);
                            command.Parameters.Add("@sortOrder", DbType.Int32);
                            command.Parameters.Add("@dependencies", DbType.String);

                            AddTask(command, 1001, "朝会での連絡事項共有", defaultProjectId, defaultUserId, 0.5, "low", "completed");
                            AddTask(command, 1002, "バックエンドAPIの不具合調査", defaultProjectId, defaultUserId, 2.0, "high", "in_progress");
                            AddTask(command, 1003, "新機能仕様のドキュメント作成", defaultProjectId, defaultUserId, 1.5, "medium", "todo");
                        }
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

        private static void AddTask(SQLiteCommand command, int id, string name, int projectId, int assignedTo, double estimatedHours, string priority, string status)
        {
            command.Parameters["@id"].Value = id;
            command.Parameters["@projectId"].Value = projectId;
            command.Parameters["@name"].Value = name;
            command.Parameters["@description"].Value = DBNull.Value;
            command.Parameters["@assignedTo"].Value = assignedTo;
            command.Parameters["@estimatedHours"].Value = estimatedHours;
            command.Parameters["@actualHours"].Value = 0.0;
            command.Parameters["@priority"].Value = priority;
            command.Parameters["@status"].Value = status;
            command.Parameters["@dueDate"].Value = DBNull.Value;
            command.Parameters["@startDate"].Value = DBNull.Value;
            command.Parameters["@endDate"].Value = DBNull.Value;
            command.Parameters["@parentTaskId"].Value = DBNull.Value;
            command.Parameters["@sortOrder"].Value = 0;
            command.Parameters["@dependencies"].Value = DBNull.Value;
            command.ExecuteNonQuery();
        }

        public User GetUserByUsername(string username)
        {
            string sql = "SELECT id, username, full_name, email, created_at FROM users WHERE username = @username LIMIT 1";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@username", username);
                using (var reader = command.ExecuteReader())
                {
                    if (reader.Read()) return MapReaderToUser(reader);
                }
            }
            return null;
        }

        public User GetUserById(int id)
        {
            string sql = "SELECT id, username, full_name, email, created_at FROM users WHERE id = @id LIMIT 1";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@id", id);
                using (var reader = command.ExecuteReader())
                {
                    if (reader.Read()) return MapReaderToUser(reader);
                }
            }
            return null;
        }

        public void UpsertUser(User user)
        {
            if (user.Id <= 0)
            {
                string sql = "INSERT INTO users (username, full_name, email, created_at) VALUES (@username, @fullName, @email, @createdAt)";
                using (var command = new SQLiteCommand(sql, _connection))
                {
                    command.Parameters.AddWithValue("@username", user.Username);
                    command.Parameters.AddWithValue("@fullName", user.FullName);
                    command.Parameters.AddWithValue("@email", user.Email ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@createdAt", user.CreatedAt.ToString("o"));
                    command.ExecuteNonQuery();
                }
            }
            else
            {
                string sql = "UPDATE users SET username = @username, full_name = @fullName, email = @email WHERE id = @id";
                using (var command = new SQLiteCommand(sql, _connection))
                {
                    command.Parameters.AddWithValue("@id", user.Id);
                    command.Parameters.AddWithValue("@username", user.Username);
                    command.Parameters.AddWithValue("@fullName", user.FullName);
                    command.Parameters.AddWithValue("@email", user.Email ?? (object)DBNull.Value);
                    command.ExecuteNonQuery();
                }
            }
        }

        public void UpsertTask(TaskItem task, SQLiteTransaction transaction = null)
        {
            string sql = @"
                INSERT INTO tasks (
                    id, project_id, name, description, assigned_to,
                    estimated_hours, actual_hours, priority, status,
                    due_date, start_date, end_date,
                    actual_start_date, actual_end_date,
                    parent_task_id, sort_order, dependencies,
                    task_key, deliverable,
                    updated_at
                )
                VALUES (
                    @id, @projectId, @name, @description, @assignedTo,
                    @estimatedHours, @actualHours, @priority, @status,
                    @dueDate, @startDate, @endDate,
                    @actualStartDate, @actualEndDate,
                    @parentTaskId, @sortOrder, @dependencies,
                    @taskKey, @deliverable,
                    datetime('now', 'localtime')
                )
                ON CONFLICT(id) DO UPDATE SET
                    project_id = excluded.project_id,
                    name = excluded.name,
                    description = excluded.description,
                    assigned_to = excluded.assigned_to,
                    estimated_hours = excluded.estimated_hours,
                    actual_hours = excluded.actual_hours,
                    priority = excluded.priority,
                    status = excluded.status,
                    due_date = excluded.due_date,
                    start_date = excluded.start_date,
                    end_date = excluded.end_date,
                    actual_start_date = excluded.actual_start_date,
                    actual_end_date = excluded.actual_end_date,
                    parent_task_id = excluded.parent_task_id,
                    sort_order = excluded.sort_order,
                    dependencies = excluded.dependencies,
                    task_key = excluded.task_key,
                    deliverable = excluded.deliverable,
                    updated_at = datetime('now', 'localtime');";

            using (var command = new SQLiteCommand(sql, _connection, transaction))
            {
                command.Parameters.AddWithValue("@id", task.Id);
                command.Parameters.AddWithValue("@projectId", task.ProjectId);
                command.Parameters.AddWithValue("@name", task.Title ?? string.Empty);
                command.Parameters.AddWithValue("@description", task.Description ?? (object)DBNull.Value);
                command.Parameters.AddWithValue("@assignedTo", task.AssigneeUserId > 0 ? (object)task.AssigneeUserId : DBNull.Value);

                // EstimatedMinutesを時間に変換
                double estimatedHours = task.EstimatedMinutes / 60.0;
                command.Parameters.AddWithValue("@estimatedHours", estimatedHours);
                command.Parameters.AddWithValue("@actualHours", 0.0); // TaskItemにactual_hoursプロパティがないためデフォルト値

                command.Parameters.AddWithValue("@priority", !string.IsNullOrEmpty(task.Priority) ? task.Priority.ToLowerInvariant() : (object)DBNull.Value);

                // Statusを使用、なければIsCompletedから判定
                string status = !string.IsNullOrEmpty(task.Status) ? task.Status.ToLowerInvariant() : (task.IsCompleted ? "completed" : "todo");
                command.Parameters.AddWithValue("@status", status);

                // 日付の変換
                command.Parameters.AddWithValue("@dueDate", task.PlannedEnd.HasValue ? task.PlannedEnd.Value.ToString("yyyy-MM-dd HH:mm:ss") : (object)DBNull.Value);
                command.Parameters.AddWithValue("@startDate", task.PlannedStart.HasValue ? task.PlannedStart.Value.ToString("yyyy-MM-dd HH:mm:ss") : (object)DBNull.Value);
                command.Parameters.AddWithValue("@endDate", task.PlannedEnd.HasValue ? task.PlannedEnd.Value.ToString("yyyy-MM-dd HH:mm:ss") : (object)DBNull.Value);
                command.Parameters.AddWithValue("@actualStartDate", task.ActualStart.HasValue ? task.ActualStart.Value.ToString("yyyy-MM-dd HH:mm:ss") : (object)DBNull.Value);
                command.Parameters.AddWithValue("@actualEndDate", task.ActualEnd.HasValue ? task.ActualEnd.Value.ToString("yyyy-MM-dd HH:mm:ss") : (object)DBNull.Value);

                // TaskItemに存在しないプロパティはデフォルト値
                command.Parameters.AddWithValue("@parentTaskId", DBNull.Value);
                command.Parameters.AddWithValue("@sortOrder", 0);
                command.Parameters.AddWithValue("@dependencies", DBNull.Value);
                command.Parameters.AddWithValue("@taskKey", task.TaskKey ?? (object)DBNull.Value);
                command.Parameters.AddWithValue("@deliverable", task.Deliverable ?? (object)DBNull.Value);

                command.ExecuteNonQuery();
            }
        }

        public void AddWorkLog(WorkLog log)
        {
            string sql = "INSERT INTO work_logs (task_id, user_id, start_time, end_time, duration_minutes) VALUES (@taskId, @userId, @startTime, @endTime, @durationMinutes)";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@taskId", log.TaskId);
                command.Parameters.AddWithValue("@userId", log.UserId);
                command.Parameters.AddWithValue("@startTime", log.StartTime.ToString("o"));
                command.Parameters.AddWithValue("@endTime", log.EndTime.ToString("o"));
                command.Parameters.AddWithValue("@durationMinutes", log.DurationMinutes);
                command.ExecuteNonQuery();
            }
        }

        public List<TaskItem> LoadTasks(int userId)
        {
            var result = new List<TaskItem>();
            string sql = @"
                SELECT
                    t.id,
                    t.name,
                    t.description,
                    t.project_id,
                    p.name as project_name,
                    t.assigned_to,
                    t.estimated_hours,
                    t.actual_hours,
                    t.priority,
                    t.status,
                    t.due_date,
                    t.start_date,
                    t.end_date,
                    t.actual_start_date,
                    t.actual_end_date,
                    t.parent_task_id,
                    t.sort_order,
                    t.dependencies,
                    t.task_key,
                    t.deliverable
                FROM tasks t
                LEFT JOIN projects p ON t.project_id = p.id
                WHERE t.assigned_to = @userId
                  AND t.status NOT IN ('completed', 'cancelled')
                  AND (
                      (t.due_date IS NOT NULL AND date(t.due_date) = date('now', 'localtime'))
                      OR
                      (t.start_date IS NOT NULL AND date(t.start_date) <= date('now', 'localtime')
                       AND (t.end_date IS NULL OR date(t.end_date) >= date('now', 'localtime')))
                      OR
                      (t.status = 'in_progress')
                  );
            ";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        // estimated_hoursを分に変換
                        double estimatedHours = reader["estimated_hours"] == DBNull.Value ? 0.0 : Convert.ToDouble(reader["estimated_hours"]);
                        int estimatedMinutes = (int)Math.Round(estimatedHours * 60);

                        // statusからIsCompletedを判定
                        string status = reader["status"]?.ToString() ?? "todo";
                        bool isCompleted = status.Equals("completed", StringComparison.OrdinalIgnoreCase);

                        // priorityのマッピング（TEXTとして保存されている）
                        string priority = reader["priority"]?.ToString() ?? string.Empty;
                        if (!string.IsNullOrEmpty(priority))
                        {
                            priority = char.ToUpperInvariant(priority[0]) + priority.Substring(1).ToLowerInvariant();
                        }

                        result.Add(new TaskItem
                        {
                            Id = Convert.ToInt32(reader["id"]),
                            Title = reader["name"]?.ToString() ?? string.Empty,
                            Description = reader["description"]?.ToString() ?? string.Empty,
                            ProjectId = reader["project_id"] == DBNull.Value ? 0 : Convert.ToInt32(reader["project_id"]),
                            ProjectName = reader["project_name"]?.ToString() ?? string.Empty,
                            AssigneeUserId = reader["assigned_to"] == DBNull.Value ? 0 : Convert.ToInt32(reader["assigned_to"]),
                            EstimatedMinutes = estimatedMinutes,
                            Priority = priority,
                            Status = status,
                            IsCompleted = isCompleted,
                            TaskKey = reader["task_key"]?.ToString() ?? string.Empty,
                            Deliverable = reader["deliverable"]?.ToString() ?? string.Empty,
                            PlannedStart = reader["start_date"] == DBNull.Value ? (DateTime?)null : DateTime.Parse(reader["start_date"].ToString()),
                            PlannedEnd = reader["due_date"] == DBNull.Value ? (DateTime?)null : DateTime.Parse(reader["due_date"].ToString()),
                            ActualStart = reader["actual_start_date"] == DBNull.Value ? (DateTime?)null : DateTime.Parse(reader["actual_start_date"].ToString()),
                            ActualEnd = reader["actual_end_date"] == DBNull.Value ? (DateTime?)null : DateTime.Parse(reader["actual_end_date"].ToString())
                        });
                    }
                }
            }
            return result;
        }

        private static string MapPriority(object dbValue)
        {
            if (dbValue == null || dbValue == DBNull.Value)
            {
                return string.Empty;
            }

            if (dbValue is long || dbValue is int)
            {
                int value = Convert.ToInt32(dbValue);
                if (value >= 3)
                {
                    return "High";
                }

                if (value == 2)
                {
                    return "Medium";
                }

                if (value == 1)
                {
                    return "Low";
                }

                return string.Empty;
            }

            var text = dbValue.ToString();
            switch (text)
            {
                case "0":
                    return string.Empty;
                case "1":
                    return "Low";
                case "2":
                    return "Medium";
                case "3":
                    return "High";
                default:
                    return text;
            }
        }

        public List<WorkLog> LoadWorkLogsForToday(int userId)
        {
            var result = new List<WorkLog>();
            string sql = "SELECT log_id, task_id, user_id, start_time, end_time, duration_minutes FROM work_logs WHERE user_id = @userId AND DATE(start_time) = DATE('now')";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        result.Add(new WorkLog
                        {
                            Id = Convert.ToInt32(reader["log_id"]),
                            TaskId = Convert.ToInt32(reader["task_id"]),
                            UserId = Convert.ToInt32(reader["user_id"]),
                            StartTime = DateTime.Parse(reader["start_time"].ToString()).ToUniversalTime(),
                            EndTime = DateTime.Parse(reader["end_time"].ToString()).ToUniversalTime(),
                            DurationMinutes = Convert.ToInt32(reader["duration_minutes"])
                        });
                    }
                }
            }
            return result;
        }

        /// <summary>
        /// 作業ログをデータベースに保存します。
        /// </summary>
        /// <param name="workLog">保存する作業ログ</param>
        /// <returns>保存されたWorkLogのID</returns>
        public int SaveWorkLog(WorkLog workLog)
        {
            // work_logsテーブルにnotesカラムとactivity_typeカラムがあるか確認
            bool hasNotesColumn = TableHasColumn("work_logs", "notes");
            bool hasActivityTypeColumn = TableHasColumn("work_logs", "activity_type");

            string sql;
            if (hasNotesColumn && hasActivityTypeColumn)
            {
                sql = @"INSERT INTO work_logs (task_id, user_id, start_time, end_time, duration_minutes, activity_type, notes)
                        VALUES (@taskId, @userId, @startTime, @endTime, @durationMinutes, @activityType, @notes)";
            }
            else if (hasNotesColumn)
            {
                sql = @"INSERT INTO work_logs (task_id, user_id, start_time, end_time, duration_minutes, notes)
                        VALUES (@taskId, @userId, @startTime, @endTime, @durationMinutes, @notes)";
            }
            else
            {
                sql = @"INSERT INTO work_logs (task_id, user_id, start_time, end_time, duration_minutes)
                        VALUES (@taskId, @userId, @startTime, @endTime, @durationMinutes)";
            }

            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@taskId", workLog.TaskId);
                command.Parameters.AddWithValue("@userId", workLog.UserId);
                command.Parameters.AddWithValue("@startTime", workLog.StartTime.ToString("o"));
                command.Parameters.AddWithValue("@endTime", workLog.EndTime.ToString("o"));
                command.Parameters.AddWithValue("@durationMinutes", workLog.DurationMinutes);

                if (hasActivityTypeColumn)
                {
                    command.Parameters.AddWithValue("@activityType", workLog.ActivityType ?? "作業");
                }

                if (hasNotesColumn)
                {
                    command.Parameters.AddWithValue("@notes", workLog.Notes ?? string.Empty);
                }

                command.ExecuteNonQuery();
            }

            // 最後に挿入されたIDを取得
            using (var command = new SQLiteCommand("SELECT last_insert_rowid()", _connection))
            {
                return Convert.ToInt32(command.ExecuteScalar());
            }
        }

        /// <summary>
        /// 複数の作業ログをまとめて保存します。
        /// </summary>
        /// <param name="workLogs">保存する作業ログのリスト</param>
        public void SaveWorkLogs(List<WorkLog> workLogs)
        {
            if (workLogs == null || workLogs.Count == 0) return;

            using (var transaction = _connection.BeginTransaction())
            {
                try
                {
                    foreach (var workLog in workLogs)
                    {
                        SaveWorkLog(workLog);
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

        // ====================================
        // AI監視機能用CRUD methods (Phase 3)
        // ====================================

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
                                // 個別レコードのエラーはログに記録してスキップ
                                System.Diagnostics.Debug.WriteLine($"Error parsing activity summary record: {ex.Message}");
                                continue;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // クエリ全体のエラーはログに記録して空のリストを返す
                System.Diagnostics.Debug.WriteLine($"Error fetching activity summaries: {ex.Message}");
            }

            return summaries;
        }

        private User MapReaderToUser(SQLiteDataReader reader)
        {
            return new User
            {
                Id = Convert.ToInt32(reader["id"]),
                Username = reader["username"].ToString(),
                FullName = reader["full_name"].ToString(),
                Email = reader["email"].ToString(),
                CreatedAt = DateTime.Parse(reader["created_at"].ToString()).ToUniversalTime()
            };
        }

        // ====================================
        // AIアシスタントチャット履歴用メソッド
        // ====================================

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

        /// <summary>
        /// ユーザーの全タスクを取得します（AIアシスタント用）
        /// </summary>
        public List<TaskItem> GetTasks(int userId)
        {
            var result = new List<TaskItem>();
            string sql = @"
                SELECT
                    t.id,
                    t.name,
                    t.description,
                    t.project_id,
                    p.name as project_name,
                    t.assigned_to,
                    t.estimated_hours,
                    t.actual_hours,
                    t.priority,
                    t.status,
                    t.progress,
                    t.due_date,
                    t.start_date,
                    t.end_date,
                    t.actual_start_date,
                    t.actual_end_date,
                    t.parent_task_id,
                    t.sort_order,
                    t.dependencies,
                    t.task_key,
                    t.deliverable
                FROM tasks t
                LEFT JOIN projects p ON t.project_id = p.id
                WHERE t.assigned_to = @userId
                ORDER BY t.due_date ASC, t.priority DESC;
            ";
            using (var command = new SQLiteCommand(sql, _connection))
            {
                command.Parameters.AddWithValue("@userId", userId);
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        double estimatedHours = reader["estimated_hours"] == DBNull.Value ? 0.0 : Convert.ToDouble(reader["estimated_hours"]);
                        int estimatedMinutes = (int)Math.Round(estimatedHours * 60);

                        string status = reader["status"]?.ToString() ?? "todo";
                        bool isCompleted = status.Equals("completed", StringComparison.OrdinalIgnoreCase);

                        string priority = reader["priority"]?.ToString() ?? string.Empty;
                        if (!string.IsNullOrEmpty(priority))
                        {
                            priority = char.ToUpperInvariant(priority[0]) + priority.Substring(1).ToLowerInvariant();
                        }

                        result.Add(new TaskItem
                        {
                            Id = Convert.ToInt32(reader["id"]),
                            Title = reader["name"]?.ToString() ?? string.Empty,
                            Description = reader["description"]?.ToString() ?? string.Empty,
                            ProjectId = reader["project_id"] == DBNull.Value ? 0 : Convert.ToInt32(reader["project_id"]),
                            ProjectName = reader["project_name"]?.ToString() ?? string.Empty,
                            AssigneeUserId = reader["assigned_to"] == DBNull.Value ? 0 : Convert.ToInt32(reader["assigned_to"]),
                            EstimatedMinutes = estimatedMinutes,
                            Priority = priority,
                            Status = status,
                            Progress = reader["progress"] == DBNull.Value ? 0 : Convert.ToInt32(reader["progress"]),
                            IsCompleted = isCompleted,
                            TaskKey = reader["task_key"]?.ToString() ?? string.Empty,
                            Deliverable = reader["deliverable"]?.ToString() ?? string.Empty,
                            PlannedStart = reader["start_date"] == DBNull.Value ? (DateTime?)null : DateTime.Parse(reader["start_date"].ToString()),
                            PlannedEnd = reader["due_date"] == DBNull.Value ? (DateTime?)null : DateTime.Parse(reader["due_date"].ToString()),
                            ActualStart = reader["actual_start_date"] == DBNull.Value ? (DateTime?)null : DateTime.Parse(reader["actual_start_date"].ToString()),
                            ActualEnd = reader["actual_end_date"] == DBNull.Value ? (DateTime?)null : DateTime.Parse(reader["actual_end_date"].ToString())
                        });
                    }
                }
            }
            return result;
        }

        public void Dispose()
        {
            _connection?.Close();
            _connection?.Dispose();
        }
    }
}
