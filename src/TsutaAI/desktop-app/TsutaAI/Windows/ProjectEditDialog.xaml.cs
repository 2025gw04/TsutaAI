using System;
using System.Windows;
using System.Windows.Controls;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// プロジェクト編集ダイアログ
    /// </summary>
    public partial class ProjectEditDialog : Window
    {
        private readonly Project _project;
        private readonly bool _isEditMode;

        /// <summary>
        /// コンストラクタ
        /// </summary>
        /// <param name="project">編集するプロジェクト（新規作成の場合はnull）</param>
        public ProjectEditDialog(Project project)
        {
            InitializeComponent();

            _project = project;
            _isEditMode = project != null;

            // タイトル設定
            Title = _isEditMode ? "プロジェクト編集" : "新規プロジェクト作成";

            // 編集モードの場合は既存データを設定
            if (_isEditMode)
            {
                LoadProjectData();
            }
            else
            {
                // 新規作成モードの場合はデフォルト値を設定
                StatusComboBox.SelectedIndex = 0; // planning
                StartDatePicker.SelectedDate = DateTime.Today;
                EndDatePicker.SelectedDate = DateTime.Today.AddMonths(1);
            }

            // フォーカスを設定
            ProjectNameTextBox.Focus();
        }

        /// <summary>
        /// プロジェクトデータをフォームに読み込む
        /// </summary>
        private void LoadProjectData()
        {
            try
            {
                ProjectNameTextBox.Text = _project.Name;
                DescriptionTextBox.Text = _project.Description ?? string.Empty;
                StartDatePicker.SelectedDate = _project.StartDate;
                EndDatePicker.SelectedDate = _project.EndDate;

                // ステータスを設定
                switch (_project.Status)
                {
                    case "planning":
                        StatusComboBox.SelectedIndex = 0;
                        break;
                    case "active":
                        StatusComboBox.SelectedIndex = 1;
                        break;
                    case "completed":
                        StatusComboBox.SelectedIndex = 2;
                        break;
                    case "cancelled":
                        StatusComboBox.SelectedIndex = 3;
                        break;
                    default:
                        StatusComboBox.SelectedIndex = 0;
                        break;
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクトデータ読み込みエラー: {ex.Message}");
                Alert.Error(
                    $"プロジェクトデータの読み込みに失敗しました。\n{ex.Message}",
                    "エラー");
            }
        }

        /// <summary>
        /// 保存ボタンクリック
        /// </summary>
        private async void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // 入力検証
                if (!ValidateInput())
                {
                    return;
                }

                if (App.ApiService == null)
                {
                    Alert.Error(
                        "APIサービスが利用できません。接続を確認してください。",
                        "エラー");
                    return;
                }

                // ボタンを無効化
                SaveButton.IsEnabled = false;

                // プロジェクトオブジェクトを作成/更新
                var projectData = new Project
                {
                    Name = ProjectNameTextBox.Text.Trim(),
                    Description = string.IsNullOrWhiteSpace(DescriptionTextBox.Text)
                        ? null
                        : DescriptionTextBox.Text.Trim(),
                    StartDate = StartDatePicker.SelectedDate.Value,
                    EndDate = EndDatePicker.SelectedDate.Value,
                    Status = GetSelectedStatus(),
                    CreatedBy = App.CurrentUser?.Id
                };

                bool success;
                if (_isEditMode)
                {
                    // 更新
                    Logger.Info($"プロジェクト更新開始: ID={_project.Id}, Name={projectData.Name}");
                    success = await App.ApiService.UpdateProjectAsync(_project.Id, projectData);
                }
                else
                {
                    // 新規作成
                    Logger.Info($"プロジェクト作成開始: Name={projectData.Name}");
                    var createdProject = await App.ApiService.CreateProjectAsync(projectData);
                    success = createdProject != null;
                }

                if (success)
                {
                    Logger.Info(_isEditMode ? "プロジェクト更新成功" : "プロジェクト作成成功");
                    Alert.Success(
                        _isEditMode ? "プロジェクトを更新しました。" : "プロジェクトを作成しました。",
                        "成功");

                    DialogResult = true;
                    Close();
                }
                else
                {
                    Logger.Error(_isEditMode ? "プロジェクト更新失敗" : "プロジェクト作成失敗");
                    Alert.Error(
                        _isEditMode ? "プロジェクトの更新に失敗しました。" : "プロジェクトの作成に失敗しました。",
                        "エラー");

                    SaveButton.IsEnabled = true;
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト保存エラー: {ex.Message}");
                Alert.Error(
                    $"エラーが発生しました。\n{ex.Message}",
                    "エラー");

                SaveButton.IsEnabled = true;
            }
        }

        /// <summary>
        /// キャンセルボタンクリック
        /// </summary>
        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        /// <summary>
        /// 入力検証
        /// </summary>
        private bool ValidateInput()
        {
            // プロジェクト名
            if (string.IsNullOrWhiteSpace(ProjectNameTextBox.Text))
            {
                Alert.Warn(
                    "プロジェクト名を入力してください。",
                    "入力エラー");
                ProjectNameTextBox.Focus();
                return false;
            }

            // 開始日
            if (!StartDatePicker.SelectedDate.HasValue)
            {
                Alert.Warn(
                    "開始日を選択してください。",
                    "入力エラー");
                StartDatePicker.Focus();
                return false;
            }

            // 終了日
            if (!EndDatePicker.SelectedDate.HasValue)
            {
                Alert.Warn(
                    "終了日を選択してください。",
                    "入力エラー");
                EndDatePicker.Focus();
                return false;
            }

            // 日付の妥当性チェック
            if (StartDatePicker.SelectedDate.Value > EndDatePicker.SelectedDate.Value)
            {
                Alert.Warn(
                    "終了日は開始日より後の日付を選択してください。",
                    "入力エラー");
                EndDatePicker.Focus();
                return false;
            }

            // ステータス
            if (StatusComboBox.SelectedIndex < 0)
            {
                Alert.Warn(
                    "ステータスを選択してください。",
                    "入力エラー");
                StatusComboBox.Focus();
                return false;
            }

            return true;
        }

        /// <summary>
        /// 選択されたステータスを取得
        /// </summary>
        private string GetSelectedStatus()
        {
            var selectedItem = StatusComboBox.SelectedItem as ComboBoxItem;
            if (selectedItem == null)
            {
                return "planning";
            }

            return selectedItem.Tag as string ?? "planning";
        }
    }
}
