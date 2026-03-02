using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Diagnostics;
using System.Threading.Tasks;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;
using System.Windows.Shapes;
using GongSolutions.Wpf.DragDrop;
using DragDrop = GongSolutions.Wpf.DragDrop.DragDrop;

namespace TsutaAI.Windows
{
    /// <summary>
    /// 看板ボード表示ウィンドウのコードビハインドクラスです。
    /// プロジェクトタスクと個人タスクを1つのボード上で管理し、
    /// ドラッグ&ドロップでステータス変更、進捗率編集、コメント追加などが可能です。
    /// </summary>
    public partial class KanbanBoardWindow : Window
    {
        // === フィールド（クラス変数） ===

        /// <summary>
        /// バックエンド API と通信するサービス
        /// </summary>
        private ApiService _apiService;

        /// <summary>
        /// 現在ログインしているユーザーの ID
        /// </summary>
        private int _currentUserId;

        /// <summary>
        /// 現在表示しているプロジェクトの ID
        /// </summary>
        private int _projectId;

        /// <summary>
        /// 看板ボード上に表示されるすべてのカラム（列）
        /// </summary>
        private List<KanbanColumn> _columns = new List<KanbanColumn>();

        /// <summary>
        /// 右クリックメニューで選択されたタスク
        /// </summary>
        private KanbanCard _selectedCard = null;

        /// <summary>
        /// ドラッグ中のタスクカード
        /// </summary>
        private UIElement _draggedElement = null;

        /// <summary>
        /// ドラッグ&ドロップハンドラー
        /// </summary>
        private KanbanDragHandler _dragHandler;

        // === コンストラクタ ===

        /// <summary>
        /// コンストラクタ。APIサービスとユーザーID、プロジェクトIDを受け取ります。
        /// </summary>
        public KanbanBoardWindow(ApiService apiService, int userId, int projectId, string projectName)
        {
            InitializeComponent();

            // フィールドの初期化
            _apiService = apiService;
            _currentUserId = userId;
            _projectId = projectId;
            ProjectNameText.Text = projectName;

            // ドラッグ&ドロップハンドラーの初期化
            _dragHandler = new KanbanDragHandler(this);

            // ウィンドウのロード完了イベントを登録
            Loaded += KanbanBoardWindow_Loaded;
        }

        // === 初期化処理 ===

        /// <summary>
        /// ウィンドウのロード完了時に呼ばれるイベントハンドラ
        /// カラム定義の初期化とデータの読み込みを行います
        /// </summary>
        private async void KanbanBoardWindow_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                // 看板ボードのカラム定義を初期化
                InitializeColumns();

                // API からタスクデータを読み込む
                await LoadTasksAsync();

                // UI にカラムを描画
                RenderColumns();

                // ステータスバーを更新
                UpdateStatusBar();
            }
            catch (Exception ex)
            {
                Logger.Error($"看板ボード初期化エラー: {ex.Message}");
                Alert.Error($"看板ボード初期化に失敗しました。\n{ex.Message}", "エラー");
                Close();
            }
        }

        /// <summary>
        /// 看板ボードのカラム定義を初期化します。
        /// 各カラムのタイトル、色、WIP制限などを設定します。
        /// </summary>
        private void InitializeColumns()
        {
            // 列1：未着手（Not Started）
            _columns.Add(new KanbanColumn
            {
                Id = "not-started",
                Title = "未着手",
                ColorCode = "#27824F",      // PrimaryColor (Green)
                IconCode = "🔵",
                WipLimit = null,            // 無制限
                Order = 0
            });

            // 列2：進行中（In Progress）
            _columns.Add(new KanbanColumn
            {
                Id = "in-progress",
                Title = "進行中",
                ColorCode = "#F39C12",      // WarningColor (Orange)
                IconCode = "🟡",
                WipLimit = 3,               // 3タスクまで
                Order = 1
            });

            // 列3：完了（Done）
            _columns.Add(new KanbanColumn
            {
                Id = "done",
                Title = "完了",
                ColorCode = "#27AE60",      // SuccessColor (Green)
                IconCode = "🟢",
                WipLimit = null,            // 無制限
                Order = 2
            });

            // 列4：保留（On Hold）
            _columns.Add(new KanbanColumn
            {
                Id = "on-hold",
                Title = "保留",
                ColorCode = "#E74C3C",      // ErrorColor (Red)
                IconCode = "🔴",
                WipLimit = null,            // 無制限
                Order = 3
            });
        }

        /// <summary>
        /// API からプロジェクトタスクと個人タスクを読み込みます。
        /// </summary>
        private async Task LoadTasksAsync()
        {
            try
            {
                StatusText.Text = "タスク読み込み中...";

                // API からプロジェクトタスク一覧を取得
                var projectTasks = await _apiService.GetTodayTasksAsync(_currentUserId);
                Logger.Info($"プロジェクトタスク取得: {projectTasks?.Count ?? 0}件");

                // API から個人タスク一覧を取得
                var personalTasks = await _apiService.GetPersonalTasksAsync(_currentUserId);
                Logger.Info($"個人タスク取得: {personalTasks?.Count ?? 0}件");

                // 各カラムをクリア
                foreach (var column in _columns)
                {
                    column.Cards.Clear();
                }

                int projectTaskCount = 0;
                int personalTaskCount = 0;

                // プロジェクトタスクをカラムに振り分け
                if (projectTasks != null && projectTasks.Count > 0)
                {
                    foreach (var task in projectTasks)
                    {
                        try
                        {
                            // KanbanCard に変換
                            var card = ConvertToKanbanCard(task, TaskType.ProjectTask);
                            Logger.Info($"プロジェクトタスク変換: ID={task.Id}, Title={task.Title}, Status={task.Status} → {card.Status}");

                            // ステータスに対応するカラムを検索
                            var column = _columns.FirstOrDefault(c => c.Id == card.Status);
                            if (column != null)
                            {
                                column.Cards.Add(card);
                                projectTaskCount++;
                                Logger.Info($"  → カラム '{column.Title}' に追加");
                            }
                            else
                            {
                                Logger.Warn($"タスク ID={task.Id} のステータス '{card.Status}' に対応するカラムが見つかりません");
                            }
                        }
                        catch (Exception ex)
                        {
                            Logger.Error($"プロジェクトタスク ID={task.Id} の変換エラー: {ex.Message}");
                        }
                    }
                }

                // 個人タスクをカラムに振り分け
                if (personalTasks != null && personalTasks.Count > 0)
                {
                    foreach (var task in personalTasks)
                    {
                        try
                        {
                            // KanbanCard に変換
                            var card = ConvertToKanbanCard(task, TaskType.PersonalTask);
                            Logger.Info($"個人タスク変換: ID={task.TaskId}, Title={task.Title}, Status={task.Status} → {card.Status}");

                            // ステータスに対応するカラムを検索
                            var column = _columns.FirstOrDefault(c => c.Id == card.Status);
                            if (column != null)
                            {
                                column.Cards.Add(card);
                                personalTaskCount++;
                                Logger.Info($"  → カラン '{column.Title}' に追加");
                            }
                            else
                            {
                                Logger.Warn($"タスク ID={task.TaskId} のステータス '{card.Status}' に対応するカラムが見つかりません");
                            }
                        }
                        catch (Exception ex)
                        {
                            Logger.Error($"個人タスク ID={task.TaskId} の変換エラー: {ex.Message}");
                        }
                    }
                }

                // 各カラムのタスク数をログに記録
                foreach (var column in _columns)
                {
                    Logger.Info($"カラム '{column.Title}': {column.Cards.Count}件");
                }

                StatusText.Text = $"✓ タスク読み込み完了 (プロジェクト: {projectTaskCount}件, 個人: {personalTaskCount}件)";
                Logger.Info($"看板ボード読み込み完了: プロジェクト={projectTaskCount}, 個人={personalTaskCount}");
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク読み込みエラー: {ex.Message}");
                Logger.Error($"スタックトレース: {ex.StackTrace}");
                StatusText.Text = "エラー: タスク読み込み失敗";
                throw;
            }
        }

        /// <summary>
        /// WebSocketからの通知によりタスクを再読み込みします
        /// </summary>
        public async void ReloadTasksFromWebSocket()
        {
            try
            {
                Logger.Info("WebSocket通知によりタスクを再読み込みします");
                await LoadTasksAsync();
                Logger.Info("WebSocket通知によるタスク再読み込み完了");
            }
            catch (Exception ex)
            {
                Logger.Error($"WebSocket通知によるタスク再読み込みエラー: {ex.Message}");
            }
        }

        /// <summary>
        /// TaskItem（プロジェクトタスク）を KanbanCard に変換します。
        /// </summary>
        private KanbanCard ConvertToKanbanCard(TaskItem task, TaskType type)
        {
            var status = NormalizeStatus(task.Status);

            return new KanbanCard
            {
                Id = task.Id,
                Type = type,
                Title = task.Title,
                Description = task.Description,
                Priority = task.Priority,
                Status = status,
                Progress = task.Progress,
                EstimatedMinutes = task.EstimatedMinutes,
                ActualMinutes = task.ActualMinutes,
                DueDate = task.PlannedEnd,
                WbsCode = $"WBS-{task.Id}"
            };
        }

        /// <summary>
        /// PersonalTask（個人タスク）を KanbanCard に変換します。
        /// </summary>
        private KanbanCard ConvertToKanbanCard(PersonalTask task, TaskType type)
        {
            var status = NormalizeStatus(task.Status);

            return new KanbanCard
            {
                Id = task.Id > 0 ? task.Id : task.TaskId,
                Type = type,
                Title = task.Title,
                Description = task.Description,
                Notes = task.Notes,
                Priority = task.Priority,
                Status = status,
                Progress = task.Progress,
                EstimatedMinutes = task.EstimatedMinutes,
                ActualMinutes = task.ActualMinutes
            };
        }

        /// <summary>
        /// ステータス値を正規化して、カラムIDと一致させます。
        /// backend-api形式（todo, in_progress, completed, cancelled）を
        /// desktop-app形式（not-started, in-progress, done, on-hold）に変換します。
        /// </summary>
        private string NormalizeStatus(string status)
        {
            // nullまたは空文字列の場合はデフォルト値を返す
            if (string.IsNullOrWhiteSpace(status))
            {
                return "not-started";
            }

            // 小文字に変換して正規化
            var normalized = status.Trim().ToLowerInvariant();

            // backend-api形式 → desktop-app形式の変換
            switch (normalized)
            {
                // backend-api: "todo" → desktop-app: "not-started"
                case "todo":
                    return "not-started";

                // backend-api: "in_progress" → desktop-app: "in-progress"
                case "in_progress":
                case "in-progress":
                    return "in-progress";

                // backend-api: "completed" → desktop-app: "done"
                case "completed":
                case "done":
                    return "done";

                // backend-api: "cancelled" → desktop-app: "on-hold"
                case "cancelled":
                case "on-hold":
                case "on_hold":
                    return "on-hold";

                // 既にdesktop-app形式の場合
                case "not-started":
                    return "not-started";

                default:
                    // 未知のステータスの場合、ログに記録してデフォルト値を返す
                    Logger.Warn($"未知のステータス値: '{status}' をデフォルト値 'not-started' に変換しました");
                    return "not-started";
            }
        }

        /// <summary>
        /// desktop-app形式のステータスをbackend-api形式に変換します。
        /// </summary>
        private string ConvertStatusToApiFormat(string status)
        {
            if (string.IsNullOrWhiteSpace(status))
            {
                return "todo";
            }

            var normalized = status.Trim().ToLowerInvariant();
            switch (normalized)
            {
                case "not-started":
                    return "todo";
                case "in-progress":
                    return "in_progress"; // Fixed: backend uses underscore
                case "done":
                    return "completed";
                case "on-hold":
                    return "cancelled";
                default:
                    return normalized;
            }
        }

        /// <summary>
        /// 看板ボードを画面にレンダリングします。
        /// 各カラムとタスクカードを WPF コントロールとして生成します。
        /// </summary>
        private void RenderColumns()
        {
            // 既存の内容をクリア
            KanbanBoardPanel.Children.Clear();

            // カラムの順序でループ
            foreach (var column in _columns.OrderBy(c => c.Order))
            {
                // カラムの UI を生成
                var columnUI = CreateColumnUI(column);

                // パネルに追加
                KanbanBoardPanel.Children.Add(columnUI);
            }
        }

        /// <summary>
        /// 単一のカラムの UI を生成します。
        /// </summary>
        private Border CreateColumnUI(KanbanColumn column)
        {
            // カラムコンテナ（モダンなデザイン）
            var columnBorder = new Border
            {
                Background = (Brush)Application.Current.Resources["WindowBackgroundBrush"],
                CornerRadius = new CornerRadius(12),
                Margin = new Thickness(0, 0, 16, 0),
                MinWidth = 320,
                MaxWidth = 320,
                Effect = new System.Windows.Media.Effects.DropShadowEffect
                {
                    Color = Colors.Black,
                    Opacity = 0.06,
                    BlurRadius = 3,
                    ShadowDepth = 1,
                    Direction = 270
                }
            };

            // 縦方向レイアウト
            var columnContent = new StackPanel
            {
                Orientation = Orientation.Vertical
            };

            // ヘッダー（列タイトル）
            var headerBorder = new Border
            {
                Padding = new Thickness(20, 16, 20, 16),
                BorderBrush = (Brush)Application.Current.Resources["BorderBrush"],
                BorderThickness = new Thickness(0, 0, 0, 1)
            };

            var headerGrid = new Grid();
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            // 左側：タイトルとインジケーター
            var titleStack = new StackPanel { Orientation = Orientation.Horizontal };

            // カラーインジケーター（丸い点）
            var indicator = new System.Windows.Shapes.Ellipse
            {
                Width = 8,
                Height = 8,
                Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(column.ColorCode)),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            titleStack.Children.Add(indicator);

            // タイトル
            var titleText = new TextBlock
            {
                Text = column.Title,
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = (Brush)Application.Current.Resources["TextBrush"],
                VerticalAlignment = VerticalAlignment.Center
            };
            titleStack.Children.Add(titleText);

            Grid.SetColumn(titleStack, 0);
            headerGrid.Children.Add(titleStack);

            // 右側：タスク数
            var countBadge = new Border
            {
                Background = (Brush)Application.Current.Resources["BackgroundBrush"],
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(8, 2, 8, 2),
                VerticalAlignment = VerticalAlignment.Center
            };

            var countText = new TextBlock
            {
                Text = column.TaskCount.ToString(),
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Foreground = (Brush)Application.Current.Resources["TextLightBrush"]
            };
            countBadge.Child = countText;

            Grid.SetColumn(countBadge, 1);
            headerGrid.Children.Add(countBadge);

            headerBorder.Child = headerGrid;
            columnContent.Children.Add(headerBorder);

            // タスクリスト用のスクロールビューア
            var scrollViewer = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Padding = new Thickness(12, 12, 12, 12),
                MinHeight = 400,  // ドロップ領域を確保するための最小高さ
                Tag = column.Id   // カラムIDをタグに保存（ドロップ&ドロップ用）
            };

            // ドロップターゲットとしてScrollViewerにも設定
            DragDrop.SetIsDropTarget(scrollViewer, true);
            DragDrop.SetDropHandler(scrollViewer, _dragHandler);

            // タスクを格納するItemsControl（ドラッグ&ドロップ対応）
            var tasksControl = new ItemsControl
            {
                Tag = column.Id,  // カラムIDをタグに保存（ドラッグ&ドロップ用）
                MinHeight = 380   // タスクがない場合でもドロップ領域を確保
            };

            // ItemsPanelをStackPanelに設定
            var itemsPanelTemplate = new ItemsPanelTemplate();
            var stackPanelFactory = new FrameworkElementFactory(typeof(StackPanel));
            stackPanelFactory.SetValue(StackPanel.OrientationProperty, Orientation.Vertical);
            itemsPanelTemplate.VisualTree = stackPanelFactory;
            tasksControl.ItemsPanel = itemsPanelTemplate;

            // ItemsSourceにカードのリストを設定
            tasksControl.ItemsSource = column.Cards;

            // DataTemplateを動的に生成してカードUIを作成
            var dataTemplate = new DataTemplate();
            dataTemplate.VisualTree = CreateCardTemplate();
            tasksControl.ItemTemplate = dataTemplate;

            // ドラッグ&ドロップ機能を有効化
            DragDrop.SetIsDragSource(tasksControl, true);
            DragDrop.SetIsDropTarget(tasksControl, true);
            DragDrop.SetDropHandler(tasksControl, _dragHandler);
            DragDrop.SetDragHandler(tasksControl, _dragHandler);

            scrollViewer.Content = tasksControl;
            columnContent.Children.Add(scrollViewer);

            columnBorder.Child = columnContent;

            return columnBorder;
        }

        /// <summary>
        /// カードUIのDataTemplateを作成します。
        /// </summary>
        private FrameworkElementFactory CreateCardTemplate()
        {
            // Borderファクトリー（カードコンテナ - モダンデザイン）
            var borderFactory = new FrameworkElementFactory(typeof(Border));
            borderFactory.SetValue(Border.BackgroundProperty, (Brush)Application.Current.Resources["WindowBackgroundBrush"]);
            borderFactory.SetValue(Border.BorderThicknessProperty, new Thickness(1));
            borderFactory.SetValue(Border.BorderBrushProperty, (Brush)Application.Current.Resources["BorderBrush"]);
            borderFactory.SetValue(Border.CornerRadiusProperty, new CornerRadius(8));
            borderFactory.SetValue(Border.PaddingProperty, new Thickness(14));
            borderFactory.SetValue(Border.MarginProperty, new Thickness(0, 0, 0, 10));
            borderFactory.SetValue(Border.CursorProperty, Cursors.Hand);

            // 左側のボーダー色をタイプ別に設定
            // BorderColorのバインディングは削除し、通常のボーダーを使用

            // カードコンテンツ用のStackPanel
            var contentFactory = new FrameworkElementFactory(typeof(StackPanel));
            contentFactory.SetValue(StackPanel.OrientationProperty, Orientation.Vertical);

            // タイトル
            var titleFactory = new FrameworkElementFactory(typeof(TextBlock));
            titleFactory.SetBinding(TextBlock.TextProperty, new System.Windows.Data.Binding("Title"));
            titleFactory.SetValue(TextBlock.FontWeightProperty, FontWeights.SemiBold);
            titleFactory.SetValue(TextBlock.FontSizeProperty, 14.0);
            titleFactory.SetValue(TextBlock.TextWrappingProperty, TextWrapping.Wrap);
            titleFactory.SetValue(TextBlock.ForegroundProperty, (Brush)Application.Current.Resources["TextBrush"]);
            titleFactory.SetValue(TextBlock.MarginProperty, new Thickness(0, 0, 0, 10));
            contentFactory.AppendChild(titleFactory);

            // WBSコード
            var wbsFactory = new FrameworkElementFactory(typeof(TextBlock));
            wbsFactory.SetBinding(TextBlock.TextProperty, new System.Windows.Data.Binding("WbsCode"));
            wbsFactory.SetValue(TextBlock.FontSizeProperty, 10.0);
            wbsFactory.SetValue(TextBlock.ForegroundProperty, (Brush)Application.Current.Resources["TextLightBrush"]);
            wbsFactory.SetValue(TextBlock.MarginProperty, new Thickness(0, 0, 0, 4));
            contentFactory.AppendChild(wbsFactory);

            // 見積工数
            var estimatedFactory = new FrameworkElementFactory(typeof(TextBlock));
            var estimatedBinding = new System.Windows.Data.Binding("EstimatedMinutes");
            estimatedBinding.StringFormat = "📊 見積: {0}分";
            estimatedFactory.SetBinding(TextBlock.TextProperty, estimatedBinding);
            estimatedFactory.SetValue(TextBlock.FontSizeProperty, 11.0);
            estimatedFactory.SetValue(TextBlock.ForegroundProperty, (Brush)Application.Current.Resources["TextLightBrush"]);
            estimatedFactory.SetValue(TextBlock.MarginProperty, new Thickness(0, 0, 0, 4));
            contentFactory.AppendChild(estimatedFactory);

            // 進捗率
            var progressFactory = new FrameworkElementFactory(typeof(TextBlock));
            progressFactory.SetValue(TextBlock.FontSizeProperty, 11.0);
            progressFactory.SetValue(TextBlock.ForegroundProperty, (Brush)Application.Current.Resources["TextLightBrush"]);
            progressFactory.SetValue(TextBlock.MarginProperty, new Thickness(0, 0, 0, 4));

            var multiBinding = new System.Windows.Data.MultiBinding();
            multiBinding.StringFormat = "⏱️ 経過: {0}分 ({1}%)";
            multiBinding.Bindings.Add(new System.Windows.Data.Binding("ActualMinutes"));
            multiBinding.Bindings.Add(new System.Windows.Data.Binding("Progress"));
            progressFactory.SetBinding(TextBlock.TextProperty, multiBinding);
            contentFactory.AppendChild(progressFactory);

            // 進捗バー
            var progressBarFactory = new FrameworkElementFactory(typeof(ProgressBar));
            progressBarFactory.SetBinding(ProgressBar.ValueProperty, new System.Windows.Data.Binding("Progress"));
            progressBarFactory.SetValue(ProgressBar.MaximumProperty, 100.0);
            progressBarFactory.SetValue(ProgressBar.HeightProperty, 6.0);
            progressBarFactory.SetValue(ProgressBar.BackgroundProperty, (Brush)Application.Current.Resources["BackgroundBrush"]);
            progressBarFactory.SetValue(ProgressBar.ForegroundProperty, (Brush)Application.Current.Resources["PrimaryBrush"]);
            progressBarFactory.SetValue(ProgressBar.MarginProperty, new Thickness(0, 4, 0, 0));
            contentFactory.AppendChild(progressBarFactory);

            borderFactory.AppendChild(contentFactory);

            // イベントハンドラーの登録
            borderFactory.AddHandler(Border.MouseLeftButtonDownEvent, new MouseButtonEventHandler(Card_MouseLeftButtonDown));
            borderFactory.AddHandler(Border.MouseRightButtonDownEvent, new MouseButtonEventHandler(Card_MouseRightButtonDown));

            return borderFactory;
        }

        /// <summary>
        /// カードの左クリックイベントハンドラー
        /// </summary>
        private void Card_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is Border border && border.DataContext is KanbanCard card)
            {
                // ダブルクリック判定
                if (e.ClickCount == 2)
                {
                    if (card.IsEditable)
                    {
                        ShowEditTaskDialog(card);
                    }
                    else
                    {
                        ShowProgressEditDialog(card);
                    }
                    e.Handled = true;
                }
                else
                {
                    _selectedCard = card;
                    e.Handled = true;
                }
            }
        }

        /// <summary>
        /// カードの右クリックイベントハンドラー
        /// </summary>
        private void Card_MouseRightButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (sender is Border border && border.DataContext is KanbanCard card)
            {
                _selectedCard = card;
                ShowContextMenu(card);
                e.Handled = true;
            }
        }

        /// <summary>
        /// 単一のタスクカードの UI を生成します。
        /// </summary>
        private Border CreateCardUI(KanbanCard card)
        {
            // カードコンテナ
            var cardBorder = new Border
            {
                Background = (Brush)Application.Current.Resources["WindowBackgroundBrush"],
                BorderBrush = new SolidColorBrush(HexToColor(card.BorderColor)),
                BorderThickness = new Thickness(3, 0, 0, 0),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(12),
                Margin = new Thickness(0, 0, 0, 10),
                Cursor = Cursors.Hand,
                DataContext = card  // ドラッグ&ドロップ用にカードデータを設定
            };

            // カードコンテンツ
            var cardContent = new StackPanel
            {
                Orientation = Orientation.Vertical
            };

            // === タイトル行 ===
            var titleRow = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 0, 0, 8)
            };

            // タイプアイコン
            var typeIcon = new TextBlock
            {
                Text = card.TypeIcon + " ",
                FontSize = 14,
                VerticalAlignment = VerticalAlignment.Center
            };

            // 優先度カラーバー
            var priorityBar = new Rectangle
            {
                Width = 8,
                Height = 16,
                Fill = new SolidColorBrush(HexToColor(card.PriorityColor)),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center
            };

            // タイトル
            var titleText = new TextBlock
            {
                Text = card.Title,
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = (Brush)Application.Current.Resources["TextBrush"],
                TextWrapping = TextWrapping.Wrap,
                VerticalAlignment = VerticalAlignment.Center
            };

            // ロック/編集アイコン
            var editIcon = new TextBlock
            {
                Text = card.IsEditable ? "✏️" : "🔒",
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(8, 0, 0, 0)
            };

            titleRow.Children.Add(typeIcon);
            titleRow.Children.Add(priorityBar);
            titleRow.Children.Add(titleText);
            titleRow.Children.Add(editIcon);

            cardContent.Children.Add(titleRow);

            // === WBSコード（プロジェクトタスクのみ） ===
            if (!string.IsNullOrEmpty(card.WbsCode))
            {
                var wbsText = new TextBlock
                {
                    Text = card.WbsCode,
                    FontSize = 10,
                    Foreground = (Brush)Application.Current.Resources["TextLightBrush"],
                    Margin = new Thickness(0, 0, 0, 8)
                };
                cardContent.Children.Add(wbsText);
            }

            // === 見積工数 ===
            var estimatedText = new TextBlock
            {
                Text = $"📊 見積: {card.EstimatedMinutes}分",
                FontSize = 11,
                Foreground = (Brush)Application.Current.Resources["TextLightBrush"],
                Margin = new Thickness(0, 0, 0, 4)
            };
            cardContent.Children.Add(estimatedText);

            // === 進捗率 ===
            var progressRow = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 0, 0, 4)
            };

            var progressLabel = new TextBlock
            {
                Text = $"⏱️ 経過: {card.ActualMinutes}分 ({card.Progress}%)",
                FontSize = 11,
                Foreground = (Brush)Application.Current.Resources["TextLightBrush"],
                VerticalAlignment = VerticalAlignment.Center
            };

            progressRow.Children.Add(progressLabel);
            cardContent.Children.Add(progressRow);

            // === 進捗バー ===
            var progressBar = new ProgressBar
            {
                Value = card.Progress,
                Maximum = 100,
                Height = 8,
                Foreground = new SolidColorBrush(HexToColor(card.PriorityColor)),
                Background = (Brush)Application.Current.Resources["BackgroundBrush"],
                Margin = new Thickness(0, 0, 0, 8)
            };
            cardContent.Children.Add(progressBar);

            // === 期限（プロジェクトタスクのみ） ===
            if (card.DueDate.HasValue)
            {
                var dueText = new TextBlock
                {
                    Text = $"📅 期限: {card.DueDate:yyyy-MM-dd HH:mm}",
                    FontSize = 10,
                    Foreground = (Brush)Application.Current.Resources["TextLightBrush"],
                    Margin = new Thickness(0, 0, 0, 4)
                };
                cardContent.Children.Add(dueText);
            }

            // === コメント数（プロジェクトタスクのみ） ===
            if (card.Type == TaskType.ProjectTask && card.CommentCount > 0)
            {
                var commentText = new TextBlock
                {
                    Text = $"💬 コメント: {card.CommentCount}件",
                    FontSize = 10,
                    Foreground = (Brush)Application.Current.Resources["TextLightBrush"]
                };
                cardContent.Children.Add(commentText);
            }

            cardBorder.Child = cardContent;

            // === イベントハンドラ登録 ===
            cardBorder.MouseLeftButtonDown += (sender, e) =>
            {
                // ダブルクリック判定（ClickCount == 2）
                if (e.ClickCount == 2)
                {
                    // ダブルクリック：進捗率編集ダイアログを表示
                    if (card.IsEditable)
                    {
                        ShowEditTaskDialog(card);
                    }
                    else
                    {
                        ShowProgressEditDialog(card);
                    }
                    e.Handled = true;
                }
                else
                {
                    // シングルクリック：ドラッグ準備とカード選択
                    _draggedElement = cardBorder;
                    _selectedCard = card;
                    e.Handled = true;
                }
            };

            cardBorder.MouseRightButtonDown += (sender, e) =>
            {
                _selectedCard = card;
                ShowContextMenu(card);
                e.Handled = true;
            };

            return cardBorder;
        }

        /// <summary>
        /// 右クリックメニューを表示します。
        /// </summary>
        private void ShowContextMenu(KanbanCard card)
        {
            var contextMenu = new ContextMenu();

            // === ステータス変更メニュー ===
            var statusMenu = new MenuItem { Header = "✅ ステータス変更" };
            foreach (var column in _columns)
            {
                var statusItem = new MenuItem { Header = column.Title };
                statusItem.Click += async (sender, e) =>
                {
                    await ChangeTaskStatusAsync(card, column.Id);
                };
                statusMenu.Items.Add(statusItem);
            }
            contextMenu.Items.Add(statusMenu);

            // === 進捗率変更 ===
            var progressItem = new MenuItem { Header = "📊 進捗率を変更..." };
            progressItem.Click += (sender, e) =>
            {
                ShowProgressEditDialog(card);
            };
            contextMenu.Items.Add(progressItem);

            // === 個人タスク固有のメニュー ===
            if (card.IsEditable)
            {
                contextMenu.Items.Add(new Separator());

                var editItem = new MenuItem { Header = "✏️ タスクを編集..." };
                editItem.Click += (sender, e) =>
                {
                    ShowEditTaskDialog(card);
                };
                contextMenu.Items.Add(editItem);

                var deleteItem = new MenuItem { Header = "🗑️ タスクを削除" };
                deleteItem.Click += async (sender, e) =>
                {
                    await DeletePersonalTaskAsync(card);
                };
                contextMenu.Items.Add(deleteItem);
            }

            // === プロジェクトタスク固有のメニュー ===
            if (card.Type == TaskType.ProjectTask)
            {
                contextMenu.Items.Add(new Separator());

                var commentItem = new MenuItem { Header = "💬 コメントを追加..." };
                commentItem.Click += (sender, e) =>
                {
                    ShowAddCommentDialog(card);
                };
                contextMenu.Items.Add(commentItem);

                var detailsItem = new MenuItem { Header = "📋 詳細を表示" };
                detailsItem.Click += (sender, e) =>
                {
                    ShowTaskDetails(card);
                };
                contextMenu.Items.Add(detailsItem);
            }

            // メニューを表示
            contextMenu.IsOpen = true;
        }

        /// <summary>
        /// タスクのステータスを変更します。
        /// </summary>
        public async Task ChangeTaskStatusAsync(KanbanCard card, string newStatus)
        {
            try
            {
                StatusText.Text = "ステータス更新中...";

                if (card.Type == TaskType.ProjectTask)
                {
                    // desktop-app形式のステータスをbackend-api形式に変換
                    string apiStatus = ConvertStatusToApiFormat(newStatus);
                    Logger.Info($"ステータス変更: desktop-app形式 '{newStatus}' → backend-api形式 '{apiStatus}'");

                    // プロジェクトタスク：API で更新
                    await _apiService.UpdateTaskStatusAsync(card.Id, apiStatus, card.Progress);
                }
                else
                {
                    var personalTaskStatus = NormalizeStatus(newStatus);
                    Logger.Info($"個人タスクステータス変更: '{newStatus}' → '{personalTaskStatus}'");

                    // 個人タスク：API で更新
                    await _apiService.UpdatePersonalTaskAsync(card.Id, new { status = personalTaskStatus });
                }

                // データを再読み込み
                await LoadTasksAsync();
                RenderColumns();
                UpdateStatusBar();
            }
            catch (Exception ex)
            {
                Logger.Error($"ステータス更新エラー: {ex.Message}");
                Alert.Error($"ステータス更新に失敗しました。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// 進捗率編集ダイアログを表示します。
        /// </summary>
        private void ShowProgressEditDialog(KanbanCard card)
        {
            var dialog = new ProgressEditDialog(card.Progress)
            {
                Owner = this
            };
            if (dialog.ShowDialog() == true)
            {
                UpdateTaskProgressAsync(card, dialog.Progress);
            }
        }

        /// <summary>
        /// 個人タスク編集ダイアログを表示します。
        /// </summary>
        private void ShowEditTaskDialog(KanbanCard card)
        {
            var dialog = new PersonalTaskEditDialog(card)
            {
                Owner = this
            };
            if (dialog.ShowDialog() == true)
            {
                // 編集内容を API に送信
                UpdatePersonalTaskAsync(card, dialog.UpdatedTask);
            }
        }

        /// <summary>
        /// タスク進捗率を更新します。
        /// </summary>
        private async void UpdateTaskProgressAsync(KanbanCard card, int newProgress)
        {
            try
            {
                StatusText.Text = "進捗率更新中...";

                if (card.Type == TaskType.ProjectTask)
                {
                    // desktop-app形式のステータスをbackend-api形式に変換
                    string apiStatus = ConvertStatusToApiFormat(card.Status);

                    // プロジェクトタスク：API で更新
                    await _apiService.UpdateTaskStatusAsync(card.Id, apiStatus, newProgress);
                }
                else
                {
                    // 個人タスク：API で更新
                    await _apiService.UpdatePersonalTaskAsync(card.Id, new { progress = newProgress });
                }

                // データを再読み込み
                await LoadTasksAsync();
                RenderColumns();
                UpdateStatusBar();
            }
            catch (Exception ex)
            {
                Logger.Error($"進捗率更新エラー: {ex.Message}");
                Alert.Error($"進捗率更新に失敗しました。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// 個人タスクを更新します。
        /// </summary>
        private async void UpdatePersonalTaskAsync(KanbanCard card, PersonalTask updatedTask)
        {
            try
            {
                StatusText.Text = "タスク更新中...";

                await _apiService.UpdatePersonalTaskAsync(card.Id, updatedTask);

                // データを再読み込み
                await LoadTasksAsync();
                RenderColumns();
                UpdateStatusBar();
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク更新エラー: {ex.Message}");
                Alert.Error($"タスク更新に失敗しました。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// 個人タスクを削除します。
        /// </summary>
        private async Task DeletePersonalTaskAsync(KanbanCard card)
        {
            if (!Alert.Confirm(
                $"'{card.Title}' を削除してもよろしいですか？\nこの操作は取り消せません。",
                "削除確認"))
                return;

            try
            {
                StatusText.Text = "タスク削除中...";

                await _apiService.DeletePersonalTaskAsync(card.Id);

                // データを再読み込み
                await LoadTasksAsync();
                RenderColumns();
                UpdateStatusBar();

                Alert.Success("タスクを削除しました。", "成功");
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク削除エラー: {ex.Message}");
                Alert.Error($"タスク削除に失敗しました。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// コメント追加ダイアログを表示します。
        /// </summary>
        private void ShowAddCommentDialog(KanbanCard card)
        {
            try
            {
                // プロジェクトタスクのみコメント機能をサポート
                if (card.Type != TaskType.ProjectTask)
                {
                    Alert.Info(
                        "個人タスクはコメント機能に対応していません。\nプロジェクトタスクのみコメントを追加できます。",
                        "情報");
                    return;
                }

                Logger.Info($"コメントダイアログを表示: TaskID={card.Id}, Title={card.Title}");

                var dialog = new TaskCommentsDialog(card);
                dialog.Owner = this;
                dialog.ShowDialog();
            }
            catch (Exception ex)
            {
                Logger.Error($"コメントダイアログ表示エラー: {ex.Message}");
                Alert.Error(
                    $"コメント機能でエラーが発生しました。\n{ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// タスク詳細を表示します。
        /// </summary>
        private void ShowTaskDetails(KanbanCard card)
        {
            var details = $"タスク: {card.Title}\n"
                + $"ステータス: {card.Status}\n"
                + $"進捗率: {card.Progress}%\n"
                + $"見積: {card.EstimatedMinutes}分\n"
                + $"優先度: {card.Priority}";

            Alert.Info(details, "タスク詳細");
        }

        /// <summary>
        /// ステータスバーを更新します。
        /// </summary>
        private void UpdateStatusBar()
        {
            var totalTasks = _columns.Sum(c => c.TaskCount);
            var completedTasks = _columns.FirstOrDefault(c => c.Id == "done")?.TaskCount ?? 0;

            StatusText.Text = $"✓ {totalTasks}件中 {completedTasks}件完了";
        }

        // === ボタンイベントハンドラ ===

        /// <summary>
        /// フィルターボタンが押されたときの処理
        /// </summary>
        private void FilterButton_Click(object sender, RoutedEventArgs e)
        {
            Alert.Info("フィルター機能は現在実装中です。", "情報");
        }

        /// <summary>
        /// 個人タスク追加ボタンが押されたときの処理
        /// </summary>
        private void AddPersonalTaskButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new PersonalTaskEditDialog
            {
                Owner = this
            };
            if (dialog.ShowDialog() == true)
            {
                CreatePersonalTaskAsync(dialog.UpdatedTask);
            }
        }

        /// <summary>
        /// 新しい個人タスクを作成します。
        /// </summary>
        private async void CreatePersonalTaskAsync(PersonalTask newTask)
        {
            try
            {
                StatusText.Text = "タスク作成中...";

                newTask.UserId = _currentUserId;
                await _apiService.CreatePersonalTaskAsync(newTask);

                // データを再読み込み
                await LoadTasksAsync();
                RenderColumns();
                UpdateStatusBar();

                Alert.Success("タスクを作成しました。", "成功");
            }
            catch (Exception ex)
            {
                Logger.Error($"タスク作成エラー: {ex.Message}");
                Alert.Error($"タスク作成に失敗しました。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// 閉じるボタンが押されたときの処理
        /// </summary>
        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        /// <summary>
        /// ダッシュボードに戻るボタンが押されたときの処理
        /// </summary>
        private void BackToDashboard_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        /// <summary>
        /// Web管理画面を開くボタンが押されたときの処理
        /// </summary>
        private void OpenWebAdmin_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Web管理画面を既定のブラウザで開く
                Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Logger.Error($"Web管理画面オープンエラー: {ex.Message}");
                Alert.Error("Web管理画面を開けません。ブラウザが起動できません。", "エラー");
            }
        }

        /// <summary>
        /// ウィンドウクローズ時の処理
        /// </summary>
        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            // クリーンアップ処理（必要に応じて）
            Logger.Info("看板ボードウィンドウを閉じました");
        }

        // === ユーティリティメソッド ===

        /// <summary>
        /// 16進数カラーコードを WPF Color に変換します。
        /// 例: "#3B82F6" → Color.FromArgb(255, 59, 130, 246)
        /// </summary>
        private Color HexToColor(string hex)
        {
            try
            {
                hex = hex.TrimStart('#');
                if (hex.Length == 6)
                {
                    return Color.FromArgb(
                        255,
                        Convert.ToByte(hex.Substring(0, 2), 16),
                        Convert.ToByte(hex.Substring(2, 2), 16),
                        Convert.ToByte(hex.Substring(4, 2), 16));
                }
            }
            catch { }

            return Colors.Gray;
        }
    }

    /// <summary>
    /// 看板ボードのドラッグ&ドロップハンドラー
    /// gong-wpf-dragdrop ライブラリを使用してカードのドラッグ&ドロップを処理します。
    /// </summary>
    public class KanbanDragHandler : IDropTarget, IDragSource
    {
        private KanbanBoardWindow _window;

        public KanbanDragHandler(KanbanBoardWindow window)
        {
            _window = window;
        }

        // === IDragSource インターフェイスの実装 ===

        /// <summary>
        /// ドラッグが開始される前に呼ばれます。
        /// ドラッグを開始してよいかどうかを判定します。
        /// </summary>
        public void StartDrag(IDragInfo dragInfo)
        {
            // ドラッグされるカードを取得
            // 動的に生成されたUIの場合、VisualSourceからDataContextを取得
            var card = dragInfo.SourceItem as KanbanCard;
            if (card == null && dragInfo.VisualSource is FrameworkElement element)
            {
                card = element.DataContext as KanbanCard;
            }

            if (card != null)
            {
                dragInfo.Data = card;
                dragInfo.Effects = System.Windows.DragDropEffects.Move;
            }
        }

        /// <summary>
        /// ドラッグが進行中かどうかを判定します。
        /// </summary>
        public bool CanStartDrag(IDragInfo dragInfo)
        {
            // カードのみドラッグ可能
            var card = dragInfo.SourceItem as KanbanCard;
            if (card == null && dragInfo.VisualSource is FrameworkElement element)
            {
                card = element.DataContext as KanbanCard;
            }
            return card != null;
        }

        /// <summary>
        /// ドラッグが完了したときに呼ばれます。
        /// </summary>
        public void Dropped(IDropInfo dropInfo)
        {
            // ドロップ処理は IDropTarget 側で処理
        }

        /// <summary>
        /// ドラッグ操作がキャンセルされたときに呼ばれます。
        /// </summary>
        public void DragCancelled()
        {
            // 何もしない
        }

        /// <summary>
        /// ドラッグ時に表示するビジュアルを返します（省略可）
        /// </summary>
        public bool TryCatchOccurredException(Exception exception)
        {
            Logger.Error($"ドラッグ操作エラー: {exception.Message}");
            return true;
        }

        // === IDropTarget インターフェイスの実装 ===

        /// <summary>
        /// ドロップが可能かどうかを判定します。
        /// </summary>
        public void DragOver(IDropInfo dropInfo)
        {
            var card = dropInfo.Data as KanbanCard;

            // ItemsControlまたはScrollViewerを探す
            DependencyObject targetElement = dropInfo.VisualTarget;
            string targetColumnId = null;

            while (targetElement != null)
            {
                // ItemsControlまたはScrollViewerでカラムIDを持つものを探す
                if ((targetElement is ItemsControl || targetElement is ScrollViewer) &&
                    targetElement is FrameworkElement fe && fe.Tag is string columnId)
                {
                    targetColumnId = columnId;
                    break;
                }
                targetElement = VisualTreeHelper.GetParent(targetElement);
            }

            if (card != null && targetColumnId != null)
            {
                // ドロップ可能
                dropInfo.Effects = System.Windows.DragDropEffects.Move;
                dropInfo.DropTargetAdorner = DropTargetAdorners.Highlight;
            }
            else
            {
                // ドロップ不可
                dropInfo.Effects = System.Windows.DragDropEffects.None;
            }
        }

        /// <summary>
        /// ドロップが実行されたときに呼ばれます。
        /// タスクのステータスを新しいカラムに変更します。
        /// </summary>
        public async void Drop(IDropInfo dropInfo)
        {
            try
            {
                var card = dropInfo.Data as KanbanCard;
                if (card == null)
                {
                    Logger.Warn("ドロップされたデータがKanbanCardではありません");
                    return;
                }

                // ドロップ先のカラムIDを取得
                string targetColumnId = null;

                // ItemsControlまたはScrollViewerを探す
                DependencyObject targetElement = dropInfo.VisualTarget;
                while (targetElement != null)
                {
                    // ItemsControlまたはScrollViewerでカラムIDを持つものを探す
                    if ((targetElement is ItemsControl || targetElement is ScrollViewer) &&
                        targetElement is FrameworkElement fe && fe.Tag is string columnId)
                    {
                        targetColumnId = columnId;
                        break;
                    }
                    targetElement = VisualTreeHelper.GetParent(targetElement);
                }

                if (targetColumnId == null)
                {
                    Logger.Warn("ドロップ先のカラムが見つかりませんでした");
                    return;
                }

                if (targetColumnId == card.Status)
                {
                    // 同じカラムにドロップした場合は何もしない
                    Logger.Info($"同じカラムへのドロップ: '{card.Title}' は既に '{targetColumnId}' にあります");
                    return;
                }

                Logger.Info($"ドロップ: タスク '{card.Title}' を '{card.Status}' から '{targetColumnId}' に移動");

                // ステータスを変更
                await _window.ChangeTaskStatusAsync(card, targetColumnId);
            }
            catch (Exception ex)
            {
                Logger.Error($"ドロップ処理エラー: {ex.Message}");
                Logger.Error($"スタックトレース: {ex.StackTrace}");
                Alert.Error($"タスクの移動に失敗しました。\n{ex.Message}", "エラー");
            }
        }

        public void DropHint(IDropHintInfo dropHintInfo)
        {
            //throw new NotImplementedException();
        }

        public void DragEnter(IDropInfo dropInfo)
        {
            //throw new NotImplementedException();
        }

        public void DragLeave(IDropInfo dropInfo)
        {
            //throw new NotImplementedException();
        }

        public void DragDropOperationFinished(DragDropEffects operationResult, IDragInfo dragInfo)
        {
            //throw new NotImplementedException();
        }
    }

    /// <summary>
    /// 16進数カラーコードをSolidColorBrushに変換するコンバーター
    /// </summary>
    public class HexToColorConverter : System.Windows.Data.IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            if (value is string hex)
            {
                try
                {
                    hex = hex.TrimStart('#');
                    if (hex.Length == 6)
                    {
                        var color = Color.FromArgb(
                            255,
                            System.Convert.ToByte(hex.Substring(0, 2), 16),
                            System.Convert.ToByte(hex.Substring(2, 2), 16),
                            System.Convert.ToByte(hex.Substring(4, 2), 16));
                        return new SolidColorBrush(color);
                    }
                }
                catch { }
            }
            return new SolidColorBrush(Colors.Gray);
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
