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
    /// ProjectDashboardWindow.xaml の相互作用ロジック
    /// </summary>
    public partial class ProjectDashboardWindow : Window
    {
        private readonly ApiService _apiService;
        private List<Project> _projects;
        private int? _selectedProjectId;

        public ProjectDashboardWindow(ApiService apiService)
        {
            InitializeComponent();
            _apiService = apiService;

            Loaded += ProjectDashboardWindow_Loaded;
        }

        private async void ProjectDashboardWindow_Loaded(object sender, RoutedEventArgs e)
        {
            await LoadProjectsAsync();
        }

        private async Task LoadProjectsAsync()
        {
            try
            {
                SetStatus("プロジェクト一覧を読み込み中...");
                _projects = await _apiService.GetProjectsAsync();
                cmbProjects.ItemsSource = _projects;

                if (_projects != null && _projects.Count > 0)
                {
                    cmbProjects.SelectedIndex = 0;
                }

                SetStatus("準備完了");
            }
            catch (Exception ex)
            {
                Logger.Error($"プロジェクト一覧の読み込みに失敗しました: {ex.Message}");
                Alert.Error($"プロジェクト一覧の読み込みに失敗しました。\n{ex.Message}", "エラー");
                SetStatus("エラー");
            }
        }

        private void CmbProjects_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            if (cmbProjects.SelectedItem is Project project)
            {
                _selectedProjectId = project.Id;

                Task.Run(async () =>
                {
                    await LoadAllDashboardDataAsync();
                });
            }
        }

        private async Task LoadAllDashboardDataAsync()
        {
            if (!_selectedProjectId.HasValue)
            {
                return;
            }

            try
            {
                await Dispatcher.InvokeAsync(() => SetStatus("ダッシュボードデータ読み込み中..."));

                await LoadHealthScoreAsync();
                await LoadBurndownDataAsync();
                await LoadSprintsAsync();

                await Dispatcher.InvokeAsync(() => SetStatus("準備完了"));
            }
            catch (Exception ex)
            {
                Logger.Error($"ダッシュボードデータの読み込みに失敗しました: {ex.Message}");
                await Dispatcher.InvokeAsync(() => SetStatus("エラー"));
            }
        }

        #region Health Score

        private async Task LoadHealthScoreAsync()
        {
            if (!_selectedProjectId.HasValue)
            {
                return;
            }

            try
            {
                var healthScore = await _apiService.GetLatestHealthScoreAsync(_selectedProjectId.Value);

                // デバッグ: 取得したデータをログに出力
                if (healthScore != null)
                {
                    Logger.Info($"GetLatestHealthScore結果:");
                    Logger.Info($"  ID: {healthScore.Id}");
                    Logger.Info($"  HealthScore: {healthScore.HealthScore}");
                    Logger.Info($"  ProgressScore: {healthScore.ProgressScore}");
                    Logger.Info($"  DeadlineScore: {healthScore.DeadlineScore}");
                    Logger.Info($"  TeamMoraleScore: {healthScore.TeamMoraleScore}");
                    Logger.Info($"  BlockerScore: {healthScore.BlockerScore}");
                    Logger.Info($"  VelocityScore: {healthScore.VelocityScore}");
                }
                else
                {
                    Logger.Warn("GetLatestHealthScore returned null");
                }

                await Dispatcher.InvokeAsync(() =>
                {
                    if (healthScore != null)
                    {
                        txtHealthScore.Text = healthScore.HealthScore.ToString();
                        txtProgressScore.Text = healthScore.ProgressScore?.ToString() ?? "N/A";
                        txtDeadlineScore.Text = healthScore.DeadlineScore?.ToString() ?? "N/A";
                        txtTeamMoraleScore.Text = healthScore.TeamMoraleScore?.ToString() ?? "N/A";
                        txtBlockerScore.Text = healthScore.BlockerScore?.ToString() ?? "N/A";
                        txtVelocityScore.Text = healthScore.VelocityScore?.ToString() ?? "N/A";
                        txtAiAnalysis.Text = healthScore.AiAnalysis ?? "";
                        txtRiskFactors.Text = healthScore.RiskFactors ?? "";
                        txtRecommendations.Text = healthScore.Recommendations ?? "";
                    }
                });

                var history = await _apiService.GetHealthScoreHistoryAsync(_selectedProjectId.Value, 30);
                await Dispatcher.InvokeAsync(() =>
                {
                    if (history != null)
                    {
                        dgHealthScoreHistory.ItemsSource = history.OrderByDescending(h => h.ScoreDate);
                    }
                });
            }
            catch (Exception ex)
            {
                Logger.Error($"ヘルススコア読み込みに失敗しました: {ex.Message}");
            }
        }

        private async void BtnRefreshHealthScore_Click(object sender, RoutedEventArgs e)
        {
            if (!_selectedProjectId.HasValue)
            {
                Alert.Warn("プロジェクトを選択してください。", "確認");
                return;
            }

            try
            {
                SetStatus("ヘルススコアを計算中...");
                
                // ヘルススコアを計算
                ProjectHealthScore calculatedScore = await _apiService.CalculateHealthScoreAsync(_selectedProjectId.Value);
                
                if (calculatedScore == null)
                {
                    Logger.Warn("ヘルススコアの計算結果がnullです");
                    Alert.Warn("ヘルススコアの計算に失敗しました。", "警告");
                    SetStatus("エラー");
                    return;
                }
                
                // デバッグ: 受信したデータをログに出力
                Logger.Info($"ヘルススコア計算結果:");
                Logger.Info($"  ID: {calculatedScore.Id}");
                Logger.Info($"  ProjectId: {calculatedScore.ProjectId}");
                Logger.Info($"  HealthScore: {calculatedScore.HealthScore}");
                Logger.Info($"  ScoreDate: {calculatedScore.ScoreDate}");
                Logger.Info($"  ProgressScore: {calculatedScore.ProgressScore}");
                Logger.Info($"  DeadlineScore: {calculatedScore.DeadlineScore}");
                Logger.Info($"  TeamMoraleScore: {calculatedScore.TeamMoraleScore}");
                Logger.Info($"  BlockerScore: {calculatedScore.BlockerScore}");
                Logger.Info($"  VelocityScore: {calculatedScore.VelocityScore}");
                Logger.Info($"  AiAnalysis: {calculatedScore.AiAnalysis ?? "(null)"}");
                Logger.Info($"  RiskFactors: {calculatedScore.RiskFactors ?? "(null)"}");
                Logger.Info($"  Recommendations: {calculatedScore.Recommendations ?? "(null)"}");
                
                // 最新のヘルススコアを再読み込み
                await LoadHealthScoreAsync();
                SetStatus("ヘルススコア更新完了");
            }
            catch (Exception ex)
            {
                Logger.Error($"ヘルススコア計算に失敗しました: {ex.Message}");
                Logger.Error($"スタックトレース: {ex.StackTrace}");
                Alert.Error($"ヘルススコア計算に失敗しました。\n{ex.Message}", "エラー");
                SetStatus("エラー");
            }
        }

        #endregion

        #region Burndown

        private async Task LoadBurndownDataAsync()
        {
            if (!_selectedProjectId.HasValue)
            {
                return;
            }

            try
            {
                var burndownData = await _apiService.GetBurndownDataAsync(_selectedProjectId.Value, 30);

                await Dispatcher.InvokeAsync(() =>
                {
                    if (burndownData != null)
                    {
                        dgBurndownData.ItemsSource = burndownData.OrderByDescending(b => b.Date);
                    }
                });
            }
            catch (Exception ex)
            {
                Logger.Error($"バーンダウンデータ読み込みに失敗しました: {ex.Message}");
            }
        }

        private async void BtnRefreshBurndown_Click(object sender, RoutedEventArgs e)
        {
            if (!_selectedProjectId.HasValue)
            {
                Alert.Warn("プロジェクトを選択してください。", "確認");
                return;
            }

            try
            {
                SetStatus("バーンダウンデータ更新中...");
                await LoadBurndownDataAsync();
                SetStatus("バーンダウンデータ更新完了");
            }
            catch (Exception ex)
            {
                Logger.Error($"バーンダウンデータ更新に失敗しました: {ex.Message}");
                Alert.Error($"バーンダウンデータ更新に失敗しました。\n{ex.Message}", "エラー");
                SetStatus("エラー");
            }
        }

        #endregion

        #region Critical Path

        private async void BtnAnalyzeCriticalPath_Click(object sender, RoutedEventArgs e)
        {
            if (!_selectedProjectId.HasValue)
            {
                Alert.Warn("プロジェクトを選択してください。", "確認");
                return;
            }

            try
            {
                SetStatus("クリティカルパス分析中...");

                var analysis = await _apiService.AnalyzeCriticalPathAsync(_selectedProjectId.Value);

                if (analysis != null)
                {
                    txtCriticalTasksCount.Text = analysis.TotalCriticalTasks.ToString();
                    txtLongestPathDays.Text = $"{analysis.LongestPathDays} 日";
                    txtProjectEndDate.Text = analysis.ProjectEndDate?.ToString("yyyy-MM-dd") ?? "N/A";
                    lstCriticalTasks.ItemsSource = analysis.CriticalTasks;
                    lstCriticalPathRisks.ItemsSource = analysis.Risks;
                    lstCriticalPathRecommendations.ItemsSource = analysis.Recommendations;

                    SetStatus("クリティカルパス分析完了");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"クリティカルパス分析に失敗しました: {ex.Message}");
                Alert.Error($"クリティカルパス分析に失敗しました。\n{ex.Message}", "エラー");
                SetStatus("エラー");
            }
        }

        #endregion

        #region Sprint Management

        private async Task LoadSprintsAsync()
        {
            if (!_selectedProjectId.HasValue)
            {
                return;
            }

            try
            {
                var allSprints = await _apiService.GetSprintsAsync(_selectedProjectId.Value);

                await Dispatcher.InvokeAsync(() =>
                {
                    if (allSprints != null)
                    {
                        var activeSprints = allSprints.Where(s => s.Status == "active" || s.Status == "planning").ToList();
                        var completedSprints = allSprints.Where(s => s.Status == "completed").ToList();

                        dgActiveSprints.ItemsSource = activeSprints;
                        dgCompletedSprints.ItemsSource = completedSprints.OrderByDescending(s => s.EndDate);
                    }
                });
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリント読み込みに失敗しました: {ex.Message}");
            }
        }

        private async void BtnRefreshSprints_Click(object sender, RoutedEventArgs e)
        {
            if (!_selectedProjectId.HasValue)
            {
                Alert.Warn("プロジェクトを選択してください。", "確認");
                return;
            }

            try
            {
                SetStatus("スプリントデータ更新中...");
                await LoadSprintsAsync();
                SetStatus("スプリントデータ更新完了");
            }
            catch (Exception ex)
            {
                Logger.Error($"スプリントデータ更新に失敗しました: {ex.Message}");
                Alert.Error($"スプリントデータ更新に失敗しました。\n{ex.Message}", "エラー");
                SetStatus("エラー");
            }
        }

        #endregion

        #region Window Controls

        private void SetStatus(string message)
        {
            if (txtStatus != null)
            {
                txtStatus.Text = message;
            }
        }

        #endregion

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            this.Close();
        }
    }
}
