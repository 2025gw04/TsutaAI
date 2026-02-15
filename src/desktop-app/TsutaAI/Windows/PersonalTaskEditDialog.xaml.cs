using System;
using System.Windows;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// 個人タスク編集ダイアログのコードビハインドクラスです。
    /// 新規個人タスク作成時、または既存タスク編集時に使用されます。
    /// </summary>
    public partial class PersonalTaskEditDialog : Window
    {
        /// <summary>
        /// 編集対象のタスク（編集時）または新規タスク（作成時）
        /// </summary>
        public PersonalTask UpdatedTask { get; private set; }

        // === コンストラクタ ===

        /// <summary>
        /// コンストラクタ（新規タスク作成用）
        /// パラメータなしで呼び出すと、新規タスク作成モードで起動します
        /// </summary>
        public PersonalTaskEditDialog()
        {
            InitializeComponent();

            // 新規作成モードの初期化
            Title = "個人タスク作成";

            // ウィンドウロード完了イベント
            Loaded += (s, e) => InitializeForCreate();
        }

        /// <summary>
        /// コンストラクタ（既存タスク編集用）
        /// KanbanCard を受け取って編集モードで起動します
        /// </summary>
        public PersonalTaskEditDialog(KanbanCard existingCard)
        {
            InitializeComponent();

            // 編集モードの初期化
            Title = "個人タスク編集";

            // ウィンドウロード完了イベント
            Loaded += (s, e) => InitializeForEdit(existingCard);
        }

        // === 初期化処理 ===

        /// <summary>
        /// 新規作成モードの初期化処理
        /// </summary>
        private void InitializeForCreate()
        {
            // デフォルト値で UI を初期化
            TitleTextBox.Text = "";
            DescriptionTextBox.Text = "";
            PriorityMediumRadio.IsChecked = true;
            EstimatedMinutesTextBox.Text = "30";
            NotesTextBox.Text = "";
            StatusNotStartedRadio.IsChecked = true;

            // フォーカスをタイトル入力欄に設定
            TitleTextBox.Focus();
        }

        /// <summary>
        /// 編集モードの初期化処理
        /// 既存タスクの情報を UI に展開します
        /// </summary>
        private void InitializeForEdit(KanbanCard existingCard)
        {
            // 既存タスクの値を UI に展開
            TitleTextBox.Text = existingCard.Title;
            DescriptionTextBox.Text = existingCard.Description;
            EstimatedMinutesTextBox.Text = existingCard.EstimatedMinutes.ToString();
            NotesTextBox.Text = existingCard.Notes;

            // 優先度を設定
            switch (existingCard.Priority)
            {
                case "High":
                    PriorityHighRadio.IsChecked = true;
                    break;
                case "Low":
                    PriorityLowRadio.IsChecked = true;
                    break;
                default:
                    PriorityMediumRadio.IsChecked = true;
                    break;
            }

            // ステータスを設定
            switch (existingCard.Status)
            {
                case "in-progress":
                    StatusInProgressRadio.IsChecked = true;
                    break;
                case "done":
                    StatusDoneRadio.IsChecked = true;
                    break;
                default:
                    StatusNotStartedRadio.IsChecked = true;
                    break;
            }

            // フォーカスをタイトル入力欄に設定
            TitleTextBox.Focus();
            TitleTextBox.SelectAll();
        }

        // === イベントハンドラ ===

        /// <summary>
        /// 保存ボタンが押されたときの処理
        /// 入力値の検証と PersonalTask オブジェクトの生成
        /// </summary>
        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            // === 入力値の検証 ===
            if (string.IsNullOrWhiteSpace(TitleTextBox.Text))
            {
                Alert.Warn("タスクタイトルを入力してください。", "入力エラー");
                TitleTextBox.Focus();
                return;
            }

            // 見積時間の妥当性チェック
            if (!int.TryParse(EstimatedMinutesTextBox.Text, out var estimatedMinutes) || estimatedMinutes < 0)
            {
                Alert.Warn("見積時間は正の数値で入力してください。", "入力エラー");
                EstimatedMinutesTextBox.Focus();
                return;
            }

            // === PersonalTask オブジェクトの生成 ===
            UpdatedTask = new PersonalTask
            {
                Title = TitleTextBox.Text.Trim(),
                Description = DescriptionTextBox.Text.Trim(),
                Notes = NotesTextBox.Text.Trim(),
                Priority = GetSelectedPriority(),
                Status = GetSelectedStatus(),
                EstimatedMinutes = estimatedMinutes,
                Progress = GetStatusProgress()
            };

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
        /// 選択された優先度の値を取得します
        /// </summary>
        /// <returns>"High", "Medium", または "Low"</returns>
        private string GetSelectedPriority()
        {
            if (PriorityHighRadio.IsChecked == true)
                return "High";
            else if (PriorityLowRadio.IsChecked == true)
                return "Low";
            else
                return "Medium";
        }

        /// <summary>
        /// 選択されたステータスの値を取得します
        /// </summary>
        /// <returns>"not-started", "in-progress", または "done"</returns>
        private string GetSelectedStatus()
        {
            if (StatusInProgressRadio.IsChecked == true)
                return "in-progress";
            else if (StatusDoneRadio.IsChecked == true)
                return "done";
            else
                return "not-started";
        }

        /// <summary>
        /// 選択されたステータスに対応する進捗率を取得します
        /// </summary>
        /// <returns>
        /// "done" の場合は 100、"in-progress" の場合は 50、"not-started" の場合は 0
        /// </returns>
        private int GetStatusProgress()
        {
            var status = GetSelectedStatus();
            switch (status)
            {
                case "done":
                    return 100;
                case "in-progress":
                    return 50;
                default:
                    return 0;
            }
        }
    }
}
