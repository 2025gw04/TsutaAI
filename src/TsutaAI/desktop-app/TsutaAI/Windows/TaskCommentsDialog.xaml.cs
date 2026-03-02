using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// タスクコメント表示・追加ダイアログ
    /// </summary>
    public partial class TaskCommentsDialog : Window
    {
        private readonly KanbanCard _card;
        private List<TaskComment> _comments;

        public TaskCommentsDialog(KanbanCard card)
        {
            InitializeComponent();

            _card = card;
            TaskNameText.Text = card.Title;

            // コメント読み込み
            Loaded += async (s, e) => await LoadCommentsAsync();
        }

        /// <summary>
        /// コメント一覧を読み込みます
        /// </summary>
        private async Task LoadCommentsAsync()
        {
            try
            {
                LoadingText.Visibility = Visibility.Visible;
                NoCommentsText.Visibility = Visibility.Collapsed;
                CommentsList.Visibility = Visibility.Collapsed;

                Logger.Info($"タスクコメント読み込み開始: TaskID={_card.Id}");

                // プロジェクトタスクのみコメント機能をサポート
                if (_card.Type != TaskType.ProjectTask)
                {
                    LoadingText.Text = "個人タスクはコメント機能に対応していません";
                    AddCommentButton.IsEnabled = false;
                    return;
                }

                if (App.ApiService == null)
                {
                    LoadingText.Text = "APIサービスが利用できません。接続を確認してください。";
                    LoadingText.Foreground = System.Windows.Media.Brushes.Red;
                    AddCommentButton.IsEnabled = false;
                    return;
                }

                _comments = await App.ApiService.GetTaskCommentsAsync(_card.Id);

                LoadingText.Visibility = Visibility.Collapsed;

                if (_comments == null || _comments.Count == 0)
                {
                    NoCommentsText.Visibility = Visibility.Visible;
                    Logger.Info("コメントが見つかりませんでした");
                }
                else
                {
                    // 新しい順に並び替え
                    _comments = _comments.OrderByDescending(c => c.CreatedAt).ToList();

                    CommentsList.ItemsSource = _comments;
                    CommentsList.Visibility = Visibility.Visible;

                    Logger.Info($"コメント読み込み完了: {_comments.Count}件");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"コメント読み込みエラー: {ex.Message}");
                LoadingText.Text = $"コメント読み込みエラー: {ex.Message}";
                LoadingText.Foreground = System.Windows.Media.Brushes.Red;
            }
        }

        /// <summary>
        /// コメント追加ボタンクリック
        /// </summary>
        private async void AddCommentButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (App.ApiService == null)
                {
                    Alert.Error("APIサービスが利用できません。接続を確認してください。", "エラー");
                    return;
                }

                if (App.CurrentUser == null || App.CurrentUser.Id <= 0)
                {
                    Alert.Error("ユーザー情報が見つかりません。再ログインしてください。", "エラー");
                    return;
                }

                var dialog = new AddCommentDialog(_card)
                {
                    Owner = this
                };
                var result = dialog.ShowDialog();

                if (result == true && !string.IsNullOrWhiteSpace(dialog.CommentContent))
                {
                    AddCommentButton.IsEnabled = false;
                    Logger.Info($"コメント追加開始: TaskID={_card.Id}");

                    // コメント追加API呼び出し
                    var success = await App.ApiService.AddTaskCommentAsync(
                        _card.Id,
                        App.CurrentUser.Id,
                        dialog.CommentContent);

                    if (success)
                    {
                        Logger.Info("コメント追加成功");
                        Alert.Success("コメントを追加しました。", "成功");

                        // コメント一覧を再読み込み
                        await LoadCommentsAsync();
                    }
                    else
                    {
                        Logger.Error("コメント追加失敗");
                        Alert.Error("コメントの追加に失敗しました。", "エラー");
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"コメント追加エラー: {ex.Message}");
                Alert.Error($"コメント追加エラー: {ex.Message}", "エラー");
            }
            finally
            {
                AddCommentButton.IsEnabled = true;
            }
        }

        /// <summary>
        /// 閉じるボタンクリック
        /// </summary>
        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }
    }
}
