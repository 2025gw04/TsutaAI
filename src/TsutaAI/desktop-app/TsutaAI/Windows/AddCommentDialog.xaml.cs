using System;
using System.Windows;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// コメント追加ダイアログ
    /// </summary>
    public partial class AddCommentDialog : Window
    {
        private const int MaxCommentLength = 500;
        private readonly KanbanCard _card;

        public string CommentContent { get; private set; }

        public AddCommentDialog(KanbanCard card)
        {
            InitializeComponent();

            _card = card;
            TaskNameText.Text = card.Title;

            // 文字数カウント更新
            CommentTextBox.TextChanged += (s, e) =>
            {
                var length = CommentTextBox.Text.Length;
                CharCountText.Text = $"{length} / {MaxCommentLength}文字";

                if (length > MaxCommentLength)
                {
                    CharCountText.Foreground = System.Windows.Media.Brushes.Red;
                }
                else
                {
                    CharCountText.Foreground = System.Windows.Media.Brushes.Gray;
                }

                SubmitButton.IsEnabled = length > 0 && length <= MaxCommentLength;
            };

            // 初期状態では追加ボタンを無効化
            SubmitButton.IsEnabled = false;

            // フォーカスをテキストボックスに
            Loaded += (s, e) => CommentTextBox.Focus();
        }

        private void SubmitButton_Click(object sender, RoutedEventArgs e)
        {
            var content = CommentTextBox.Text.Trim();

            if (string.IsNullOrWhiteSpace(content))
            {
                Alert.Warn("コメントを入力してください。", "入力エラー");
                return;
            }

            if (content.Length > MaxCommentLength)
            {
                Alert.Warn($"コメントは{MaxCommentLength}文字以内で入力してください。", "入力エラー");
                return;
            }

            CommentContent = content;
            DialogResult = true;
            Close();
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }
    }
}
