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
    /// GrowthTrackingWindow.xaml の相互作用ロジック
    /// </summary>
    public partial class GrowthTrackingWindow : Window
    {
        private readonly ApiService _apiService;
        private readonly int _userId;
        private GrowthReport _growthReport;

        public GrowthTrackingWindow(ApiService apiService, int userId)
        {
            InitializeComponent();
            _apiService = apiService;
            _userId = userId;

            Loaded += GrowthTrackingWindow_Loaded;
        }

        private async void GrowthTrackingWindow_Loaded(object sender, RoutedEventArgs e)
        {
            await LoadAllDataAsync();
        }

        private async Task LoadAllDataAsync()
        {
            try
            {
                SetStatus("データ読み込み中...");

                await LoadGrowthReportAsync();
                await LoadCurrentSkillsAsync();
                await LoadPerformanceMetricsAsync();
                await LoadContributionsAsync();
                await LoadGoalsAsync();

                SetStatus("準備完了");
            }
            catch (Exception ex)
            {
                Logger.Error($"データ読み込みに失敗しました: {ex.Message}");
                Alert.Error($"データ読み込みに失敗しました。\n{ex.Message}", "エラー");
                SetStatus("エラー");
            }
        }

        private async Task LoadGrowthReportAsync()
        {
            try
            {
                _growthReport = await _apiService.GetGrowthReportAsync(_userId, 3);

                if (_growthReport != null && _growthReport.SkillGrowth != null && _growthReport.SkillGrowth.History != null)
                {
                    dgSkillHistory.ItemsSource = _growthReport.SkillGrowth.History.OrderByDescending(s => s.RecordedDate);
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"成長レポート読み込みに失敗しました: {ex.Message}");
            }
        }

        private async Task LoadCurrentSkillsAsync()
        {
            try
            {
                var skills = await _apiService.GetUserSkillsAsync(_userId);
                if (skills != null)
                {
                    lstCurrentSkills.ItemsSource = skills.OrderByDescending(s => s.SkillLevel);
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"現在のスキル読み込みに失敗しました: {ex.Message}");
            }
        }

        private async Task LoadPerformanceMetricsAsync()
        {
            try
            {
                var metrics = await _apiService.GetPerformanceMetricsAsync(_userId, 3);

                if (metrics != null && metrics.Count > 0)
                {
                    dgPerformanceMetrics.ItemsSource = metrics.OrderByDescending(m => m.MetricDate);

                    var latest = metrics.OrderByDescending(m => m.MetricDate).FirstOrDefault();
                    if (latest != null)
                    {
                        txtTaskCompletionRate.Text = latest.TaskCompletionRate.HasValue
                            ? $"{latest.TaskCompletionRate.Value}%"
                            : "N/A";

                        txtFocusLevel.Text = latest.FocusLevelAvg.HasValue
                            ? $"{latest.FocusLevelAvg.Value:F1}"
                            : "N/A";

                        txtHelpCount.Text = latest.HelpCount.HasValue
                            ? latest.HelpCount.Value.ToString()
                            : "0";
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"パフォーマンスメトリクス読み込みに失敗しました: {ex.Message}");
            }
        }

        private async Task LoadContributionsAsync()
        {
            try
            {
                var endDate = DateTime.Now;
                var startDate = endDate.AddMonths(-3);

                var contributions = await _apiService.GetContributionsAsync(_userId, startDate, endDate);

                if (contributions != null)
                {
                    lstContributions.ItemsSource = contributions.OrderByDescending(c => c.ContributionDate);
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"貢献記録読み込みに失敗しました: {ex.Message}");
            }
        }

        private async Task LoadGoalsAsync()
        {
            try
            {
                var allGoals = await _apiService.GetGrowthGoalsAsync(_userId);

                if (allGoals != null)
                {
                    var activeGoals = allGoals.Where(g => g.Status == "active").ToList();
                    var completedGoals = allGoals.Where(g => g.Status == "completed").ToList();

                    lstActiveGoals.ItemsSource = activeGoals;
                    lstCompletedGoals.ItemsSource = completedGoals;
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"成長目標読み込みに失敗しました: {ex.Message}");
            }
        }

        private async void BtnAnalyzeStrengths_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                SetStatus("強み分析中...");

                var analysis = await _apiService.AnalyzeStrengthsAsync(_userId);

                if (analysis != null)
                {
                    txtStrengthsSummary.Text = analysis.Summary;
                    lstStrengths.ItemsSource = analysis.TopStrengths;

                    SetStatus("強み分析完了");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"強み分析に失敗しました: {ex.Message}");
                Alert.Error($"強み分析に失敗しました。\n{ex.Message}", "エラー");
                SetStatus("エラー");
            }
        }

        private async void BtnSuggestOpportunities_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                SetStatus("成長機会を提案中...");

                var opportunities = await _apiService.SuggestGrowthOpportunitiesAsync(_userId);

                if (opportunities != null && opportunities.Count > 0)
                {
                    lstOpportunities.ItemsSource = opportunities;
                    SetStatus($"成長機会提案完了 ({opportunities.Count}件)");
                }
                else
                {
                    Alert.Info("成長機会の提案はありません。", "情報");
                    SetStatus("提案なし");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"成長機会提案に失敗しました: {ex.Message}");
                Alert.Error($"成長機会提案に失敗しました。\n{ex.Message}", "エラー");
                SetStatus("エラー");
            }
        }

        private async void BtnSuggestGoals_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                SetStatus("AI目標提案中...");

                var suggestions = await _apiService.SuggestGoalsAsync(_userId);

                if (suggestions != null && suggestions.Count > 0)
                {
                    lstGoalSuggestions.ItemsSource = suggestions;
                    SetStatus($"AI目標提案完了 ({suggestions.Count}件)");
                }
                else
                {
                    Alert.Info("AI目標提案はありません。", "情報");
                    SetStatus("提案なし");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"AI目標提案に失敗しました: {ex.Message}");
                Alert.Error($"AI目標提案に失敗しました。\n{ex.Message}", "エラー");
                SetStatus("エラー");
            }
        }

        private async void BtnRefreshContributions_Click(object sender, RoutedEventArgs e)
        {
            await LoadContributionsAsync();
        }

        private async void BtnRefreshGoals_Click(object sender, RoutedEventArgs e)
        {
            await LoadGoalsAsync();
        }

        private void SetStatus(string message)
        {
            if (txtStatus != null)
            {
                txtStatus.Text = message;
            }
        }
    }
}
