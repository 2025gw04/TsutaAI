using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// ヘルプリクエスト作成ウィンドウ
    /// </summary>
    public partial class HelpRequestWindow : Window
    {
        private readonly ApiService _apiService;
        private readonly int _userId;
        private List<TaskItem> _tasks;
        private AiContext _generatedContext;
        private int? _selectedHelperId;

        // State tracking
        private bool _isSuggestionView = false;

        public HelpRequest CreatedHelpRequest { get; private set; }

        public HelpRequestWindow(ApiService apiService, int userId)
        {
            InitializeComponent();
            _apiService = apiService ?? throw new ArgumentNullException(nameof(apiService));
            _userId = userId;

            Loaded += HelpRequestWindow_Loaded;
        }

        private void HeaderBd_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                this.DragMove();
        }

        private async void HelpRequestWindow_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                // 自分のタスク一覧を取得
                var tasksList = await _apiService.GetUserTasksAsync(_userId);
                _tasks = tasksList.ToList();

                // 未完了タスクのみ表示
                var incompleteTasks = _tasks.Where(t => t.Status != "completed").ToList();
                TaskComboBox.ItemsSource = incompleteTasks;

                if (incompleteTasks.Count == 0)
                {
                    Alert.Info(
                        "対象となるタスクがありません。",
                        "情報");
                    DialogResult = false;
                    Close();
                }
            }
            catch (Exception ex)
            {
                Alert.Error(
                    $"タスク一覧の読み込みに失敗しました。\n{ex.Message}",
                    "エラー");
                DialogResult = false;
                Close();
            }
        }

        private async void ActionButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isSuggestionView)
            {
                // Submit logic
                await SubmitRequestAsync();
            }
            else
            {
                // Switch to Preview/Logic
                await ShowSuggestionsAsync();
            }
        }

        private void BackOrDirectButton_Click(object sender, RoutedEventArgs e)
        {
            if (_isSuggestionView)
            {
                // Go Back to Input
                SwitchToInputView();
            }
            else
            {
                // Submit Direct (skip AI suggestions)
                _ = SubmitRequestAsync();
            }
        }

        private void SwitchToInputView()
        {
            _isSuggestionView = false;
            InputView.Visibility = Visibility.Visible;
            SuggestionsView.Visibility = Visibility.Collapsed;
            
            HeaderTitle.Text = "ヘルプリクエスト作成";
            HeaderSubtitle.Text = "困っていることがあれば、チームメンバーに助けを求めましょう";

            ActionButton.Content = "AIメンバー検索";
            BackOrDirectButton.Content = "直接作成";
        }

        private void SwitchToSuggestionView()
        {
            _isSuggestionView = true;
            InputView.Visibility = Visibility.Collapsed;
            SuggestionsView.Visibility = Visibility.Visible;

            HeaderTitle.Text = "ヘルパー候補の選択";
            HeaderSubtitle.Text = "AIが推奨する最適なメンバーを選択してください";

            ActionButton.Content = "リクエスト送信";
            BackOrDirectButton.Content = "戻る";
        }

        private bool ValidateInput()
        {
            if (TaskComboBox.SelectedItem == null)
            {
                Alert.Warn("対象タスクを選択してください。", "入力エラー");
                return false;
            }

            if (string.IsNullOrWhiteSpace(TitleTextBox.Text))
            {
                Alert.Warn("タイトルを入力してください。", "入力エラー");
                return false;
            }
            return true;
        }

        private CreateHelpRequestRequest BuildRequestPayload()
        {
            var urgencyItem = UrgencyComboBox.SelectedItem as System.Windows.Controls.ComboBoxItem;
            return new CreateHelpRequestRequest
            {
                TaskId = (int)TaskComboBox.SelectedValue,
                RequesterId = _userId,
                RequestTitle = TitleTextBox.Text.Trim(),
                RequestDescription = DescriptionTextBox.Text?.Trim() ?? string.Empty,
                Urgency = urgencyItem.Tag.ToString(),
                GenerateContext = true // Always try to generate context on submit/preview if not present
            };
        }

        private async void GenerateDraftButton_Click(object sender, RoutedEventArgs e)
        {
            if (TaskComboBox.SelectedItem == null)
            {
                Alert.Warn("対象タスクを選択してください。", "入力エラー");
                return;
            }

            // If empty, warn user that they should write something to refine, OR let AI generate from scratch if they want draft?
            // The user said "improve what people wrote", implying they wrote something.
            // But if empty, we can fall back to draft generation.
            bool isRefinement = !string.IsNullOrWhiteSpace(DescriptionTextBox.Text) || !string.IsNullOrWhiteSpace(TitleTextBox.Text);
            
            try
            {
                GenerateDraftButton.IsEnabled = false;
                GenerateDraftButton.Content = "推敲中...";
                Mouse.OverrideCursor = Cursors.Wait;

                var request = BuildRequestPayload();
                request.GenerateSuggestions = false; // Only context/text
                request.GenerateContext = true;

                // Call Preview API
                var preview = await _apiService.PreviewHelpRequestAsync(request);
                _generatedContext = preview.AiContext;

                if (!string.IsNullOrEmpty(_generatedContext?.ContextSummary))
                {
                    if (isRefinement)
                    {
                        if (Alert.Confirm(
                            "AIによる推敲案が見つかりました。\n現在の入力内容を、改善された内容で上書きしますか？",
                            "推敲完了"))
                        {
                            DescriptionTextBox.Text = _generatedContext.ContextSummary;
                            // Note: Title refinement support would require backend change to return refined Title separately.
                            // For now, ContextSummary often contains the full text.
                        }
                    }
                    else
                    {
                        // Filled from empty
                        DescriptionTextBox.Text = _generatedContext.ContextSummary;
                    }
                }
            }
            catch (Exception ex)
            {
                Alert.Error($"AI処理に失敗しました。\n{ex.Message}", "エラー");
            }
            finally
            {
                GenerateDraftButton.IsEnabled = true;
                GenerateDraftButton.Content = "AIで推敲";
                Mouse.OverrideCursor = null;
            }
        }

        private async Task ShowSuggestionsAsync()
        {
            if (!ValidateInput()) return;

            try
            {
                ActionButton.IsEnabled = false;
                ActionButton.Content = "AI分析中...";

                var request = BuildRequestPayload();
                request.GenerateSuggestions = true; // Ensure suggestions are requested
                
                // Call Preview API
                var preview = await _apiService.PreviewHelpRequestAsync(request);

                // Store AI Context for final submission
                _generatedContext = preview.AiContext;

                // Bind Suggestions
                SuggestionsList.ItemsSource = preview.Suggestions;
                if (preview?.Suggestions != null && preview.Suggestions.Count > 0)
                {
                    var scoreLog = string.Join(", ", preview.Suggestions.Select((s, i) =>
                        $"#{i + 1}:{s.FullName}(nested={s.MatchScores?.TotalMatchScore:F2}, top={s.TotalMatchScore:F2}, overall={s.OverallScore:F2}, effective={s.EffectiveTotalMatchScore:F2})"));
                    Logger.Info($"AIメンバー検索スコア: {scoreLog}");
                }
                else
                {
                    Logger.Info("AIメンバー検索スコア: 候補なし");
                }

                SwitchToSuggestionView();
            }
            catch (Exception ex)
            {
                 Alert.Error(
                    $"AI分析に失敗しました。\n{ex.Message}",
                    "エラー");
            }
            finally
            {
                ActionButton.IsEnabled = true;
                if (!_isSuggestionView) ActionButton.Content = "AIメンバー検索";
            }
        }

        private async Task SubmitRequestAsync()
        {
            if (!ValidateInput()) return;

            try
            {
                ActionButton.IsEnabled = false;
                ActionButton.Content = "送信中...";

                var request = BuildRequestPayload();

                // If coming from suggestion view, attach extra data
                if (_isSuggestionView)
                {
                    request.AssignedTo = _selectedHelperId;
                    Logger.Info($"ヘルプリクエスト送信準備: AssignedTo={request.AssignedTo}, Title={request.RequestTitle}");
                    request.AiContextSummary = _generatedContext?.ContextSummary;
                    request.ProblemType = _generatedContext?.ProblemType;
                    request.DetectedIssues = _generatedContext?.DetectedIssues;
                    
                    // If no helper selected in suggestion view, user is effectively asking for "Any" or "Let manager decide"? 
                    // Or maybe we treat it as generic request.
                    // If assignedTo is null, backend logic falls back to existing flow (or suggestion generation).
                    // We prevent "GenerateSuggestions" again if we already did preview, unless we want to save them.
                    // Current backend logic: if assignedTo is set -> assign. Else if generateSuggestions -> generate.
                    
                    // If user is in Suggestion View but didn't pick anyone, AssignedTo is null.
                    // We should probably save the suggestions we just showed? 
                    // Implementation plan said "createHelperSuggestions" is done in backend.
                    // But here we already have them. 
                    // For simplicity, let's just re-enable suggestion generation on backend if AssignedTo is null,
                    // so they persist.
                    if (request.AssignedTo == null)
                    {
                        request.GenerateSuggestions = true;
                    }
                }
                else
                {
                    // Direct submission without preview
                    request.GenerateSuggestions = true; // Default behavior
                }

                CreatedHelpRequest = await _apiService.CreateHelpRequestAsync(request);

                Alert.Success(
                    "ヘルプリクエストを作成しました。\n" + (request.AssignedTo.HasValue ? "担当者に通知されました。" : "管理者に通知されました。"),
                    "成功");

                DialogResult = true;
                Close();
            }
            catch (Exception ex)
            {
                Alert.Error(
                    $"ヘルプリクエストの作成に失敗しました。\n{ex.Message}",
                    "エラー");
            }
            finally
            {
                ActionButton.IsEnabled = true;
                ActionButton.Content = _isSuggestionView ? "リクエスト送信" : "AIメンバー検索";
            }
        }

        private void HelperRadioButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is System.Windows.Controls.RadioButton rb)
            {
                // Try to get UserId from DataContext first (more reliable)
                if (rb.DataContext is HelperSuggestion suggestion)
                {
                    _selectedHelperId = suggestion.UserId;
                    Logger.Info($"ヘルパー選択: UserId={_selectedHelperId}, Name={suggestion.FullName}");
                }
                // Fallback to Tag property
                else if (rb.Tag != null)
                {
                    // Handle both int and string types
                    if (rb.Tag is int userId)
                    {
                        _selectedHelperId = userId;
                        Logger.Info($"ヘルパー選択(Tag-int): UserId={_selectedHelperId}");
                    }
                    else if (int.TryParse(rb.Tag.ToString(), out int parsedUserId))
                    {
                        _selectedHelperId = parsedUserId;
                        Logger.Info($"ヘルパー選択(Tag-parsed): UserId={_selectedHelperId}");
                    }
                    else
                    {
                        Logger.Warn($"ヘルパー選択失敗: Tag型が不正 - {rb.Tag?.GetType().Name}");
                    }
                }
                else
                {
                    Logger.Warn("ヘルパー選択失敗: DataContextとTagの両方がnull");
                }
            }
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }
    }
}
