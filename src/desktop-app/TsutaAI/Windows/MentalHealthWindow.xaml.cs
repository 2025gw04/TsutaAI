using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// メンタルヘルスチェックウィンドウ
    /// </summary>
    public partial class MentalHealthWindow : Window
    {
        private readonly ApiService _apiService;
        private readonly int _userId;
        private int? _selectedMood;
        private int? _selectedStressLevel;

        public MentalHealthLog CreatedLog { get; private set; }

        public MentalHealthWindow(ApiService apiService, int userId)
        {
            InitializeComponent();
            _apiService = apiService ?? throw new ArgumentNullException(nameof(apiService));
            _userId = userId;

            Loaded += MentalHealthWindow_Loaded;
        }

        private void HeaderBd_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                this.DragMove();
        }

        private async void MentalHealthWindow_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                // 今日の記録があるかチェック
                var today = DateTime.Today.ToString("yyyy-MM-dd");
                var existingLog = await _apiService.GetMentalHealthLogByDateAsync(_userId, today);

                if (existingLog != null)
                {
                if (!Alert.Confirm(
                    "今日は既に記録済みです。新しい記録を作成しますか？",
                    "確認"))
                {
                    DialogResult = false;
                    Close();
                    return;
                }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn($"既存のメンタルヘルスログチェックに失敗しました: {ex.Message}");
                // エラーは無視して続行
            }
        }

        private void MoodButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag != null)
            {
                _selectedMood = int.Parse(button.Tag.ToString());
                UpdateMoodButtonsStyle();
            }
        }

        private void StressButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag != null)
            {
                _selectedStressLevel = int.Parse(button.Tag.ToString());
                UpdateStressButtonsStyle();
            }
        }

        private void UpdateMoodButtonsStyle()
        {
            // すべてのボタンをリセット
            foreach (var child in MoodRatingPanel.Children)
            {
                if (child is Button btn)
                {
                    btn.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E0E0E0"));
                    btn.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#CCCCCC"));
                    btn.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#34495E"));
                    btn.BorderThickness = new Thickness(1);
                }
            }

            // 選択されたボタンをハイライト
            if (_selectedMood.HasValue)
            {
                var selectedButton = MoodRatingPanel.Children
                    .OfType<Button>()
                    .FirstOrDefault(b => b.Tag?.ToString() == _selectedMood.ToString());

                if (selectedButton != null)
                {
                    selectedButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#27824F"));
                    selectedButton.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1B5E38"));
                    selectedButton.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFFFFF"));
                    selectedButton.BorderThickness = new Thickness(2);
                }
            }
        }

        private void UpdateStressButtonsStyle()
        {
            // すべてのボタンをリセット
            foreach (var child in StressRatingPanel.Children)
            {
                if (child is Button btn)
                {
                    btn.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E0E0E0"));
                    btn.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#CCCCCC"));
                    btn.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#34495E"));
                    btn.BorderThickness = new Thickness(1);
                }
            }

            // 選択されたボタンをハイライト（ストレスレベルに応じて色を変える）
            if (_selectedStressLevel.HasValue)
            {
                var selectedButton = StressRatingPanel.Children
                    .OfType<Button>()
                    .FirstOrDefault(b => b.Tag?.ToString() == _selectedStressLevel.ToString());

                if (selectedButton != null)
                {
                    // ストレスレベルに応じて色を変える
                    string color;
                    string fore;
                    switch (_selectedStressLevel.Value)
                    {
                        case 1:
                            color = "#27824F"; // 緑
                            fore = "#FFFFFF";
                            break;
                        case 2:
                            color = "#4BA262"; // 薄緑
                            fore = "#FFFFFF";
                            break;
                        case 3:
                            color = "#FFC107"; // 黄色
                            fore = "#34495E";
                            break;
                        case 4:
                            color = "#FF9800"; // オレンジ
                            fore = "#FFFFFF";
                            break;
                        case 5:
                            color = "#F44336"; // 赤
                            fore = "#FFFFFF";
                            break;
                        default:
                            color = "#27824F";
                            fore = "#FFFFFF";
                            break;
                    }

                    selectedButton.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));
                    selectedButton.BorderBrush = new SolidColorBrush(Colors.DarkGray);
                    selectedButton.BorderThickness = new Thickness(2);
                    selectedButton.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(fore));
                }
            }
        }

        private void HasBlockerCheckBox_CheckedChanged(object sender, RoutedEventArgs e)
        {
            BlockerDetailsTextBox.IsEnabled = HasBlockerCheckBox.IsChecked == true;
            if (HasBlockerCheckBox.IsChecked == false)
            {
                BlockerDetailsTextBox.Text = string.Empty;
            }
        }

        private void NeedSupportCheckBox_CheckedChanged(object sender, RoutedEventArgs e)
        {
            SupportDetailsTextBox.IsEnabled = NeedSupportCheckBox.IsChecked == true;
            if (NeedSupportCheckBox.IsChecked == false)
            {
                SupportDetailsTextBox.Text = string.Empty;
            }
        }

        private async void SubmitButton_Click(object sender, RoutedEventArgs e)
        {
            // 入力検証
            if (!_selectedMood.HasValue || !_selectedStressLevel.HasValue)
            {
                Alert.Warn(
                    "気分とストレスレベルを選択してください。",
                    "入力エラー");
                return;
            }

            if (HasBlockerCheckBox.IsChecked == true && string.IsNullOrWhiteSpace(BlockerDetailsTextBox.Text))
            {
                Alert.Warn(
                    "問題の詳細を入力してください。",
                    "入力エラー");
                return;
            }

            if (NeedSupportCheckBox.IsChecked == true && string.IsNullOrWhiteSpace(SupportDetailsTextBox.Text))
            {
                Alert.Warn(
                    "必要なサポートの詳細を入力してください。",
                    "入力エラー");
                return;
            }

            try
            {
                SubmitButton.IsEnabled = false;
                SubmitButton.Content = "記録中...";

                var request = new CreateMentalHealthLogRequest
                {
                    UserId = _userId,
                    ReportDate = DateTime.Today.ToString("yyyy-MM-dd"),
                    Mood = _selectedMood.Value,
                    StressLevel = _selectedStressLevel.Value,
                    HasBlocker = HasBlockerCheckBox.IsChecked == true,
                    BlockerDetails = HasBlockerCheckBox.IsChecked == true ? BlockerDetailsTextBox.Text.Trim() : null,
                    NeedSupport = NeedSupportCheckBox.IsChecked == true,
                    SupportDetails = NeedSupportCheckBox.IsChecked == true ? SupportDetailsTextBox.Text.Trim() : null
                };

                var response = await _apiService.CreateMentalHealthLogAsync(request);

                Logger.Info($"メンタルヘルスログを作成しました（ID: {response.Id}）");

                // AI Adviceを表示
                if (!string.IsNullOrEmpty(response.AiAdvice))
                {
                    AiAdviceText.Text = response.AiAdvice;
                    AiAdvicePanel.Visibility = Visibility.Visible;

                    // ボタンを変更
                    SubmitButton.Content = "閉じる";
                    SubmitButton.IsEnabled = true;
                    SubmitButton.Click -= SubmitButton_Click;
                    SubmitButton.Click += CloseButton_Click;
                }
                else
                {
                    Alert.Success(
                        "メンタルヘルスログを記録しました。",
                        "成功");

                    DialogResult = true;
                    Close();
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"メンタルヘルスログの作成に失敗しました: {ex.Message}");
                Alert.Error(
                    $"記録の保存に失敗しました。\n{ex.Message}",
                    "エラー");
            }
            finally
            {
                if (SubmitButton.Content.ToString() == "記録中...")
                {
                    SubmitButton.IsEnabled = true;
                    SubmitButton.Content = "記録する";
                }
            }
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
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
