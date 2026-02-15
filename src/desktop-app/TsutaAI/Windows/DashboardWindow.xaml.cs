using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// ダッシュボード画面。ログイン後に表示され、当日のタスクを一覧として提示します。
    /// </summary>
    public partial class DashboardWindow : Window
    {
        private List<TaskItem> _displayTasks = new List<TaskItem>(); // 表示するタスク（本日+過去の未完了）
        private List<TaskItem> _orderedSelectedTasks = new List<TaskItem>(); // 順番付きの選択タスク
        private string _aiMessage = "";
        private ApiService.DashboardSummary _dashboardSummary;
        private List<TaskItem> _allTasksForAi = new List<TaskItem>();
        private List<TaskItem> _todayTasksForAi = new List<TaskItem>();
        private List<TaskItem> _pastIncompleteTasksForAi = new List<TaskItem>();
        private string _dashboardOverviewForAi = "ダッシュボード情報がまだ読み込まれていません。";

        public DashboardWindow()
        {
            InitializeComponent();
            Loaded += OnWindowLoaded;
        }

        private async void OnWindowLoaded(object sender, RoutedEventArgs e)
        {


            SetGreetingMessage();
            await LoadTasksAsync();
        }

        private void SetGreetingMessage()
        {
            var currentUser = App.CurrentUser;
            var userName = string.IsNullOrWhiteSpace(currentUser?.FullName) ? "ゲストユーザー" : currentUser.FullName;

            var hour = DateTime.Now.Hour;
            string greeting = hour < 12 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";

            GreetingTextBlock.Text = $"{greeting}、{userName}さん";
        }

        /// <summary>
        /// PersonalTaskをTaskItemに変換します
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
                EstimatedMinutes = personalTask.EstimatedMinutes,
                ActualMinutes = personalTask.ActualMinutes,
                StartDate = DateTime.TryParse(personalTask.StartDate, out var startDate) ? (DateTime?)startDate : null,
                DueDate = DateTime.TryParse(personalTask.DueDate, out var dueDate) ? (DateTime?)dueDate : null,
                EndDate = DateTime.TryParse(personalTask.DueDate, out var endDate) ? (DateTime?)endDate : null, // 個人タスクはendDateがないのでdueDateを使用
                AssigneeUserId = personalTask.UserId,
                ProjectId = 0, // 個人タスクはプロジェクトに属さない
                ProjectName = "個人タスク"
            };
        }

        /// <summary>
        /// AIアシスタントへ渡すダッシュボード全体状況のスナップショットを作成します。
        /// </summary>
        private void BuildDashboardOverviewForAi()
        {
            var today = DateTime.Today;
            var allTasks = (_allTasksForAi != null && _allTasksForAi.Count > 0)
                ? _allTasksForAi
                : (_displayTasks ?? new List<TaskItem>());

            var pendingCount = allTasks.Count(t => !IsTaskCompleted(t));
            var completedCount = allTasks.Count(t => IsTaskCompleted(t));
            var inProgressCount = allTasks.Count(t => string.Equals(t.Status, "in-progress", StringComparison.OrdinalIgnoreCase));
            var notStartedCount = allTasks.Count(t => string.Equals(t.Status, "not-started", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(t.Status));
            var onHoldCount = allTasks.Count(t => string.Equals(t.Status, "on-hold", StringComparison.OrdinalIgnoreCase));
            var overdueCount = allTasks.Count(t => IsTaskOverdue(t, today));
            var projectCount = allTasks
                .Select(t => t.ProjectName)
                .Where(name => !string.IsNullOrWhiteSpace(name) && name != "個人タスク")
                .Distinct()
                .Count();
            var personalTaskCount = allTasks.Count(t => t.ProjectName == "個人タスク");

            var topTasks = allTasks
                .Where(t => !IsTaskCompleted(t))
                .OrderByDescending(t => IsTaskOverdue(t, today))
                .ThenBy(t => t.DueDate ?? DateTime.MaxValue)
                .Take(5)
                .ToList();

            var lines = new List<string>
            {
                $"取得日時: {DateTime.Now:yyyy-MM-dd HH:mm}",
                $"ダッシュボード集計: 完了(今日)={_dashboardSummary?.CompletedToday ?? _todayTasksForAi.Count(t => IsTaskCompleted(t))}件 / 未完了={_dashboardSummary?.PendingTasks ?? pendingCount}件 / 集中時間={_dashboardSummary?.TotalFocusMinutes ?? 0}分",
                $"タスク内訳: 全体={allTasks.Count}件 / 今日={_todayTasksForAi.Count}件 / 過去未完了={_pastIncompleteTasksForAi.Count}件 / 期限超過={overdueCount}件",
                $"ステータス: 進行中={inProgressCount}件 / 未着手={notStartedCount}件 / 保留={onHoldCount}件 / 完了={completedCount}件",
                $"プロジェクト: 参加中={projectCount}件 / 個人タスク={personalTaskCount}件"
            };

            if (!string.IsNullOrWhiteSpace(_aiMessage))
            {
                lines.Add($"ダッシュボードAIメッセージ: {_aiMessage}");
            }

            if (topTasks.Count > 0)
            {
                lines.Add("注目タスク:");
                foreach (var task in topTasks)
                {
                    var dueText = task.DueDate.HasValue ? task.DueDate.Value.ToString("yyyy-MM-dd") : "期限未設定";
                    var progressText = $"{Math.Max(0, task.Progress)}%";
                    lines.Add($"- [{(string.IsNullOrWhiteSpace(task.ProjectName) ? "未分類" : task.ProjectName)}] {task.Title} | 状態={ToStatusDisplay(task.Status)} | 進捗={progressText} | 期限={dueText}");
                }
            }

            _dashboardOverviewForAi = string.Join("\n", lines);
        }

        private static bool IsTaskCompleted(TaskItem task)
        {
            return task != null &&
                   (task.IsCompleted ||
                    string.Equals(task.Status, "done", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(task.Status, "completed", StringComparison.OrdinalIgnoreCase));
        }

        private static bool IsTaskOverdue(TaskItem task, DateTime today)
        {
            if (task == null || IsTaskCompleted(task))
            {
                return false;
            }

            if (task.DueDate.HasValue && task.DueDate.Value.Date < today)
            {
                return true;
            }

            if (task.EndDate.HasValue && task.EndDate.Value.Date < today)
            {
                return true;
            }

            return false;
        }

        private static string ToStatusDisplay(string status)
        {
            if (string.IsNullOrWhiteSpace(status))
            {
                return "未着手";
            }

            switch (status.Trim().ToLowerInvariant())
            {
                case "in-progress":
                    return "進行中";
                case "done":
                case "completed":
                    return "完了";
                case "on-hold":
                    return "保留";
                case "blocked":
                    return "ブロック";
                case "not-started":
                    return "未着手";
                default:
                    return status;
            }
        }

        /// <summary>
        /// タスクを非同期で読み込みます（API優先、フォールバックでDB）
        /// </summary>
        private async Task LoadTasksAsync()
        {
            var userId = App.CurrentUser?.UserId ?? 0;

            try
            {
                // まずAPIから取得を試みる
                if (App.ApiService != null && userId > 0)
                {
                    var today = DateTime.Today;

                    // 本日のタスク、プロジェクトタスク、個人タスクを並列で取得
                    var todayTasksTask = App.ApiService.GetTodayTasksAsync(userId);
                    var allUserTasksTask = App.ApiService.GetUserTasksAsync(userId);
                    var personalTasksTask = App.ApiService.GetPersonalTasksAsync(userId);
                    var summaryTask = App.ApiService.GetDashboardSummaryAsync(userId);

                    await Task.WhenAll(todayTasksTask, allUserTasksTask, personalTasksTask, summaryTask);

                    var todayProjectTasks = await todayTasksTask ?? new List<TaskItem>();
                    var allUserTasks = await allUserTasksTask ?? new List<TaskItem>();
                    var personalTasks = await personalTasksTask ?? new List<PersonalTask>();

                    // 個人タスクをTaskItemに変換
                    var convertedPersonalTasks = personalTasks.Select(pt => ConvertPersonalTaskToTaskItem(pt)).ToList();

                    // 本日の個人タスクを抽出
                    var todayPersonalTasks = convertedPersonalTasks
                        .Where(t => !t.IsCompleted && (
                            (t.DueDate.HasValue && t.DueDate.Value.Date == today) ||
                            (t.StartDate.HasValue && t.StartDate.Value.Date == today) ||
                            (t.StartDate.HasValue && t.EndDate.HasValue &&
                             t.StartDate.Value.Date <= today && t.EndDate.Value.Date >= today)
                        ))
                        .ToList();

                    // 本日のタスク（プロジェクト + 個人）を結合
                    var todayTasks = todayProjectTasks.Concat(todayPersonalTasks).ToList();

                    // プロジェクトタスクと個人タスクを結合（全体）
                    var allTasks = allUserTasks.Concat(convertedPersonalTasks).ToList();

                    // 本日のタスクIDを記録
                    var todayTaskIds = new HashSet<int>(todayTasks.Select(t => t.TaskId));

                    // 過去の未完了タスク（期限が今日より前で、未完了のタスク）を抽出
                    var pastIncompleteTasks = allTasks
                        .Where(t => !t.IsCompleted && !todayTaskIds.Contains(t.TaskId))
                        .Where(t =>
                        {
                            // 期限が今日より前のタスク
                            if (t.DueDate.HasValue && t.DueDate.Value.Date < today)
                            {
                                return true;
                            }
                            // 終了日が今日より前のタスク
                            if (t.EndDate.HasValue && t.EndDate.Value.Date < today)
                            {
                                return true;
                            }
                            return false;
                        })
                        .ToList();

                    // 過去の未完了タスクと本日のタスクを結合
                    _displayTasks = pastIncompleteTasks.Concat(todayTasks).ToList();
                    _allTasksForAi = allTasks;
                    _todayTasksForAi = todayTasks;
                    _pastIncompleteTasksForAi = pastIncompleteTasks;

                    Logger.Info($"APIから本日のタスク{todayTasks.Count()}件（プロジェクト: {todayProjectTasks.Count()}, 個人: {todayPersonalTasks.Count()}）、" +
                                $"過去の未完了タスク{pastIncompleteTasks.Count()}件を取得しました。");

                    // ダッシュボードサマリーを取得してAIメッセージを表示
                    var summary = await summaryTask;
                    _dashboardSummary = summary;
                    if (summary != null && !string.IsNullOrEmpty(summary.AiMessage))
                    {
                        _aiMessage = summary.AiMessage;
                        AiMessageTextBlock.Text = _aiMessage;
                    }

                    BuildDashboardOverviewForAi();
                }
                else
                {
                    // APIサービスが利用できない場合はDBから取得
                    LoadTasksFromDatabase(userId);
                }
            }
            catch (Exception ex)
            {
                Logger.Warn($"タスクの取得に失敗しました（API）: {ex.Message}");
                // エラー時はDBから取得
                LoadTasksFromDatabase(userId);
            }

            // UIに反映（初期表示は本日のタスク）
            UpdateTaskDisplay();

            // 通知ポーリングの開始
            StartNotificationPolling();
        }

        private System.Windows.Threading.DispatcherTimer _notificationTimer;

        private void StartNotificationPolling()
        {
            _notificationTimer = new System.Windows.Threading.DispatcherTimer();
            _notificationTimer.Tick += async (s, e) => await CheckNotificationsAsync();
            _notificationTimer.Interval = TimeSpan.FromMinutes(1); // 1分ごとに確認
            _notificationTimer.Start();
            
            // 初回即時実行
            _ = CheckNotificationsAsync();
        }

        private async Task CheckNotificationsAsync()
        {
            try
            {
                if (App.ApiService == null) return;
                var notifications = await App.ApiService.GetNotificationsAsync(true); // Get unread

                if (notifications != null && notifications.Count > 0)
                {
                    // バッジを表示
                    Application.Current.Dispatcher.Invoke(() =>
                    {
                        var count = notifications.Count;
                        NotificationCountText.Text = count > 99 ? "99+" : count.ToString();
                        NotificationBadge.Visibility = Visibility.Visible;
                    });
                }
                else
                {
                    // バッジを非表示
                    Application.Current.Dispatcher.Invoke(() =>
                    {
                        NotificationBadge.Visibility = Visibility.Collapsed;
                    });
                }
            }
            catch (Exception ex)
            {
                Logger.Warn($"通知確認エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// API接続エラー時のフォールバック処理
        /// タスクは共有データのためbackend-api経由でのみ取得します。
        /// オフライン時は空のリストを返します。
        /// </summary>
        private void LoadTasksFromDatabase(int userId)
        {
            // タスクは共有データのため、ローカルDBからは取得しません
            // オフライン時は空のリストを返します
            Logger.Info("オフライン状態のため、タスクは取得できません。API接続をご確認ください。");
            _displayTasks = new List<TaskItem>();
            _allTasksForAi = new List<TaskItem>();
            _todayTasksForAi = new List<TaskItem>();
            _pastIncompleteTasksForAi = new List<TaskItem>();
            _dashboardSummary = null;
            BuildDashboardOverviewForAi();
        }

        /// <summary>
        /// タスク表示を更新します。
        /// </summary>
        private void UpdateTaskDisplay()
        {
            TasksItemsControl.ItemsSource = _displayTasks;

            bool hasTasks = _displayTasks.Count > 0;
            TasksItemsControl.Visibility = hasTasks ? Visibility.Visible : Visibility.Collapsed;
            EmptyTasksMessage.Visibility = hasTasks ? Visibility.Collapsed : Visibility.Visible;
            StartWorkButton.IsEnabled = hasTasks;

            // 選択状態をクリア
            _orderedSelectedTasks.Clear();
            UpdateStartButtonText();
        }

        /// <summary>
        /// タスク選択状態が変更されたときの処理です。
        /// </summary>
        private void OnTaskSelectionChanged(object sender, RoutedEventArgs e)
        {
            if (sender is CheckBox checkBox)
            {
                var task = checkBox.DataContext as TaskItem;
                if (task != null)
                {
                    if (checkBox.IsChecked == true)
                    {
                        // 選択時は順番付きリストの最後に追加
                        if (!_orderedSelectedTasks.Contains(task))
                        {
                            _orderedSelectedTasks.Add(task);
                        }
                    }
                    else
                    {
                        // 選択解除時は順番付きリストから削除
                        _orderedSelectedTasks.Remove(task);
                    }
                    UpdateSelectedTasksPanel();
                    UpdateStartButtonText();
                }
            }
        }

        /// <summary>
        /// 選択タスクパネルを更新します
        /// </summary>
        private void UpdateSelectedTasksPanel()
        {
            SelectedTasksItemsControl.ItemsSource = null;
            SelectedTasksItemsControl.ItemsSource = _orderedSelectedTasks;
            SelectedTasksPanel.Visibility = _orderedSelectedTasks.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        /// <summary>
        /// タスクを上に移動します
        /// </summary>
        private void OnMoveTaskUp(object sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is TaskItem task)
            {
                int currentIndex = _orderedSelectedTasks.IndexOf(task);
                if (currentIndex > 0)
                {
                    _orderedSelectedTasks.RemoveAt(currentIndex);
                    _orderedSelectedTasks.Insert(currentIndex - 1, task);
                    UpdateSelectedTasksPanel();
                }
            }
        }

        /// <summary>
        /// タスクを下に移動します
        /// </summary>
        private void OnMoveTaskDown(object sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is TaskItem task)
            {
                int currentIndex = _orderedSelectedTasks.IndexOf(task);
                if (currentIndex >= 0 && currentIndex < _orderedSelectedTasks.Count - 1)
                {
                    _orderedSelectedTasks.RemoveAt(currentIndex);
                    _orderedSelectedTasks.Insert(currentIndex + 1, task);
                    UpdateSelectedTasksPanel();
                }
            }
        }

        /// <summary>
        /// スタートボタンのテキストを更新します。
        /// </summary>
        private void UpdateStartButtonText()
        {
            if (_orderedSelectedTasks.Count > 0)
            {
                StartWorkButtonText.Text = $"選択した{_orderedSelectedTasks.Count}件のタスクで開始";
            }
            else
            {
                StartWorkButtonText.Text = "今日の作業を開始";
            }
        }

        private void OnStartWorkClicked(object sender, RoutedEventArgs e)
        {
            StartWorkButton.IsEnabled = false;

            // 設定から作業フォルダを取得
            string workFolder = null;
            try
            {
                var settings = Services.ConfigService.Current;
                workFolder = settings.WorkFolder;
            }
            catch (Exception ex)
            {
                Logger.Warn($"設定の読み込みに失敗しました: {ex.Message}");
            }

            // 選択されたタスクがある場合はそれを使用（順番を保持）、なければ表示中の全タスク
            var tasksToStart = _orderedSelectedTasks.Count > 0
                ? _orderedSelectedTasks
                : _displayTasks;

            var widgetWindow = new WidgetWindow(tasksToStart, workFolder);
            App.CurrentWidgetWindow = widgetWindow; // 現在のWidgetWindowを設定
            widgetWindow.Show();
            Close();
        }

        /// <summary>
        /// 通知ボタンのクリックイベントです。
        /// </summary>
        private void NotificationsButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (App.ApiService == null)
                {
                    Alert.Error("API サービスが利用できません。接続を確認してください。", "エラー");
                    return;
                }

                var notificationWindow = new NotificationHistoryWindow(App.ApiService);
                notificationWindow.Owner = this;
                notificationWindow.ShowDialog();
                
                // バッジ更新
                _ = CheckNotificationsAsync();
            }
            catch (Exception ex)
            {
                Logger.Error($"通知履歴ウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"通知履歴画面を開けません。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// 設定ボタンのクリックイベントです。
        /// </summary>
        private void SettingsButton_Click(object sender, RoutedEventArgs e)
        {
            var settingsWindow = new SettingsWindow();
            settingsWindow.Owner = this;
            var result = settingsWindow.ShowDialog();

            if (result == true)
            {
                // 設定が保存された場合、必要に応じて再読み込み
                Logger.Info("設定が更新されました。");
            }
        }

        /// <summary>
        /// ログアウトボタンのクリックイベントです。
        /// </summary>
        private void LogoutButton_Click(object sender, RoutedEventArgs e)
        {
            if (Alert.Confirm(
                "ログアウトしますか？",
                "確認"))
            {
                App.ClearCurrentUser();
                Logger.Info("ユーザーがログアウトしました。");

                var loginWindow = new LoginWindow();
                loginWindow.Show();
                this.Close();
            }
        }

        /// <summary>
        /// タスク詳細を開くボタンのクリックイベントです。
        /// </summary>
        private void OnOpenTaskDetail(object sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is TaskItem task)
            {
                try
                {
                    var detailWindow = new TaskDetailWindow(task);
                    detailWindow.Owner = this;
                    detailWindow.ShowDialog();

                    // タスク詳細画面を閉じた後、タスク一覧を再読み込み
                    _ = LoadTasksAsync();
                }
                catch (Exception ex)
                {
                    Logger.Error($"タスク詳細画面のオープンに失敗しました: {ex.Message}");
                    Alert.Error($"タスク詳細を開けません。\n{ex.Message}", "エラー");
                }
            }
        }

        /// <summary>
        /// 看板ボード表示ボタンのクリックイベントです。
        /// 看板ボードウィンドウを新規に開いてタスク管理画面を表示します。
        /// </summary>
        private async void OpenKanbanButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                OpenKanbanButton.IsEnabled = false;

                // 現在のユーザーとプロジェクト情報を取得
                var currentUser = App.CurrentUser;
                var userId = currentUser?.UserId ?? 0;

                if (userId <= 0)
                {
                    Alert.Error("ユーザー情報が見つかりません。ログインし直してください。", "エラー");
                    OpenKanbanButton.IsEnabled = true;
                    return;
                }

                // API サービスが利用可能か確認
                if (App.ApiService == null)
                {
                    Alert.Error("API サービスが利用できません。接続を確認してください。", "エラー");
                    OpenKanbanButton.IsEnabled = true;
                    return;
                }

                // 看板ボードウィンドウをモーダルダイアログとして開く
                // 注：プロジェクトIDはここではダミー値を使用。実装時に適切に設定してください。
                var kanbanWindow = new KanbanBoardWindow(
                    App.ApiService,
                    userId,
                    projectId: 1,
                    projectName: "マイプロジェクト");

                kanbanWindow.Owner = this; // オーナーを設定

                Logger.Info("看板ボードウィンドウを開きました。");
                kanbanWindow.ShowDialog(); // モーダルダイアログとして開く

                // 看板ボードを閉じた後、タスクを再読み込み
                Logger.Info("看板ボードから戻りました。タスクを再読み込みします。");
                await LoadTasksAsync();

                OpenKanbanButton.IsEnabled = true;
            }
            catch (Exception ex)
            {
                Logger.Error($"看板ボードウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"看板ボードを開けません。\n{ex.Message}", "エラー");
                OpenKanbanButton.IsEnabled = true;
            }
        }

        /// <summary>
        /// ヘルプリクエスト作成ボタンのクリックイベント
        /// </summary>
        private void CreateHelpRequestButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var userId = App.CurrentUser?.UserId ?? 0;

                if (userId <= 0)
                {
                    Alert.Error("ユーザー情報が取得できません。再ログインしてください。", "エラー");
                    return;
                }

                if (App.ApiService == null)
                {
                    Alert.Error("API サービスが利用できません。接続を確認してください。", "エラー");
                    return;
                }

                // ヘルプリクエスト作成ウィンドウを開く
                var helpRequestWindow = new HelpRequestWindow(App.ApiService, userId)
                {
                    Owner = this
                };

                Logger.Info("ヘルプリクエスト作成ウィンドウを開きました。");
                var result = helpRequestWindow.ShowDialog();

                if (result == true && helpRequestWindow.CreatedHelpRequest != null)
                {
                    Logger.Info($"ヘルプリクエストが作成されました（ID: {helpRequestWindow.CreatedHelpRequest.Id}）");
                    // 必要に応じてダッシュボードを更新
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"ヘルプリクエスト作成ウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"ヘルプリクエスト作成画面を開けません。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// AI活動分析ボタンのクリックイベント
        /// </summary>
        private void ViewAiAnalysisButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var userId = App.CurrentUser?.UserId ?? 0;

                if (userId <= 0)
                {
                    Alert.Error("ユーザー情報が取得できません。再ログインしてください。", "エラー");
                    return;
                }

                // AI分析結果ウィンドウを開く
                var aiAnalysisWindow = new AiAnalysisWindow(userId)
                {
                    Owner = this
                };
                aiAnalysisWindow.Initialize(); // 初期化処理を明示的に呼び出す
                aiAnalysisWindow.ShowDialog();
            }
            catch (Exception ex)
            {
                Logger.Error($"AI活動分析ウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"AI活動分析画面を開けません。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// AIアシスタントボタンのクリックイベント
        /// </summary>
        private void AiAssistantButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var userId = App.CurrentUser?.UserId ?? 0;
                var userName = App.CurrentUser?.FullName ?? "ゲストユーザー";

                if (userId <= 0)
                {
                    Alert.Error("ユーザー情報が取得できません。再ログインしてください。", "エラー");
                    return;
                }

                if (string.IsNullOrWhiteSpace(_dashboardOverviewForAi))
                {
                    BuildDashboardOverviewForAi();
                }

                // AIアシスタントウィンドウを開く
                var aiAssistantWindow = new AiAssistantWindow(userId, userName, _dashboardOverviewForAi)
                {
                    Owner = this
                };

                Logger.Info("AIアシスタントウィンドウを開きました。");
                aiAssistantWindow.Show();
            }
            catch (Exception ex)
            {
                Logger.Error($"AIアシスタントウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"AIアシスタント画面を開けません。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// メンタルヘルスチェックボタンのクリックイベント
        /// </summary>
        private void MentalHealthCheckButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var userId = App.CurrentUser?.UserId ?? 0;

                if (userId <= 0)
                {
                    Alert.Error("ユーザー情報が取得できません。再ログインしてください。", "エラー");
                    return;
                }

                if (App.ApiService == null)
                {
                    Alert.Error("API サービスが利用できません。接続を確認してください。", "エラー");
                    return;
                }

                // メンタルヘルスチェックウィンドウを開く
                var mentalHealthWindow = new MentalHealthWindow(App.ApiService, userId)
                {
                    Owner = this
                };

                Logger.Info("メンタルヘルスチェックウィンドウを開きました。");
                var result = mentalHealthWindow.ShowDialog();

                if (result == true && mentalHealthWindow.CreatedLog != null)
                {
                    Logger.Info($"メンタルヘルスログが作成されました（ID: {mentalHealthWindow.CreatedLog.Id}）");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"メンタルヘルスチェックウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"メンタルヘルスチェック画面を開けません。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// プロジェクト管理ボタンのクリックイベント
        /// </summary>
        private void ManageProjectsButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (App.ApiService == null)
                {
                    Alert.Error("API サービスが利用できません。接続を確認してください。", "エラー");
                    return;
                }

                // プロジェクト管理ウィンドウを開く
                var projectManagementWindow = new ProjectManagementWindow
                {
                    Owner = this
                };

                Logger.Info("プロジェクト管理ウィンドウを開きました。");
                projectManagementWindow.ShowDialog();

                Logger.Info("プロジェクト管理ウィンドウから戻りました。");
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト管理ウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"プロジェクト管理画面を開けません。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// プロジェクトダッシュボードボタンのクリックイベント
        /// </summary>
        private void ProjectDashboardButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (App.ApiService == null)
                {
                    Alert.Error("API サービスが利用できません。接続を確認してください。", "エラー");
                    return;
                }

                var projectDashboardWindow = new ProjectDashboardWindow(App.ApiService)
                {
                    Owner = this
                };
                projectDashboardWindow.ShowDialog();
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクトダッシュボードウィンドウの起動に失敗しました: {ex.Message}");
                Alert.Error($"プロジェクトダッシュボードウィンドウの起動に失敗しました。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// 成長トラッキングボタンのクリックイベント
        /// </summary>
        private void GrowthTrackingButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (App.ApiService == null)
                {
                    Alert.Error("API サービスが利用できません。接続を確認してください。", "エラー");
                    return;
                }

                var userId = App.CurrentUser?.UserId ?? 0;
                if (userId <= 0)
                {
                    Alert.Error("ユーザー情報が取得できません。再ログインしてください。", "エラー");
                    return;
                }

                // 成長トラッキングウィンドウを開く
                var growthTrackingWindow = new GrowthTrackingWindow(App.ApiService, userId)
                {
                    Owner = this
                };

                Logger.Info("成長トラッキングウィンドウを開きました。");
                growthTrackingWindow.ShowDialog();

                Logger.Info("成長トラッキングウィンドウから戻りました。");
            }
            catch (Exception ex)
            {
                Logger.Error($"成長トラッキングウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"成長トラッキング画面を開けません。\n{ex.Message}", "エラー");
            }
        }
    }
}
