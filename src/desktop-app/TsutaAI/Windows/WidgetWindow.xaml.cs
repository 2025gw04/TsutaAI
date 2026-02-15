using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using MahApps.Metro.IconPacks;
using TsutaAI.Config;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// 常駐タスクウィジェット。現在取り組むタスクと進行状況を可視化します。
    /// </summary>
    public partial class WidgetWindow : Window
    {
        /// <summary>表示・並び替え対象となるタスクリスト。</summary>
        private readonly List<TaskItem> _allTasks;
        /// <summary>現在作業中として扱うタスク。</summary>
        private TaskItem _currentTask;

        /// <summary>UI 更新用の 1 秒タイマー。</summary>
        private readonly DispatcherTimer _uiTimer;
        /// <summary>自動保存用の 1 時間タイマー。</summary>
        private readonly DispatcherTimer _autoSaveTimer;
        /// <summary>AI分析チェック用タイマー（5分ごと）。</summary>
        private readonly DispatcherTimer _aiCheckTimer;
        /// <summary>経過時間を計測するストップウォッチ。</summary>
        private readonly Stopwatch _stopwatch;

        /// <summary>最後にAI分析をチェックした時刻。</summary>
        private DateTime _lastAiCheckTime;

        /// <summary>マウス・キーボードの操作監視サービス。</summary>
        private ActivityMonitorService _activityMonitor;
        /// <summary>ファイル変更監視サービス。</summary>
        private FileChangeMonitorService _fileMonitor;
        /// <summary>Git 監視サービス。</summary>
        private GitService _gitService;
        /// <summary>フォルダバックアップサービス。</summary>
        private FolderBackupService _backupService;
        /// <summary>ファイル差分サービス。</summary>
        private FileDiffService _diffService;
        /// <summary>ファイル内容分析サービス。</summary>
        private FileContentAnalysisService _analysisService;
        /// <summary>タスク変更検出サービス。</summary>
        private TaskChangeDetectionService _taskChangeService;
        /// <summary>ウィンドウセッション追跡サービス。</summary>
        private WindowSessionTracker _windowTracker;
        /// <summary>システムパフォーマンス監視サービス。</summary>
        private SystemPerformanceMonitor _performanceMonitor;
        /// <summary>バージョン管理監視サービス。</summary>
        private VersionControlMonitorService _versionControlMonitor;
        /// <summary>1時間ごとのアクティビティ集計サービス。</summary>
        private HourlyActivityAggregator _hourlyAggregator;

        /// <summary>直近の自動保存日時。</summary>
        private DateTime _lastAutoSaveTime;
        /// <summary>Gitイベント（commit/push）同期の基準時刻。</summary>
        private DateTime _lastGitEventSyncTime;
        /// <summary>監視対象の作業フォルダー。</summary>
        private readonly string _workFolder;
        /// <summary>変更されたファイルパスのリスト（メモリ上に保存）。</summary>
        private readonly HashSet<string> _changedFilePaths = new HashSet<string>();

        /// <summary>ドラッグ開始位置（タスク並び替え用）。</summary>
        private Point? _dragStartPoint;
        /// <summary>ドラッグ対象となっているタスク。</summary>
        private TaskItem _draggedTask;

        public WidgetWindow(List<TaskItem> tasks, string workFolder = null)
        {
            InitializeComponent();

            _allTasks = tasks ?? new List<TaskItem>();
            _workFolder = workFolder ?? string.Empty;

            _stopwatch = new Stopwatch();

            _uiTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _uiTimer.Tick += UiTimer_Tick;

            int intervalMinutes = ConfigService.Current?.AutoSaveIntervalMinutes ?? 60;
            _autoSaveTimer = new DispatcherTimer { Interval = TimeSpan.FromMinutes(intervalMinutes) };
            _autoSaveTimer.Tick += AutoSaveTimer_Tick;

            _aiCheckTimer = new DispatcherTimer { Interval = TimeSpan.FromMinutes(5) };
            _aiCheckTimer.Tick += AiCheckTimer_Tick;

            _lastAutoSaveTime = DateTime.Now;
            _lastAiCheckTime = DateTime.Now;
            _lastGitEventSyncTime = DateTime.Now;

            Loaded += OnLoaded;
            Closing += OnClosing;
        }

        /// <summary>ウィンドウ表示時の初期化処理。</summary>
        private void OnLoaded(object sender, RoutedEventArgs e)
        {
            TaskListItemsControl.ItemsSource = _allTasks;
            InitializeMonitoringServices();
            
            // タスク変更検出サービスを初期化
            _taskChangeService = new TaskChangeDetectionService();
            
            // 初回のタスク変更チェック
            CheckForTaskChanges();
            
            // 初回のタスク変更チェック
            CheckForTaskChanges();

            // 通知チェック
            _ = CheckNotifications();
            
            LoadNextTask();
        }

        /// <summary>
        /// タスクを再読み込みします（看板ボードから戻った時などに使用）
        /// </summary>
        private async System.Threading.Tasks.Task ReloadTasksAsync()
        {
            var userId = App.CurrentUser?.UserId ?? 0;
            if (userId <= 0 || App.ApiService == null)
            {
                Logger.Warn("タスクの再読み込みに失敗: ユーザーIDまたはAPIサービスが無効です。");
                return;
            }

            try
            {
                var today = DateTime.Today;
                var todayStr = today.ToString("yyyy-MM-dd");

                // プロジェクトタスクと個人タスクを並列で取得
                var todayTasksTask = App.ApiService.GetTodayTasksAsync(userId);
                var allUserTasksTask = App.ApiService.GetUserTasksAsync(userId);
                var personalTasksTask = App.ApiService.GetPersonalTasksAsync(userId);

                await System.Threading.Tasks.Task.WhenAll(todayTasksTask, allUserTasksTask, personalTasksTask);

                var todayProjectTasks = await todayTasksTask ?? new List<TaskItem>();
                var allUserTasks = await allUserTasksTask ?? new List<TaskItem>();
                var personalTasks = await personalTasksTask ?? new List<PersonalTask>();

                // 個人タスクをTaskItemに変換
                var convertedPersonalTasks = personalTasks.Select(pt => ConvertPersonalTaskToTaskItem(pt)).ToList();

                // 本日のタスク（プロジェクト + 個人）を結合
                var todayPersonalTasks = convertedPersonalTasks
                    .Where(t => !t.IsCompleted && (
                        (t.DueDate.HasValue && t.DueDate.Value.Date == today) ||
                        (t.StartDate.HasValue && t.StartDate.Value.Date == today) ||
                        (t.StartDate.HasValue && t.EndDate.HasValue &&
                         t.StartDate.Value.Date <= today && t.EndDate.Value.Date >= today)
                    ))
                    .ToList();

                var todayTasks = todayProjectTasks.Concat(todayPersonalTasks).ToList();

                // プロジェクトタスクと個人タスクを結合（全体）
                var allTasks = allUserTasks.Concat(convertedPersonalTasks).ToList();

                // 本日のタスクIDを記録
                var todayTaskIds = new HashSet<int>(todayTasks.Select(t => t.TaskId));

                // 過去の未完了タスクを抽出
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

                // 既存のタスクリストを更新
                var newTasks = pastIncompleteTasks.Concat(todayTasks).ToList();

                _allTasks.Clear();
                _allTasks.AddRange(newTasks);

                // タスク変更をチェック
                CheckForTaskChanges();

                // UIを更新
                TaskListItemsControl.ItemsSource = null;
                TaskListItemsControl.ItemsSource = _allTasks;

                Logger.Info($"タスクを再読み込みしました: {newTasks.Count()}件");
            }
            catch (Exception ex)
            {
                Logger.Error($"タスクの再読み込みに失敗しました: {ex.Message}");
            }
        }

        /// <summary>
        /// タスクの変更をチェックし、通知を表示します
        /// </summary>
        private void CheckForTaskChanges()
        {
            try
            {
                if (_taskChangeService == null)
                {
                    return;
                }

                // 本日のタスクのみをチェック対象とする
                var today = DateTime.Today;
                var todayTasks = _allTasks.Where(t =>
                    (t.DueDate.HasValue && t.DueDate.Value.Date == today) ||
                    (t.StartDate.HasValue && t.StartDate.Value.Date == today) ||
                    (t.StartDate.HasValue && t.EndDate.HasValue &&
                     t.StartDate.Value.Date <= today && t.EndDate.Value.Date >= today)
                ).ToList();

                // 変更を検出
                var changes = _taskChangeService.DetectChanges(todayTasks);

                if (changes.Any())
                {
                    // 変更通知ダイアログを表示
                    var dialog = new TaskChangeNotificationDialog(changes)
                    {
                        Owner = this
                    };

                    var result = dialog.ShowDialog();

                    if (result == true)
                    {
                        // ユーザーが確認したら、すべての変更を既読にする
                        _taskChangeService.MarkAllAsRead(todayTasks);
                        RefreshTaskListDisplay();
                    }
                }

                // 現在のタスク状態をスナップショットとして保存
                _taskChangeService.SaveTaskSnapshots(todayTasks);
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク変更チェック中にエラーが発生しました: {ex.Message}");
            }
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

        /// <summary>ウィンドウ閉鎖時の後始末。</summary>
        private void OnClosing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            CleanupMonitoringServices();
        }

        /// <summary>監視系サービスの初期化。</summary>
        private void InitializeMonitoringServices()
        {
            try
            {
                // アクティビティ監視サービスの初期化
                _activityMonitor = new ActivityMonitorService();

                // 設定から監視オプションを適用
                var config = ConfigService.Current;
                if (config != null)
                {
                    _activityMonitor.MonitorMouse = config.MonitorMouse;
                    _activityMonitor.MonitorKeyboard = config.MonitorKeyboard;
                    _activityMonitor.MonitorActiveWindow = config.MonitorActiveWindow;
                }

                _activityMonitor.Start();

                // ウィンドウセッション追跡サービスの初期化
                _windowTracker = new WindowSessionTracker(App.LocalDatabase);

                // ActivityMonitorのウィンドウ変更イベントをWindowSessionTrackerに連携
                _activityMonitor.ActiveWindowChanged += (sender, e) =>
                {
                    _windowTracker?.OnWindowChanged(
                        App.CurrentUser?.UserId ?? 0,
                        e.WindowTitle,
                        e.ProcessName
                    );
                };

                // システムパフォーマンス監視サービスの初期化
                _performanceMonitor = new SystemPerformanceMonitor(App.LocalDatabase);
                _performanceMonitor.StartMonitoring(App.CurrentUser?.UserId ?? 0);

                if (!string.IsNullOrWhiteSpace(_workFolder) && Directory.Exists(_workFolder))
                {
                    // フォルダバックアップサービスの初期化
                    _backupService = new FolderBackupService();
                    
                    // 1日1回のバックアップを実行（再起動時はスキップ）
                    if (_backupService.ShouldBackupToday())
                    {
                        Logger.Info("本日のフォルダバックアップを開始します...");
                        var backupSuccess = _backupService.BackupFolder(_workFolder);
                        if (backupSuccess)
                        {
                            Logger.Info("フォルダバックアップが完了しました。");
                        }
                    }
                    else
                    {
                        Logger.Info("本日のバックアップは既に実行済みです。");
                        
                        // 再起動した場合は、バックアップと比較して変更ファイルを取得
                        var changedFiles = _backupService.GetChangedFilesSinceBackup(_workFolder);
                        foreach (var file in changedFiles)
                        {
                            _changedFilePaths.Add(file);
                        }
                        Logger.Info($"バックアップとの比較: {changedFiles.Count}個のファイルが変更されています。");
                    }

                    // ファイル変更監視サービスの初期化
                    if (ConfigService.Current?.MonitorFileChanges ?? true)
                    {
                        _fileMonitor = new FileChangeMonitorService();
                        _fileMonitor.FileChanged += OnFileChanged;
                        _fileMonitor.Start(_workFolder);
                    }

                    // ファイル差分・分析サービスの初期化
                    _diffService = new FileDiffService(App.LocalDatabase);
                    _analysisService = new FileContentAnalysisService(_backupService, _diffService);

                    // Git監視サービスの初期化
                    if ((ConfigService.Current?.MonitorGit ?? true) && GitService.IsGitRepository(_workFolder))
                    {
                        _gitService = new GitService(_workFolder);

                        // バージョン管理監視サービスの初期化
                        var vcsSettings = new VersionControlSettings
                        {
                            Type = "git",
                            LocalPath = _workFolder,
                            EnableMonitoring = true,
                            AutoRecognizeCommits = true
                        };
                        _versionControlMonitor = new VersionControlMonitorService(vcsSettings);
                        _versionControlMonitor.Start();
                    }
                }

                // 1時間ごとのアクティビティ集計サービスの初期化
                _hourlyAggregator = new HourlyActivityAggregator(
                    App.LocalDatabase,
                    App.ApiService,
                    _activityMonitor,
                    _windowTracker,
                    _diffService,
                    _performanceMonitor
                );
                _hourlyAggregator.Start(App.CurrentUser?.UserId ?? 0);

                Logger.Info("すべての監視サービスが正常に初期化されました。");
            }
            catch (Exception ex)
            {
                Logger.Error("監視サービス初期化中にエラーが発生しました: " + ex.Message);
            }
        }

        /// <summary>ファイル変更イベントのハンドラー。</summary>
        private void OnFileChanged(object sender, FileChangeEventArgs e)
        {
            if (e?.ChangeInfo != null)
            {
                // 変更されたファイルパスをメモリ上に保存
                lock (_changedFilePaths)
                {
                    _changedFilePaths.Add(e.ChangeInfo.FilePath);
                }

                PersistFileDiffEvent(e);
                Logger.Debug($"ファイル変更を検出: {e.ChangeInfo.FilePath} ({e.ChangeInfo.ChangeType})");
            }
        }

        /// <summary>監視系サービスの終了処理。</summary>
        private void CleanupMonitoringServices()
        {
            try
            {
                // 1時間ごとのアクティビティ集計サービスの停止
                _hourlyAggregator?.Stop();
                _hourlyAggregator?.Dispose();
                _hourlyAggregator = null;

                // システムパフォーマンス監視サービスの停止
                _performanceMonitor?.StopMonitoring();
                _performanceMonitor?.Dispose();
                _performanceMonitor = null;

                // バージョン管理監視サービスの停止
                _versionControlMonitor?.Stop();
                _versionControlMonitor?.Dispose();
                _versionControlMonitor = null;

                // ウィンドウセッション追跡サービスのクリーンアップ
                _windowTracker = null;

                // アクティビティ監視サービスの停止
                _activityMonitor?.Stop();
                _activityMonitor?.Dispose();
                _activityMonitor = null;

                // ファイル変更監視サービスの停止
                if (_fileMonitor != null)
                {
                    _fileMonitor.FileChanged -= OnFileChanged;
                    _fileMonitor.Stop();
                    _fileMonitor.Dispose();
                    _fileMonitor = null;
                }

                _gitService = null;
                _backupService = null;
                _diffService = null;
                _analysisService = null;

                Logger.Info("すべての監視サービスが正常に終了しました。");
            }
            catch (Exception ex)
            {
                Logger.Warn("監視サービス終了処理中にエラーが発生しました: " + ex.Message);
            }
        }

        /// <summary>未完了タスクを現在タスクとして読み込みます。</summary>
        private void LoadNextTask()
        {
            if (_currentTask != null)
            {
                _currentTask.IsCurrent = false;
            }

            _currentTask = _allTasks.FirstOrDefault(t => !t.IsCompleted) ?? _allTasks.FirstOrDefault();

            if (_currentTask == null)
            {
                _hourlyAggregator?.SetCurrentTask(null, null);
                AllTasksCompleted();
                return;
            }

            _currentTask.IsCurrent = true;
            _hourlyAggregator?.SetCurrentTask(_currentTask.ProjectId, _currentTask.TaskId);
            
            UpdateCurrentTaskDisplay();
            RefreshTaskListDisplay();

            _stopwatch.Restart();
            _uiTimer.Start();
            _autoSaveTimer.Start();
            _aiCheckTimer.Start();
            _lastAutoSaveTime = DateTime.Now;
            _lastAiCheckTime = DateTime.Now;
            _lastGitEventSyncTime = DateTime.Now;
            UpdateTimerUi();

            PauseResumeTextBlock.Text = "一時停止";
            PauseResumeIcon.Kind = PackIconBoxIconsKind.RegularPause;
            PauseResumeButton.IsEnabled = true;
            CompleteButton.IsEnabled = true;
        }

        /// <summary>すべてのタスクが完了した際の処理。</summary>
        private void AllTasksCompleted()
        {
            EndWorkDay();
        }

        /// <summary>本日の作業を強制終了し、日報画面を表示します。</summary>
        private void EndWorkDay()
        {
            _uiTimer.Stop();
            _autoSaveTimer.Stop();
            _aiCheckTimer.Stop();
            _stopwatch.Stop();

            SyncGitActivityEvents(DateTime.Now);

            PauseResumeButton.IsEnabled = false;
            CompleteButton.IsEnabled = false;

            TaskTitleTextBlock.Text = "本日のタスクは終了しました";
            ElapsedTimeTextBlock.Text = "お疲れさまでした";
            TaskProgressBar.Value = 100;

            var reportWindow = new DailyReportWindow(_allTasks, _workFolder);

            // 実行時点の操作統計を渡す（時間単位集計の未保存分を補完）
            if (_activityMonitor != null)
            {
                try
                {
                    reportWindow.SetLatestActivityStats(_activityMonitor.GetCurrentStats());
                }
                catch (Exception ex)
                {
                    Logger.Warn("活動統計の引き渡しに失敗しました: " + ex.Message);
                }
            }
            
            // ファイル変更の基本サマリーを設定
            if (_fileMonitor != null)
            {
                try
                {
                    reportWindow.SetFileChangeSummary(_fileMonitor.GetSummary());
                }
                catch (Exception ex)
                {
                    Logger.Warn("ファイル変更情報の取り込みに失敗しました: " + ex.Message);
                }
            }

            // 変更されたファイルの詳細分析を実行
            if (_analysisService != null && _changedFilePaths.Count > 0)
            {
                try
                {
                    Logger.Info($"ファイル変更の詳細分析を開始します（{_changedFilePaths.Count}個のファイル）...");
                    var userId = App.CurrentUser?.UserId ?? 1;
                    var changedFilesList = _changedFilePaths.ToList();
                    var workContentSummary = _analysisService.AnalyzeChangedFiles(changedFilesList, _workFolder, userId);
                    
                    reportWindow.SetWorkContentSummary(workContentSummary);
                    Logger.Info("ファイル変更の詳細分析が完了しました。");
                }
                catch (Exception ex)
                {
                    Logger.Error($"ファイル変更の詳細分析に失敗しました: {ex.Message}");
                }
            }

            reportWindow.Show();
            Close();
        }

        /// <summary>タスクリスト項目をダブルクリックした際の処理。</summary>
        private void TaskItem_Click(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount < 2)
            {
                return;
            }

            if (sender is Border border && border.Tag is TaskItem task)
            {
                var detailWindow = new TaskDetailWindow(task)
                {
                    Owner = this
                };
                detailWindow.ShowDialog();

                RefreshTaskListDisplay();
                UpdateCurrentTaskDisplay();
                e.Handled = true;
            }
        }

        /// <summary>ヘッダーの現在タスク表示を更新します。</summary>
        private void UpdateCurrentTaskDisplay()
        {
            TaskTitleTextBlock.Text = _currentTask?.Title ?? "未着手のタスクはありません";
        }

        /// <summary>並び替えガイドを表示します。</summary>
        private void ReorderTasksButton_Click(object sender, RoutedEventArgs e)
        {
            Alert.Info(
                "タスクリストの項目をドラッグ＆ドロップすると順番を変更できます。",
                "並び替え");
        }

        /// <summary>終業処理の確認。</summary>
        private void EndWorkDayButton_Click(object sender, RoutedEventArgs e)
        {
            if (Alert.Confirm("本日の作業を終了しますか？", "確認"))
            {
                SaveWorkLog();
                EndWorkDay();
            }
        }

        /// <summary>UI 更新タイマーの処理。</summary>
        private void UiTimer_Tick(object sender, EventArgs e)
        {
            UpdateTimerUi();
        }

        /// <summary>経過時間とアクティビティ表示を更新します。</summary>
        private void UpdateTimerUi()
        {
            ElapsedTimeTextBlock.Text = _stopwatch.Elapsed.ToString(@"hh\:mm\:ss");

            if (_currentTask != null && _currentTask.EstimatedMinutes > 0)
            {
                var progressValue = (_stopwatch.Elapsed.TotalMinutes / _currentTask.EstimatedMinutes) * 100;
                TaskProgressBar.Value = Math.Min(progressValue, 100);
            }
            else
            {
                TaskProgressBar.Value = 0;
            }

            UpdateActivityStats();
        }

        /// <summary>操作回数などのアクティビティ情報を表示します。</summary>
        private void UpdateActivityStats()
        {
            if (_activityMonitor == null)
            {
                ActivityStatsTextBlock.Text = string.Empty;
                return;
            }

            try
            {
                var stats = _activityMonitor.GetCurrentStats();
                var builder = new StringBuilder();

                if (stats.MouseClickCount > 0 || stats.KeyPressCount > 0)
                {
                    builder.Append($"🖱 {stats.MouseClickCount}回  ⌨ {stats.KeyPressCount}回");
                }

                if (_fileMonitor != null)
                {
                    var fileSummary = _fileMonitor.GetSummary();
                    if (fileSummary.TotalChanges > 0)
                    {
                        if (builder.Length > 0)
                        {
                            builder.Append(" | ");
                        }

                        builder.Append($"📁 変更 {fileSummary.TotalChanges}件");
                    }
                }

                ActivityStatsTextBlock.Text = builder.ToString();
            }
            catch (Exception ex)
            {
                Logger.Warn("アクティビティ統計の更新に失敗しました: " + ex.Message);
            }
        }

        /// <summary>一時停止／再開ボタン押下時の処理。</summary>
        private void PauseResumeButton_Click(object sender, RoutedEventArgs e)
        {
            if (_stopwatch.IsRunning)
            {
                _stopwatch.Stop();
                _uiTimer.Stop();
                _autoSaveTimer.Stop();
                _aiCheckTimer.Stop();
                PauseResumeIcon.Kind = PackIconBoxIconsKind.RegularPlay;
                PauseResumeTextBlock.Text = "再開";
            }
            else
            {
                _stopwatch.Start();
                _uiTimer.Start();
                _autoSaveTimer.Start();
                _aiCheckTimer.Start();
                _lastAutoSaveTime = DateTime.Now;
                PauseResumeIcon.Kind = PackIconBoxIconsKind.RegularPause;
                PauseResumeTextBlock.Text = "一時停止";
            }
        }

        /// <summary>完了ボタン押下時の処理。</summary>
        private void CompleteButton_Click(object sender, RoutedEventArgs e)
        {
            if (_currentTask == null)
            {
                return;
            }

            _currentTask.IsCompleted = true;
            _currentTask.Progress = 100;
            SaveWorkLog();
            LoadNextTask();
        }

        private void NotificationsButton_Click(object sender, RoutedEventArgs e)
        {
            var window = new NotificationHistoryWindow(App.ApiService);
            window.Owner = this;
            window.ShowDialog();
            
            // バッジ更新のためにチェック（簡易実装）
            _ = CheckNotifications();
        }

        private async System.Threading.Tasks.Task CheckNotifications()
        {
            try
            {
                if (App.ApiService == null) return;
                var notifications = await App.ApiService.GetNotificationsAsync(unreadOnly: true);
                if (notifications != null && notifications.Count > 0)
                {
                    NotificationBadge.Visibility = Visibility.Visible;
                }
                else
                {
                    NotificationBadge.Visibility = Visibility.Collapsed;
                }
            }
            catch { /* Ignore */ }
        }

        /// <summary>ウィジェットをシステムトレイへ最小化します。</summary>
        private void MinimizeButton_Click(object sender, RoutedEventArgs e)
        {
            Hide();
            App.ShowSystemTrayIcon();
            App.ShowNotification("TsutaAI", "作業ウィジェットをシステムトレイに移動しました。", System.Windows.Forms.ToolTipIcon.Info);
        }

        /// <summary>ウィジェットを閉じてダッシュボードへ戻ります。</summary>
        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            if (Alert.Confirm("作業を中断してダッシュボードに戻りますか？", "確認"))
            {
                _uiTimer.Stop();
                _autoSaveTimer.Stop();
                _stopwatch.Stop();

                var dashboard = new DashboardWindow();
                dashboard.Show();
                Close();
            }
        }

        /// <summary>自動保存タイマー処理。</summary>
        private void AutoSaveTimer_Tick(object sender, EventArgs e)
        {
            try
            {
                SaveWorkLog();
                _lastAutoSaveTime = DateTime.Now;
            }
            catch (Exception ex)
            {
                Logger.Error("作業ログの自動保存に失敗しました: " + ex.Message);
            }
        }

        /// <summary>作業ログをローカルデータベースに保存します。</summary>
        private void SaveWorkLog()
        {
            if (_currentTask == null)
            {
                return;
            }

            try
            {
                var now = DateTime.Now;
                SyncGitActivityEvents(now);

                var user = App.CurrentUser;
                var log = new WorkLog
                {
                    UserId = user?.UserId ?? 1,
                    TaskId = _currentTask.Id,
                    StartTime = _lastAutoSaveTime,
                    EndTime = now,
                    DurationMinutes = (int)(now - _lastAutoSaveTime).TotalMinutes,
                    ActivityType = "作業",
                    Notes = BuildWorkLogNotes()
                };

                // 作業ログはbackend-api経由で保存
                _ = App.ApiService?.SendWorkLogAsync(log);
            }
            catch (Exception ex)
            {
                Logger.Error("作業ログ保存中にエラーが発生しました: " + ex.Message);
            }
        }

        /// <summary>ログ保存時に添付するメモを作成します。</summary>
        private string BuildWorkLogNotes()
        {
            var notes = new StringBuilder();
            notes.AppendLine($"【作業時間】{_lastAutoSaveTime:HH:mm} ~ {DateTime.Now:HH:mm}");

            if (_activityMonitor != null)
            {
                var stats = _activityMonitor.GetCurrentStats();
                notes.AppendLine($"【操作記録】マウス {stats.MouseClickCount} 回 / キーボード {stats.KeyPressCount} 回");
                if (!string.IsNullOrWhiteSpace(stats.CurrentWindowTitle))
                {
                    notes.AppendLine("【最前面ウィンドウ】" + stats.CurrentWindowTitle);
                }
            }

            if (_fileMonitor != null)
            {
                var summary = _fileMonitor.GetSummary();
                if (summary.TotalChanges > 0)
                {
                    notes.AppendLine($"【ファイル変更】{summary.TotalChanges} 件 (変更 {summary.ModifiedCount}, 作成 {summary.CreatedCount}, 削除 {summary.DeletedCount})");
                }
            }

            if (_gitService != null)
            {
                try
                {
                    var commits = _gitService.GetCommitsSince(_lastAutoSaveTime);
                    if (commits.Any())
                    {
                        notes.AppendLine($"【Git コミット】{commits.Count} 件");
                        foreach (var commit in commits.Take(3))
                        {
                            notes.AppendLine("  - " + commit.Message);
                        }
                    }

                    var pushEvents = _gitService.GetPushEventsSince(_lastAutoSaveTime);
                    if (pushEvents.Any())
                    {
                        notes.AppendLine($"【Git Push】{pushEvents.Count} 件");
                        foreach (var push in pushEvents.Take(3))
                        {
                            var branchText = string.IsNullOrWhiteSpace(push.Branch) ? "unknown" : push.Branch;
                            notes.AppendLine($"  - [{push.Date:HH:mm}] {branchText}: {push.Message}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warn("Git 活動取得中にエラーが発生しました: " + ex.Message);
                }
            }

            return notes.ToString();
        }

        /// <summary>
        /// ファイル変更イベントをローカルDBへ保存します。
        /// </summary>
        private void PersistFileDiffEvent(FileChangeEventArgs e)
        {
            if (e == null || e.ChangeInfo == null || _diffService == null || App.LocalDatabase == null)
            {
                return;
            }

            var userId = App.CurrentUser?.UserId ?? 0;
            if (userId <= 0)
            {
                return;
            }

            try
            {
                var fileDiff = _diffService.CalculateDiff(e.ChangeInfo.FilePath, userId);
                if (fileDiff == null)
                {
                    fileDiff = new FileDiff
                    {
                        UserId = userId,
                        FilePath = e.ChangeInfo.FilePath,
                        ChangeType = ToFileDiffChangeType(e.ChangeInfo.ChangeType),
                        DiffContent = string.Empty,
                        LinesAdded = 0,
                        LinesRemoved = 0,
                        Timestamp = e.ChangeInfo.Timestamp
                    };
                }

                App.LocalDatabase.SaveFileDiff(fileDiff);
            }
            catch (Exception ex)
            {
                Logger.Warn("ファイル差分のローカル保存に失敗しました: " + ex.Message);
            }
        }

        /// <summary>
        /// Gitイベント（commit/push）をローカルDBへ保存します。
        /// </summary>
        private void SyncGitActivityEvents(DateTime syncUntil)
        {
            if (_gitService == null || App.LocalDatabase == null)
            {
                return;
            }

            var userId = App.CurrentUser?.UserId ?? 0;
            if (userId <= 0)
            {
                return;
            }

            try
            {
                var startTime = _lastGitEventSyncTime;
                var queryStart = startTime.AddSeconds(-1);
                var repositoryPath = _workFolder ?? string.Empty;

                // Gitログは秒精度で取得されるため、境界秒の取りこぼし防止として1秒戻して取得し、
                // 既存レコードとの重複チェックで二重保存を防ぐ。
                var existingEvents = App.LocalDatabase.GetGitActivityEvents(userId, queryStart, syncUntil)
                    .Where(e => string.Equals(e.RepositoryPath ?? string.Empty, repositoryPath, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                var existingCommitHashes = new HashSet<string>(
                    existingEvents
                        .Where(e => string.Equals(e.EventType, "commit", StringComparison.OrdinalIgnoreCase))
                        .Select(e => e.CommitHash ?? string.Empty)
                        .Where(hash => !string.IsNullOrWhiteSpace(hash)),
                    StringComparer.OrdinalIgnoreCase);

                var existingPushKeys = new HashSet<string>(
                    existingEvents
                        .Where(e => string.Equals(e.EventType, "push", StringComparison.OrdinalIgnoreCase))
                        .Select(e => BuildPushEventKey(e.OccurredAt, e.BranchName, e.Message)),
                    StringComparer.OrdinalIgnoreCase);

                var commits = _gitService.GetCommitsSince(queryStart)
                    .Where(c => c.Date <= syncUntil)
                    .OrderBy(c => c.Date)
                    .ToList();

                foreach (var commit in commits)
                {
                    if (string.IsNullOrWhiteSpace(commit.Hash) || existingCommitHashes.Contains(commit.Hash))
                    {
                        continue;
                    }

                    App.LocalDatabase.SaveGitActivityEvent(new GitActivityEvent
                    {
                        UserId = userId,
                        RepositoryPath = repositoryPath,
                        EventType = "commit",
                        CommitHash = commit.Hash,
                        BranchName = null,
                        Message = commit.Message,
                        OccurredAt = commit.Date
                    });

                    existingCommitHashes.Add(commit.Hash);
                }

                var pushEvents = _gitService.GetPushEventsSince(queryStart)
                    .Where(p => p.Date <= syncUntil)
                    .OrderBy(p => p.Date)
                    .ToList();

                foreach (var push in pushEvents)
                {
                    var pushKey = BuildPushEventKey(push.Date, push.Branch, push.Message);
                    if (existingPushKeys.Contains(pushKey))
                    {
                        continue;
                    }

                    App.LocalDatabase.SaveGitActivityEvent(new GitActivityEvent
                    {
                        UserId = userId,
                        RepositoryPath = repositoryPath,
                        EventType = "push",
                        CommitHash = null,
                        BranchName = push.Branch,
                        Message = push.Message,
                        OccurredAt = push.Date
                    });

                    existingPushKeys.Add(pushKey);
                }

                _lastGitEventSyncTime = syncUntil;
            }
            catch (Exception ex)
            {
                Logger.Warn("Gitイベントのローカル保存に失敗しました: " + ex.Message);
            }
        }

        private static string BuildPushEventKey(DateTime occurredAt, string branchName, string message)
        {
            var branch = branchName ?? string.Empty;
            var content = message ?? string.Empty;
            return occurredAt.ToString("o") + "|" + branch + "|" + content;
        }

        private static string ToFileDiffChangeType(WatcherChangeTypes changeType)
        {
            switch (changeType)
            {
                case WatcherChangeTypes.Created:
                    return "added";
                case WatcherChangeTypes.Deleted:
                    return "deleted";
                case WatcherChangeTypes.Renamed:
                    return "renamed";
                default:
                    return "modified";
            }
        }

        /// <summary>タスクリストを再描画し、現在タスクを表示位置へスクロールします。</summary>
        private void RefreshTaskListDisplay()
        {
            TaskListItemsControl.ItemsSource = null;
            TaskListItemsControl.ItemsSource = _allTasks;
            TaskListItemsControl.SelectedItem = _currentTask;
            if (_currentTask != null)
            {
                TaskListItemsControl.ScrollIntoView(_currentTask);
            }
        }

        /// <summary>ドラッグ開始時の処理。</summary>
        private void TaskList_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            _dragStartPoint = e.GetPosition(null);
            _draggedTask = null;
        }

        /// <summary>ドラッグ中の処理。</summary>
        private void TaskList_PreviewMouseMove(object sender, MouseEventArgs e)
        {
            if (e.LeftButton != MouseButtonState.Pressed || !_dragStartPoint.HasValue)
            {
                return;
            }

            var currentPosition = e.GetPosition(null);
            if (Math.Abs(currentPosition.X - _dragStartPoint.Value.X) < SystemParameters.MinimumHorizontalDragDistance &&
                Math.Abs(currentPosition.Y - _dragStartPoint.Value.Y) < SystemParameters.MinimumVerticalDragDistance)
            {
                return;
            }

            var listBoxItem = FindAncestor<ListBoxItem>((DependencyObject)e.OriginalSource);
            if (listBoxItem == null || !(listBoxItem.DataContext is TaskItem task))
            {
                return;
            }

            _draggedTask = task;
            var result = DragDrop.DoDragDrop(listBoxItem, task, DragDropEffects.Move);
            if (result == DragDropEffects.None)
            {
                ResetDragState();
            }
        }

        /// <summary>ドラッグ操作中の描画を制御します。</summary>
        private void TaskList_DragOver(object sender, DragEventArgs e)
        {
            if (_draggedTask != null)
            {
                e.Effects = DragDropEffects.Move;
                e.Handled = true;
            }
        }

        /// <summary>タスクがドロップされた際の処理。</summary>
        private void TaskList_Drop(object sender, DragEventArgs e)
        {
            if (_draggedTask == null)
            {
                ResetDragState();
                return;
            }

            var targetContainer = FindAncestor<ListBoxItem>((DependencyObject)e.OriginalSource);
            var targetTask = targetContainer?.DataContext as TaskItem;

            var sourceIndex = _allTasks.IndexOf(_draggedTask);
            if (sourceIndex < 0)
            {
                ResetDragState();
                return;
            }

            var targetIndex = targetTask == null ? _allTasks.Count : _allTasks.IndexOf(targetTask);
            if (targetIndex < 0)
            {
                ResetDragState();
                return;
            }

            if (targetContainer != null)
            {
                var position = e.GetPosition(targetContainer);
                if (position.Y > targetContainer.ActualHeight / 2)
                {
                    targetIndex += 1;
                }
            }

            if (targetIndex > _allTasks.Count)
            {
                targetIndex = _allTasks.Count;
            }

            if (sourceIndex == targetIndex || sourceIndex + 1 == targetIndex)
            {
                ResetDragState();
                return;
            }

            _allTasks.RemoveAt(sourceIndex);
            if (sourceIndex < targetIndex)
            {
                targetIndex--;
            }
            _allTasks.Insert(targetIndex, _draggedTask);

            UpdateCurrentTaskAfterReorder();
            e.Handled = true;
            ResetDragState();
        }

        /// <summary>並び替え後に現在タスクを再決定します。</summary>
        private void UpdateCurrentTaskAfterReorder()
        {
            foreach (var task in _allTasks)
            {
                task.IsCurrent = false;
            }

            _currentTask = _allTasks.FirstOrDefault(t => !t.IsCompleted) ?? _allTasks.FirstOrDefault();
            if (_currentTask != null)
            {
                _currentTask.IsCurrent = true;
            }

            RefreshTaskListDisplay();
            UpdateCurrentTaskDisplay();
        }

        /// <summary>ドラッグ状態を初期化します。</summary>
        private void ResetDragState()
        {
            _dragStartPoint = null;
            _draggedTask = null;
        }

        /// <summary>ビジュアルツリーを遡って先祖要素を取得します。</summary>
        private static T FindAncestor<T>(DependencyObject current) where T : DependencyObject
        {
            while (current != null)
            {
                if (current is T match)
                {
                    return match;
                }
                current = VisualTreeHelper.GetParent(current);
            }
            return null;
        }

        /// <summary>ドラッグによるウィンドウ移動を実現します。</summary>
        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed)
            {
                DragMove();
            }
        }

        /// <summary>
        /// 看板ボード表示ボタンのクリックイベント。
        /// 看板ボードウィンドウを開いてタスク管理画面を表示します。
        /// </summary>
        private async void OpenKanbanButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                OpenKanbanButton.IsEnabled = false;

                // 現在のユーザー情報を取得
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
                await ReloadTasksAsync();

                OpenKanbanButton.IsEnabled = true;
            }
            catch (Exception ex)
            {
                Logger.Error($"看板ボードウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"看板ボードを開けません。\n{ex.Message}", "エラー");
                OpenKanbanButton.IsEnabled = true;
            }
        }

        /// <summary>AI分析チェックタイマー処理（5分ごと）。</summary>
        private void AiCheckTimer_Tick(object sender, EventArgs e)
        {
            try
            {
                SyncGitActivityEvents(DateTime.Now);
                CheckForNewAiAnalysis();
            }
            catch (Exception ex)
            {
                Logger.Error("AI分析チェック中にエラーが発生しました: " + ex.Message);
            }
        }

        /// <summary>新しいAI分析結果をチェックして通知を表示します。</summary>
        private void CheckForNewAiAnalysis()
        {
            try
            {
                var userId = App.CurrentUser?.UserId ?? 0;
                if (userId <= 0 || App.LocalDatabase == null)
                {
                    return;
                }

                // 最後のチェック以降の新しい分析結果を取得（個人データ）
                var recentSummaries = App.LocalDatabase.GetHourlyActivitySummaries(
                    userId,
                    _lastAiCheckTime,
                    DateTime.Now);

                _lastAiCheckTime = DateTime.Now;

                // 完了した分析結果で、重要な問題があるものを抽出
                var importantResults = recentSummaries
                    .Where(s => s.AiAnalysisStatus == "completed" && !string.IsNullOrEmpty(s.AiAnalysisResult))
                    .ToList();

                if (!importantResults.Any())
                {
                    return;
                }

                // 最新の分析結果を解析
                var latestSummary = importantResults.OrderByDescending(s => s.HourStart).First();
                var analysisResult = Newtonsoft.Json.JsonConvert.DeserializeObject<AIAnalysisResult>(latestSummary.AiAnalysisResult);

                if (analysisResult == null)
                {
                    return;
                }

                // スコアが低い場合、または問題が検出された場合に通知
                bool shouldNotify = false;
                string notificationMessage = "";

                if (analysisResult.ConcentrationScore < 50 || analysisResult.EfficiencyScore < 50)
                {
                    shouldNotify = true;
                    notificationMessage = "集中度または効率性が低下しています。";
                }
                else if (analysisResult.Issues != null && analysisResult.Issues.Any())
                {
                    shouldNotify = true;
                    var firstIssue = analysisResult.Issues.First();
                    notificationMessage = firstIssue.Length > 60 ? firstIssue.Substring(0, 60) + "..." : firstIssue;
                }
                else if (analysisResult.Recommendations != null && analysisResult.Recommendations.Any())
                {
                    shouldNotify = true;
                    var firstRec = analysisResult.Recommendations.First();
                    notificationMessage = firstRec.Length > 60 ? firstRec.Substring(0, 60) + "..." : firstRec;
                }

                if (shouldNotify)
                {
                    ShowAiNotification(notificationMessage);
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"AI分析結果のチェックに失敗しました: {ex.Message}");
            }
        }

        /// <summary>AI通知を表示します。</summary>
        private void ShowAiNotification(string message)
        {
            Dispatcher.Invoke(() =>
            {
                AiNotificationText.Text = message;
                AiNotificationBorder.Visibility = Visibility.Visible;
            });
        }

        /// <summary>通知を閉じるボタンのクリックイベント。</summary>
        private void CloseNotificationButton_Click(object sender, RoutedEventArgs e)
        {
            AiNotificationBorder.Visibility = Visibility.Collapsed;
        }

        /// <summary>詳細を見るボタンのクリックイベント。</summary>
        private void ViewDetailsButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var userId = App.CurrentUser?.UserId ?? 0;

                if (userId <= 0)
                {
                    Alert.Error("ユーザー情報が取得できません。", "エラー");
                    return;
                }

                if (App.LocalDatabase == null)
                {
                    Alert.Error("ローカルデータベースサービスが利用できません。", "エラー");
                    return;
                }

                // AI分析ウィンドウを開く
                var aiAnalysisWindow = new AiAnalysisWindow(userId)
                {
                    Owner = this
                };
                aiAnalysisWindow.Initialize(); // 初期化処理を明示的に呼び出す
                aiAnalysisWindow.ShowDialog();

                // 通知を閉じる
                AiNotificationBorder.Visibility = Visibility.Collapsed;
            }
            catch (Exception ex)
            {
                Logger.Error($"AI活動分析ウィンドウのオープンに失敗しました: {ex.Message}");
                Alert.Error($"AI活動分析画面を開けません。\n{ex.Message}", "エラー");
            }
        }
    }
}
