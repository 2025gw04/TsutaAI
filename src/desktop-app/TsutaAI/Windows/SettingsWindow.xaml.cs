using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Forms;
using TsutaAI.Config;
using TsutaAI.Services;
using TsutaAI.Utils;
using MessageBox = System.Windows.MessageBox;
using TsutaAI.Models;
using System.Threading.Tasks;

namespace TsutaAI.Windows
{
    /// <summary>
    /// アプリケーションの各種設定を管理するウィンドウです。
    /// </summary>
    public partial class SettingsWindow : Window
    {
        private readonly ConfigService _configService;
        private ObservableCollection<VacationItem> _vacations;
        private ObservableCollection<UserSkill> _skills;

        /// <summary>
        /// 新しい SettingsWindow を初期化します。
        /// </summary>
        public SettingsWindow()
        {
            InitializeComponent();
            _configService = new ConfigService();
            _vacations = new ObservableCollection<VacationItem>();
            _skills = new ObservableCollection<UserSkill>();
            VacationsListBox.ItemsSource = _vacations;
            SkillsListBox.ItemsSource = _skills;

            LoadSettings();
            LoadUserProfile();
        }

        /// <summary>
        /// 設定を読み込んでUIに反映します。
        /// </summary>
        private void LoadSettings()
        {
            try
            {
                var settings = _configService.LoadSettings();

                // API接続設定
                ApiUrlTextBox.Text = settings.ApiUrl ?? "http://localhost:3000";

                // 作業フォルダ設定
                WorkFolderTextBox.Text = settings.WorkFolder ?? "";
                MonitorFileChangesCheckBox.IsChecked = settings.MonitorFileChanges;
                MonitorGitCheckBox.IsChecked = settings.MonitorGit;

                // 監視設定
                MonitorMouseCheckBox.IsChecked = settings.MonitorMouse;
                MonitorKeyboardCheckBox.IsChecked = settings.MonitorKeyboard;
                MonitorActiveWindowCheckBox.IsChecked = settings.MonitorActiveWindow;

                // 自動保存間隔
                switch (settings.AutoSaveIntervalMinutes)
                {
                    case 15: AutoSaveIntervalComboBox.SelectedIndex = 0; break;
                    case 30: AutoSaveIntervalComboBox.SelectedIndex = 1; break;
                    case 60: AutoSaveIntervalComboBox.SelectedIndex = 2; break;
                    case 120: AutoSaveIntervalComboBox.SelectedIndex = 3; break;
                    default: AutoSaveIntervalComboBox.SelectedIndex = 2; break;
                }

                // アイドル検出時間
                switch (settings.IdleTimeMinutes)
                {
                    case 5: IdleTimeComboBox.SelectedIndex = 0; break;
                    case 10: IdleTimeComboBox.SelectedIndex = 1; break;
                    case 15: IdleTimeComboBox.SelectedIndex = 2; break;
                    case 20: IdleTimeComboBox.SelectedIndex = 3; break;
                    default: IdleTimeComboBox.SelectedIndex = 1; break;
                }

                // 通知設定
                NotifyTaskStartCheckBox.IsChecked = settings.NotifyTaskStart;
                NotifyTaskEndCheckBox.IsChecked = settings.NotifyTaskEnd;
                NotifyBreakCheckBox.IsChecked = settings.NotifyBreak;
                NotifyAiAlertCheckBox.IsChecked = settings.NotifyAiAlert;
                NotifySoundCheckBox.IsChecked = settings.NotifySound;

                // 休暇リストの読み込み
                _vacations.Clear();
                if (settings.Vacations != null)
                {
                    foreach (var vacation in settings.Vacations)
                    {
                        _vacations.Add(new VacationItem
                        {
                            StartDate = vacation.StartDate,
                            EndDate = vacation.EndDate
                        });
                    }
                }

                // バージョン管理設定
                if (settings.VersionControl != null)
                {
                    switch (settings.VersionControl.Type?.ToLower())
                    {
                        case "git": VcsTypeComboBox.SelectedIndex = 0; break;
                        case "svn": VcsTypeComboBox.SelectedIndex = 1; break;
                        default: VcsTypeComboBox.SelectedIndex = 2; break;
                    }
                    VcsRepositoryUrlTextBox.Text = settings.VersionControl.RepositoryUrl ?? "";
                    VcsLocalPathTextBox.Text = settings.VersionControl.LocalPath ?? "";
                    VcsUsernameTextBox.Text = settings.VersionControl.Username ?? "";
                    // パスワードは読み込まない（セキュリティ上の理由）
                    VcsEnableMonitoringCheckBox.IsChecked = settings.VersionControl.EnableMonitoring;
                    VcsAutoRecognizeCommitsCheckBox.IsChecked = settings.VersionControl.AutoRecognizeCommits;
                }

                Logger.Info("設定を読み込みました。");
            }
            catch (Exception ex)
            {
                Logger.Error($"設定の読み込み中にエラーが発生しました: {ex.Message}");
                Alert.Error("設定の読み込みに失敗しました。", "エラー");
            }
        }

        /// <summary>
        /// 設定を保存します。
        /// </summary>
        private void SaveSettings_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var settings = new ApplicationSetting
                {
                    ApiUrl = ApiUrlTextBox.Text,
                    WorkFolder = WorkFolderTextBox.Text,
                    MonitorFileChanges = MonitorFileChangesCheckBox.IsChecked ?? true,
                    MonitorGit = MonitorGitCheckBox.IsChecked ?? true,
                    MonitorMouse = MonitorMouseCheckBox.IsChecked ?? true,
                    MonitorKeyboard = MonitorKeyboardCheckBox.IsChecked ?? true,
                    MonitorActiveWindow = MonitorActiveWindowCheckBox.IsChecked ?? true,
                    AutoSaveIntervalMinutes = GetAutoSaveInterval(),
                    IdleTimeMinutes = GetIdleTime(),
                    NotifyTaskStart = NotifyTaskStartCheckBox.IsChecked ?? true,
                    NotifyTaskEnd = NotifyTaskEndCheckBox.IsChecked ?? true,
                    NotifyBreak = NotifyBreakCheckBox.IsChecked ?? false,
                    NotifyAiAlert = NotifyAiAlertCheckBox.IsChecked ?? true,
                    NotifySound = NotifySoundCheckBox.IsChecked ?? true,
                    Vacations = new System.Collections.Generic.List<VacationInfo>()
                };

                // 休暇リストを保存
                foreach (var vacation in _vacations)
                {
                    settings.Vacations.Add(new VacationInfo
                    {
                        StartDate = vacation.StartDate,
                        EndDate = vacation.EndDate
                    });
                }

                // バージョン管理設定を保存
                var vcsType = VcsTypeComboBox.SelectedIndex == 0 ? "Git" : 
                              VcsTypeComboBox.SelectedIndex == 1 ? "SVN" : "None";
                settings.VersionControl = new Config.VersionControlSettings
                {
                    Type = vcsType,
                    RepositoryUrl = VcsRepositoryUrlTextBox.Text,
                    LocalPath = VcsLocalPathTextBox.Text,
                    Username = VcsUsernameTextBox.Text,
                    Password = VcsPasswordBox.Password, // 注意: 平文保存されます
                    EnableMonitoring = VcsEnableMonitoringCheckBox.IsChecked ?? true,
                    AutoRecognizeCommits = VcsAutoRecognizeCommitsCheckBox.IsChecked ?? true
                };

                _configService.SaveSettings(settings);
                Logger.Info("設定を保存しました。");

                Alert.Success("設定を保存しました。", "成功");
                this.DialogResult = true;
                this.Close();
            }
            catch (Exception ex)
            {
                Logger.Error($"設定の保存中にエラーが発生しました: {ex.Message}");
                Alert.Error("設定の保存に失敗しました。", "エラー");
            }
        }

        /// <summary>
        /// 選択された自動保存間隔を取得します。
        /// </summary>
        private int GetAutoSaveInterval()
        {
            switch (AutoSaveIntervalComboBox.SelectedIndex)
            {
                case 0: return 15;
                case 1: return 30;
                case 2: return 60;
                case 3: return 120;
                default: return 60;
            }
        }

        /// <summary>
        /// 選択されたアイドル検出時間を取得します。
        /// </summary>
        private int GetIdleTime()
        {
            switch (IdleTimeComboBox.SelectedIndex)
            {
                case 0: return 5;
                case 1: return 10;
                case 2: return 15;
                case 3: return 20;
                default: return 10;
            }
        }

        /// <summary>
        /// 設定をキャンセルしてウィンドウを閉じます。
        /// </summary>
        private void CancelSettings_Click(object sender, RoutedEventArgs e)
        {
            this.DialogResult = false;
            this.Close();
        }

        /// <summary>
        /// 作業フォルダを参照します。
        /// </summary>
        private void BrowseFolder_Click(object sender, RoutedEventArgs e)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.Description = "作業フォルダを選択してください";
                dialog.ShowNewFolderButton = true;

                if (!string.IsNullOrEmpty(WorkFolderTextBox.Text) && Directory.Exists(WorkFolderTextBox.Text))
                {
                    dialog.SelectedPath = WorkFolderTextBox.Text;
                }

                if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                {
                    WorkFolderTextBox.Text = dialog.SelectedPath;

                    // フォルダ状態を確認
                    if (GitService.IsGitRepository(dialog.SelectedPath))
                    {
                        FolderStatusTextBlock.Text = "✓ Gitリポジトリを検出しました";
                        FolderStatusTextBlock.Foreground = System.Windows.Media.Brushes.LightGreen;
                    }
                    else
                    {
                        FolderStatusTextBlock.Text = "ℹ️ Gitリポジトリではありません（ファイル変更のみ監視）";
                        FolderStatusTextBlock.Foreground = System.Windows.Media.Brushes.Orange;
                    }
                }
            }
        }

        /// <summary>
        /// API接続をテストします。
        /// </summary>
        private async void TestConnection_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                ConnectionStatusTextBlock.Text = "接続テスト中...";
                ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.Orange;

                var loadedSettings = _configService.LoadSettings();
                var apiSettings = new ApiSettings
                {
                    BaseUrl = ApiUrlTextBox.Text,
                    Timeout = loadedSettings?.API?.Timeout ?? 30
                };
                var proxySettings = loadedSettings?.Proxy ?? new ProxySettings();

                var apiService = new ApiService(apiSettings, proxySettings);

                // 実際のAPI接続テストを実行
                bool result = await apiService.TestConnectionAsync();

                if (result)
                {
                    ConnectionStatusTextBlock.Text = "✓ 接続成功 - APIサーバーに正常に接続できました";
                    ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.LightGreen;
                    Logger.Info($"API接続テスト成功: {ApiUrlTextBox.Text}");
                }
                else
                {
                    ConnectionStatusTextBlock.Text = "✗ 接続失敗 - APIサーバーから応答がありません";
                    ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                    Logger.Warn($"API接続テスト失敗: {ApiUrlTextBox.Text}");
                }
            }
            catch (Exception ex)
            {
                ConnectionStatusTextBlock.Text = "✗ 接続失敗: " + ex.Message;
                ConnectionStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                Logger.Error($"API接続テスト失敗: {ex.Message}");
            }
        }

        /// <summary>
        /// 休暇を追加します。
        /// </summary>
        private void AddVacation_Click(object sender, RoutedEventArgs e)
        {
            var startDate = VacationStartDatePicker.SelectedDate;
            var endDate = VacationEndDatePicker.SelectedDate;

            if (!startDate.HasValue || !endDate.HasValue)
            {
                Alert.Warn("開始日と終了日を選択してください。", "入力エラー");
                return;
            }

            if (startDate.Value > endDate.Value)
            {
                Alert.Warn("開始日は終了日より前である必要があります。", "入力エラー");
                return;
            }

            _vacations.Add(new VacationItem
            {
                StartDate = startDate.Value,
                EndDate = endDate.Value
            });

            // 入力をクリア
            VacationStartDatePicker.SelectedDate = null;
            VacationEndDatePicker.SelectedDate = null;

            Logger.Info($"休暇を追加しました: {startDate.Value:yyyy/MM/dd} ~ {endDate.Value:yyyy/MM/dd}");
        }

        /// <summary>
        /// 休暇を削除します。
        /// </summary>
        private void DeleteVacation_Click(object sender, RoutedEventArgs e)
        {
            var button = sender as System.Windows.Controls.Button;
            if (button?.Tag is VacationItem vacation)
            {
                _vacations.Remove(vacation);
                Logger.Info($"休暇を削除しました: {vacation.DisplayText}");
            }
        }

        /// <summary>
        /// ユーザープロフィールを読み込みます。
        /// </summary>
        private async void LoadUserProfile()
        {
            try
            {
                if (App.CurrentUser == null)
                {
                    Logger.Warn("ログインしていないため、プロフィールを読み込めません。");
                    return;
                }

                UsernameTextBox.Text = App.CurrentUser.Username ?? "";
                FullNameTextBox.Text = App.CurrentUser.FullName ?? "";
                EmailTextBox.Text = App.CurrentUser.Email ?? "";

                // スキル情報を読み込み
                if (App.ApiService != null)
                {
                    try
                    {
                        var userSkills = await App.ApiService.GetUserSkillsAsync(App.CurrentUser.UserId);
                        _skills.Clear();
                        foreach (var us in userSkills)
                            _skills.Add(us);
                    }
                    catch(Exception ex)
                    {
                        Logger.Warn($"スキル情報の取得に失敗: {ex.Message}");
                    }
                }

                Logger.Info("ユーザープロフィールを読み込みました。");
            }
            catch (Exception ex)
            {
                Logger.Error($"プロフィールの読み込み中にエラーが発生しました: {ex.Message}");
            }
        }

        /// <summary>
        /// スキルを追加します。
        /// </summary>
        private async void AddSkill_Click(object sender, RoutedEventArgs e)
        {
            var skillName = SkillNameComboBox.Text?.Trim();
            if (string.IsNullOrEmpty(skillName)) return;
            var skillLevel = SkillLevelComboBox.SelectedIndex + 1;
            try
            {
                var newSkill = new UserSkill { UserId = App.CurrentUser.UserId, SkillName = skillName, SkillLevel = skillLevel };
                await App.ApiService.UpsertUserSkillAsync(newSkill);
                await ReloadUserSkills();
                SkillsListBox.SelectedItem = null;
            }
            catch(Exception ex) { Alert.Error($"スキル追加に失敗: {ex.Message}"); }
        }

        /// <summary>
        /// スキルを削除します。
        /// </summary>
        private async void DeleteSkill_Click(object sender, RoutedEventArgs e)
        {
            var button = sender as System.Windows.Controls.Button;
            if (button?.Tag is UserSkill us)
            {
                try
                {
                    await App.ApiService.DeleteUserSkillAsync(us.UserId, us.SkillName);
                    await ReloadUserSkills();
                    SkillsListBox.SelectedItem = null;
                }
                catch(Exception ex) { Alert.Error($"削除に失敗: {ex.Message}"); }
            }
        }

        private async Task ReloadUserSkills()
        {
            if (App.ApiService != null && App.CurrentUser != null)
            {
                var userSkills = await App.ApiService.GetUserSkillsAsync(App.CurrentUser.UserId);
                _skills.Clear();
                foreach (var us in userSkills)
                    _skills.Add(us);
            }
        }

        /// <summary>
        /// プロフィールを更新します。
        /// </summary>
        private async void UpdateProfile_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (App.CurrentUser == null)
                {
                    Alert.Error("ログインしていません。", "エラー");
                    return;
                }
                // ApiService経由でユーザー情報のみPUT
                if (App.ApiService != null)
                {
                    var updateData = new {
                        email = EmailTextBox.Text,
                        fullName = FullNameTextBox.Text,
                        role = App.CurrentUser.Role
                    };
                    await App.ApiService.UpdateUserAsync(App.CurrentUser.UserId, updateData);
                    App.CurrentUser.FullName = FullNameTextBox.Text;
                    App.CurrentUser.Email = EmailTextBox.Text;
                    Alert.Success("プロフィールを更新しました。", "成功");
                    Logger.Info("プロフィールを更新しました。");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"プロフィールの更新中にエラーが発生しました: {ex.Message}");
                Alert.Error("プロフィールの更新に失敗しました。", "エラー");
            }
        }

        /// <summary>
        /// スキルリストの選択が変更された際の処理
        /// </summary>
        private void SkillsListBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            if (SkillsListBox.SelectedItem is UserSkill selectedSkill)
            {
                // 編集モード
                SkillNameComboBox.Text = selectedSkill.SkillName;
                SkillLevelComboBox.SelectedIndex = selectedSkill.SkillLevel - 1;
                AddSkillButton.Content = "更新";
                SkillNameComboBox.IsEnabled = false; // スキル名は変更不可とする
                ClearSkillSelectionButton.Visibility = Visibility.Visible;
            }
            else
            {
                // 追加モード
                SkillNameComboBox.Text = "";
                SkillLevelComboBox.SelectedIndex = 4; // デフォルト「実務経験」
                AddSkillButton.Content = "追加";
                SkillNameComboBox.IsEnabled = true;
                ClearSkillSelectionButton.Visibility = Visibility.Collapsed;
            }
        }

        /// <summary>
        /// スキル選択解除ボタンのクリック処理
        /// </summary>
        private void ClearSkillSelectionButton_Click(object sender, RoutedEventArgs e)
        {
            SkillsListBox.SelectedItem = null;
        }

        /// <summary>
        /// VCSフォルダを参照します。
        /// </summary>
        private void BrowseVcsFolder_Click(object sender, RoutedEventArgs e)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                dialog.Description = "バージョン管理リポジトリのローカルパスを選択してください";
                dialog.ShowNewFolderButton = true;

                if (!string.IsNullOrEmpty(VcsLocalPathTextBox.Text) && Directory.Exists(VcsLocalPathTextBox.Text))
                {
                    dialog.SelectedPath = VcsLocalPathTextBox.Text;
                }

                if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                {
                    VcsLocalPathTextBox.Text = dialog.SelectedPath;

                    // リポジトリタイプを自動検出
                    if (GitService.IsGitRepository(dialog.SelectedPath))
                    {
                        VcsTypeComboBox.SelectedIndex = 0; // Git
                        VcsStatusTextBlock.Text = "✓ Gitリポジトリを検出しました";
                        VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.LightGreen;
                    }
                    else if (SvnService.IsSvnRepository(dialog.SelectedPath))
                    {
                        VcsTypeComboBox.SelectedIndex = 1; // SVN
                        VcsStatusTextBlock.Text = "✓ SVNリポジトリを検出しました";
                        VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.LightGreen;
                    }
                    else
                    {
                        VcsStatusTextBlock.Text = "ℹ️ バージョン管理リポジトリではありません";
                        VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.Orange;
                    }
                }
            }
        }

        /// <summary>
        /// VCS接続をテストします。
        /// </summary>
        private void TestVcsConnection_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                VcsStatusTextBlock.Text = "接続テスト中...";
                VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.Orange;

                var vcsType = VcsTypeComboBox.SelectedIndex;
                var localPath = VcsLocalPathTextBox.Text;

                if (string.IsNullOrEmpty(localPath) || !Directory.Exists(localPath))
                {
                    VcsStatusTextBlock.Text = "✗ ローカルパスが無効です";
                    VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                    return;
                }

                if (vcsType == 0) // Git
                {
                    if (GitService.IsGitRepository(localPath))
                    {
                        var gitService = new GitService(localPath);
                        var branch = gitService.GetCurrentBranch();
                        VcsStatusTextBlock.Text = $"✓ Git接続成功 - ブランチ: {branch}";
                        VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.LightGreen;
                        Logger.Info($"Git接続テスト成功: {localPath}");
                    }
                    else
                    {
                        VcsStatusTextBlock.Text = "✗ Gitリポジトリではありません";
                        VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                    }
                }
                else if (vcsType == 1) // SVN
                {
                    if (SvnService.IsSvnRepository(localPath))
                    {
                        var svnService = new SvnService(localPath, VcsUsernameTextBox.Text, VcsPasswordBox.Password);
                        var info = svnService.GetRepositoryInfo();
                        if (info != null)
                        {
                            VcsStatusTextBlock.Text = $"✓ SVN接続成功 - リビジョン: {info.Revision}";
                            VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.LightGreen;
                            Logger.Info($"SVN接続テスト成功: {localPath}");
                        }
                        else
                        {
                            VcsStatusTextBlock.Text = "✗ SVN情報の取得に失敗しました";
                            VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                        }
                    }
                    else
                    {
                        VcsStatusTextBlock.Text = "✗ SVNリポジトリではありません";
                        VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                    }
                }
                else
                {
                    VcsStatusTextBlock.Text = "バージョン管理システムが選択されていません";
                    VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.Orange;
                }
            }
            catch (Exception ex)
            {
                VcsStatusTextBlock.Text = "✗ 接続失敗: " + ex.Message;
                VcsStatusTextBlock.Foreground = System.Windows.Media.Brushes.Red;
                Logger.Error($"VCS接続テスト失敗: {ex.Message}");
            }
        }

        /// <summary>
        /// VCSタイプ選択が変更された際の処理
        /// </summary>
        private void VcsTypeComboBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            if (VcsAuthenticationLabel == null) return; // 初期化前は無視

            // SVN選択時のみ認証情報を表示
            var isSvn = VcsTypeComboBox.SelectedIndex == 1;
            VcsAuthenticationLabel.Visibility = isSvn ? Visibility.Visible : Visibility.Collapsed;
            VcsUsernameLabel.Visibility = isSvn ? Visibility.Visible : Visibility.Collapsed;
            VcsUsernameTextBox.Visibility = isSvn ? Visibility.Visible : Visibility.Collapsed;
            VcsPasswordLabel.Visibility = isSvn ? Visibility.Visible : Visibility.Collapsed;
            VcsPasswordBox.Visibility = isSvn ? Visibility.Visible : Visibility.Collapsed;
        }
    }

    /// <summary>
    /// 休暇情報を表示するためのアイテムクラスです。
    /// </summary>
    public class VacationItem
    {
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }

        public string DisplayText => $"{StartDate:yyyy/MM/dd} ~ {EndDate:yyyy/MM/dd}";
    }

    /// <summary>
    /// スキル情報を表示するためのアイテムクラスです。
    /// </summary>
    public class SkillItem
    {
        public string Name { get; set; }
        public int Level { get; set; }

        public string LevelText => $"{Level} / 10";
        public double LevelPercentage => Level * 10.0; // 0-100のパーセンテージ
    }
}