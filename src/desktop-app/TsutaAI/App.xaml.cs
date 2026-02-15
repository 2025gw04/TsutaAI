using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Forms;
using TsutaAI.Config;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;
using TsutaAI.Windows;
using Application = System.Windows.Application;

namespace TsutaAI
{
    /// <summary>
    /// アプリケーションのエントリーポイントです。
    /// </summary>
    public partial class App : Application
    {
        public static ApiService ApiService { get; private set; }
        public static LocalDatabaseService LocalDatabase => LocalDatabaseService.Instance;
        public static WebSocketService WebSocketService { get; private set; }
        public static User CurrentUser { get; private set; }

        /// <summary>
        /// システムトレイアイコン
        /// </summary>
        private static NotifyIcon _notifyIcon;

        /// <summary>
        /// 現在のWidget Windowのインスタンス（作業中の場合）
        /// </summary>
        public static WidgetWindow CurrentWidgetWindow { get; set; }

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            DispatcherUnhandledException += OnDispatcherUnhandledException;
            AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;

            try
            {
                InitializeCoreServices();
                InitializeSystemTray();

                var window = new LoginWindow();
                window.Show();
            }
            catch (Exception ex)
            {
                var errorMessage = $"アプリケーションの起動に失敗しました。ログファイルを確認してください。\nエラー: {ex.Message}";
                Logger.Error(errorMessage);
                System.Windows.MessageBox.Show(errorMessage, "起動エラー", MessageBoxButton.OK, MessageBoxImage.Error);
                Shutdown(-1);
            }
        }

        protected override void OnExit(ExitEventArgs e)
        {
            base.OnExit(e);
            _notifyIcon?.Dispose();

            // WebSocket切断
            if (WebSocketService != null)
            {
                Logger.Info("WebSocketServiceを切断します。");
                try
                {
                    WebSocketService.DisconnectAsync().Wait();
                }
                catch (Exception ex)
                {
                    Logger.Error($"WebSocket切断エラー: {ex.Message}");
                }
                WebSocketService.Dispose();
            }

            // LocalDatabaseService のDispose
            try
            {
                LocalDatabaseService.Instance?.Dispose();
                Logger.Info("LocalDatabaseServiceをDisposeしました。");
            }
            catch (Exception ex)
            {
                Logger.Error($"LocalDatabaseService Disposeエラー: {ex.Message}");
            }

            Logger.Info("アプリケーションを終了します。");
        }

        /// <summary>
        /// システムトレイアイコンを初期化します。
        /// </summary>
        private void InitializeSystemTray()
        {
            _notifyIcon = new NotifyIcon
            {
                Visible = false, // 初期は非表示
                Text = "TsutaAI - 作業管理アプリ"
            };

            // アイコンを設定（既定のアプリケーションアイコンを使用）
            try
            {
                _notifyIcon.Icon = new System.Drawing.Icon(System.Windows.Application.GetResourceStream(
                    new Uri("pack://application:,,,/TsutaAI;component/Resources/app.ico")).Stream);
            }
            catch
            {
                // アイコンファイルが存在しない場合は既定のアイコンを使用
                _notifyIcon.Icon = System.Drawing.SystemIcons.Application;
            }

            // ダブルクリックイベント
            _notifyIcon.DoubleClick += (s, e) =>
            {
                ShowMainWindow();
            };

            // コンテキストメニュー
            var contextMenu = new ContextMenuStrip();

            var mainWindowItem = new ToolStripMenuItem("メインウィンドウを開く");
            mainWindowItem.Click += (s, e) => ShowMainWindow();
            contextMenu.Items.Add(mainWindowItem);

            var settingsItem = new ToolStripMenuItem("設定");
            settingsItem.Click += (s, e) => ShowSettings();
            contextMenu.Items.Add(settingsItem);

            contextMenu.Items.Add(new ToolStripSeparator());

            var exitItem = new ToolStripMenuItem("終了");
            exitItem.Click += (s, e) => ExitApplication();
            contextMenu.Items.Add(exitItem);

            _notifyIcon.ContextMenuStrip = contextMenu;

            Logger.Info("システムトレイアイコンを初期化しました。");
        }

        /// <summary>
        /// システムトレイアイコンを表示します。
        /// </summary>
        public static void ShowSystemTrayIcon()
        {
            if (_notifyIcon != null)
            {
                _notifyIcon.Visible = true;
            }
        }

        /// <summary>
        /// システムトレイアイコンを非表示にします。
        /// </summary>
        public static void HideSystemTrayIcon()
        {
            if (_notifyIcon != null)
            {
                _notifyIcon.Visible = false;
            }
        }

        /// <summary>
        /// システムトレイから通知を表示します。
        /// </summary>
        public static void ShowNotification(string title, string message, ToolTipIcon icon = ToolTipIcon.Info)
        {
            if (_notifyIcon != null && _notifyIcon.Visible)
            {
                _notifyIcon.ShowBalloonTip(3000, title, message, icon);

                if (ConfigService.Current?.NotifySound ?? true)
                {
                    PlayNotificationSound();
                }
            }
        }

        /// <summary>
        /// 通知音を再生します。
        /// </summary>
        private static void PlayNotificationSound()
        {
            try
            {
                System.Media.SystemSounds.Asterisk.Play();
            }
            catch (Exception ex)
            {
                Logger.Error($"通知音再生エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// メインウィンドウを表示します（作業中ならWidgetWindow、それ以外はDashboardWindow）。
        /// </summary>
        private void ShowMainWindow()
        {
            // 作業中（WidgetWindowが存在する場合）はWidgetWindowを表示
            if (CurrentWidgetWindow != null)
            {
                try
                {
                    if (CurrentWidgetWindow.IsVisible)
                    {
                        CurrentWidgetWindow.Activate();
                    }
                    else
                    {
                        CurrentWidgetWindow.Show();
                        CurrentWidgetWindow.Activate();
                    }
                    Logger.Info("WidgetWindowを表示しました。");
                    return;
                }
                catch
                {
                    // WidgetWindowが閉じられている場合
                    CurrentWidgetWindow = null;
                }
            }

            // 作業中でない場合はDashboardWindowを表示
            var dashboard = new DashboardWindow();
            dashboard.Show();
            dashboard.Activate();
            Logger.Info("DashboardWindowを表示しました。");
        }

        /// <summary>
        /// ダッシュボードを表示します。
        /// </summary>
        private void ShowDashboard()
        {
            var dashboard = new DashboardWindow();
            dashboard.Show();
            dashboard.Activate();
        }

        /// <summary>
        /// 設定画面を表示します。
        /// </summary>
        private void ShowSettings()
        {
            var settings = new SettingsWindow();
            settings.ShowDialog();
        }

        /// <summary>
        /// アプリケーションを終了します。
        /// </summary>
        private void ExitApplication()
        {
            var result = System.Windows.MessageBox.Show(
                "TsutaAIを終了しますか？",
                "確認",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result == MessageBoxResult.Yes)
            {
                Logger.Info("ユーザーがアプリケーションを終了しました。");
                Shutdown();
            }
        }

        private void InitializeCoreServices()
        {
            ConfigService.Initialize();
            ApplyLoggerSetting();
            Logger.Info("中核サービスの初期化を開始します。");

            ApplicationSetting settings = ConfigService.Current;
            ApiService = new ApiService(settings.API, settings.Proxy);

            // WebSocketService初期化（ログイン後に接続）
            WebSocketService = new WebSocketService(settings.API.BaseUrl);
            SetupWebSocketEventHandlers();
            Logger.Info("WebSocketService 初期化完了");

            Logger.Info("すべてのサービスが初期化されました。");
        }

        private void ApplyLoggerSetting()
        {
            string logLevel = ConfigService.Current.App.LogLevel;
            if (Enum.TryParse(logLevel, true, out Logger.LogLevel parsedLevel))
            {
                Logger.CurrentLevel = parsedLevel;
                Logger.Info($"ログレベルを '{parsedLevel}' に設定しました。");
            }
            else
            {
                Logger.Warn($"ログレベル '{logLevel}' は無効です。既定の 'Info' を使用します。");
            }
        }

        public static void SetCurrentUser(User user)
        {
            CurrentUser = user;
        }

        /// <summary>
        /// ログイン成功後にWebSocketに接続します
        /// </summary>
        public static async void ConnectWebSocketAsync()
        {
            if (WebSocketService != null && CurrentUser != null)
            {
                try
                {
                    await WebSocketService.ConnectAsync(CurrentUser.Token);
                    Logger.Info("WebSocket接続が確立されました");
                }
                catch (Exception ex)
                {
                    Logger.Error($"WebSocket接続エラー: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// WebSocketイベントハンドラーを設定します
        /// </summary>
        private void SetupWebSocketEventHandlers()
        {
            if (WebSocketService == null) return;

            // タスク更新イベント
            WebSocketService.TaskUpdated += (sender, e) =>
            {
                Dispatcher.Invoke(() =>
                {
                    Logger.Info($"タスク更新通知受信: TaskID={e.TaskId}");

                    // 看板ボードウィンドウが開いている場合は再読み込み
                    foreach (Window window in Current.Windows)
                    {
                        if (window is KanbanBoardWindow kanbanWindow)
                        {
                            kanbanWindow.ReloadTasksFromWebSocket();
                        }
                    }
                });
            };

            // プロジェクト更新イベント
            WebSocketService.ProjectUpdated += (sender, e) =>
            {
                Dispatcher.Invoke(() =>
                {
                    Logger.Info($"プロジェクト更新通知受信: ProjectID={e.ProjectId}");
                    // 必要に応じてプロジェクト一覧を再読み込み
                });
            };

            // 作業ログ作成イベント
            WebSocketService.WorkLogCreated += (sender, e) =>
            {
                Dispatcher.Invoke(() =>
                {
                    Logger.Info($"作業ログ作成通知受信: UserID={e.UserId}");
                });
            };

            // AIアラートイベント
            WebSocketService.AiAlertReceived += (sender, e) =>
            {
                Dispatcher.Invoke(() =>
                {
                    Logger.Info($"AIアラート受信: ProjectID={e.ProjectId}");
                    // 通知を表示（設定が有効な場合のみ）
                    if (ConfigService.Current?.NotifyAiAlert ?? true)
                    {
                        ShowNotification("AIアラート", "新しいAIアラートがあります", ToolTipIcon.Warning);
                    }
                });
            };

            // 接続イベント
            WebSocketService.Connected += (sender, e) =>
            {
                Logger.Info("WebSocket接続確立");
            };

            // 切断イベント
            WebSocketService.Disconnected += (sender, e) =>
            {
                Logger.Warn("WebSocket切断");
            };

            // エラーイベント
            WebSocketService.ErrorOccurred += (sender, errorMessage) =>
            {
                Logger.Error($"WebSocketエラー: {errorMessage}");
            };
        }

        public static void ClearCurrentUser()
        {
            if (CurrentUser != null)
            {
                Logger.Info($"ユーザーがログアウトしました: {CurrentUser.FullName}");
            }

            // APIサービスのトークン情報をクリア
            ApiService?.Logout();

            // WebSocket切断
            if (WebSocketService != null && WebSocketService.IsConnected)
            {
                 Task.Run(async () => await WebSocketService.DisconnectAsync());
            }

            CurrentUser = null;
        }

        private void OnDispatcherUnhandledException(object sender, System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
        {
            try
            {
                ErrorHandler.LogDetailedError(e.Exception, "UIスレッドでキャッチされていない例外");

                // 致命的でないエラーの場合は続行を試みる
                if (!IsCriticalError(e.Exception))
                {
                    ErrorHandler.HandleException(e.Exception, "UIスレッドでエラーが発生しました", showMessageBox: true);
                    e.Handled = true;
                }
                else
                {
                    // 致命的なエラーの場合はアプリケーションを終了
                    ErrorHandler.ShowErrorMessage(
                        "致命的なエラーが発生しました。アプリケーションを終了します。\n詳細はログファイルを確認してください。",
                        "致命的エラー");
                    Shutdown(-1);
                }
            }
            catch (Exception handlerEx)
            {
                // エラーハンドラ自体がエラーを起こした場合
                Logger.Error($"エラーハンドラでエラーが発生: {handlerEx.Message}");
                System.Windows.MessageBox.Show("予期しないエラーが発生しました。", "エラー", MessageBoxButton.OK, MessageBoxImage.Error);
                e.Handled = true;
            }
        }

        private void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            if (e.ExceptionObject is Exception ex)
            {
                try
                {
                    ErrorHandler.LogDetailedError(ex, "バックグラウンドでキャッチされていない例外");
                    ErrorHandler.ShowErrorMessage(
                        "致命的なエラーが発生しました。アプリケーションを終了します。\n詳細はログファイルを確認してください。",
                        "致命的エラー");
                }
                catch (Exception handlerEx)
                {
                    Logger.Error($"エラーハンドラでエラーが発生: {handlerEx.Message}");
                }
                finally
                {
                    Shutdown(-1);
                }
            }
        }

        /// <summary>
        /// 例外が致命的かどうかを判定します。
        /// </summary>
        /// <param name="ex">例外</param>
        /// <returns>致命的な場合true</returns>
        private bool IsCriticalError(Exception ex)
        {
            return ex is OutOfMemoryException ||
                   ex is StackOverflowException ||
                   ex is System.Threading.ThreadAbortException ||
                   (ex is System.Data.SQLite.SQLiteException sqliteEx && sqliteEx.Message.Contains("database is locked"));
        }
    }
}
