using System.Collections.Generic;
using System.Linq;
using System.Windows;
using TsutaAI.Services;

namespace TsutaAI.Windows
{
    /// <summary>
    /// タスク変更通知ダイアログ
    /// </summary>
    public partial class TaskChangeNotificationDialog : Window
    {
        private readonly List<TaskChangeInfo> _changes;

        public TaskChangeNotificationDialog(List<TaskChangeInfo> changes)
        {
            InitializeComponent();
            _changes = changes;

            // 変更情報を表示
            ChangesItemsControl.ItemsSource = _changes;

            // サブタイトルを更新
            if (_changes.Count == 1)
            {
                SubtitleTextBlock.Text = "1件のタスクが更新されました";
            }
            else
            {
                SubtitleTextBlock.Text = $"{_changes.Count}件のタスクが更新されました";
            }
        }

        /// <summary>
        /// 確認ボタンクリック
        /// </summary>
        private void ConfirmButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = true;
            Close();
        }

        /// <summary>
        /// 閉じるボタンクリック
        /// </summary>
        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }
    }
}
