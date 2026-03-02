using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using Newtonsoft.Json;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// メンバー向けAIアシスタントウィンドウです。
    /// プロジェクトメンバーがAIと対話してタスクの確認・検索・進捗報告などを行えます。
    /// </summary>
    public partial class AiAssistantWindow : Window
    {
        private readonly ObservableCollection<AiChatMessage> _messages;
        private readonly int _userId;
        private readonly string _userName;
        private readonly string _dashboardOverview;
        private readonly LocalDatabaseService _localDatabaseService;
        private List<ChangePreview> _currentPreviews;
        private bool _isProcessing;
        private bool _isApplyingPreview;
        private System.Threading.Tasks.Task _loadUserTasksTask;

        // @メンション関連
        private List<TaskItem> _userTasks;
        private int _mentionStartIndex = -1;
        private bool _isMentionMode;

        /// <summary>
        /// AiAssistantWindowを初期化します。
        /// </summary>
        /// <param name="userId">ログインユーザーのID</param>
        /// <param name="userName">ログインユーザーの名前</param>
        /// <param name="dashboardOverview">ダッシュボード全体状況のスナップショット</param>
        public AiAssistantWindow(int userId, string userName, string dashboardOverview)
        {
            InitializeComponent();

            _userId = userId;
            _userName = userName;
            _dashboardOverview = dashboardOverview ?? string.Empty;
            _localDatabaseService = App.LocalDatabase;
            _messages = new ObservableCollection<AiChatMessage>();
            _currentPreviews = new List<ChangePreview>();
            _userTasks = new List<TaskItem>();

            MessagesItemsControl.ItemsSource = _messages;

            // チャット履歴を読み込み
            LoadChatHistory();

            // 履歴がない場合は初期メッセージを追加
            if (_messages.Count == 0)
            {
                AddWelcomeMessage();
            }

            // ユーザーのタスク一覧を取得
            _loadUserTasksTask = LoadUserTasksAsync();

            // テキストボックスにフォーカス
            Loaded += (s, e) =>
            {
                MessageTextBox.Focus();
                ScrollToBottom();
            };

            // ウィンドウ閉じる時にチャット履歴を保存
            Closing += (s, e) => SaveAllChatHistory();
        }

        #region チャット履歴保存/読み込み

        /// <summary>
        /// チャット履歴をデータベースから読み込みます。
        /// </summary>
        private void LoadChatHistory()
        {
            try
            {
                if (_localDatabaseService == null)
                {
                    Logger.Warn("LocalDatabaseServiceがnullのため、チャット履歴を読み込めません。");
                    return;
                }

                var historyList = _localDatabaseService.GetAiChatHistory(_userId, 50);

                foreach (var history in historyList)
                {
                    List<ChangePreview> preview = null;
                    if (!string.IsNullOrEmpty(history.PreviewJson))
                    {
                        try
                        {
                            preview = JsonConvert.DeserializeObject<List<ChangePreview>>(history.PreviewJson);
                        }
                        catch
                        {
                            // プレビューのデシリアライズに失敗した場合は無視
                        }
                    }

                    var message = new AiChatMessage
                    {
                        Id = history.MessageId,
                        Role = history.Role,
                        Content = history.Content,
                        Timestamp = history.CreatedAt,
                        Preview = preview
                    };
                    _messages.Add(message);
                }

                Logger.Info($"チャット履歴を{historyList.Count}件読み込みました。");
            }
            catch (Exception ex)
            {
                Logger.Error($"チャット履歴読み込みエラー: {ex.Message}");
            }
        }

        /// <summary>
        /// 単一のメッセージをデータベースに保存します。
        /// </summary>
        private void SaveMessageToHistory(AiChatMessage message)
        {
            try
            {
                if (_localDatabaseService == null)
                    return;

                string previewJson = null;
                if (message.Preview != null && message.Preview.Count > 0)
                {
                    previewJson = JsonConvert.SerializeObject(message.Preview);
                }

                var history = new AiChatHistory
                {
                    UserId = _userId,
                    MessageId = message.Id,
                    Role = message.Role,
                    Content = message.Content,
                    PreviewJson = previewJson,
                    CreatedAt = message.Timestamp
                };

                _localDatabaseService.SaveAiChatHistory(history);
            }
            catch (Exception ex)
            {
                Logger.Error($"メッセージ保存エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// 全てのチャット履歴を保存します（ウィンドウ閉じる時用）。
        /// </summary>
        private void SaveAllChatHistory()
        {
            // 現在は個別保存しているため、特に処理なし
            Logger.Info("チャット履歴を保存しました。");
        }

        #endregion

        #region @メンション機能

        /// <summary>
        /// PersonalTaskをTaskItemに変換します。
        /// </summary>
        private TaskItem ConvertPersonalTaskToTaskItem(PersonalTask personalTask)
        {
            return new TaskItem
            {
                TaskId = personalTask.TaskId,
                Title = personalTask.Title,
                Description = personalTask.Description,
                Priority = personalTask.Priority,
                Status = personalTask.Status,
                Progress = personalTask.Progress,
                EstimatedMinutes = personalTask.EstimatedMinutes,
                ActualMinutes = personalTask.ActualMinutes,
                StartDate = DateTime.TryParse(personalTask.StartDate, out var startDate) ? (DateTime?)startDate : null,
                DueDate = DateTime.TryParse(personalTask.DueDate, out var dueDate) ? (DateTime?)dueDate : null,
                EndDate = DateTime.TryParse(personalTask.DueDate, out var endDate) ? (DateTime?)endDate : null,
                AssigneeUserId = personalTask.UserId,
                AssigneeName = _userName,
                ProjectId = 0,
                ProjectName = "個人タスク"
            };
        }

        /// <summary>
        /// ユーザーのタスク一覧を非同期で取得します。
        /// </summary>
        private async System.Threading.Tasks.Task LoadUserTasksAsync()
        {
            try
            {
                if (App.ApiService == null)
                {
                    Logger.Warn("APIサービス未接続のため、担当タスクを取得できません。");
                    _userTasks = new List<TaskItem>();
                    return;
                }

                var projectTasksTask = App.ApiService.GetUserTasksAsync(_userId);
                var personalTasksTask = App.ApiService.GetPersonalTasksAsync(_userId);

                await System.Threading.Tasks.Task.WhenAll(projectTasksTask, personalTasksTask);

                var projectTasks = await projectTasksTask ?? new List<TaskItem>();
                var personalTasks = await personalTasksTask ?? new List<PersonalTask>();

                var convertedPersonalTasks = personalTasks
                    .Select(pt => ConvertPersonalTaskToTaskItem(pt))
                    .ToList();

                _userTasks = projectTasks
                    .Concat(convertedPersonalTasks)
                    .ToList();

                Logger.Info($"ユーザーのタスクを{_userTasks.Count}件取得しました（プロジェクト: {projectTasks.Count}, 個人: {convertedPersonalTasks.Count}）。");
            }
            catch (Exception ex)
            {
                Logger.Warn($"タスク取得エラー: {ex.Message}");
                // モックタスクを設定
                _userTasks = new List<TaskItem>
                {
                    new TaskItem { Id = 1, Title = "機能Aの実装", ProjectName = "プロジェクトA", Status = "in-progress", Progress = 60 },
                    new TaskItem { Id = 2, Title = "テストケース作成", ProjectName = "プロジェクトA", Status = "not-started", Progress = 0 },
                    new TaskItem { Id = 3, Title = "ドキュメント更新", ProjectName = "プロジェクトB", Status = "in-progress", Progress = 30 }
                };
            }
        }

        /// <summary>
        /// テキスト変更時の処理（@メンション検出）。
        /// </summary>
        private void MessageTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            var text = MessageTextBox.Text;
            var caretIndex = MessageTextBox.CaretIndex;

            // @の位置を検出
            if (caretIndex > 0)
            {
                var textBeforeCaret = text.Substring(0, caretIndex);
                var lastAtIndex = textBeforeCaret.LastIndexOf('@');

                if (lastAtIndex >= 0)
                {
                    // @の後のテキストを取得
                    var searchText = textBeforeCaret.Substring(lastAtIndex + 1);

                    // スペースがない場合のみメンションモード
                    if (searchText.IndexOf(' ') < 0 && searchText.IndexOf('\n') < 0)
                    {
                        _mentionStartIndex = lastAtIndex;
                        _isMentionMode = true;
                        ShowMentionSuggestions(searchText);
                        return;
                    }
                }
            }

            // メンションモードを解除
            HideMentionPopup();
        }

        /// <summary>
        /// メンション候補を表示します。
        /// </summary>
        private void ShowMentionSuggestions(string searchText)
        {
            if (_userTasks == null || _userTasks.Count == 0)
            {
                HideMentionPopup();
                return;
            }

            var filteredTasks = _userTasks;

            if (!string.IsNullOrEmpty(searchText))
            {
                var lowerSearch = searchText.ToLowerInvariant();
                filteredTasks = _userTasks
                    .Where(t => t.Title != null && t.Title.ToLowerInvariant().IndexOf(lowerSearch, StringComparison.Ordinal) >= 0)
                    .ToList();
            }

            if (filteredTasks.Count == 0)
            {
                HideMentionPopup();
                return;
            }

            // 最大10件に制限
            var displayTasks = filteredTasks.Count > 10
                ? filteredTasks.GetRange(0, 10)
                : filteredTasks;

            MentionItemsControl.ItemsSource = displayTasks;
            MentionPopup.Visibility = Visibility.Visible;
        }

        /// <summary>
        /// メンションポップアップを非表示にします。
        /// </summary>
        private void HideMentionPopup()
        {
            MentionPopup.Visibility = Visibility.Collapsed;
            _isMentionMode = false;
            _mentionStartIndex = -1;
        }

        /// <summary>
        /// メンション候補がクリックされた時の処理。
        /// </summary>
        private void MentionItem_Click(object sender, MouseButtonEventArgs e)
        {
            if (sender is Border border && border.Tag is TaskItem task)
            {
                InsertMention(task);
            }
        }

        /// <summary>
        /// メンションを入力欄に挿入します。
        /// </summary>
        private void InsertMention(TaskItem task)
        {
            if (_mentionStartIndex < 0)
                return;

            var text = MessageTextBox.Text;
            var caretIndex = MessageTextBox.CaretIndex;

            // @以降を置換
            var beforeAt = text.Substring(0, _mentionStartIndex);
            var afterCaret = caretIndex < text.Length ? text.Substring(caretIndex) : "";

            // タスク名を挿入（スペースを追加）
            var mentionText = $"@{task.Title} ";
            var newText = beforeAt + mentionText + afterCaret;

            MessageTextBox.Text = newText;
            MessageTextBox.CaretIndex = beforeAt.Length + mentionText.Length;

            HideMentionPopup();
            MessageTextBox.Focus();
        }

        #endregion

        /// <summary>
        /// ウェルカムメッセージを追加します。
        /// </summary>
        private void AddWelcomeMessage()
        {
            var welcomeMessage = new AiChatMessage
            {
                Id = Guid.NewGuid().ToString(),
                Role = "assistant",
                Content = $"こんにちは、{_userName}さん！\n\n" +
                          "私はあなたの作業をサポートするAIアシスタントです。\n\n" +
                          "できること：\n" +
                          "・担当タスクの確認と検索\n" +
                          "・進捗状況の報告\n" +
                          "・コメントの追加\n" +
                          "・プロジェクト状況の確認\n\n" +
                          "「/help」と入力すると詳しいコマンド一覧を表示します。\n" +
                          "「@」を入力するとタスクを指定できます。\n" +
                          "何かお手伝いできることはありますか？",
                Timestamp = DateTime.Now
            };

            _messages.Add(welcomeMessage);
            SaveMessageToHistory(welcomeMessage);
        }

        /// <summary>
        /// 送信ボタンクリック時の処理です。
        /// </summary>
        private async void SendButton_Click(object sender, RoutedEventArgs e)
        {
            await SendMessageAsync();
        }

        /// <summary>
        /// テキストボックスでのキーダウン処理です。
        /// </summary>
        private async void MessageTextBox_KeyDown(object sender, KeyEventArgs e)
        {
            // メンションモード中のキー処理
            if (_isMentionMode && MentionPopup.Visibility == Visibility.Visible)
            {
                if (e.Key == Key.Escape)
                {
                    e.Handled = true;
                    HideMentionPopup();
                    return;
                }
            }

            if (e.Key == Key.Enter && !Keyboard.Modifiers.HasFlag(ModifierKeys.Shift))
            {
                e.Handled = true;
                HideMentionPopup();
                await SendMessageAsync();
            }
        }

        /// <summary>
        /// メッセージを送信します。
        /// </summary>
        private async System.Threading.Tasks.Task SendMessageAsync()
        {
            var messageText = MessageTextBox.Text?.Trim();
            if (string.IsNullOrEmpty(messageText) || _isProcessing)
                return;

            _isProcessing = true;
            SetSendingState(true);

            try
            {
                // ユーザーメッセージを追加
                var userMessage = new AiChatMessage
                {
                    Id = Guid.NewGuid().ToString(),
                    Role = "user",
                    Content = messageText,
                    Timestamp = DateTime.Now
                };
                _messages.Add(userMessage);
                SaveMessageToHistory(userMessage);
                MessageTextBox.Clear();
                ScrollToBottom();

                // /helpコマンドの処理
                if (messageText.ToLowerInvariant() == "/help")
                {
                    ShowHelpMessage();
                    return;
                }

                // APIにリクエストを送信
                var response = await SendToApiAsync(messageText);

                if (response != null)
                {
                    // AIメッセージを追加
                    var aiMessage = new AiChatMessage
                    {
                        Id = Guid.NewGuid().ToString(),
                        Role = "assistant",
                        Content = response.Message ?? "応答を取得できませんでした。",
                        Timestamp = DateTime.Now,
                        Preview = response.Preview
                    };
                    _messages.Add(aiMessage);
                    SaveMessageToHistory(aiMessage);

                    // プレビューがある場合は表示
                    if (response.NeedsConfirmation && response.Preview != null && response.Preview.Count > 0)
                    {
                        ShowPreviewPanel(response.Preview);
                    }
                }
                else
                {
                    AddErrorMessage("AIから有効な応答を取得できませんでした。少し待ってから再試行してください。");
                }

                ScrollToBottom();
            }
            catch (Exception ex)
            {
                Logger.Error($"メッセージ送信エラー: {ex.Message}");
                AddErrorMessage("メッセージの送信中にエラーが発生しました。");
            }
            finally
            {
                _isProcessing = false;
                SetSendingState(false);
            }
        }

        /// <summary>
        /// APIにメッセージを送信します。
        /// </summary>
        private async System.Threading.Tasks.Task<AiChatResponse> SendToApiAsync(string message)
        {
            try
            {
                if (_loadUserTasksTask != null && !_loadUserTasksTask.IsCompleted)
                {
                    await _loadUserTasksTask;
                }

                // 会話履歴を構築（最新30件）
                // 直前に追加した同一ユーザーメッセージは request.message と重複するため除外する
                var historyMessages = _messages
                    .Where(m => !string.IsNullOrWhiteSpace(m.Content))
                    .Where(m => string.Equals(m.Role, "user", StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(m.Role, "assistant", StringComparison.OrdinalIgnoreCase))
                    .ToList();

                if (historyMessages.Count > 0)
                {
                    var lastMessage = historyMessages[historyMessages.Count - 1];
                    if (string.Equals(lastMessage.Role, "user", StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(lastMessage.Content, message, StringComparison.Ordinal))
                    {
                        historyMessages.RemoveAt(historyMessages.Count - 1);
                    }
                }

                var historyCount = historyMessages.Count;
                const int maxHistoryMessages = 30;
                historyMessages = historyMessages
                    .Skip(Math.Max(0, historyCount - maxHistoryMessages))
                    .ToList();

                var history = new List<AiChatHistoryItem>();
                foreach (var msg in historyMessages)
                {
                    history.Add(new AiChatHistoryItem
                    {
                        Role = msg.Role,
                        Content = msg.Content
                    });
                }

                // ユーザーのタスク情報を構築
                var currentTasks = new List<object>();
                foreach (var task in _userTasks)
                {
                    var normalizedStatus = NormalizeStatusForAssistant(task.Status);
                    var progress = task.Progress;
                    if (progress < 0)
                    {
                        progress = 0;
                    }
                    else if (progress > 100)
                    {
                        progress = 100;
                    }

                    currentTasks.Add(new
                    {
                        id = task.TaskId.ToString(),
                        taskId = task.TaskId.ToString(),
                        taskKey = task.TaskKey,
                        name = task.Title,
                        title = task.Title,
                        status = normalizedStatus,
                        progress = progress,
                        dueDate = task.DueDate?.ToString("yyyy-MM-dd"),
                        startDate = task.StartDate?.ToString("yyyy-MM-dd"),
                        endDate = task.EndDate?.ToString("yyyy-MM-dd"),
                        projectName = task.ProjectName,
                        description = task.Description,
                        assigneeId = task.AssigneeUserId,
                        assigneeName = string.IsNullOrWhiteSpace(task.AssigneeName) ? _userName : task.AssigneeName,
                        priority = task.Priority,
                        estimatedMinutes = task.EstimatedMinutes
                    });
                }

                var projectGroups = _userTasks
                    .Where(t => !string.IsNullOrWhiteSpace(t.ProjectName))
                    .GroupBy(t => t.ProjectName)
                    .Select(group => new
                    {
                        name = group.Key,
                        taskCount = group.Count(),
                        completedCount = group.Count(t => t.IsCompleted),
                        inProgressCount = group.Count(t => string.Equals(t.Status, "in-progress", StringComparison.OrdinalIgnoreCase)),
                        pendingCount = group.Count(t => !t.IsCompleted)
                    })
                    .Cast<object>()
                    .ToList();

                var request = new AiChatRequest
                {
                    Mode = "member-assistant",
                    Message = message,
                    History = history,
                    CurrentTasks = currentTasks,
                    ProjectContext = new
                    {
                        name = "ダッシュボード全体",
                        goal = $"担当タスク全体を横断した支援（全{_userTasks.Count}件）",
                        projects = projectGroups
                    },
                    MemberContext = new MemberContext
                    {
                        UserId = _userId,
                        UserName = _userName,
                        CurrentDate = DateTime.Now.ToString("yyyy-MM-dd HH:mm"),
                        DashboardOverview = _dashboardOverview,
                        CurrentTasks = currentTasks
                    }
                };

                // APIを呼び出し
                return await App.ApiService.SendMemberAssistantMessageAsync(request);
            }
            catch (Exception ex)
            {
                Logger.Warn($"API呼び出し失敗: {ex.Message}");
                return new AiChatResponse
                {
                    Message = BuildApiFailureMessage(ex),
                    ToolCalls = null,
                    Preview = null,
                    NeedsConfirmation = false
                };
            }
        }

        /// <summary>
        /// AIアシスタント用にステータスを正規化します。
        /// </summary>
        private string NormalizeStatusForAssistant(string status)
        {
            if (string.IsNullOrWhiteSpace(status))
            {
                return "not-started";
            }

            var normalized = status.Trim().ToLowerInvariant();
            switch (normalized)
            {
                case "done":
                case "completed":
                case "complete":
                    return "completed";
                case "in_progress":
                case "in-progress":
                    return "in-progress";
                case "todo":
                case "not_started":
                case "not-started":
                    return "not-started";
                case "on-hold":
                case "on_hold":
                case "blocked":
                    return "blocked";
                default:
                    return normalized;
            }
        }

        /// <summary>
        /// APIエラー時に表示するメッセージを組み立てます。
        /// </summary>
        private string BuildApiFailureMessage(Exception ex)
        {
            var message = ex.Message ?? string.Empty;

            if (message.IndexOf("401", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("403", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("unauthorized", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("forbidden", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("トークン", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return "認証状態の確認が必要です。再ログイン後にもう一度お試しください。";
            }

            if (message.IndexOf("timeout", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("タイムアウト", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return "AIサービスの応答がタイムアウトしました。少し待ってから再試行してください。";
            }

            return "AIサービスに接続できませんでした。ネットワークとAI設定を確認して再試行してください。";
        }

        /// <summary>
        /// モックレスポンスを追加します（API接続不可時）。
        /// </summary>
        private void AddMockResponse(string userMessage)
        {
            var lowerMessage = userMessage.ToLowerInvariant();
            string responseText;

            // @メンションからタスク名を抽出
            TaskItem mentionedTask = null;
            if (userMessage.IndexOf("@", StringComparison.Ordinal) >= 0)
            {
                var atIndex = userMessage.IndexOf("@", StringComparison.Ordinal);
                var afterAt = userMessage.Substring(atIndex + 1);
                // スペースまたは文末までを取得
                var spaceIndex = afterAt.IndexOf(" ", StringComparison.Ordinal);
                var taskName = spaceIndex >= 0 ? afterAt.Substring(0, spaceIndex) : afterAt;

                // タスク名でマッチするタスクを検索
                mentionedTask = _userTasks.FirstOrDefault(t =>
                    t.Title != null && t.Title.IndexOf(taskName, StringComparison.OrdinalIgnoreCase) >= 0);
            }

            // @タスク + 詳細 のパターン
            if (mentionedTask != null && (lowerMessage.IndexOf("詳細", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                           lowerMessage.IndexOf("教えて", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                           lowerMessage.IndexOf("確認", StringComparison.OrdinalIgnoreCase) >= 0))
            {
                var statusText = mentionedTask.Status == "in-progress" ? "進行中" :
                                 mentionedTask.Status == "done" ? "完了" :
                                 mentionedTask.Status == "not-started" ? "未着手" : mentionedTask.Status ?? "未設定";
                var dueDate = mentionedTask.DueDate?.ToString("yyyy/MM/dd") ??
                              mentionedTask.EndDate?.ToString("yyyy/MM/dd") ?? "未設定";

                responseText = $"📋 タスク詳細: {mentionedTask.Title}\n\n" +
                               $"・ID: {mentionedTask.Id}\n" +
                               $"・プロジェクト: {mentionedTask.ProjectName ?? "未設定"}\n" +
                               $"・ステータス: {statusText}\n" +
                               $"・進捗: {mentionedTask.Progress}%\n" +
                               $"・期限: {dueDate}\n" +
                               (string.IsNullOrEmpty(mentionedTask.Description) ? "" : $"・説明: {mentionedTask.Description}\n");
            }
            // @タスク + 進捗更新 のパターン
            else if (mentionedTask != null && lowerMessage.IndexOf("進捗", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                responseText = $"「{mentionedTask.Title}」の進捗を更新します。\n\n" +
                              $"現在の進捗: {mentionedTask.Progress}%\n\n" +
                              "何%に更新しますか？（例：70%に更新）";
            }
            // @タスク + コメント のパターン
            else if (mentionedTask != null && lowerMessage.IndexOf("コメント", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                responseText = $"「{mentionedTask.Title}」にコメントを追加します。\n\n" +
                              "追加したいコメント内容を教えてください。";
            }
            // 担当タスク確認
            else if (lowerMessage.IndexOf("タスク", StringComparison.OrdinalIgnoreCase) >= 0 &&
                     (lowerMessage.IndexOf("確認", StringComparison.OrdinalIgnoreCase) >= 0 ||
                      lowerMessage.IndexOf("一覧", StringComparison.OrdinalIgnoreCase) >= 0 ||
                      lowerMessage.IndexOf("教えて", StringComparison.OrdinalIgnoreCase) >= 0))
            {
                if (_userTasks.Count > 0)
                {
                    var taskList = string.Join("\n", _userTasks.Select(t =>
                    {
                        var status = t.Status == "in-progress" ? "🔄" :
                                     t.Status == "done" ? "✅" :
                                     t.Status == "not-started" ? "📋" : "📋";
                        return $"{status} {t.Title} (進捗: {t.Progress}%)";
                    }));
                    responseText = $"📋 担当タスク一覧 ({_userTasks.Count}件):\n\n{taskList}\n\n" +
                                  "詳細を確認したいタスクがあれば「@タスク名 の詳細」と聞いてください。";
                }
                else
                {
                    responseText = "現在、担当タスクはありません。";
                }
            }
            // 進捗（タスク指定なし）
            else if (lowerMessage.IndexOf("進捗", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                responseText = "進捗を更新したいタスクを教えてください。\n" +
                              "例：「@機能Aの実装 を70%に更新」";
            }
            // コメント（タスク指定なし）
            else if (lowerMessage.IndexOf("コメント", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                responseText = "コメントを追加したいタスクとコメント内容を教えてください。\n" +
                              "例：「@機能Aの実装 にコメント追加：レビュー待ち」";
            }
            // プロジェクト状況
            else if (lowerMessage.IndexOf("プロジェクト", StringComparison.OrdinalIgnoreCase) >= 0 &&
                     (lowerMessage.IndexOf("状況", StringComparison.OrdinalIgnoreCase) >= 0 ||
                      lowerMessage.IndexOf("概要", StringComparison.OrdinalIgnoreCase) >= 0))
            {
                if (_userTasks.Count > 0)
                {
                    var projectNames = _userTasks.Select(t => t.ProjectName).Distinct().Where(p => !string.IsNullOrEmpty(p)).ToList();
                    responseText = $"📊 プロジェクト状況\n\n" +
                                   $"参加プロジェクト数: {projectNames.Count}件\n\n";
                    if (projectNames.Count > 0)
                    {
                        responseText += "参加中のプロジェクト:\n" +
                                        string.Join("\n", projectNames.Select(p => $"・{p}"));
                    }
                }
                else
                {
                    responseText = "現在参加中のプロジェクトはありません。";
                }
            }
            // @メンションはあるが操作が不明
            else if (mentionedTask != null)
            {
                responseText = $"「{mentionedTask.Title}」について何をしますか？\n\n" +
                               "・「詳細を教えて」- タスクの詳細を表示\n" +
                               "・「進捗を〇%に更新」- 進捗率を変更\n" +
                               "・「コメント追加：内容」- コメントを追加";
            }
            // その他
            else
            {
                responseText = "ご質問ありがとうございます。\n\n" +
                               "現在オフラインモードで動作しています。\n" +
                               "「/help」でコマンド一覧を確認できます。\n" +
                               "「@」を入力するとタスクを指定できます。";
            }

            var aiMessage = new AiChatMessage
            {
                Id = Guid.NewGuid().ToString(),
                Role = "assistant",
                Content = responseText,
                Timestamp = DateTime.Now
            };
            _messages.Add(aiMessage);
            SaveMessageToHistory(aiMessage);
        }

        /// <summary>
        /// ヘルプメッセージを表示します。
        /// </summary>
        private void ShowHelpMessage()
        {
            var helpMessage = new AiChatMessage
            {
                Id = Guid.NewGuid().ToString(),
                Role = "assistant",
                Content = "【利用可能なコマンド】\n\n" +
                          "📋 タスク関連\n" +
                          "・「担当タスクを確認」- 自分のタスク一覧を表示\n" +
                          "・「タスクを検索：〇〇」- キーワードでタスク検索\n" +
                          "・「@タスク名 の詳細」- 特定タスクの詳細を表示\n\n" +
                          "📊 進捗報告\n" +
                          "・「@タスク名 の進捗を△%に更新」- タスクの進捗を更新\n" +
                          "・「@タスク名 を完了にする」- タスクを完了状態に変更\n\n" +
                          "💬 コメント\n" +
                          "・「@タスク名 にコメント追加：内容」- タスクにコメント追加\n" +
                          "・「@タスク名 のコメントを確認」- コメント一覧を表示\n\n" +
                          "📈 プロジェクト\n" +
                          "・「プロジェクト状況」- プロジェクト概要を表示\n\n" +
                          "💡 ヒント\n" +
                          "・「@」を入力するとタスク候補が表示されます\n" +
                          "・「/help」- このヘルプを表示",
                Timestamp = DateTime.Now
            };
            _messages.Add(helpMessage);
            SaveMessageToHistory(helpMessage);
            ScrollToBottom();
        }

        /// <summary>
        /// エラーメッセージを追加します。
        /// </summary>
        private void AddErrorMessage(string error)
        {
            var errorMessage = new AiChatMessage
            {
                Id = Guid.NewGuid().ToString(),
                Role = "assistant",
                Content = $"⚠️ {error}\n\n再度お試しください。",
                Timestamp = DateTime.Now
            };
            _messages.Add(errorMessage);
            SaveMessageToHistory(errorMessage);
            ScrollToBottom();
        }

        /// <summary>
        /// プレビューパネルを表示します。
        /// </summary>
        private void ShowPreviewPanel(List<ChangePreview> previews)
        {
            _currentPreviews = previews;
            PreviewItemsControl.ItemsSource = previews;
            PreviewPanel.Visibility = Visibility.Visible;
        }

        /// <summary>
        /// プレビューパネルを非表示にします。
        /// </summary>
        private void HidePreviewPanel()
        {
            PreviewPanel.Visibility = Visibility.Collapsed;
            _currentPreviews = new List<ChangePreview>();
        }

        /// <summary>
        /// プレビューキャンセルボタンクリック時の処理です。
        /// </summary>
        private void CancelPreviewButton_Click(object sender, RoutedEventArgs e)
        {
            HidePreviewPanel();
            AddSystemMessage("変更をキャンセルしました。");
        }

        /// <summary>
        /// プレビュー適用ボタンクリック時の処理です。
        /// </summary>
        private async void ApplyPreviewButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isApplyingPreview || _currentPreviews == null || _currentPreviews.Count == 0)
                return;

            _isApplyingPreview = true;
            SetSendingState(true);
            ApplyPreviewButton.IsEnabled = false;
            CancelPreviewButton.IsEnabled = false;

            try
            {
                var successCount = 0;
                var failCount = 0;

                foreach (var preview in _currentPreviews)
                {
                    var success = await ApplyPreviewChangeAsync(preview);
                    if (success)
                        successCount++;
                    else
                        failCount++;
                }

                HidePreviewPanel();

                if (failCount == 0)
                {
                    AddSystemMessage($"✅ {successCount}件の変更を適用しました。");
                }
                else
                {
                    AddSystemMessage($"⚠️ {successCount}件成功、{failCount}件失敗しました。");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"プレビュー適用エラー: {ex.Message}");
                AddErrorMessage("変更の適用中にエラーが発生しました。");
            }
            finally
            {
                _isApplyingPreview = false;
                ApplyPreviewButton.IsEnabled = true;
                CancelPreviewButton.IsEnabled = true;
                SetSendingState(false);
            }
        }

        /// <summary>
        /// プレビューの変更を適用します。
        /// </summary>
        private async System.Threading.Tasks.Task<bool> ApplyPreviewChangeAsync(ChangePreview preview)
        {
            try
            {
                if (!int.TryParse(preview.TaskId, out int taskId))
                {
                    Logger.Warn($"無効なタスクID: {preview.TaskId}");
                    return false;
                }

                if (preview.Changes == null)
                    return false;

                foreach (var change in preview.Changes)
                {
                    var fieldName = change.Key.ToLowerInvariant();
                    var newValue = change.Value?.After;

                    if (string.IsNullOrEmpty(newValue))
                        continue;

                    switch (fieldName)
                    {
                        case "progress":
                            if (int.TryParse(newValue.Replace("%", ""), out int progressValue))
                            {
                                // 進捗更新はステータスと一緒に更新
                                await App.ApiService.UpdateTaskStatusAsync(taskId, "in-progress", progressValue);
                            }
                            break;

                        case "status":
                            var normalizedStatus = NormalizeStatusForAssistant(newValue);
                            var progress = 0;
                            if (normalizedStatus == "completed")
                            {
                                progress = 100;
                            }
                            else
                            {
                                var currentTask = _userTasks.FirstOrDefault(t => t.TaskId == taskId || t.Id == taskId);
                                if (currentTask != null)
                                {
                                    progress = currentTask.Progress;
                                }
                            }

                            await App.ApiService.UpdateTaskStatusAsync(taskId, normalizedStatus, progress);
                            break;

                        case "comment":
                            await App.ApiService.AddTaskCommentAsync(taskId, _userId, newValue);
                            break;
                    }
                }

                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"変更適用エラー (TaskId: {preview.TaskId}): {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// システムメッセージを追加します。
        /// </summary>
        private void AddSystemMessage(string message)
        {
            var systemMessage = new AiChatMessage
            {
                Id = Guid.NewGuid().ToString(),
                Role = "assistant",
                Content = message,
                Timestamp = DateTime.Now
            };
            _messages.Add(systemMessage);
            SaveMessageToHistory(systemMessage);
            ScrollToBottom();
        }

        /// <summary>
        /// 送信中状態を設定します。
        /// </summary>
        private void SetSendingState(bool isSending)
        {
            SendButton.IsEnabled = !isSending;
            MessageTextBox.IsEnabled = !isSending;
            ApplyPreviewButton.IsEnabled = !isSending && !_isApplyingPreview &&
                                           _currentPreviews != null && _currentPreviews.Count > 0;
            CancelPreviewButton.IsEnabled = !isSending && !_isApplyingPreview;
            StatusTextBlock.Text = isSending ? "処理中..." : "オンライン";

            if (isSending)
            {
                SendButtonText.Text = "送信中";
            }
            else
            {
                SendButtonText.Text = "送信";
            }
        }

        /// <summary>
        /// スクロールを最下部に移動します。
        /// </summary>
        private void ScrollToBottom()
        {
            Dispatcher.BeginInvoke(new Action(() =>
            {
                MessageScrollViewer.ScrollToEnd();
            }), System.Windows.Threading.DispatcherPriority.Background);
        }

        /// <summary>
        /// 履歴クリアボタンクリック時の処理です。
        /// </summary>
        private void ClearHistoryButton_Click(object sender, RoutedEventArgs e)
        {
            if (Alert.Confirm(
                "チャット履歴をクリアしますか？\n（データベースからも削除されます）",
                "確認"))
            {
                // データベースからも削除
                try
                {
                    if (_localDatabaseService != null)
                    {
                        _localDatabaseService.ClearAiChatHistory(_userId);
                    }
                }
                catch (Exception ex)
                {
                    Logger.Error($"チャット履歴削除エラー: {ex.Message}");
                }

                _messages.Clear();
                HidePreviewPanel();
                AddWelcomeMessage();
            }
        }

        /// <summary>
        /// ヘルプボタンクリック時の処理です。
        /// </summary>
        private void HelpButton_Click(object sender, RoutedEventArgs e)
        {
            ShowHelpMessage();
        }
    }

    /// <summary>
    /// Boolを Visibility に変換するコンバーターです。
    /// </summary>
    public class BoolToVisibilityConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            if (value is bool boolValue && boolValue)
                return Visibility.Visible;
            return Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    /// <summary>
    /// Boolを反転して Visibility に変換するコンバーターです。
    /// </summary>
    public class BoolToVisibilityConverterInverted : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            if (value is bool boolValue && !boolValue)
                return Visibility.Visible;
            return Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
