using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using Newtonsoft.Json;
using TsutaAI.Models;
using TsutaAI.Services;
using TsutaAI.Utils;

namespace TsutaAI.Windows
{
    /// <summary>
    /// 1日の作業を振り返る日報画面のコードビハインドです。
    /// Git情報とファイル変更情報を自動収集し、AIによる日報生成をサポートします。
    /// </summary>
    public partial class DailyReportWindow : Window
    {
        private readonly List<TaskItem> _tasks;
        private readonly string _workFolder;
        private GitService _gitService;
        private List<GitCommitInfo> _todayCommits;
        private FileChangeSummary _fileChanges;
        private WorkContentSummary _workContentSummary;
        private ActivityStats _latestActivityStats;
        private DailyReportAiRequest _cachedAiRequest;
        private DailyReportAiFeedback _cachedAiFeedback;
        private bool _feedbackHistoryPersisted;

        /// <summary>
        /// 新しい DailyReportWindow を初期化します。
        /// </summary>
        /// <param name="tasks">本日のタスクリスト</param>
        /// <param name="workFolder">作業フォルダパス</param>
        public DailyReportWindow(List<TaskItem> tasks, string workFolder = null)
        {
            InitializeComponent();
            _tasks = tasks ?? new List<TaskItem>();
            _workFolder = workFolder;
            Loaded += OnLoaded;
        }

        /// <summary>
        /// ウィンドウが読み込まれたときの処理です。
        /// </summary>
        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            // 作業情報を収集
            CollectWorkInformation();

            // 日報の内容を生成
            PopulateReport();

            // AIで詳細な日報を生成
            await GenerateDailyReportTextAsync();

            // AIフィードバックを生成
            await GenerateAiFeedbackAsync();
        }

        /// <summary>
        /// 作業情報（Git、ファイル変更）を収集します。
        /// </summary>
        private void CollectWorkInformation()
        {
            try
            {
                // Git情報の収集
                if (!string.IsNullOrEmpty(_workFolder) && GitService.IsGitRepository(_workFolder))
                {
                    _gitService = new GitService(_workFolder);
                    _todayCommits = _gitService.GetTodayCommits();
                    Logger.Info($"本日のコミット数: {_todayCommits?.Count ?? 0}");
                }
                else
                {
                    Logger.Info("作業フォルダがGitリポジトリではありません。");
                }

                // ファイル変更情報は WidgetWindow から渡される。
                // 未設定時のみ空データを初期化して、外部から設定済みの値を上書きしない。
                if (_fileChanges == null)
                {
                    _fileChanges = new FileChangeSummary
                    {
                        TotalChanges = 0,
                        ModifiedCount = 0,
                        CreatedCount = 0,
                        DeletedCount = 0,
                        RenamedCount = 0,
                        FileExtensions = new List<FileExtensionCount>()
                    };
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"作業情報の収集中にエラーが発生しました: {ex.Message}");
            }
        }

        /// <summary>
        /// 日報の内容を画面に表示します。
        /// </summary>
        private void PopulateReport()
        {
            var completedTaskTitles = _tasks.Where(t => t.IsCompleted).Select(t => t.Title).ToList();
            var pendingTaskTitles = _tasks.Where(t => !t.IsCompleted).Select(t => t.Title).ToList();

            CompletedTasksItemsControl.ItemsSource = completedTaskTitles.Any()
                ? completedTaskTitles
                : new List<string> { "完了したタスクはありません。" };

            PendingTasksItemsControl.ItemsSource = pendingTaskTitles.Any()
                ? pendingTaskTitles
                : new List<string> { "残っているタスクはありません。" };

            if (_tasks.Any())
            {
                double completionPercentage = (double)completedTaskTitles.Count / _tasks.Count * 100;
                CompletionSlider.Value = completionPercentage;
            }
            else
            {
                CompletionSlider.Value = 0;
            }
        }

        /// <summary>
        /// AIを使って詳細な日報テキストを生成します（backend-api経由）。
        /// </summary>
        private async Task GenerateDailyReportTextAsync()
        {
            if (DailyReportTextBox != null)
            {
                DailyReportTextBox.Text = "AIが日報を生成しています…";
            }

            try
            {
                // backend-api経由でAI日報を生成
                string aiGeneratedReport = null;
                if (App.ApiService != null)
                {
                    var feedback = await GetOrGenerateAiFeedbackAsync();

                    if (feedback != null && feedback.HasContent())
                    {
                        aiGeneratedReport = FormatDailyReportFromFeedback(feedback);
                    }
                }

                // AIが利用できない場合は、基本的な日報を生成
                if (string.IsNullOrWhiteSpace(aiGeneratedReport))
                {
                    aiGeneratedReport = GenerateBasicReportText();
                }

                // 生成したテキストをTextBoxに設定
                if (DailyReportTextBox != null)
                {
                    DailyReportTextBox.Text = aiGeneratedReport;
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"AI日報生成中にエラーが発生しました: {ex.Message}");
                if (DailyReportTextBox != null)
                {
                    DailyReportTextBox.Text = GenerateBasicReportText();
                }
            }
        }

        /// <summary>
        /// AIフィードバックから日報テキストを整形します。
        /// </summary>
        private string FormatDailyReportFromFeedback(DailyReportAiFeedback feedback)
        {
            if (feedback == null || !feedback.HasContent())
            {
                return string.Empty;
            }

            var builder = new StringBuilder();

            // サマリー
            builder.AppendLine("■ 本日の作業サマリー");
            builder.AppendLine();
            builder.AppendLine(!string.IsNullOrWhiteSpace(feedback.Summary)
                ? feedback.Summary.Trim()
                : "本日の作業を進めました。");
            builder.AppendLine();

            // 成果・達成 (Draft API対応)
            if (feedback.Achievements != null && feedback.Achievements.Count > 0)
            {
                builder.AppendLine("■ 成果・達成");
                builder.AppendLine();
                foreach (var item in feedback.Achievements.Where(i => !string.IsNullOrWhiteSpace(i)))
                {
                    builder.AppendLine($"・{item.Trim()}");
                }
                builder.AppendLine();
            }

            // 完了タスク
            var completedTasks = _tasks.Where(t => t.IsCompleted).ToList();
            if (completedTasks.Any())
            {
                builder.AppendLine("■ 完了したタスク");
                builder.AppendLine();
                foreach (var task in completedTasks)
                {
                    builder.AppendLine($"・{task.Title}");
                }
                builder.AppendLine();
            }

            // 課題・懸念 (Draft API対応)
            if (feedback.Issues != null && feedback.Issues.Count > 0)
            {
                builder.AppendLine("■ 課題・懸念");
                builder.AppendLine();
                foreach (var item in feedback.Issues.Where(i => !string.IsNullOrWhiteSpace(i)))
                {
                    builder.AppendLine($"・{item.Trim()}");
                }
                builder.AppendLine();
            }

            // 気づきと成果
            var insights = new List<string>();
            if (feedback.Insights != null) insights.AddRange(feedback.Insights);
            if (feedback.Learnings != null) insights.AddRange(feedback.Learnings);

            if (insights.Any(i => !string.IsNullOrWhiteSpace(i)))
            {
                builder.AppendLine("■ 気づきと学び");
                builder.AppendLine();
                foreach (var item in insights.Where(i => !string.IsNullOrWhiteSpace(i)))
                {
                    builder.AppendLine($"・{item.Trim()}");
                }
                builder.AppendLine();
            }

            // 明日の予定
            var tomorrow = new List<string>();
            if (feedback.Tomorrow != null) tomorrow.AddRange(feedback.Tomorrow);
            if (feedback.NextPlan != null) tomorrow.AddRange(feedback.NextPlan);

            if (tomorrow.Any(t => !string.IsNullOrWhiteSpace(t)))
            {
                builder.AppendLine("■ 明日の予定");
                builder.AppendLine();
                foreach (var item in tomorrow.Where(t => !string.IsNullOrWhiteSpace(t)))
                {
                    builder.AppendLine($"・{item.Trim()}");
                }
                builder.AppendLine();
            }

            // エンカレッジメント
            if (!string.IsNullOrWhiteSpace(feedback.Encouragement))
            {
                builder.AppendLine("■ 総評");
                builder.AppendLine();
                builder.AppendLine(feedback.Encouragement.Trim());
            }

            return builder.ToString().Trim();
        }

        /// <summary>
        /// AIが利用できない場合の基本的な日報テキストを生成します。
        /// </summary>
        private string GenerateBasicReportText()
        {
            var builder = new StringBuilder();
            var completedTasks = _tasks.Where(t => t.IsCompleted).ToList();
            var pendingTasks = _tasks.Where(t => !t.IsCompleted).ToList();

            builder.AppendLine("■ 本日の作業内容");
            builder.AppendLine();

            if (completedTasks.Any())
            {
                builder.AppendLine($"本日は{completedTasks.Count}件のタスクを完了しました。");
                foreach (var task in completedTasks)
                {
                    builder.AppendLine($"「{task.Title}」については予定通り完了し、次のフェーズに進める準備が整いました。");
                }
                builder.AppendLine();
            }
            else
            {
                builder.AppendLine("本日は完了したタスクはありませんでした。");
                builder.AppendLine();
            }

            if (pendingTasks.Any())
            {
                builder.AppendLine("■ 進行中の作業");
                builder.AppendLine();
                foreach (var task in pendingTasks)
                {
                    var progress = ClampProgressValue(task.Progress);
                    builder.AppendLine($"「{task.Title}」は現在{progress}%の進捗で、引き続き作業を進めています。");
                }
                builder.AppendLine();
            }

            // Git情報
            if (_todayCommits != null && _todayCommits.Any())
            {
                builder.AppendLine("■ Git活動");
                builder.AppendLine();
                builder.AppendLine($"本日は{_todayCommits.Count}件のコミットを行いました。");

                var changedFiles = new HashSet<string>();
                foreach (var commit in _todayCommits)
                {
                    if (_gitService != null)
                    {
                        var files = _gitService.GetChangedFiles(commit.Hash);
                        foreach (var file in files)
                        {
                            changedFiles.Add(file);
                        }
                    }
                }

                if (changedFiles.Any())
                {
                    builder.AppendLine($"変更されたファイルは合計{changedFiles.Count}件です。");
                }
                builder.AppendLine();
            }

            builder.AppendLine("■ 明日の予定");
            builder.AppendLine();
            if (pendingTasks.Any())
            {
                builder.AppendLine($"明日は「{pendingTasks.First().Title}」を優先的に進め、完了を目指します。");
            }
            else
            {
                builder.AppendLine("明日は新しいタスクの割り当てを待ちます。");
            }

            return builder.ToString();
        }

        /// <summary>
        /// AIフィードバックを非同期で生成します。
        /// </summary>
        private async Task GenerateAiFeedbackAsync()
        {
            if (AiFeedbackTextBlock != null)
            {
                AiFeedbackTextBlock.Text = "AIがフィードバックを生成しています…";
            }

            if (App.ApiService == null)
            {
                Logger.Warn("APIサービスが初期化されていません。");
                if (AiFeedbackTextBlock != null)
                {
                    AiFeedbackTextBlock.Text = "APIサービスが利用できないため、AIフィードバックを生成できませんでした。";
                }
                return;
            }

            try
            {
                var response = await GetOrGenerateAiFeedbackAsync();

                // JSON形式のレスポンスをパースして整形する
                string formattedFeedback = FormatFeedbackText(response);

                if (AiFeedbackTextBlock != null)
                {
                    AiFeedbackTextBlock.Text = string.IsNullOrWhiteSpace(formattedFeedback)
                        ? "AIからのフィードバックはありませんでした。"
                        : formattedFeedback;
                }
            }
            catch (Exception ex)
            {
                Logger.Warn($"AIフィードバックの取得に失敗しました: {ex.Message}");
                if (AiFeedbackTextBlock != null)
                {
                    AiFeedbackTextBlock.Text = "AIフィードバックの取得に失敗しました。時間をおいて再度お試しください。";
                }
            }
        }

        private async Task<DailyReportAiFeedback> GetOrGenerateAiFeedbackAsync()
        {
            if (_cachedAiFeedback != null && _cachedAiFeedback.HasContent())
            {
                return _cachedAiFeedback;
            }

            if (App.ApiService == null)
            {
                return null;
            }

            var request = BuildAiRequest();
            var feedback = await App.ApiService.GenerateDailyReportFeedbackAsync(request);
            if (feedback != null && feedback.HasContent())
            {
                _cachedAiFeedback = feedback;
                PersistFeedbackHistory(request, feedback);
            }

            return feedback;
        }

        /// <summary>
        /// AIフィードバックを整形して文字列に変換します。
        /// </summary>
        private static string FormatFeedbackText(DailyReportAiFeedback feedback)
        {
            if (feedback == null || !feedback.HasContent())
            {
                return string.Empty;
            }

            var builder = new StringBuilder();

            if (!string.IsNullOrWhiteSpace(feedback.Summary))
            {
                builder.AppendLine(feedback.Summary.Trim());
                builder.AppendLine();
            }

            if (feedback.Achievements != null && feedback.Achievements.Any(i => !string.IsNullOrWhiteSpace(i)))
            {
                builder.AppendLine("■ 成果・達成");
                foreach (var item in feedback.Achievements.Where(i => !string.IsNullOrWhiteSpace(i)))
                {
                    builder.AppendLine($"・{item.Trim()}");
                }
                builder.AppendLine();
            }

            if (feedback.Issues != null && feedback.Issues.Any(i => !string.IsNullOrWhiteSpace(i)))
            {
                builder.AppendLine("■ 課題・懸念");
                foreach (var item in feedback.Issues.Where(i => !string.IsNullOrWhiteSpace(i)))
                {
                    builder.AppendLine($"・{item.Trim()}");
                }
                builder.AppendLine();
            }

            // Insights + Learnings
            var insights = new List<string>();
            if (feedback.Insights != null) insights.AddRange(feedback.Insights);
            if (feedback.Learnings != null) insights.AddRange(feedback.Learnings);

            if (insights.Any(i => !string.IsNullOrWhiteSpace(i)))
            {
                builder.AppendLine("■ 気づきと学び");
                foreach (var item in insights.Where(i => !string.IsNullOrWhiteSpace(i)))
                {
                    builder.AppendLine($"・{item.Trim()}");
                }
                builder.AppendLine();
            }

            // Tomorrow + NextPlan
            var tomorrow = new List<string>();
            if (feedback.Tomorrow != null) tomorrow.AddRange(feedback.Tomorrow);
            if (feedback.NextPlan != null) tomorrow.AddRange(feedback.NextPlan);

            if (tomorrow.Any(i => !string.IsNullOrWhiteSpace(i)))
            {
                builder.AppendLine("■ 明日への提案");
                foreach (var item in tomorrow.Where(i => !string.IsNullOrWhiteSpace(i)))
                {
                    builder.AppendLine($"・{item.Trim()}");
                }
                builder.AppendLine();
            }

            if (!string.IsNullOrWhiteSpace(feedback.Encouragement))
            {
                builder.AppendLine(feedback.Encouragement.Trim());
            }

            return builder.ToString().Trim();
        }

        /// <summary>
        /// AI日報生成用のリクエストデータを構築します。
        /// </summary>
        private DailyReportAiRequest BuildAiRequest()
        {
            if (_cachedAiRequest != null)
            {
                return _cachedAiRequest;
            }

            var userId = App.CurrentUser?.UserId ?? 0;
            var userName = string.IsNullOrWhiteSpace(App.CurrentUser?.FullName)
                ? "チームメンバー"
                : App.CurrentUser.FullName;

            var completed = _tasks.Where(t => t.IsCompleted).ToList();
            var pending = _tasks.Where(t => !t.IsCompleted).ToList();

            var taskListBuilder = new StringBuilder();
            foreach (var task in _tasks)
            {
                var status = task.IsCompleted ? "完了" : "進行中";
                var progressText = task.IsCompleted
                    ? "100%"
                    : $"{ClampProgressValue(task.Progress)}%";

                taskListBuilder.AppendLine($"- {task.Title}（{status}、進捗: {progressText}）");
            }

            var taskList = taskListBuilder.ToString().Trim();
            if (string.IsNullOrWhiteSpace(taskList))
            {
                taskList = "- 本日のタスクは記録されていません。";
            }

            // Git情報を追加
            string gitInfo = string.Empty;
            if (_todayCommits != null && _todayCommits.Any())
            {
                var gitBuilder = new StringBuilder();
                gitBuilder.AppendLine("\n【Git活動】");
                gitBuilder.AppendLine($"- コミット数: {_todayCommits.Count}件");
                foreach (var commit in _todayCommits.Take(10)) // 最大10件まで
                {
                    gitBuilder.AppendLine($"  - {commit.Date:HH:mm}: {commit.Message}");
                }

                if (_gitService != null)
                {
                    var pushEvents = _gitService.GetPushEventsSince(DateTime.Today);
                    if (pushEvents.Any())
                    {
                        gitBuilder.AppendLine($"- push回数: {pushEvents.Count}件");
                        foreach (var push in pushEvents.Take(5))
                        {
                            var branch = string.IsNullOrWhiteSpace(push.Branch) ? "unknown" : push.Branch;
                            gitBuilder.AppendLine($"  - {push.Date:HH:mm} {branch}: {push.Message}");
                        }
                    }
                }
                gitInfo = gitBuilder.ToString();
            }

            // ファイル変更情報を追加（基本サマリー）
            string fileChangeInfo = string.Empty;
            if (_fileChanges != null && _fileChanges.TotalChanges > 0)
            {
                var fileBuilder = new StringBuilder();
                fileBuilder.AppendLine("\n【ファイル変更】");
                fileBuilder.AppendLine($"- 総変更数: {_fileChanges.TotalChanges}件");
                fileBuilder.AppendLine($"  - 変更: {_fileChanges.ModifiedCount}件");
                fileBuilder.AppendLine($"  - 作成: {_fileChanges.CreatedCount}件");
                fileBuilder.AppendLine($"  - 削除: {_fileChanges.DeletedCount}件");
                fileChangeInfo = fileBuilder.ToString();
            }

            // ファイル変更の詳細内容を追加（WorkContentSummaryから）
            string detailedFileContent = string.Empty;
            if (_workContentSummary != null && _workContentSummary.TotalFilesChanged > 0)
            {
                var analysisService = new FileContentAnalysisService(null, null);
                detailedFileContent = analysisService.GenerateDetailedWorkContentText(_workContentSummary, maxFiles: 5);
            }

            string achievements = completed.Any()
                ? $"完了したタスク: {string.Join("、", completed.Select(t => t.Title))}{gitInfo}{fileChangeInfo}{detailedFileContent}"
                : $"完了したタスクはありませんでした。{gitInfo}{fileChangeInfo}{detailedFileContent}";

            string issues = pending.Any()
                ? $"未完了タスク: {string.Join("、", pending.Select(t => t.Title))}"
                : "特筆すべき課題はありません。";

            string learnings = "進行中タスクの見積もりと所要時間を記録し、次回の参考にします。";
            string nextPlan = pending.Any()
                ? $"{pending.First().Title} から着手し、残りのタスクも順次完了させます。"
                : "翌日は振り返りと次の案件準備を進めます。";

            var threeDaysAgo = DateTime.Today.AddDays(-2);
            var now = DateTime.Now;

            _cachedAiRequest = new DailyReportAiRequest
            {
                UserId = userId,
                UserName = userName,
                ReportDate = now.ToString("yyyy-MM-dd"),
                TaskList = taskList,
                Achievements = achievements,
                Issues = issues,
                Learnings = learnings,
                NextPlan = nextPlan,
                MonitoringContext = BuildMonitoringContext(userId, DateTime.Today, now),
                ThreeDayContext = BuildThreeDayContext(userId, threeDaysAgo, now),
                RecentFeedbackContext = BuildRecentFeedbackContext(userId, DateTime.Today.AddDays(-30), 6)
            };

            return _cachedAiRequest;
        }

        private string BuildMonitoringContext(int userId, DateTime startTime, DateTime endTime)
        {
            var builder = new StringBuilder();
            builder.AppendLine("【監視データ（ローカルDB集計）】");

            if (userId <= 0 || App.LocalDatabase == null)
            {
                builder.AppendLine("- ローカルDBまたはユーザー情報が利用できません。");
                return builder.ToString();
            }

            var summaries = App.LocalDatabase.GetHourlyActivitySummaries(userId, startTime, endTime);
            if (summaries == null || summaries.Count == 0)
            {
                builder.AppendLine("- 当日の時間単位データが未保存のため、実行時スナップショットを使用します。");
                if (_latestActivityStats != null)
                {
                    builder.AppendLine($"- マウス: {_latestActivityStats.MouseClickCount}回 / キーボード: {_latestActivityStats.KeyPressCount}回 / ホイール: {_latestActivityStats.MouseWheelCount}回");
                    if (!string.IsNullOrWhiteSpace(_latestActivityStats.CurrentWindowTitle))
                    {
                        builder.AppendLine($"- 直近アクティブウィンドウ: {_latestActivityStats.CurrentWindowTitle}");
                    }
                }

                var fileDiffs = App.LocalDatabase.GetFileDiffs(userId, startTime, endTime);
                if (fileDiffs != null && fileDiffs.Count > 0)
                {
                    builder.AppendLine($"- ファイル変更: {fileDiffs.Count}件（+{fileDiffs.Sum(f => f.LinesAdded)}行 / -{fileDiffs.Sum(f => f.LinesRemoved)}行）");
                }

                var gitEventsFallback = App.LocalDatabase.GetGitActivityEvents(userId, startTime, endTime);
                if (gitEventsFallback != null && gitEventsFallback.Count > 0)
                {
                    var commitCountFallback = gitEventsFallback.Count(e => string.Equals(e.EventType, "commit", StringComparison.OrdinalIgnoreCase));
                    var pushCountFallback = gitEventsFallback.Count(e => string.Equals(e.EventType, "push", StringComparison.OrdinalIgnoreCase));
                    builder.AppendLine($"- Gitイベント: commit {commitCountFallback}件 / push {pushCountFallback}件");
                }

                return LimitPromptText(builder.ToString(), 3500);
            }

            var totalMouse = summaries.Sum(s => s.MouseClicks);
            var totalKeyboard = summaries.Sum(s => s.KeyPresses);
            var totalWheel = summaries.Sum(s => s.MouseWheelScrolls);
            var totalActiveSeconds = summaries.Sum(s => s.TotalActiveSeconds);
            var totalFileChanges = summaries.Sum(s => s.FileChangesCount);
            var totalLinesAdded = summaries.Sum(s => s.LinesAdded);
            var totalLinesRemoved = summaries.Sum(s => s.LinesRemoved);
            var analyzedCount = summaries.Count(s => string.Equals(s.AiAnalysisStatus, "completed", StringComparison.OrdinalIgnoreCase));

            builder.AppendLine($"- 対象時間: {startTime:yyyy-MM-dd HH:mm} ～ {endTime:yyyy-MM-dd HH:mm}");
            builder.AppendLine($"- マウス: {totalMouse}回 / キーボード: {totalKeyboard}回 / ホイール: {totalWheel}回");
            builder.AppendLine($"- アクティブ時間: {Math.Round(totalActiveSeconds / 60.0, 1)}分");
            builder.AppendLine($"- ファイル変更: {totalFileChanges}件（+{totalLinesAdded}行 / -{totalLinesRemoved}行）");
            builder.AppendLine($"- AI時間分析済み: {analyzedCount}/{summaries.Count}件");

            var gitEvents = App.LocalDatabase.GetGitActivityEvents(userId, startTime, endTime);
            var commitCount = gitEvents.Count(e => string.Equals(e.EventType, "commit", StringComparison.OrdinalIgnoreCase));
            var pushCount = gitEvents.Count(e => string.Equals(e.EventType, "push", StringComparison.OrdinalIgnoreCase));
            builder.AppendLine($"- Gitイベント: commit {commitCount}件 / push {pushCount}件");

            var topWindows = new Dictionary<string, int>();
            foreach (var summary in summaries)
            {
                if (string.IsNullOrWhiteSpace(summary.TopWindows))
                {
                    continue;
                }

                try
                {
                    var windows = JsonConvert.DeserializeObject<List<WindowUsageInfo>>(summary.TopWindows);
                    if (windows == null)
                    {
                        continue;
                    }

                    foreach (var window in windows)
                    {
                        var key = string.IsNullOrWhiteSpace(window.ProcessName)
                            ? window.WindowTitle
                            : window.ProcessName;

                        if (string.IsNullOrWhiteSpace(key))
                        {
                            continue;
                        }

                        if (!topWindows.ContainsKey(key))
                        {
                            topWindows[key] = 0;
                        }

                        topWindows[key] += Math.Max(0, window.DurationSeconds);
                    }
                }
                catch
                {
                    // JSON不正時はスキップ
                }
            }

            if (topWindows.Count > 0)
            {
                builder.AppendLine("- 主要ウィンドウ:");
                foreach (var item in topWindows.OrderByDescending(x => x.Value).Take(3))
                {
                    builder.AppendLine($"  - {item.Key}: {Math.Round(item.Value / 60.0, 1)}分");
                }
            }

            return LimitPromptText(builder.ToString(), 3500);
        }

        private string BuildThreeDayContext(int userId, DateTime startDate, DateTime endDate)
        {
            var builder = new StringBuilder();
            builder.AppendLine("【直近3日間の推移】");

            if (userId <= 0 || App.LocalDatabase == null)
            {
                builder.AppendLine("- ローカルDBまたはユーザー情報が利用できません。");
                return builder.ToString();
            }

            var summaries = App.LocalDatabase.GetHourlyActivitySummaries(userId, startDate, endDate);
            var gitEvents = App.LocalDatabase.GetGitActivityEvents(userId, startDate, endDate);

            if ((summaries == null || summaries.Count == 0) && (gitEvents == null || gitEvents.Count == 0))
            {
                builder.AppendLine("- 直近3日間の活動データが不足しています。");
                return builder.ToString();
            }

            var date = startDate.Date;
            while (date <= endDate.Date)
            {
                var daySummaries = summaries == null
                    ? new List<HourlyActivitySummary>()
                    : summaries.Where(s => s.HourStart.Date == date).ToList();

                var dayGitEvents = gitEvents == null
                    ? new List<GitActivityEvent>()
                    : gitEvents.Where(e => e.OccurredAt.Date == date).ToList();

                var mouse = daySummaries.Sum(s => s.MouseClicks);
                var keyboard = daySummaries.Sum(s => s.KeyPresses);
                var activeMinutes = Math.Round(daySummaries.Sum(s => s.TotalActiveSeconds) / 60.0, 1);
                var fileChanges = daySummaries.Sum(s => s.FileChangesCount);
                var commits = dayGitEvents.Count(e => string.Equals(e.EventType, "commit", StringComparison.OrdinalIgnoreCase));
                var pushes = dayGitEvents.Count(e => string.Equals(e.EventType, "push", StringComparison.OrdinalIgnoreCase));

                builder.AppendLine($"- {date:yyyy-MM-dd}: 操作(マウス{mouse}/キー{keyboard})・稼働{activeMinutes}分・ファイル変更{fileChanges}件・commit{commits}件・push{pushes}件");
                date = date.AddDays(1);
            }

            return LimitPromptText(builder.ToString(), 4500);
        }

        private string BuildRecentFeedbackContext(int userId, DateTime startDate, int limit)
        {
            var builder = new StringBuilder();
            builder.AppendLine("【過去フィードバック要約】");

            if (userId <= 0 || App.LocalDatabase == null)
            {
                builder.AppendLine("- 過去フィードバックは利用できません。");
                return builder.ToString();
            }

            var histories = App.LocalDatabase.GetDailyReportFeedbackHistory(userId, startDate, limit);
            if (histories == null || histories.Count == 0)
            {
                builder.AppendLine("- 指定期間の保存済みフィードバックはありません。");
                return builder.ToString();
            }

            foreach (var history in histories.OrderByDescending(h => h.ReportDate).Take(limit))
            {
                var summary = ExtractFeedbackSummary(history);
                builder.AppendLine($"- {history.ReportDate:yyyy-MM-dd}: {summary}");
            }

            return LimitPromptText(builder.ToString(), 2500);
        }

        private static string ExtractFeedbackSummary(DailyReportFeedbackHistory history)
        {
            if (history == null)
            {
                return "要約なし";
            }

            if (!string.IsNullOrWhiteSpace(history.FeedbackJson))
            {
                try
                {
                    var feedback = JsonConvert.DeserializeObject<DailyReportAiFeedback>(history.FeedbackJson);
                    if (feedback != null && !string.IsNullOrWhiteSpace(feedback.Summary))
                    {
                        return feedback.Summary.Trim();
                    }
                }
                catch
                {
                    // JSON不正時はテキストにフォールバック
                }
            }

            if (!string.IsNullOrWhiteSpace(history.FeedbackText))
            {
                var line = history.FeedbackText
                    .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                    .FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(line))
                {
                    return line.Trim();
                }
            }

            return "要約なし";
        }

        private static string LimitPromptText(string text, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(text) || text.Length <= maxLength)
            {
                return text ?? string.Empty;
            }

            return text.Substring(0, maxLength) + "\n...（以下は長文のため省略）";
        }

        private void PersistFeedbackHistory(DailyReportAiRequest request, DailyReportAiFeedback feedback)
        {
            if (_feedbackHistoryPersisted || feedback == null || !feedback.HasContent() || App.LocalDatabase == null)
            {
                return;
            }

            try
            {
                var userId = App.CurrentUser?.UserId ?? 0;
                if (userId <= 0)
                {
                    return;
                }

                var history = new DailyReportFeedbackHistory
                {
                    UserId = userId,
                    ReportDate = DateTime.Today,
                    FeedbackText = FormatFeedbackText(feedback),
                    FeedbackJson = JsonConvert.SerializeObject(feedback),
                    RequestSnapshot = JsonConvert.SerializeObject(request),
                    CreatedAt = DateTime.Now
                };

                App.LocalDatabase.SaveDailyReportFeedbackHistory(history);
                _feedbackHistoryPersisted = true;
                Logger.Info("日報AIフィードバックをローカルDBに保存しました。");
            }
            catch (Exception ex)
            {
                Logger.Warn($"日報AIフィードバックのローカル保存に失敗しました: {ex.Message}");
            }
        }

        /// <summary>
        /// 進捗値を0～100の範囲にクランプします。
        /// </summary>
        private static int ClampProgressValue(int value)
        {
            if (value < 0) return 0;
            if (value > 100) return 100;
            return value;
        }

        /// <summary>
        /// 送信ボタンのクリックイベントハンドラーです。
        /// </summary>
        private async void SubmitButton_Click(object sender, RoutedEventArgs e)
        {
            SubmitButton.IsEnabled = false;

            try
            {
                // 自己評価データを収集
                int satisfactionLevel = GetSatisfactionLevel();
                int achievementRate = (int)CompletionSlider.Value;
                int focusLevel = (int)FocusSlider.Value;
                int difficultyLevel = (int)DifficultySlider.Value;
                int learningLevel = (int)LearningSlider.Value;

                // 日報オブジェクトを作成
                var report = new DailyReport
                {
                    UserId = App.CurrentUser?.UserId ?? 1,
                    ReportDate = DateTime.Today,
                    GeneratedSummary = DailyReportTextBox?.Text ?? string.Empty,
                    SatisfactionLevel = satisfactionLevel,
                    AchievementRate = achievementRate,
                    FocusLevel = focusLevel,
                    DifficultyLevel = difficultyLevel,
                    LearningLevel = learningLevel,
                    IsSubmitted = true,
                    CreatedAt = DateTime.Now
                };

                // APIに送信
                if (App.ApiService == null)
                {
                    throw new InvalidOperationException("APIサービスが初期化されていません。");
                }

                var submitted = await App.ApiService.SubmitDailyReportAsync(report);
                if (!submitted)
                {
                    throw new InvalidOperationException("日報送信に失敗しました。");
                }
                Logger.Info("日報をAPIに送信しました。");

                Alert.Success("日報を送信しました。本日もお疲れ様でした。", "送信完了");
                Application.Current.Shutdown();
            }
            catch (Exception ex)
            {
                Logger.Error($"日報送信中にエラーが発生しました: {ex.Message}");
                Alert.Error("日報の送信中にエラーが発生しました。ログを確認してください。", "エラー");
                SubmitButton.IsEnabled = true;
            }
        }

        /// <summary>
        /// 満足度の選択値を1-5の整数に変換します。
        /// </summary>
        private int GetSatisfactionLevel()
        {
            if (SatisfactionVeryBad?.IsChecked == true) return 1;
            if (SatisfactionBad?.IsChecked == true) return 2;
            if (SatisfactionNormal?.IsChecked == true) return 3;
            if (SatisfactionGood?.IsChecked == true) return 4;
            if (SatisfactionExcellent?.IsChecked == true) return 5;
            return 3; // デフォルトは普通
        }

        /// <summary>
        /// ファイル変更情報を外部から設定します。
        /// </summary>
        public void SetFileChangeSummary(FileChangeSummary summary)
        {
            _fileChanges = summary;
        }

        /// <summary>
        /// ウィジェット終了時点の活動統計を外部から設定します。
        /// </summary>
        public void SetLatestActivityStats(ActivityStats stats)
        {
            _latestActivityStats = stats;
        }

        /// <summary>
        /// 作業内容サマリーを外部から設定します。
        /// </summary>
        public void SetWorkContentSummary(WorkContentSummary summary)
        {
            _workContentSummary = summary;
            Logger.Info($"作業内容サマリーを設定しました: {summary?.TotalFilesChanged ?? 0}個のファイル変更");
        }
    }
}
