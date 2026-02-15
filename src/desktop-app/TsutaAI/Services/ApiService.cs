using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using TsutaAI.Config;
using TsutaAI.Models;
using TsutaAI.Utils;
using System.Net;

namespace TsutaAI.Services
{
    /// <summary>
    /// バックエンド API との通信を担うサービスです。
    /// </summary>
    public class ApiService
    {
        private readonly HttpClient _client;
        private readonly ApiSettings _settings;
        private string _authToken = string.Empty;

        private class ApiResponse<T>
        {
            [JsonProperty("data")]
            public T Data { get; set; }

            [JsonProperty("success")]
            public bool Success { get; set; }

            [JsonProperty("message")]
            public string Message { get; set; }
        }

        public class DashboardSummary
        {
            [JsonProperty("completedToday")]
            public int CompletedToday { get; set; }

            [JsonProperty("pendingTasks")]
            public int PendingTasks { get; set; }

            [JsonProperty("totalFocusMinutes")]
            public int TotalFocusMinutes { get; set; }

            [JsonProperty("aiMessage")]
            public string AiMessage { get; set; }
        }

        public ApiService(ApiSettings settings, ProxySettings proxySettings)
        {
            _settings = settings;
            var handler = ProxyHelper.CreateHandler(proxySettings);
            _client = handler != null ? new HttpClient(handler, true) : new HttpClient();
            _client.Timeout = TimeSpan.FromSeconds(settings.Timeout);
            
            // BaseUrlの正規化: 末尾の / や /api を削除して、ルートURLにする
            var baseUrl = settings.BaseUrl?.Trim();
            if (!string.IsNullOrEmpty(baseUrl))
            {
                // 末尾のスラッシュを削除
                baseUrl = baseUrl.TrimEnd('/');

                // 末尾が /api で終わっている場合は削除 (例: http://localhost:3000/api -> http://localhost:3000)
                if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
                {
                    baseUrl = baseUrl.Substring(0, baseUrl.Length - 4);
                    // 削除後、再度末尾スラッシュがあれば削除
                    baseUrl = baseUrl.TrimEnd('/');
                }
            }

            _client.BaseAddress = new Uri(baseUrl ?? "http://localhost:3000");
            _client.DefaultRequestHeaders.Accept.Clear();
            _client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }

        private async Task<T> SendAsync<T>(HttpMethod method, string path, object body = null)
        {
            // backend-apiは/apiプレフィックスを使用するため、パスが/apiで始まっていない場合は追加
            if (!path.StartsWith("/api/") && !path.StartsWith("api/"))
            {
                path = "/api" + path;
            }

            using (var request = new HttpRequestMessage(method, path))
            {
                if (!string.IsNullOrEmpty(_authToken) && request.Headers.Authorization == null)
                {
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authToken);
                }

                if (body != null)
                {
                    var json = JsonConvert.SerializeObject(body);
                    request.Content = new StringContent(json, Encoding.UTF8, "application/json");
                }

                var response = await _client.SendAsync(request);
                var jsonResponse = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    Logger.Warn($"API呼び出しに失敗しました: {response.StatusCode} {jsonResponse}");
                    throw new InvalidOperationException($"API 呼び出しに失敗しました ({response.StatusCode}).");
                }

                var envelope = JsonConvert.DeserializeObject<ApiResponse<T>>(jsonResponse);
                if (envelope == null)
                {
                    throw new InvalidOperationException("API 応答の解析に失敗しました。");
                }

                if (!envelope.Success)
                {
                    throw new InvalidOperationException(envelope.Message ?? "API からエラーが返されました。");
                }

                return envelope.Data;
            }
        }

        public async Task<User> LoginAsync(string username, string password)
        {
            var user = await SendAsync<User>(HttpMethod.Post, "/auth/login", new { username, password });

            if (!string.IsNullOrWhiteSpace(user?.Token))
            {
                _authToken = user.Token;
                _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _authToken);
            }

            return user;
        }

        /// <summary>
        /// ログアウト処理を行います。保存されているトークンを破棄します。
        /// </summary>
        public void Logout()
        {
            _authToken = string.Empty;
            _client.DefaultRequestHeaders.Authorization = null;
        }

        public async Task<IList<TaskItem>> GetTodayTasksAsync(int userId)
        {
            return await SendAsync<IList<TaskItem>>(HttpMethod.Get, $"/tasks/today?userId={userId}");
        }

        public async Task<IList<TaskItem>> GetUserTasksAsync(int userId)
        {
            return await SendAsync<IList<TaskItem>>(HttpMethod.Get, $"/tasks?assignedTo={userId}");
        }

        public async Task<IList<PersonalTask>> GetPersonalTasksAsync(int userId)
        {
            return await SendAsync<IList<PersonalTask>>(HttpMethod.Get, $"/personal-tasks?userId={userId}");
        }

        public async Task<DashboardSummary> GetDashboardSummaryAsync(int userId)
        {
            return await SendAsync<DashboardSummary>(HttpMethod.Get, $"/dashboards/summary?userId={userId}");
        }

        public async Task SendWorkLogAsync(WorkLog log)
        {
            try
            {
                await SendAsync<object>(HttpMethod.Post, "/worklogs", log);
            }
            catch (Exception ex)
            {
                Logger.Warn($"作業ログ送信に失敗しました: {ex.Message}");
            }
        }

        public async Task SubmitDailyReportAsync(DailyReport report)
        {
            try
            {
                await SendAsync<object>(HttpMethod.Post, "/reports", report);
            }
            catch (Exception ex)
            {
                Logger.Warn($"日報送信に失敗しました: {ex.Message}");
            }
        }

        //public async Task<DailyReportAiFeedback> GenerateDailyReportFeedbackAsync(DailyReportAiRequest request)
        //{
        //    return await SendAsync<DailyReportAiFeedback>(HttpMethod.Post, "/ai/daily-report", request);
        //}

        public async Task<IList<UserSkill>> GetUserSkillsAsync(int userId)
        {
            return await SendAsync<IList<UserSkill>>(HttpMethod.Get, $"/user-skills/{userId}");
        }

        public async Task UpsertUserSkillAsync(UserSkill skill)
        {
            var payload = new
            {
                skillName = skill.SkillName,
                skillLevel = skill.SkillLevel
            };

            await SendAsync<object>(HttpMethod.Post, $"/user-skills/{skill.UserId}", payload);
        }

        public async Task DeleteUserSkillAsync(int userId, string skillName)
        {
            var encoded = WebUtility.UrlEncode(skillName);
            await SendAsync<object>(HttpMethod.Delete, $"/user-skills/{userId}/{encoded}");
        }

        /// <summary>
        /// ユーザー情報を更新します。
        /// </summary>
        public async Task UpdateUserAsync(int userId, object updateData)
        {
            await SendAsync<object>(HttpMethod.Put, $"/users/{userId}", updateData);
        }

        /// <summary>
        /// API接続をテストします。
        /// </summary>
        /// <returns>接続テストの結果</returns>
        public async Task<bool> TestConnectionAsync()
        {
            try
            {
                // シンプルなヘルスチェックエンドポイントを使用
                var response = await _client.GetAsync("/health");

                if (response.IsSuccessStatusCode)
                {
                    Logger.Info($"API接続テスト成功: {_settings.BaseUrl}");
                    return true;
                }
                else
                {
                    Logger.Warn($"API接続テスト失敗: HTTP {response.StatusCode}");
                    return false;
                }
            }
            catch (HttpRequestException ex)
            {
                Logger.Error($"API接続テスト失敗（ネットワークエラー）: {ex.Message}");
                throw new InvalidOperationException($"API サーバーに接続できません。URL: {_settings.BaseUrl}", ex);
            }
            catch (TaskCanceledException)
            {
                Logger.Error($"API接続テスト失敗（タイムアウト）: {_settings.BaseUrl}");
                throw new InvalidOperationException("API サーバーへの接続がタイムアウトしました。");
            }
            catch (Exception ex)
            {
                Logger.Error($"API接続テスト失敗（予期しないエラー）: {ex.Message}");
                throw new InvalidOperationException($"API 接続テスト中にエラーが発生しました: {ex.Message}", ex);
            }
        }

        // ==================================================================================
        // 個人タスク関連メソッド
        // ==================================================================================

        /// <summary>
        /// 個人タスク一覧を取得します。
        /// ユーザーが作成した個人タスクをフィルター条件付きで取得できます。
        /// </summary>
        /// <param name="userId">対象ユーザーID</param>
        /// <param name="status">フィルター条件：タスクステータス（オプション）
        ///   "not-started" = 未着手、"in-progress" = 進行中、"done" = 完了、"on-hold" = 保留</param>
        /// <returns>個人タスクのリスト</returns>
        public async Task<List<PersonalTask>> GetPersonalTasksAsync(int userId, string status = null)
        {
            try
            {
                // クエリパラメータを構築
                var query = $"/personal-tasks?userId={userId}";
                if (!string.IsNullOrEmpty(status))
                {
                    query += $"&status={status}";
                }

                // API から個人タスク一覧を取得
                return await SendAsync<List<PersonalTask>>(HttpMethod.Get, query);
            }
            catch (Exception ex)
            {
                Logger.Error($"個人タスク取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 新しい個人タスクを作成します。
        /// </summary>
        /// <param name="task">作成する個人タスク情報</param>
        /// <returns>作成されたタスク情報（ID と作成日時を含む）</returns>
        public async Task<PersonalTask> CreatePersonalTaskAsync(PersonalTask task)
        {
            try
            {
                // API に POST リクエストを送信してタスクを作成
                return await SendAsync<PersonalTask>(HttpMethod.Post, "/personal-tasks", task);
            }
            catch (Exception ex)
            {
                Logger.Error($"個人タスク作成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 既存の個人タスクを更新します。
        /// タイトル、ステータス、進捗率、メモなどを更新できます。
        /// </summary>
        /// <param name="taskId">更新するタスクのID</param>
        /// <param name="updateData">更新内容（タスク情報の一部）</param>
        /// <returns>更新成功の可否</returns>
        public async Task<bool> UpdatePersonalTaskAsync(int taskId, object updateData)
        {
            try
            {
                // API に PUT リクエストを送信してタスクを更新
                await SendAsync<object>(HttpMethod.Put, $"/personal-tasks/{taskId}", updateData);
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"個人タスク更新に失敗しました（ID: {taskId}）: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 個人タスクを削除します。
        /// </summary>
        /// <param name="taskId">削除するタスクのID</param>
        /// <returns>削除成功の可否</returns>
        public async Task<bool> DeletePersonalTaskAsync(int taskId)
        {
            try
            {
                // API に DELETE リクエストを送信してタスクを削除
                await SendAsync<object>(HttpMethod.Delete, $"/personal-tasks/{taskId}");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"個人タスク削除に失敗しました（ID: {taskId}）: {ex.Message}");
                throw;
            }
        }

        // ==================================================================================
        // プロジェクトタスク関連メソッド（看板ボード用）
        // ==================================================================================

        /// <summary>
        /// プロジェクトタスクのステータスと進捗率を更新します。
        /// プロジェクトタスクではステータスと進捗率のみ更新可能です。
        /// その他のプロパティ（タイトル、説明など）は Web 管理画面からのみ変更できます。
        /// </summary>
        /// <param name="taskId">更新するタスクのID</param>
        /// <param name="status">新しいステータス
        ///   "not-started" = 未着手、"in-progress" = 進行中、"done" = 完了、"on-hold" = 保留</param>
        /// <param name="progress">新しい進捗率（0～100）</param>
        /// <returns>更新成功の可否</returns>
        public async Task<bool> UpdateTaskStatusAsync(int taskId, string status, int progress)
        {
            try
            {
                // ステータスと進捗率を含めたペイロードを作成
                var payload = new { status, progress };

                // API に PUT リクエストを送信
                await SendAsync<object>(HttpMethod.Put, $"/tasks/{taskId}", payload);
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"タスクステータス更新に失敗しました（ID: {taskId}）: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクトタスクにコメントを追加します。
        /// これは作業記録として使用され、チーム内のコミュニケーションに役立ちます。
        /// </summary>
        /// <param name="taskId">コメントを追加するタスクのID</param>
        /// <param name="userId">コメント作成者のユーザーID</param>
        /// <param name="content">コメント内容</param>
        /// <returns>追加成功の可否</returns>
        public async Task<bool> AddTaskCommentAsync(int taskId, int userId, string content)
        {
            try
            {
                // ユーザーID とコメント内容を含めたペイロードを作成
                var payload = new { userId, content };

                // API に POST リクエストを送信
                await SendAsync<object>(HttpMethod.Post, $"/tasks/{taskId}/comments", payload);
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"タスクコメント追加に失敗しました（ID: {taskId}）: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// タスクのコメント一覧を取得します。
        /// </summary>
        /// <param name="taskId">対象タスクのID</param>
        /// <returns>コメント情報のリスト</returns>
        public async Task<List<TaskComment>> GetTaskCommentsAsync(int taskId)
        {
            try
            {
                // API からコメント一覧を取得
                return await SendAsync<List<TaskComment>>(HttpMethod.Get, $"/tasks/{taskId}/comments");
            }
            catch (Exception ex)
            {
                Logger.Error($"タスクコメント取得に失敗しました（ID: {taskId}）: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// タスクのアクティビティログ（更新履歴）を取得します。
        /// ステータス変更、コメント追加などの履歴が記録されます。
        /// </summary>
        /// <param name="taskId">対象タスクのID</param>
        /// <returns>アクティビティログのリスト</returns>
        public async Task<List<TaskActivity>> GetTaskActivityAsync(int taskId)
        {
            try
            {
                // API からアクティビティログを取得
                return await SendAsync<List<TaskActivity>>(HttpMethod.Get, $"/tasks/{taskId}/activity");
            }
            catch (Exception ex)
            {
                Logger.Error($"タスクアクティビティ取得に失敗しました（ID: {taskId}）: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// タスクの添付ファイル一覧を取得します。
        /// </summary>
        /// <param name="taskId">対象タスクのID</param>
        /// <returns>添付ファイル情報のリスト</returns>
        public async Task<List<TaskAttachment>> GetTaskAttachmentsAsync(int taskId)
        {
            try
            {
                // API から添付ファイル一覧を取得
                return await SendAsync<List<TaskAttachment>>(HttpMethod.Get, $"/tasks/{taskId}/attachments");
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク添付ファイル取得に失敗しました（ID: {taskId}）: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// タスクにファイルを添付します。
        /// </summary>
        /// <param name="taskId">対象タスクのID</param>
        /// <param name="filePath">アップロードするファイルのパス</param>
        /// <returns>アップロードされたファイル情報</returns>
        public async Task<TaskAttachment> UploadTaskAttachmentAsync(int taskId, string filePath)
        {
            try
            {
                using (var content = new MultipartFormDataContent())
                {
                    var fileContent = new ByteArrayContent(System.IO.File.ReadAllBytes(filePath));
                    fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                    content.Add(fileContent, "file", System.IO.Path.GetFileName(filePath));

                    using (var request = new HttpRequestMessage(HttpMethod.Post, $"/tasks/{taskId}/attachments"))
                    {
                        if (!string.IsNullOrEmpty(_authToken))
                        {
                            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authToken);
                        }

                        request.Content = content;

                        var response = await _client.SendAsync(request);
                        var jsonResponse = await response.Content.ReadAsStringAsync();

                        if (!response.IsSuccessStatusCode)
                        {
                            Logger.Warn($"ファイルアップロードに失敗しました: {response.StatusCode} {jsonResponse}");
                            throw new InvalidOperationException($"ファイルアップロードに失敗しました ({response.StatusCode}).");
                        }

                        var envelope = JsonConvert.DeserializeObject<ApiResponse<TaskAttachment>>(jsonResponse);
                        if (envelope == null || !envelope.Success)
                        {
                            throw new InvalidOperationException("ファイルアップロードに失敗しました。");
                        }

                        return envelope.Data;
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク添付ファイルアップロードに失敗しました（ID: {taskId}）: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 添付ファイルをダウンロードします。
        /// </summary>
        /// <param name="taskId">対象タスクのID（ログ用）</param>
        /// <param name="attachmentId">添付ファイルのID</param>
        /// <param name="savePath">保存先のパス</param>
        public async Task DownloadTaskAttachmentAsync(int taskId, int attachmentId, string savePath)
        {
            try
            {
                using (var request = new HttpRequestMessage(HttpMethod.Get, $"/tasks/attachments/{attachmentId}/download"))
                {
                    if (!string.IsNullOrEmpty(_authToken))
                    {
                        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _authToken);
                    }

                    var response = await _client.SendAsync(request);

                    if (!response.IsSuccessStatusCode)
                    {
                        throw new InvalidOperationException($"ファイルダウンロードに失敗しました ({response.StatusCode}).");
                    }

                    var fileBytes = await response.Content.ReadAsByteArrayAsync();
                    System.IO.File.WriteAllBytes(savePath, fileBytes);
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク添付ファイルダウンロードに失敗しました（ID: {taskId}, Attachment: {attachmentId}）: {ex.Message}");
                throw;
            }
        }

        // ========================================
        // ヘルプリクエスト関連メソッド
        // ========================================

        /// <summary>
        /// ヘルプリクエストを作成します。
        /// </summary>
        /// <param name="request">ヘルプリクエスト作成リクエスト</param>
        /// <returns>作成されたヘルプリクエスト</returns>
        public async Task<HelpRequest> CreateHelpRequestAsync(CreateHelpRequestRequest request)
        {
            return await SendAsync<HelpRequest>(HttpMethod.Post, "/help-requests", request);
        }

        /// <summary>
        /// 自分のヘルプリクエスト一覧を取得します。
        /// </summary>
        /// <param name="userId">ユーザーID</param>
        /// <param name="status">ステータスフィルタ（省略可）</param>
        /// <returns>ヘルプリクエストのリスト</returns>
        public async Task<List<HelpRequest>> GetMyHelpRequestsAsync(int userId, string status = null)
        {
            var url = $"/help-requests?requesterId={userId}";
            if (!string.IsNullOrEmpty(status))
            {
                url += $"&status={status}";
            }

            return await SendAsync<List<HelpRequest>>(HttpMethod.Get, url);
        }

        /// <summary>
        /// ヘルプリクエストの詳細を取得します。
        /// </summary>
        /// <param name="requestId">ヘルプリクエストID</param>
        /// <returns>ヘルプリクエスト詳細</returns>
        public async Task<HelpRequest> GetHelpRequestAsync(int requestId)
        {
            return await SendAsync<HelpRequest>(HttpMethod.Get, $"/help-requests/{requestId}");
        }

        public async Task<PreviewHelpRequestResponse> PreviewHelpRequestAsync(CreateHelpRequestRequest request)
        {
            return await SendAsync<PreviewHelpRequestResponse>(HttpMethod.Post, "/help-requests/preview", request);
        }

        public async Task<List<Notification>> GetNotificationsAsync(bool unreadOnly = true)
        {
            var url = unreadOnly ? "/notifications/unread" : "/notifications";
            return await SendAsync<List<Notification>>(HttpMethod.Get, url);
        }

        public async Task MarkNotificationAsReadAsync(int notificationId)
        {
            await SendAsync<object>(HttpMethod.Put, $"/notifications/{notificationId}/read");
        }

        public async Task MarkAllNotificationsAsReadAsync()
        {
            await SendAsync<object>(HttpMethod.Put, "/notifications/read-all");
        }

        public async Task MarkNotificationAsUnreadAsync(int notificationId)
        {
            await SendAsync<object>(HttpMethod.Put, $"/notifications/{notificationId}/unread");
        }

        /// <summary>
        /// ヘルパー推奨を取得します。
        /// </summary>
        /// <param name="requestId">ヘルプリクエストID</param>
        /// <returns>ヘルパー推奨のリスト</returns>
        public async Task<List<HelperSuggestion>> GetHelperSuggestionsAsync(int requestId)
        {
            try
            {
                return await SendAsync<List<HelperSuggestion>>(HttpMethod.Get, $"/help-requests/{requestId}/suggestions");
            }
            catch (Exception ex)
            {
                Logger.Error($"ヘルパー推奨取得に失敗しました: {ex.Message}");
                return new List<HelperSuggestion>();
            }
        }

        /// <summary>
        /// ヘルプリクエストを更新します。
        /// </summary>
        /// <param name="requestId">ヘルプリクエストID</param>
        /// <param name="updateData">更新データ</param>
        /// <returns>更新成功したかどうか</returns>
        public async Task<bool> UpdateHelpRequestAsync(int requestId, object updateData)
        {
            var json = JsonConvert.SerializeObject(updateData);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var request = new HttpRequestMessage(new HttpMethod("PATCH"), $"/help-requests/{requestId}")
            {
                Content = content
            };

            var response = await _client.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                Logger.Error($"ヘルプリクエスト更新に失敗しました ({response.StatusCode})");
                return false;
            }

            return true;
        }

        /// <summary>
        /// 時間単位活動データのAI分析をトリガーします（AI監視機能）
        /// </summary>
        /// <param name="summaryId">HourlyActivitySummaryのID</param>
        /// <returns>AI分析リクエストの結果</returns>
        public async Task<AiAnalysisResponse> TriggerHourlyActivityAnalysisAsync(int summaryId)
        {
            try
            {
                var requestData = new { summaryId = summaryId };
                var json = JsonConvert.SerializeObject(requestData);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _client.PostAsync("/ai/analyze-hourly-activity", content);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Logger.Error($"AI分析トリガーに失敗しました ({response.StatusCode}): {errorContent}");
                    return new AiAnalysisResponse
                    {
                        IsSuccess = false,
                        ErrorMessage = $"AI分析トリガーに失敗しました ({response.StatusCode})"
                    };
                }

                Logger.Info($"AI分析トリガー成功 (SummaryId: {summaryId})");
                return new AiAnalysisResponse
                {
                    IsSuccess = true,
                    ErrorMessage = null
                };
            }
            catch (Exception ex)
            {
                Logger.Error($"AI分析トリガー例外: {ex.Message}");
                return new AiAnalysisResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        /// <summary>
        /// 1時間単位活動集計データをbackend-apiに送信します
        /// </summary>
        /// <param name="summary">送信する活動集計データ</param>
        /// <returns>送信結果（サーバー側で保存されたsummaryId）</returns>
        public async Task<HourlyActivitySubmitResponse> SendHourlyActivitySummaryAsync(HourlyActivitySummary summary)
        {
            try
            {
                var requestData = new
                {
                    userId = summary.UserId,
                    hourStart = summary.HourStart.ToString("o"),
                    hourEnd = summary.HourEnd.ToString("o"),
                    mouseClicks = summary.MouseClicks,
                    keyPresses = summary.KeyPresses,
                    mouseWheelScrolls = summary.MouseWheelScrolls,
                    totalActiveSeconds = summary.TotalActiveSeconds,
                    topWindows = summary.TopWindows,
                    fileChangesCount = summary.FileChangesCount,
                    linesAdded = summary.LinesAdded,
                    linesRemoved = summary.LinesRemoved,
                    activityIntensity = summary.ActivityIntensity,
                    avgCpuUsage = summary.AvgCpuUsage,
                    avgMemoryMb = summary.AvgMemoryMB
                };

                var json = JsonConvert.SerializeObject(requestData);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _client.PostAsync("/hourly-activity", content);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Logger.Error($"1時間単位活動集計送信に失敗しました ({response.StatusCode}): {errorContent}");
                    return new HourlyActivitySubmitResponse
                    {
                        IsSuccess = false,
                        ErrorMessage = $"送信に失敗しました ({response.StatusCode})"
                    };
                }

                var responseJson = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<ApiResponse<HourlyActivitySubmitResult>>(responseJson);

                if (result == null || !result.Success)
                {
                    return new HourlyActivitySubmitResponse
                    {
                        IsSuccess = false,
                        ErrorMessage = "送信に失敗しました"
                    };
                }

                Logger.Info($"1時間単位活動集計送信成功 (ServerSummaryId: {result.Data.SummaryId})");
                return new HourlyActivitySubmitResponse
                {
                    IsSuccess = true,
                    ServerSummaryId = result.Data.SummaryId,
                    ErrorMessage = null
                };
            }
            catch (Exception ex)
            {
                Logger.Error($"1時間単位活動集計送信例外: {ex.Message}");
                return new HourlyActivitySubmitResponse
                {
                    IsSuccess = false,
                    ErrorMessage = ex.Message
                };
            }
        }

        // ========================================
        // メンタルヘルス関連メソッド
        // ========================================

        /// <summary>
        /// メンタルヘルスログを作成します。
        /// </summary>
        /// <param name="request">メンタルヘルスログ作成リクエスト</param>
        /// <returns>作成されたメンタルヘルスログ（AI adviceを含む）</returns>
        public async Task<CreateMentalHealthLogResponse> CreateMentalHealthLogAsync(CreateMentalHealthLogRequest request)
        {
            var payload = new
            {
                user_id = request.UserId,
                report_date = request.ReportDate,
                mood = request.Mood,
                stress_level = request.StressLevel,
                has_blocker = request.HasBlocker,
                blocker_details = request.BlockerDetails,
                need_support = request.NeedSupport,
                support_details = request.SupportDetails
            };

            var result = await SendAsync<CreateMentalHealthLogResult>(HttpMethod.Post, "/mental-health", payload);

            return new CreateMentalHealthLogResponse
            {
                Id = result.id,
                AiAdvice = result.ai_advice
            };
        }

        /// <summary>
        /// ユーザーのメンタルヘルスログ一覧を取得します。
        /// </summary>
        /// <param name="userId">ユーザーID</param>
        /// <param name="days">取得日数（デフォルト: 30日）</param>
        /// <returns>メンタルヘルスログのリスト</returns>
        public async Task<List<MentalHealthLog>> GetMentalHealthLogsAsync(int userId, int days = 30)
        {
            var url = $"/mental-health/user/{userId}?days={days}";
            var response = await _client.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                Logger.Error($"メンタルヘルスログ取得に失敗しました ({response.StatusCode})");
                throw new InvalidOperationException($"メンタルヘルスログ取得に失敗しました ({response.StatusCode})");
            }

            var jsonResponse = await response.Content.ReadAsStringAsync();
            var result = JsonConvert.DeserializeObject<ApiResponse<List<MentalHealthLog>>>(jsonResponse);

            return result?.Data ?? new List<MentalHealthLog>();
        }

        /// <summary>
        /// 特定日のメンタルヘルスログを取得します。
        /// </summary>
        /// <param name="userId">ユーザーID</param>
        /// <param name="date">日付（yyyy-MM-dd形式）</param>
        /// <returns>メンタルヘルスログ</returns>
        public async Task<MentalHealthLog> GetMentalHealthLogByDateAsync(int userId, string date)
        {
            var response = await _client.GetAsync($"/mental-health/user/{userId}/date/{date}");

            if (!response.IsSuccessStatusCode)
            {
                Logger.Error($"メンタルヘルスログ取得に失敗しました ({response.StatusCode})");
                return null;
            }

            var json = await response.Content.ReadAsStringAsync();
            var result = JsonConvert.DeserializeObject<ApiResponse<MentalHealthLog>>(json);

            return result?.Data;
        }

        #region プロジェクト管理API

        /// <summary>
        /// プロジェクト一覧を取得します。
        /// </summary>
        public async Task<List<Project>> GetProjectsAsync()
        {
            try
            {
                Logger.Info("プロジェクト一覧取得開始");
                return await SendAsync<List<Project>>(HttpMethod.Get, "/projects");
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト一覧取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクト詳細を取得します。
        /// </summary>
        public async Task<Project> GetProjectAsync(int projectId)
        {
            try
            {
                Logger.Info($"プロジェクト詳細取得開始: プロジェクトID={projectId}");
                return await SendAsync<Project>(HttpMethod.Get, $"/projects/{projectId}");
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト詳細取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクトを作成します（manager権限必要）
        /// </summary>
        public async Task<Project> CreateProjectAsync(Project project)
        {
            try
            {
                Logger.Info($"プロジェクト作成開始: 名前={project.Name}");
                return await SendAsync<Project>(HttpMethod.Post, "/projects", project);
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト作成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクトを更新します（manager権限必要）
        /// </summary>
        public async Task<bool> UpdateProjectAsync(int projectId, Project project)
        {
            try
            {
                Logger.Info($"プロジェクト更新開始: プロジェクトID={projectId}");
                var result = await SendAsync<object>(HttpMethod.Put, $"/projects/{projectId}", project);
                return result != null;
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト更新に失敗しました: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// プロジェクトを削除します（admin権限必要）
        /// </summary>
        public async Task<bool> DeleteProjectAsync(int projectId)
        {
            try
            {
                Logger.Info($"プロジェクト削除開始: プロジェクトID={projectId}");
                await SendAsync<object>(HttpMethod.Delete, $"/projects/{projectId}");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト削除に失敗しました: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// プロジェクトメンバー一覧を取得します。
        /// </summary>
        public async Task<List<ProjectMember>> GetProjectMembersAsync(int projectId)
        {
            try
            {
                Logger.Info($"プロジェクトメンバー取得開始: プロジェクトID={projectId}");
                return await SendAsync<List<ProjectMember>>(HttpMethod.Get, $"/projects/{projectId}/members");
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクトメンバー取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクトメンバーを更新します（manager権限必要）
        /// </summary>
        public async Task<bool> UpdateProjectMembersAsync(int projectId, List<ProjectMember> members)
        {
            try
            {
                Logger.Info($"プロジェクトメンバー更新開始: プロジェクトID={projectId}, メンバー数={members.Count}");
                var result = await SendAsync<object>(HttpMethod.Put, $"/projects/{projectId}/members", new { members = members });
                return result != null;
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクトメンバー更新に失敗しました: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// プロジェクトをエクスポートします。
        /// </summary>
        /// <param name="projectId">プロジェクトID</param>
        /// <param name="format">フォーマット: json, md, csv</param>
        public async Task<string> ExportProjectAsync(int projectId, string format)
        {
            try
            {
                Logger.Info($"プロジェクトエクスポート開始: プロジェクトID={projectId}, フォーマット={format}");
                var response = await SendAsync<object>(HttpMethod.Get, $"/projects/{projectId}/export?format={format}");
                return response?.ToString();
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクトエクスポートに失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// ユーザー一覧を取得します
        /// </summary>
        public async Task<List<User>> GetUsersAsync()
        {
            try
            {
                Logger.Info("ユーザー一覧取得開始");
                return await SendAsync<List<User>>(HttpMethod.Get, "/users");
            }
            catch (Exception ex)
            {
                Logger.Error($"ユーザー一覧取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 指定したプロジェクトのタスク一覧を取得します
        /// </summary>
        /// <param name="projectId">プロジェクトID</param>
        public async Task<List<TaskItem>> GetTasksAsync(int projectId)
        {
            try
            {
                Logger.Info($"タスク一覧取得開始: プロジェクトID={projectId}");
                return await SendAsync<List<TaskItem>>(HttpMethod.Get, $"/tasks?project_id={projectId}");
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク一覧取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        #endregion

        #region 進捗予測API

        /// <summary>
        /// タスクの進捗予測を計算します
        /// </summary>
        public async Task<ProgressPrediction> CalculateProgressPredictionAsync(int taskId)
        {
            try
            {
                Logger.Info($"進捗予測計算開始: タスクID={taskId}");
                return await SendAsync<ProgressPrediction>(HttpMethod.Post, $"/progress-predictions/task/{taskId}/calculate");
            }
            catch (Exception ex)
            {
                Logger.Error($"進捗予測計算に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 最新の進捗予測を取得します
        /// </summary>
        public async Task<ProgressPrediction> GetLatestProgressPredictionAsync(int taskId)
        {
            try
            {
                Logger.Info($"最新進捗予測取得開始: タスクID={taskId}");
                return await SendAsync<ProgressPrediction>(HttpMethod.Get, $"/progress-predictions/task/{taskId}/latest");
            }
            catch (Exception ex)
            {
                Logger.Error($"最新進捗予測取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 進捗予測履歴を取得します
        /// </summary>
        public async Task<List<ProgressPrediction>> GetProgressPredictionHistoryAsync(int taskId, int limit = 10)
        {
            try
            {
                Logger.Info($"進捗予測履歴取得開始: タスクID={taskId}, 件数={limit}");
                return await SendAsync<List<ProgressPrediction>>(HttpMethod.Get,
                    $"/progress-predictions/task/{taskId}/history?limit={limit}");
            }
            catch (Exception ex)
            {
                Logger.Error($"進捗予測履歴取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// ユーザーの全タスク進捗予測を取得します
        /// </summary>
        public async Task<List<ProgressPrediction>> GetUserProgressPredictionsAsync(int userId)
        {
            try
            {
                Logger.Info($"ユーザー進捗予測取得開始: ユーザーID={userId}");
                return await SendAsync<List<ProgressPrediction>>(HttpMethod.Get,
                    $"/progress-predictions/user/{userId}");
            }
            catch (Exception ex)
            {
                Logger.Error($"ユーザー進捗予測取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 高リスクタスクを取得します
        /// </summary>
        public async Task<List<ProgressPrediction>> GetHighRiskTasksAsync(string riskLevel = "high")
        {
            try
            {
                Logger.Info($"高リスクタスク取得開始: リスクレベル={riskLevel}");
                return await SendAsync<List<ProgressPrediction>>(HttpMethod.Get,
                    $"/progress-predictions/high-risk?riskLevel={riskLevel}");
            }
            catch (Exception ex)
            {
                Logger.Error($"高リスクタスク取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 遅延タスクを取得します
        /// </summary>
        public async Task<List<ProgressPrediction>> GetDelayedTasksAsync()
        {
            try
            {
                Logger.Info("遅延タスク取得開始");
                return await SendAsync<List<ProgressPrediction>>(HttpMethod.Get, "/progress-predictions/delayed");
            }
            catch (Exception ex)
            {
                Logger.Error($"遅延タスク取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクトの進捗予測サマリーを取得します
        /// </summary>
        public async Task<ProjectPredictionSummary> GetProjectPredictionSummaryAsync(int projectId)
        {
            try
            {
                Logger.Info($"プロジェクト進捗予測サマリー取得開始: プロジェクトID={projectId}");
                return await SendAsync<ProjectPredictionSummary>(HttpMethod.Get,
                    $"/progress-predictions/project/{projectId}/summary");
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト進捗予測サマリー取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクトの納期分析を実行します
        /// </summary>
        public async Task<DeadlineAnalysis> AnalyzeProjectDeadlineAsync(int projectId)
        {
            try
            {
                Logger.Info($"納期分析開始: プロジェクトID={projectId}");
                return await SendAsync<DeadlineAnalysis>(HttpMethod.Post,
                    $"/progress-predictions/project/{projectId}/analyze-deadline");
            }
            catch (Exception ex)
            {
                Logger.Error($"納期分析に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 古い進捗予測データをクリーンアップします
        /// </summary>
        public async Task<bool> DeleteProgressPredictionsAsync()
        {
            try
            {
                Logger.Info("進捗予測データクリーンアップ開始");
                await SendAsync<object>(HttpMethod.Delete, "/progress-predictions/cleanup");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"進捗予測データクリーンアップに失敗しました: {ex.Message}");
                throw;
            }
        }

        #endregion

        #region AI機能API

        /// <summary>
        /// WBSを生成します。
        /// </summary>
        public async Task<WbsResult> GenerateWbsAsync(WbsRequest request)
        {
            try
            {
                Logger.Info($"WBS生成開始: プロジェクト名={request.ProjectName}");
                return await SendAsync<WbsResult>(HttpMethod.Post, "/ai/wbs", request);
            }
            catch (Exception ex)
            {
                Logger.Error($"WBS生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// タスクを分解します。
        /// </summary>
        public async Task<List<TaskItem>> DecomposeTaskAsync(TaskDecomposeRequest request)
        {
            try
            {
                Logger.Info($"タスク分解開始: タスクID={request.TaskId}");
                var result = await SendAsync<List<TaskItem>>(HttpMethod.Post, "/ai/wbs/decompose", request);
                return result;
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク分解に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// WBSを精緻化します。
        /// </summary>
        public async Task<WbsRefineResult> RefineWbsAsync(WbsRefineRequest request)
        {
            try
            {
                Logger.Info($"WBS精緻化開始: タスク数={request.Tasks.Count}");
                return await SendAsync<WbsRefineResult>(HttpMethod.Post, "/ai/wbs/refine", request);
            }
            catch (Exception ex)
            {
                Logger.Error($"WBS精緻化に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// WBSのサニティチェックを実行します。
        /// </summary>
        public async Task<SanityCheckResult> SanityCheckWbsAsync(List<TaskItem> tasks)
        {
            try
            {
                Logger.Info($"WBSサニティチェック開始: タスク数={tasks.Count}");
                return await SendAsync<SanityCheckResult>(HttpMethod.Post, "/ai/wbs/sanity-check", new { tasks = tasks });
            }
            catch (Exception ex)
            {
                Logger.Error($"WBSサニティチェックに失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクトサマリーを生成します。
        /// </summary>
        public async Task<ProjectSummary> GenerateProjectSummaryAsync(int projectId)
        {
            try
            {
                Logger.Info($"プロジェクトサマリー生成開始: プロジェクトID={projectId}");
                return await SendAsync<ProjectSummary>(HttpMethod.Post, "/ai/project-summary", new { projectId = projectId });
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクトサマリー生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// センチメント分析を実行します。
        /// </summary>
        public async Task<SentimentAnalysis> AnalyzeSentimentAsync(SentimentAnalysisRequest request)
        {
            try
            {
                Logger.Info($"センチメント分析開始: プロジェクトID={request.ProjectId}");
                return await SendAsync<SentimentAnalysis>(HttpMethod.Post, "/ai/sentiment-analysis", request);
            }
            catch (Exception ex)
            {
                Logger.Error($"センチメント分析に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// タスク提案を取得します。
        /// </summary>
        public async Task<List<TaskSuggestion>> SuggestTasksAsync(int projectId)
        {
            try
            {
                Logger.Info($"タスク提案取得開始: プロジェクトID={projectId}");
                return await SendAsync<List<TaskSuggestion>>(HttpMethod.Post, "/ai/task-suggestion", new { projectId = projectId });
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク提案取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// リスク検出を実行します。
        /// </summary>
        public async Task<List<RiskDetection>> DetectRisksAsync(int projectId)
        {
            try
            {
                Logger.Info($"リスク検出開始: プロジェクトID={projectId}");
                return await SendAsync<List<RiskDetection>>(HttpMethod.Post, "/ai/risk-detection", new { projectId = projectId });
            }
            catch (Exception ex)
            {
                Logger.Error($"リスク検出に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// リスケジュール提案を取得します。
        /// </summary>
        public async Task<RescheduleProposal> ProposeRescheduleAsync(RescheduleRequest request)
        {
            try
            {
                Logger.Info($"リスケジュール提案取得開始: プロジェクトID={request.ProjectId}");
                return await SendAsync<RescheduleProposal>(HttpMethod.Post, "/ai/reschedule", request);
            }
            catch (Exception ex)
            {
                Logger.Error($"リスケジュール提案取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 自動タスク割り当てを実行します。
        /// </summary>
        public async Task<AutoAssignResult> AutoAssignTasksAsync(AutoAssignRequest request)
        {
            try
            {
                Logger.Info($"自動タスク割り当て開始: プロジェクトID={request.ProjectId}");
                return await SendAsync<AutoAssignResult>(HttpMethod.Post, "/ai/auto-assign", request);
            }
            catch (Exception ex)
            {
                Logger.Error($"自動タスク割り当てに失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 自動期間調整を実行します。
        /// </summary>
        public async Task<AutoDurationResult> AutoAdjustDurationAsync(AutoDurationRequest request)
        {
            try
            {
                Logger.Info($"自動期間調整開始: プロジェクトID={request.ProjectId}");
                return await SendAsync<AutoDurationResult>(HttpMethod.Post, "/ai/auto-duration", request);
            }
            catch (Exception ex)
            {
                Logger.Error($"自動期間調整に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクトフィールドを生成します。
        /// </summary>
        public async Task<GenerateProjectFieldsResult> GenerateProjectFieldsAsync(GenerateProjectFieldsRequest request)
        {
            try
            {
                Logger.Info($"プロジェクトフィールド生成開始: プロジェクト名={request.ProjectName}");
                return await SendAsync<GenerateProjectFieldsResult>(HttpMethod.Post, "/ai/generate-project-fields", request);
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクトフィールド生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// AIアラートを生成します。
        /// </summary>
        public async Task<GenerateAlertsResult> GenerateAlertsAsync(int projectId)
        {
            try
            {
                Logger.Info($"AIアラート生成開始: プロジェクトID={projectId}");
                return await SendAsync<GenerateAlertsResult>(HttpMethod.Post, "/ai/generate-alerts", new { projectId = projectId });
            }
            catch (Exception ex)
            {
                Logger.Error($"AIアラート生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// タスク説明文を生成します（AI支援）
        /// </summary>
        public async Task<string> GenerateTaskDescriptionAsync(int taskId)
        {
            try
            {
                Logger.Info($"タスク説明文生成開始: タスクID={taskId}");
                var result = await SendAsync<Dictionary<string, string>>(HttpMethod.Post, "/tasks/ai/generate-description", new { taskId = taskId });
                if (result != null && result.ContainsKey("description"))
                {
                    return result["description"];
                }
                return string.Empty;
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク説明文生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// タスクをAIで分割します。
        /// </summary>
        public async Task<List<TaskItem>> SubdivideTaskAsync(int taskId)
        {
            try
            {
                Logger.Info($"タスク分割開始: タスクID={taskId}");
                return await SendAsync<List<TaskItem>>(HttpMethod.Post, "/tasks/ai/subdivide", new { taskId = taskId });
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク分割に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// メンバー向けAIアシスタントにメッセージを送信します。
        /// </summary>
        /// <param name="request">AIチャットリクエスト</param>
        /// <returns>AIチャットレスポンス</returns>
        public async Task<AiChatResponse> SendMemberAssistantMessageAsync(AiChatRequest request)
        {
            try
            {
                Logger.Info($"メンバーAIアシスタントメッセージ送信: mode={request.Mode}");
                return await SendAsync<AiChatResponse>(HttpMethod.Post, "/wbs-ai-chat/chat", request);
            }
            catch (Exception ex)
            {
                Logger.Error($"メンバーAIアシスタントメッセージ送信に失敗しました: {ex.Message}");
                throw;
            }
        }

        #endregion

        #region 成長トラッキングAPI

        /// <summary>
        /// 成長レポートを取得します。
        /// </summary>
        public async Task<GrowthReport> GetGrowthReportAsync(int userId, int months = 3)
        {
            try
            {
                Logger.Info($"成長レポート取得開始: ユーザーID={userId}, 期間={months}ヶ月");
                return await SendAsync<GrowthReport>(HttpMethod.Get, $"/growth/reports/{userId}?months={months}");
            }
            catch (Exception ex)
            {
                Logger.Error($"成長レポート取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スキル成長履歴を取得します。
        /// </summary>
        public async Task<List<SkillGrowthHistory>> GetSkillGrowthHistoryAsync(int userId, string skillName = null)
        {
            try
            {
                var url = $"/growth/skills/{userId}/history";
                if (!string.IsNullOrEmpty(skillName))
                {
                    url = url + $"?skillName={Uri.EscapeDataString(skillName)}";
                }

                Logger.Info($"スキル成長履歴取得開始: ユーザーID={userId}");
                return await SendAsync<List<SkillGrowthHistory>>(HttpMethod.Get, url);
            }
            catch (Exception ex)
            {
                Logger.Error($"スキル成長履歴取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スキル成長履歴を記録します。
        /// </summary>
        public async Task<bool> RecordSkillGrowthAsync(int userId, SkillGrowthHistory record)
        {
            try
            {
                Logger.Info($"スキル成長履歴記録開始: ユーザーID={userId}, スキル={record.SkillName}");
                var result = await SendAsync<object>(HttpMethod.Post, $"/growth/skills/{userId}/history", record);
                return result != null;
            }
            catch (Exception ex)
            {
                Logger.Error($"スキル成長履歴記録に失敗しました: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// パフォーマンスメトリクスを取得します。
        /// </summary>
        public async Task<List<PerformanceMetrics>> GetPerformanceMetricsAsync(int userId, int months = 3)
        {
            try
            {
                Logger.Info($"パフォーマンスメトリクス取得開始: ユーザーID={userId}, 期間={months}ヶ月");
                return await SendAsync<List<PerformanceMetrics>>(HttpMethod.Get, $"/growth/metrics/{userId}?months={months}");
            }
            catch (Exception ex)
            {
                Logger.Error($"パフォーマンスメトリクス取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// パフォーマンスメトリクスを計算します。
        /// </summary>
        public async Task<PerformanceMetrics> CalculatePerformanceMetricsAsync(int userId)
        {
            try
            {
                Logger.Info($"パフォーマンスメトリクス計算開始: ユーザーID={userId}");
                return await SendAsync<PerformanceMetrics>(HttpMethod.Post, $"/growth/metrics/{userId}/calculate");
            }
            catch (Exception ex)
            {
                Logger.Error($"パフォーマンスメトリクス計算に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 貢献一覧を取得します。
        /// </summary>
        public async Task<List<MemberContribution>> GetContributionsAsync(int userId, DateTime? startDate = null, DateTime? endDate = null)
        {
            try
            {
                var url = $"/growth/contributions/{userId}";
                var queryParams = new List<string>();

                if (startDate.HasValue)
                {
                    queryParams.Add($"startDate={startDate.Value.ToString("yyyy-MM-dd")}");
                }

                if (endDate.HasValue)
                {
                    queryParams.Add($"endDate={endDate.Value.ToString("yyyy-MM-dd")}");
                }

                if (queryParams.Count > 0)
                {
                    url = url + "?" + string.Join("&", queryParams);
                }

                Logger.Info($"貢献一覧取得開始: ユーザーID={userId}");
                return await SendAsync<List<MemberContribution>>(HttpMethod.Get, url);
            }
            catch (Exception ex)
            {
                Logger.Error($"貢献一覧取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 貢献を記録します。
        /// </summary>
        public async Task<MemberContribution> RecordContributionAsync(int userId, MemberContribution contribution)
        {
            try
            {
                Logger.Info($"貢献記録開始: ユーザーID={userId}");
                return await SendAsync<MemberContribution>(HttpMethod.Post, $"/growth/contributions/{userId}", contribution);
            }
            catch (Exception ex)
            {
                Logger.Error($"貢献記録に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 成長目標一覧を取得します。
        /// </summary>
        public async Task<List<GrowthGoal>> GetGrowthGoalsAsync(int userId, string status = null)
        {
            try
            {
                var url = $"/growth/goals/{userId}";
                if (!string.IsNullOrEmpty(status))
                {
                    url = url + $"?status={Uri.EscapeDataString(status)}";
                }

                Logger.Info($"成長目標一覧取得開始: ユーザーID={userId}");
                return await SendAsync<List<GrowthGoal>>(HttpMethod.Get, url);
            }
            catch (Exception ex)
            {
                Logger.Error($"成長目標一覧取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 成長目標を作成します。
        /// </summary>
        public async Task<GrowthGoal> CreateGrowthGoalAsync(int userId, GrowthGoal goal)
        {
            try
            {
                Logger.Info($"成長目標作成開始: ユーザーID={userId}, タイトル={goal.GoalTitle}");
                return await SendAsync<GrowthGoal>(HttpMethod.Post, $"/growth/goals/{userId}", goal);
            }
            catch (Exception ex)
            {
                Logger.Error($"成長目標作成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 成長目標を更新します。
        /// </summary>
        public async Task<bool> UpdateGrowthGoalAsync(int goalId, GrowthGoal goal)
        {
            try
            {
                Logger.Info($"成長目標更新開始: 目標ID={goalId}");
                var result = await SendAsync<object>(HttpMethod.Put, $"/growth/goals/{goalId}", goal);
                return result != null;
            }
            catch (Exception ex)
            {
                Logger.Error($"成長目標更新に失敗しました: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// 成長目標を削除します。
        /// </summary>
        public async Task<bool> DeleteGrowthGoalAsync(int goalId)
        {
            try
            {
                Logger.Info($"成長目標削除開始: 目標ID={goalId}");
                var result = await SendAsync<object>(HttpMethod.Delete, $"/growth/goals/{goalId}");
                return result != null;
            }
            catch (Exception ex)
            {
                Logger.Error($"成長目標削除に失敗しました: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// 強み分析を実行します。
        /// </summary>
        public async Task<StrengthsAnalysis> AnalyzeStrengthsAsync(int userId)
        {
            try
            {
                Logger.Info($"強み分析開始: ユーザーID={userId}");
                return await SendAsync<StrengthsAnalysis>(HttpMethod.Post, $"/growth/analyze/{userId}/strengths");
            }
            catch (Exception ex)
            {
                Logger.Error($"強み分析に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 成長機会を提案します。
        /// </summary>
        public async Task<List<GrowthOpportunity>> SuggestGrowthOpportunitiesAsync(int userId)
        {
            try
            {
                Logger.Info($"成長機会提案開始: ユーザーID={userId}");
                return await SendAsync<List<GrowthOpportunity>>(HttpMethod.Post, $"/growth/analyze/{userId}/opportunities");
            }
            catch (Exception ex)
            {
                Logger.Error($"成長機会提案に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 目標を提案します。
        /// </summary>
        public async Task<List<GoalSuggestion>> SuggestGoalsAsync(int userId)
        {
            try
            {
                Logger.Info($"目標提案開始: ユーザーID={userId}");
                return await SendAsync<List<GoalSuggestion>>(HttpMethod.Post, $"/growth/analyze/{userId}/goal-suggestions");
            }
            catch (Exception ex)
            {
                Logger.Error($"目標提案に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 1on1レポートを生成します。
        /// </summary>
        public async Task<OneOnOneReport> Generate1on1ReportAsync(int userId)
        {
            try
            {
                Logger.Info($"1on1レポート生成開始: ユーザーID={userId}");
                return await SendAsync<OneOnOneReport>(HttpMethod.Post, $"/growth/reports/{userId}/1on1");
            }
            catch (Exception ex)
            {
                Logger.Error($"1on1レポート生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 評価シートを生成します。
        /// </summary>
        public async Task<EvaluationSheet> GenerateEvaluationSheetAsync(int userId)
        {
            try
            {
                Logger.Info($"評価シート生成開始: ユーザーID={userId}");
                return await SendAsync<EvaluationSheet>(HttpMethod.Post, $"/growth/reports/{userId}/evaluation");
            }
            catch (Exception ex)
            {
                Logger.Error($"評価シート生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        #endregion

        #region スプリント管理API

        /// <summary>
        /// スプリントを作成します
        /// </summary>
        public async Task<Sprint> CreateSprintAsync(Sprint sprint)
        {
            try
            {
                Logger.Info($"スプリント作成開始: {sprint.SprintName}");
                return await SendAsync<Sprint>(HttpMethod.Post, "/sprints", sprint);
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント作成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリント一覧を取得します
        /// </summary>
        public async Task<List<Sprint>> GetSprintsAsync(int projectId)
        {
            try
            {
                var queryParams = new List<string>();
                queryParams.Add($"projectId={projectId}");

                var query = queryParams.Count > 0 ? "?" + string.Join("&", queryParams) : "";
                Logger.Info($"スプリント一覧取得開始: {query}");
                return await SendAsync<List<Sprint>>(HttpMethod.Get, $"/sprints{query}");
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント一覧取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリント詳細を取得します
        /// </summary>
        public async Task<Sprint> GetSprintAsync(int sprintId)
        {
            try
            {
                Logger.Info($"スプリント詳細取得開始: スプリントID={sprintId}");
                return await SendAsync<Sprint>(HttpMethod.Get, $"/sprints/{sprintId}");
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント詳細取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリントを更新します
        /// </summary>
        public async Task<bool> UpdateSprintAsync(int sprintId, Sprint sprint)
        {
            try
            {
                Logger.Info($"スプリント更新開始: スプリントID={sprintId}");
                await SendAsync<object>(new HttpMethod("PATCH"), $"/sprints/{sprintId}", sprint);
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント更新に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリントを開始します
        /// </summary>
        public async Task<bool> StartSprintAsync(int sprintId)
        {
            try
            {
                Logger.Info($"スプリント開始: スプリントID={sprintId}");
                await SendAsync<object>(HttpMethod.Post, $"/sprints/{sprintId}/start");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント開始に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリントを完了します
        /// </summary>
        public async Task<bool> CompleteSprintAsync(int sprintId)
        {
            try
            {
                Logger.Info($"スプリント完了: スプリントID={sprintId}");
                await SendAsync<object>(HttpMethod.Post, $"/sprints/{sprintId}/complete");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント完了に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリント進捗を記録します
        /// </summary>
        public async Task<bool> RecordSprintProgressAsync(int sprintId, SprintProgress progress)
        {
            try
            {
                Logger.Info($"スプリント進捗記録: スプリントID={sprintId}");
                await SendAsync<object>(HttpMethod.Post, $"/sprints/{sprintId}/progress", progress);
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント進捗記録に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリント進捗を取得します
        /// </summary>
        public async Task<List<SprintProgress>> GetSprintProgressAsync(int sprintId, int days = 7)
        {
            try
            {
                Logger.Info($"スプリント進捗取得: スプリントID={sprintId}, 日数={days}");
                return await SendAsync<List<SprintProgress>>(HttpMethod.Get, $"/sprints/{sprintId}/progress?days={days}");
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント進捗取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 最新スプリント進捗を取得します
        /// </summary>
        public async Task<SprintProgress> GetLatestSprintProgressAsync(int sprintId)
        {
            try
            {
                Logger.Info($"最新スプリント進捗取得: スプリントID={sprintId}");
                return await SendAsync<SprintProgress>(HttpMethod.Get, $"/sprints/{sprintId}/progress/latest");
            }
            catch (Exception ex)
            {
                Logger.Error($"最新スプリント進捗取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリントパフォーマンスを記録します
        /// </summary>
        public async Task<bool> RecordSprintPerformanceAsync(int sprintId, SprintPerformance performance)
        {
            try
            {
                Logger.Info($"スプリントパフォーマンス記録: スプリントID={sprintId}");
                await SendAsync<object>(HttpMethod.Post, $"/sprints/{sprintId}/performance", performance);
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリントパフォーマンス記録に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリントパフォーマンスを取得します
        /// </summary>
        public async Task<List<SprintPerformance>> GetSprintPerformanceAsync(int sprintId)
        {
            try
            {
                Logger.Info($"スプリントパフォーマンス取得: スプリントID={sprintId}");
                return await SendAsync<List<SprintPerformance>>(HttpMethod.Get, $"/sprints/{sprintId}/performance");
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリントパフォーマンス取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリント統計を取得します
        /// </summary>
        public async Task<SprintStats> GetSprintStatsAsync(int sprintId)
        {
            try
            {
                Logger.Info($"スプリント統計取得: スプリントID={sprintId}");
                return await SendAsync<SprintStats>(HttpMethod.Get, $"/sprints/{sprintId}/stats");
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント統計取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// スプリントを分析します
        /// </summary>
        public async Task<SprintAnalysis> AnalyzeSprintAsync(int sprintId)
        {
            try
            {
                Logger.Info($"スプリント分析開始: スプリントID={sprintId}");
                return await SendAsync<SprintAnalysis>(HttpMethod.Post, $"/sprints/{sprintId}/analyze");
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント分析に失敗しました: {ex.Message}");
                throw;
            }
        }

        #endregion

        #region 休暇管理API

        /// <summary>
        /// 休暇一覧を取得します
        /// </summary>
        public async Task<List<Vacation>> GetVacationsAsync(int? userId = null, DateTime? startDate = null, DateTime? endDate = null)
        {
            try
            {
                var queryParams = new List<string>();
                if (userId.HasValue)
                {
                    queryParams.Add($"userId={userId.Value}");
                }
                if (startDate.HasValue)
                {
                    queryParams.Add($"startDate={startDate.Value:yyyy-MM-dd}");
                }
                if (endDate.HasValue)
                {
                    queryParams.Add($"endDate={endDate.Value:yyyy-MM-dd}");
                }

                var query = queryParams.Count > 0 ? "?" + string.Join("&", queryParams) : "";
                Logger.Info($"休暇一覧取得開始: {query}");
                return await SendAsync<List<Vacation>>(HttpMethod.Get, $"/vacations{query}");
            }
            catch (Exception ex)
            {
                Logger.Error($"休暇一覧取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 休暇を登録します
        /// </summary>
        public async Task<Vacation> CreateVacationAsync(Vacation vacation)
        {
            try
            {
                Logger.Info($"休暇登録開始: ユーザーID={vacation.UserId}");
                return await SendAsync<Vacation>(HttpMethod.Post, "/vacations", vacation);
            }
            catch (Exception ex)
            {
                Logger.Error($"休暇登録に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 休暇を更新します
        /// </summary>
        public async Task<bool> UpdateVacationAsync(int vacationId, Vacation vacation)
        {
            try
            {
                Logger.Info($"休暇更新開始: 休暇ID={vacationId}");
                await SendAsync<object>(HttpMethod.Put, $"/vacations/{vacationId}", vacation);
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"休暇更新に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 休暇を削除します
        /// </summary>
        public async Task<bool> DeleteVacationAsync(int vacationId)
        {
            try
            {
                Logger.Info($"休暇削除開始: 休暇ID={vacationId}");
                await SendAsync<object>(HttpMethod.Delete, $"/vacations/{vacationId}");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"休暇削除に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 休暇影響を分析します
        /// </summary>
        public async Task<VacationAnalysis> AnalyzeVacationImpactAsync(DateTime startDate, DateTime endDate)
        {
            try
            {
                Logger.Info($"休暇影響分析開始: {startDate:yyyy-MM-dd} - {endDate:yyyy-MM-dd}");
                return await SendAsync<VacationAnalysis>(HttpMethod.Get,
                    $"/vacations/analyze?startDate={startDate:yyyy-MM-dd}&endDate={endDate:yyyy-MM-dd}");
            }
            catch (Exception ex)
            {
                Logger.Error($"休暇影響分析に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 影響タスクを取得します
        /// </summary>
        public async Task<List<TaskItem>> GetAffectedTasksAsync(int userId, DateTime startDate, DateTime endDate)
        {
            try
            {
                Logger.Info($"影響タスク取得開始: ユーザーID={userId}");
                return await SendAsync<List<TaskItem>>(HttpMethod.Get,
                    $"/vacations/affected-tasks?userId={userId}&startDate={startDate:yyyy-MM-dd}&endDate={endDate:yyyy-MM-dd}");
            }
            catch (Exception ex)
            {
                Logger.Error($"影響タスク取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        #endregion

        #region プロジェクトダッシュボードAPI

        /// <summary>
        /// ヘルススコアを計算します
        /// </summary>
        public async Task<ProjectHealthScore> CalculateHealthScoreAsync(int projectId)
        {
            try
            {
                Logger.Info($"ヘルススコア計算開始: プロジェクトID={projectId}");
                return await SendAsync<ProjectHealthScore>(HttpMethod.Post, $"/project-dashboard/{projectId}/health-score");
            }
            catch (Exception ex)
            {
                Logger.Error($"ヘルススコア計算に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 最新ヘルススコアを取得します
        /// </summary>
        public async Task<ProjectHealthScore> GetLatestHealthScoreAsync(int projectId)
        {
            try
            {
                Logger.Info($"最新ヘルススコア取得開始: プロジェクトID={projectId}");
                return await SendAsync<ProjectHealthScore>(HttpMethod.Get, $"/project-dashboard/{projectId}/health-score/latest");
            }
            catch (Exception ex)
            {
                Logger.Error($"最新ヘルススコア取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// ヘルススコア履歴を取得します
        /// </summary>
        public async Task<List<ProjectHealthScore>> GetHealthScoreHistoryAsync(int projectId, int days = 30)
        {
            try
            {
                Logger.Info($"ヘルススコア履歴取得開始: プロジェクトID={projectId}, 日数={days}");
                return await SendAsync<List<ProjectHealthScore>>(HttpMethod.Get,
                    $"/project-dashboard/{projectId}/health-score/history?days={days}");
            }
            catch (Exception ex)
            {
                Logger.Error($"ヘルススコア履歴取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// バーンダウンデータを記録します
        /// </summary>
        public async Task<bool> RecordBurndownDataAsync(int projectId, BurndownData data)
        {
            try
            {
                Logger.Info($"バーンダウンデータ記録開始: プロジェクトID={projectId}");
                await SendAsync<object>(HttpMethod.Post, $"/project-dashboard/{projectId}/burndown", data);
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"バーンダウンデータ記録に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// バーンダウンデータを取得します
        /// </summary>
        public async Task<List<BurndownData>> GetBurndownDataAsync(int projectId, int days = 30)
        {
            try
            {
                Logger.Info($"バーンダウンデータ取得開始: プロジェクトID={projectId}, 日数={days}");
                return await SendAsync<List<BurndownData>>(HttpMethod.Get,
                    $"/project-dashboard/{projectId}/burndown?days={days}");
            }
            catch (Exception ex)
            {
                Logger.Error($"バーンダウンデータ取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// クリティカルパスを分析します
        /// </summary>
        public async Task<CriticalPathAnalysis> AnalyzeCriticalPathAsync(int projectId)
        {
            try
            {
                Logger.Info($"クリティカルパス分析開始: プロジェクトID={projectId}");
                return await SendAsync<CriticalPathAnalysis>(HttpMethod.Post, $"/project-dashboard/{projectId}/critical-path");
            }
            catch (Exception ex)
            {
                Logger.Error($"クリティカルパス分析に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// クリティカルパスタスクを取得します
        /// </summary>
        public async Task<List<CriticalPathTask>> GetCriticalPathTasksAsync(int projectId, DateTime? date = null)
        {
            try
            {
                var query = date.HasValue ? $"?date={date.Value:yyyy-MM-dd}" : "";
                Logger.Info($"クリティカルパスタスク取得開始: プロジェクトID={projectId}");
                return await SendAsync<List<CriticalPathTask>>(HttpMethod.Get,
                    $"/project-dashboard/{projectId}/critical-path{query}");
            }
            catch (Exception ex)
            {
                Logger.Error($"クリティカルパスタスク取得に失敗しました: {ex.Message}");
                throw;
            }
        }

        #endregion

        #region レポート生成API

        /// <summary>
        /// プロジェクトレポートを生成します
        /// </summary>
        public async Task<ProjectReport> GenerateProjectReportAsync(int projectId, ReportOptions options)
        {
            try
            {
                Logger.Info($"プロジェクトレポート生成開始: プロジェクトID={projectId}");
                return await SendAsync<ProjectReport>(HttpMethod.Post, $"/report-generator/projects/{projectId}", options);
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクトレポート生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// プロジェクトレポートCSVを生成します
        /// </summary>
        public async Task<string> GenerateProjectReportCsvAsync(int projectId)
        {
            try
            {
                Logger.Info($"プロジェクトレポートCSV生成開始: プロジェクトID={projectId}");
                return await SendAsync<string>(HttpMethod.Get, $"/report-generator/projects/{projectId}/csv");
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクトレポートCSV生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// 全プロジェクトレポートを生成します
        /// </summary>
        public async Task<AllProjectsReport> GenerateAllProjectsReportAsync(ReportOptions options)
        {
            try
            {
                Logger.Info("全プロジェクトレポート生成開始");
                return await SendAsync<AllProjectsReport>(HttpMethod.Post, "/report-generator/all-projects", options);
            }
            catch (Exception ex)
            {
                Logger.Error($"全プロジェクトレポート生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// ユーザー作業レポートを生成します
        /// </summary>
        public async Task<UserWorkReport> GenerateUserWorkReportAsync(int userId, ReportOptions options)
        {
            try
            {
                Logger.Info($"ユーザー作業レポート生成開始: ユーザーID={userId}");
                return await SendAsync<UserWorkReport>(HttpMethod.Post, $"/report-generator/users/{userId}", options);
            }
            catch (Exception ex)
            {
                Logger.Error($"ユーザー作業レポート生成に失敗しました: {ex.Message}");
                throw;
            }
        }

        #endregion

        /// <summary>
        /// 作業セッションサマリーを作成します（プライバシー配慮版）
        /// </summary>
        public async Task<WorkSessionResponse> CreateWorkSessionSummaryAsync(WorkSessionSummary summary)
        {
            try
            {
                var payload = new 
                {
                    user_id = summary.UserId,
                    project_id = summary.ProjectId,
                    task_id = summary.TaskId,
                    session_start = summary.SessionStart.ToString("o"),
                    session_end = summary.SessionEnd.ToString("o"),
                    work_duration_seconds = summary.WorkDurationSeconds,
                    progress_percentage = summary.ProgressPercentage,
                    commits_count = summary.CommitsCount,
                    files_changed = summary.FilesChanged,
                    session_notes = summary.SessionNotes,
                    session_type = summary.SessionType,
                    // AI分析用詳細データ
                    mouse_clicks = summary.MouseClicks,
                    key_presses = summary.KeyPresses,
                    mouse_wheel_scrolls = summary.MouseWheelScrolls,
                    top_windows = summary.TopWindows
                };

                var response = await SendAsync<WorkSessionSubmitResult>(HttpMethod.Post, "/work-session", payload);

                return new WorkSessionResponse 
                { 
                    IsSuccess = true, 
                    SessionId = response.session_id 
                };
            }
            catch (Exception ex)
            {
                Logger.Error($"作業セッションサマリー送信エラー: {ex.Message}");
                return new WorkSessionResponse { IsSuccess = false, ErrorMessage = ex.Message };
            }
        }

        /// <summary>
        /// 日報のドラフト/フィードバックを生成します（クライアントデータベース）
        /// </summary>
        public async Task<DailyReportAiFeedback> GenerateDailyReportFeedbackAsync(DailyReportAiRequest request)
        {
            try
            {
                Logger.Info("AI日報フィードバック生成をリクエストします。");
                return await SendAsync<DailyReportAiFeedback>(HttpMethod.Post, "/ai/daily-report", request);
            }
            catch (Exception ex)
            {
                Logger.Error($"AI日報生成リクエストエラー: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// サーバー側の作業ログから日報下書きを生成します
        /// </summary>
        public async Task<DailyReportAiFeedback> GenerateDailyReportDraftAsync(int userId, DateTime date)
        {
            try
            {
                var payload = new { user_id = userId, date = date.ToString("yyyy-MM-dd") };
                return await SendAsync<DailyReportAiFeedback>(HttpMethod.Post, "/ai/daily-report-draft", payload);
            }
            catch (Exception ex)
            {
                Logger.Error($"日報下書き生成エラー: {ex.Message}");
                return null;
            }
        }


    }

    /// <summary>
    /// メンタルヘルスログ作成結果（内部用）
    /// </summary>
    internal class CreateMentalHealthLogResult
    {
        public int id { get; set; }
        public string ai_advice { get; set; }
    }

    /// <summary>
    /// AI分析レスポンスクラス
    /// </summary>
    public class AiAnalysisResponse
    {
        public bool IsSuccess { get; set; }
        public string ErrorMessage { get; set; }
    }

    /// <summary>
    /// 1時間単位活動集計送信レスポンスクラス
    /// </summary>
    public class HourlyActivitySubmitResponse
    {
        public bool IsSuccess { get; set; }
        public int ServerSummaryId { get; set; }
        public string ErrorMessage { get; set; }
    }



    /// <summary>
    /// 1時間単位活動集計送信結果クラス
    /// </summary>
    public class HourlyActivitySubmitResult
    {
        public int SummaryId { get; set; }
        public string Message { get; set; }
    }

    public class WorkSessionSubmitResult
    {
        [JsonProperty("session_id")]
        public int session_id { get; set; }
    }

    public class WorkSessionResponse
    {
        public bool IsSuccess { get; set; }
        public int SessionId { get; set; }
        public string ErrorMessage { get; set; }
    }
}
