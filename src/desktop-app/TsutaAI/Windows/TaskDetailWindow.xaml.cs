using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// タスク詳細画面のコードビハインドです。
    /// </summary>
    public partial class TaskDetailWindow : Window
    {
        private readonly TaskItem _task;
        private MonitoringService _monitoringService;
        private DateTime _workStartTime;
        private List<TaskComment> _comments = new List<TaskComment>();
        private List<TaskAttachment> _attachments = new List<TaskAttachment>();
        private List<TaskActivity> _activities = new List<TaskActivity>();

        public TaskDetailWindow(TaskItem task)
        {
            _task = task ?? throw new ArgumentNullException(nameof(task));
            InitializeComponent();
            Loaded += async (s, e) => await InitializeAsync();
        }

        /// <summary>
        /// ウィンドウの初期化処理
        /// </summary>
        private async Task InitializeAsync()
        {
            PopulateTaskInfo();
            await LoadCollaborationDataAsync();
        }

        /// <summary>
        /// タスク基本情報を表示
        /// </summary>
        private void PopulateTaskInfo()
        {
            TaskTitleText.Text = _task.Title;
            ProjectNameText.Text = _task.ProjectName;

            if (_task.PlannedStart.HasValue && _task.PlannedEnd.HasValue)
            {
                TimeLabel.Text = $"予定: {_task.PlannedStart.Value:HH:mm} - {_task.PlannedEnd.Value:HH:mm}";
            }
            else
            {
                TimeLabel.Text = "予定: 未設定";
            }

            var priority = string.IsNullOrWhiteSpace(_task.Priority) ? "未設定" : _task.Priority;
            PriorityLabel.Text = $"優先度: {priority}";

            var status = string.IsNullOrWhiteSpace(_task.Status) ? "未設定" : TranslateStatus(_task.Status);
            StatusLabel.Text = $"ステータス: {status}";

            // 担当者情報（TaskItemモデルには担当者名がないため、IDのみ表示）
            AssigneeLabel.Text = _task.AssigneeUserId > 0 ? $"担当者ID: {_task.AssigneeUserId}" : "担当者: 未設定";

            ProgressLabel.Text = $"進捗: {ClampProgress(_task.Progress)}%";
            DescriptionText.Text = string.IsNullOrWhiteSpace(_task.Description) ? "詳細は登録されていません。" : _task.Description;
        }

        /// <summary>
        /// ステータスを日本語に変換
        /// </summary>
        private string TranslateStatus(string status)
        {
            switch (status?.ToLower())
            {
                case "not-started":
                    return "未着手";
                case "in-progress":
                    return "進行中";
                case "done":
                case "completed":
                    return "完了";
                case "on-hold":
                    return "保留";
                default:
                    return status;
            }
        }

        /// <summary>
        /// コラボレーションデータ（コメント、添付ファイル、履歴）を読み込む
        /// </summary>
        private async Task LoadCollaborationDataAsync()
        {
            try
            {
                // 並列で全データを取得
                var commentsTask = App.ApiService.GetTaskCommentsAsync(_task.TaskId);
                var attachmentsTask = App.ApiService.GetTaskAttachmentsAsync(_task.TaskId);
                var activityTask = App.ApiService.GetTaskActivityAsync(_task.TaskId);

                await Task.WhenAll(commentsTask, attachmentsTask, activityTask);

                _comments = await commentsTask ?? new List<TaskComment>();
                _attachments = await attachmentsTask ?? new List<TaskAttachment>();
                _activities = await activityTask ?? new List<TaskActivity>();

                // UI更新
                Dispatcher.Invoke(() =>
                {
                    CommentsListBox.ItemsSource = _comments;
                    AttachmentsListBox.ItemsSource = _attachments;
                    ActivityListBox.ItemsSource = _activities;

                    // タブヘッダーにカウント表示
                    CommentTabHeader.Text = $"コメント ({_comments.Count})";
                    AttachmentTabHeader.Text = $"添付ファイル ({_attachments.Count})";
                });
            }
            catch (Exception ex)
            {
                Logger.Warn($"コラボレーションデータの読み込みに失敗しました: {ex.Message}");
            }
        }

        /// <summary>
        /// コメント追加イベントハンドラ
        /// </summary>
        private async void OnAddComment(object sender, RoutedEventArgs e)
        {
            var content = CommentInputBox.Text?.Trim();
            if (string.IsNullOrEmpty(content))
            {
                Alert.Warn("コメント内容を入力してください。", "入力エラー");
                return;
            }

            try
            {
                var userId = App.CurrentUser?.UserId ?? 0;
                if (userId == 0)
                {
                    Alert.Error("ユーザー情報を取得できませんでした。", "エラー");
                    return;
                }

                var success = await App.ApiService.AddTaskCommentAsync(_task.TaskId, userId, content);
                if (success)
                {
                    CommentInputBox.Clear();
                    await LoadCollaborationDataAsync();
                    //MessageBox.Show("コメントを追加しました。", "成功", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"コメント追加に失敗しました: {ex.Message}");
                Alert.Error($"コメントの追加に失敗しました。\n{ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// ファイルアップロードイベントハンドラ
        /// </summary>
        private async void OnUploadAttachment(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog
            {
                Title = "ファイルを選択",
                Filter = "すべてのファイル (*.*)|*.*",
                Multiselect = false
            };

            if (dialog.ShowDialog() == true)
            {
                try
                {
                    var filePath = dialog.FileName;
                    var fileInfo = new System.IO.FileInfo(filePath);

                    // ファイルサイズチェック (10MB制限)
                    if (fileInfo.Length > 10 * 1024 * 1024)
                    {
                        Alert.Warn("ファイルサイズは10MB以下にしてください。", "エラー");
                        return;
                    }

                    var attachment = await App.ApiService.UploadTaskAttachmentAsync(_task.TaskId, filePath);
                    if (attachment != null)
                    {
                        await LoadCollaborationDataAsync();
                        Alert.Success("ファイルをアップロードしました。", "成功");
                    }
                }
                catch (Exception ex)
                {
                    Logger.Error($"ファイルアップロードに失敗しました: {ex.Message}");
                    Alert.Error($"ファイルのアップロードに失敗しました。\n{ex.Message}", "エラー");
                }
            }
        }

        /// <summary>
        /// ファイルダウンロードイベントハンドラ
        /// </summary>
        private async void OnDownloadAttachment(object sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is int attachmentId)
            {
                var attachment = _attachments.FirstOrDefault(a => a.Id == attachmentId);
                if (attachment == null)
                {
                    Alert.Error("添付ファイル情報が見つかりません。", "エラー");
                    return;
                }

                var dialog = new SaveFileDialog
                {
                    Title = "ファイルを保存",
                    FileName = attachment.FileName,
                    Filter = $"{attachment.FileExtension}ファイル (*.{attachment.FileExtension})|*.{attachment.FileExtension}|すべてのファイル (*.*)|*.*"
                };

                if (dialog.ShowDialog() == true)
                {
                    try
                    {
                        await App.ApiService.DownloadTaskAttachmentAsync(_task.TaskId, attachmentId, dialog.FileName);
                        Alert.Success("ファイルをダウンロードしました。", "成功");
                    }
                    catch (Exception ex)
                    {
                        Logger.Error($"ファイルダウンロードに失敗しました: {ex.Message}");
                        Alert.Error($"ファイルのダウンロードに失敗しました。\n{ex.Message}", "エラー");
                    }
                }
            }
        }

        /// <summary>
        /// タスク開始イベントハンドラ
        /// </summary>
        private void OnStart(object sender, RoutedEventArgs e)
        {
            _workStartTime = DateTime.Now;
            _monitoringService?.Dispose();
            _monitoringService = new MonitoringService(span =>
            {
                Dispatcher.Invoke(() =>
                {
                    ProgressLabel.Text = $"進捗: {ClampProgress(_task.Progress)}% / 経過 {span:hh\\:mm\\:ss}";
                });
            });
            _monitoringService.Start();
        }

        /// <summary>
        /// タスク一時停止イベントハンドラ
        /// </summary>
        private async void OnPause(object sender, RoutedEventArgs e)
        {
            if (_monitoringService == null)
            {
                return;
            }

            TimeSpan duration = _monitoringService.Stop();
            await SendWorkLogAsync(duration, false);
            Alert.Info($"作業時間 {duration:hh\\:mm\\:ss} を記録しました。", "情報");
        }

        /// <summary>
        /// タスク完了イベントハンドラ
        /// </summary>
        private async void OnComplete(object sender, RoutedEventArgs e)
        {
            TimeSpan duration = TimeSpan.Zero;
            if (_monitoringService != null)
            {
                duration = _monitoringService.Stop();
            }

            _task.IsCompleted = true;
            _task.Progress = 100;
            await SendWorkLogAsync(duration, true);
            Alert.Success("タスクを完了として記録しました。", "完了");
            Close();
        }

        /// <summary>
        /// 作業ログをサーバーに送信
        /// </summary>
        private async Task SendWorkLogAsync(TimeSpan duration, bool isComplete)
        {
            try
            {
                var log = new WorkLog
                {
                    TaskId = _task.TaskId,
                    UserId = App.CurrentUser?.UserId ?? 0,
                    StartedAt = _workStartTime,
                    EndedAt = _workStartTime + duration,
                    DurationMinutes = (int)Math.Max(0, Math.Round(duration.TotalMinutes)),
                    Note = isComplete ? "完了" : "一時停止"
                };

                await App.ApiService.SendWorkLogAsync(log);
            }
            catch (Exception ex)
            {
                Logger.Warn($"作業ログ送信に失敗しました: {ex.Message}");
            }
        }

        /// <summary>
        /// ウィンドウを閉じるイベントハンドラ
        /// </summary>
        private void OnClose(object sender, RoutedEventArgs e)
        {
            Close();
        }

        /// <summary>
        /// ウィンドウクローズ時の後処理
        /// </summary>
        protected override void OnClosed(EventArgs e)
        {
            base.OnClosed(e);
            _monitoringService?.Dispose();
        }

        /// <summary>
        /// 進捗値を0-100の範囲にクランプ
        /// </summary>
        private static int ClampProgress(int value)
        {
            if (value < 0) return 0;
            if (value > 100) return 100;
            return value;
        }

        private void HeaderBd_MouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            try
            {
                if (e.ChangedButton == System.Windows.Input.MouseButton.Left)
                {
                    DragMove();
                }
            }
            catch (Exception)
            {
            }
        }
    }
}
