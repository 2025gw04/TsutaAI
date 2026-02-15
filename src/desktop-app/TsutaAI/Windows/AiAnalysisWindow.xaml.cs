using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Newtonsoft.Json;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// AI活動分析結果を表示するウィンドウ
    /// </summary>
    public partial class AiAnalysisWindow : Window
    {
        private readonly LocalDatabaseService _localDatabaseService;
        private readonly int _userId;
        private List<HourlyActivitySummary> _currentSummaries;
        private HourlyActivitySummary _latestSummary;

        public AiAnalysisWindow()
        {
            // XAMLデザイナがインスタンス化するために必要
        }

        public AiAnalysisWindow(int userId)
        {
            InitializeComponent();
            _localDatabaseService = App.LocalDatabase;
            _userId = userId;
            
            // ウィンドウが開かれたときに自動的にデータを読み込む
            Loaded += (s, e) => Initialize();
        }

        /// <summary>
        /// ウィンドウの初期化を明示的に行います。
        /// Loadedイベントの代わりに、生成元から呼び出されることを想定しています。
        /// </summary>
        public void Initialize()
        {
            LoadLatestAnalysis();
            LoadHistoryData("today");
        }

        private void HeaderBd_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                this.DragMove();
        }

        private void OnWindowLoaded(object sender, RoutedEventArgs e)
        {
            // Initialize() に処理を移行したため、このイベントハンドラは空にするか、削除します。
        }

        /// <summary>
        /// 最新のAI分析結果を読み込んで表示します
        /// </summary>
        private void LoadLatestAnalysis()
        {
            if (_localDatabaseService == null)
            {
                Utils.Logger.Warn("LoadLatestAnalysis が _localDatabaseService=null の状態で呼び出されたため、処理を中断します。");
                return;
            }

            try
            {
                var today = DateTime.Today;
                var tomorrow = today.AddDays(1);

                // 本日の分析結果を取得（最新のもの）
                var todaySummaries = _localDatabaseService.GetHourlyActivitySummaries(_userId, today, tomorrow);
                _latestSummary = todaySummaries
                    .Where(s => s != null && !string.IsNullOrEmpty(s.AiAnalysisStatus) && s.AiAnalysisStatus == "completed" && !string.IsNullOrEmpty(s.AiAnalysisResult))
                    .OrderByDescending(s => s.HourStart)
                    .FirstOrDefault();

                if (_latestSummary != null)
                {
                    DisplayAnalysisResult(_latestSummary);
                }
                else
                {
                    ShowNoDataMessage();
                }
            }
            catch (Exception ex)
            {
                Alert.Error($"分析結果の読み込みに失敗しました: {ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// AI分析結果を画面に表示します
        /// </summary>
        private void DisplayAnalysisResult(HourlyActivitySummary summary)
        {
            try
            {
                // AI分析結果をJSON解析
                var analysisResult = JsonConvert.DeserializeObject<AIAnalysisResult>(summary.AiAnalysisResult);

                if (analysisResult == null)
                {
                    ShowNoDataMessage();
                    return;
                }

                // 日時範囲を表示
                txtDateRange.Text = $"{summary.HourStart:yyyy/MM/dd HH:mm} ～ {summary.HourEnd:HH:mm} の分析結果";

                // スコアを表示
                DisplayScores(analysisResult);

                // サマリーを表示
                txtSummary.Text = analysisResult.Summary ?? "サマリーはありません";

                // 問題点を表示
                lstIssues.ItemsSource = analysisResult.Issues ?? new List<string>();

                // 改善提案を表示
                lstRecommendations.ItemsSource = analysisResult.Recommendations ?? new List<string>();

                // 活動データ詳細を表示
                DisplayActivityDetails(summary);
            }
            catch (JsonException)
            {
                Alert.Error("AI分析結果の形式が不正です", "エラー");
            }
            catch (Exception ex)
            {
                Alert.Error($"分析結果の表示に失敗しました: {ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// スコアを表示します
        /// </summary>
        private void DisplayScores(AIAnalysisResult result)
        {
            // 集中度スコア
            txtConcentrationScore.Text = result.ConcentrationScore.ToString();
            progressConcentration.Value = result.ConcentrationScore;
            txtConcentrationStatus.Text = GetScoreStatus(result.ConcentrationScore);

            // 進捗度スコア
            txtProgressScore.Text = result.ProgressScore.ToString();
            progressProgress.Value = result.ProgressScore;
            txtProgressStatus.Text = GetScoreStatus(result.ProgressScore);

            // 効率性スコア
            txtEfficiencyScore.Text = result.EfficiencyScore.ToString();
            progressEfficiency.Value = result.EfficiencyScore;
            txtEfficiencyStatus.Text = GetScoreStatus(result.EfficiencyScore);
        }

        /// <summary>
        /// スコアに基づいてステータステキストを返します
        /// </summary>
        private string GetScoreStatus(int score)
        {
            if (score >= 80) return "優秀";
            if (score >= 60) return "良好";
            if (score >= 40) return "普通";
            return "要改善";
        }

        /// <summary>
        /// 活動データの詳細を表示します
        /// </summary>
        private void DisplayActivityDetails(HourlyActivitySummary summary)
        {
            // 入力統計
            txtMouseClicks.Text = $"マウスクリック: {summary.MouseClicks}回";
            txtKeyPresses.Text = $"キー入力: {summary.KeyPresses}回";
            txtActiveTime.Text = $"アクティブ時間: {summary.TotalActiveSeconds / 60}分";

            // コード編集
            txtFileChanges.Text = $"ファイル変更: {summary.FileChangesCount}個";
            txtLinesAdded.Text = $"追加行数: {summary.LinesAdded}行";
            txtLinesRemoved.Text = $"削除行数: {summary.LinesRemoved}行";

            // システムリソース
            txtCpuUsage.Text = $"平均CPU: {summary.AvgCpuUsage:F1}%";
            txtMemoryUsage.Text = $"平均メモリ: {summary.AvgMemoryMB}MB";
            txtActivityIntensity.Text = $"活動強度: {GetActivityIntensityText(summary.ActivityIntensity)}";
        }

        /// <summary>
        /// 活動強度を日本語に変換します
        /// </summary>
        private string GetActivityIntensityText(string intensity)
        {
            switch (intensity?.ToLower())
            {
                case "high":
                    return "高";
                case "medium":
                    return "中";
                case "low":
                    return "低";
                default:
                    return "-";
            }
        }

        /// <summary>
        /// データがない場合のメッセージを表示します
        /// </summary>
        private void ShowNoDataMessage()
        {
            txtDateRange.Text = "本日の分析結果";
            txtConcentrationScore.Text = "0";
            txtProgressScore.Text = "0";
            txtEfficiencyScore.Text = "0";
            progressConcentration.Value = 0;
            progressProgress.Value = 0;
            progressEfficiency.Value = 0;
            txtConcentrationStatus.Text = "評価待ち";
            txtProgressStatus.Text = "評価待ち";
            txtEfficiencyStatus.Text = "評価待ち";
            txtSummary.Text = "まだAI分析が完了していません。1時間ごとに自動的に分析が実行されます。";
            lstIssues.ItemsSource = new List<string>();
            lstRecommendations.ItemsSource = new List<string>();
        }

        /// <summary>
        /// 履歴データを読み込みます
        /// </summary>
        private void LoadHistoryData(string period)
        {
            // === 最終防衛ライン: サービスがnullなら絶対に実行しない ===
            if (_localDatabaseService == null)
            {
                Utils.Logger.Warn("LoadHistoryData が _localDatabaseService=null の状態で呼び出されたため、処理を中断します。");
                return;
            }
            // ======================================================

            try
            {
                DateTime startDate;
                DateTime endDate = DateTime.Now;

                switch (period)
                {
                    case "today":
                        startDate = DateTime.Today;
                        break;
                    case "week":
                        startDate = DateTime.Today.AddDays(-7);
                        break;
                    case "month":
                        startDate = DateTime.Today.AddDays(-30);
                        break;
                    default:
                        startDate = DateTime.Today;
                        break;
                }

                // 指定期間の分析結果を取得
                _currentSummaries = _localDatabaseService.GetHourlyActivitySummaries(_userId, startDate, endDate)
                    .Where(s => s != null && !string.IsNullOrEmpty(s.AiAnalysisStatus) && s.AiAnalysisStatus == "completed")
                    .OrderByDescending(s => s.HourStart)
                    .ToList();

                // DataGridに表示
                dgHistory.ItemsSource = _currentSummaries.Select(s => CreateHistoryDisplayItem(s)).ToList();
            }
            catch (Exception ex)
            {
                Alert.Error($"履歴データの読み込みに失敗しました: {ex.Message}", "エラー");
            }
        }

        /// <summary>
        /// 履歴表示用のアイテムを作成します
        /// </summary>
        private HistoryDisplayItem CreateHistoryDisplayItem(HourlyActivitySummary summary)
        {
            AIAnalysisResult analysisResult = null;
            try
            {
                if (!string.IsNullOrEmpty(summary.AiAnalysisResult))
                {
                    analysisResult = JsonConvert.DeserializeObject<AIAnalysisResult>(summary.AiAnalysisResult);
                }
            }
            catch
            {
                // JSON解析エラーは無視
            }

            return new HistoryDisplayItem
            {
                OriginalSummary = summary,
                HourStart = summary.HourStart,
                ConcentrationScore = analysisResult?.ConcentrationScore ?? 0,
                ProgressScore = analysisResult?.ProgressScore ?? 0,
                EfficiencyScore = analysisResult?.EfficiencyScore ?? 0,
                ActivityIntensity = GetActivityIntensityText(summary.ActivityIntensity),
                AiAnalysisStatus = GetAnalysisStatusText(summary.AiAnalysisStatus),
                Summary = analysisResult?.Summary ?? "分析中..."
            };
        }

        /// <summary>
        /// 分析ステータスを日本語に変換します
        /// </summary>
        private string GetAnalysisStatusText(string status)
        {
            switch (status?.ToLower())
            {
                case "completed":
                    return "完了";
                case "analyzing":
                    return "分析中";
                case "pending":
                    return "待機中";
                case "failed":
                    return "失敗";
                default:
                    return status ?? "不明";
            }
        }

        /// <summary>
        /// 期間選択が変更されたときのハンドラ
        /// </summary>
        private void CmbPeriod_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (cmbPeriod.SelectedItem is ComboBoxItem selectedItem)
            {
                string period = selectedItem.Tag?.ToString() ?? "today";
                LoadHistoryData(period);
            }
        }

        /// <summary>
        /// 更新ボタンがクリックされたときのハンドラ
        /// </summary>
        private void BtnRefresh_Click(object sender, RoutedEventArgs e)
        {
            LoadLatestAnalysis();

            if (cmbPeriod.SelectedItem is ComboBoxItem selectedItem)
            {
                string period = selectedItem.Tag?.ToString() ?? "today";
                LoadHistoryData(period);
            }

            Alert.Success("データを更新しました", "更新完了");
        }

        /// <summary>
        /// 履歴グリッドで行が選択されたときのハンドラ
        /// </summary>
        private void DgHistory_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (dgHistory.SelectedItem is HistoryDisplayItem selectedItem)
            {
                // 選択された履歴の詳細を最新タブに表示
                DisplayAnalysisResult(selectedItem.OriginalSummary);
            }
        }

        /// <summary>
        /// 閉じるボタンがクリックされたときのハンドラ
        /// </summary>
        private void BtnClose_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        /// <summary>
        /// 履歴表示用のアイテムクラス
        /// </summary>
        private class HistoryDisplayItem
        {
            public HourlyActivitySummary OriginalSummary { get; set; }
            public DateTime HourStart { get; set; }
            public int ConcentrationScore { get; set; }
            public int ProgressScore { get; set; }
            public int EfficiencyScore { get; set; }
            public string ActivityIntensity { get; set; }
            public string AiAnalysisStatus { get; set; }
            public string Summary { get; set; }
        }
    }
}