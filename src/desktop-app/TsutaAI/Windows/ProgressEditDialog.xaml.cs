using System.Windows;
using System.Windows.Input;

namespace TsutaAI.Windows
{
    /// <summary>
    /// 進捗率編集ダイアログのコードビハインドクラスです。
    /// スライダーを使用して進捗率（0～100）を選択できます。
    /// </summary>
    public partial class ProgressEditDialog : Window
    {
        /// <summary>
        /// 選択された進捗率（0～100）
        /// </summary>
        public int Progress { get; private set; } = 0;

        // === コンストラクタ ===

        /// <summary>
        /// コンストラクタ。初期進捗率を受け取ります。
        /// </summary>
        /// <param name="initialProgress">初期進捗率（0～100）</param>
        public ProgressEditDialog(int initialProgress = 0)
        {
            InitializeComponent();

            // スライダーの初期値を設定
            ProgressSlider.Value = initialProgress;
            Progress = initialProgress;

            // 進捗率表示を更新
            UpdateProgressDisplay();
        }

        private void HeaderBd_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                this.DragMove();
        }

        // === イベントハンドラ ===

        /// <summary>
        /// スライダーの値が変更されたときに呼ばれるイベントハンドラ
        /// </summary>
        private void ProgressSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            // スライダーの値を整数に変換
            Progress = (int)ProgressSlider.Value;

            // UI 表示を更新
            UpdateProgressDisplay();
        }

        /// <summary>
        /// OK ボタンが押されたときの処理
        /// </summary>
        private void OkButton_Click(object sender, RoutedEventArgs e)
        {
            // ダイアログ結果を OK に設定して閉じる
            DialogResult = true;
            Close();
        }

        /// <summary>
        /// キャンセルボタンが押されたときの処理
        /// </summary>
        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            // ダイアログ結果をキャンセルに設定して閉じる
            DialogResult = false;
            Close();
        }

        // === ユーティリティメソッド ===

        /// <summary>
        /// 進捗率表示を更新します。
        /// スライダーの値をテキストで表示します。
        /// </summary>
        private void UpdateProgressDisplay()
        {
            // 進捗率をテキストで表示
            ProgressValueText.Text = $"{Progress}%";
        }
    }
}
