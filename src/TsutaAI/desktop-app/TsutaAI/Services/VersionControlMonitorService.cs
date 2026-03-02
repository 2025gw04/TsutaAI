using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Timers;
using TsutaAI.Config;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// バージョン管理システム（Git/SVN）の変更を監視し、作業内容として認識するサービスです。
    /// </summary>
    public class VersionControlMonitorService
    {
        #region フィールド

        private readonly Timer _monitorTimer;
        private readonly VersionControlSettings _settings;
        private GitService _gitService;
        private SvnService _svnService;
        private DateTime _lastCheckTime;
        private List<VcsCommitRecord> _recentCommits;

        #endregion

        #region イベント

        /// <summary>
        /// 新しいコミットが検出されたときに発生します。
        /// </summary>
        public event EventHandler<VcsCommitDetectedEventArgs> CommitDetected;

        /// <summary>
        /// ファイル変更が検出されたときに発生します。
        /// </summary>
        public event EventHandler<VcsChangeDetectedEventArgs> ChangeDetected;

        #endregion

        #region コンストラクター

        /// <summary>
        /// 新しい VersionControlMonitorService を初期化します。
        /// </summary>
        /// <param name="settings">バージョン管理設定</param>
        public VersionControlMonitorService(VersionControlSettings settings)
        {
            _settings = settings ?? throw new ArgumentNullException(nameof(settings));
            _recentCommits = new List<VcsCommitRecord>();
            _lastCheckTime = DateTime.Now;

            // 監視タイマーの設定（5分ごと）
            _monitorTimer = new Timer(5 * 60 * 1000); // 5分
            _monitorTimer.Elapsed += OnMonitorTimerElapsed;

            InitializeVcsService();
        }

        #endregion

        #region パブリックメソッド

        /// <summary>
        /// 監視を開始します。
        /// </summary>
        public void Start()
        {
            if (!_settings.EnableMonitoring)
            {
                Logger.Info("バージョン管理の監視は無効になっています。");
                return;
            }

            if (string.IsNullOrEmpty(_settings.LocalPath) || !Directory.Exists(_settings.LocalPath))
            {
                Logger.Warn("バージョン管理のローカルパスが無効です。");
                return;
            }

            _monitorTimer.Start();
            Logger.Info($"バージョン管理監視を開始しました: {_settings.Type} - {_settings.LocalPath}");

            // 初回チェック
            CheckForChanges();
        }

        /// <summary>
        /// 監視を停止します。
        /// </summary>
        public void Stop()
        {
            _monitorTimer.Stop();
            Logger.Info("バージョン管理監視を停止しました。");
        }

        /// <summary>
        /// 本日の作業サマリーを取得します。
        /// </summary>
        public string GetTodayWorkSummary()
        {
            if (_settings.Type?.ToLower() == "git" && _gitService != null)
            {
                return _gitService.GenerateTodayWorkSummary();
            }
            else if (_settings.Type?.ToLower() == "svn" && _svnService != null)
            {
                return _svnService.GenerateTodayWorkSummary();
            }

            return "バージョン管理システムが設定されていません。";
        }

        /// <summary>
        /// 最近のコミット一覧を取得します。
        /// </summary>
        public List<VcsCommitRecord> GetRecentCommits()
        {
            return _recentCommits.ToList();
        }

        #endregion

        #region プライベートメソッド

        /// <summary>
        /// VCSサービスを初期化します。
        /// </summary>
        private void InitializeVcsService()
        {
            if (string.IsNullOrEmpty(_settings.LocalPath) || !Directory.Exists(_settings.LocalPath))
            {
                return;
            }

            try
            {
                if (_settings.Type?.ToLower() == "git")
                {
                    _gitService = new GitService(_settings.LocalPath);
                    Logger.Info("Gitサービスを初期化しました。");
                }
                else if (_settings.Type?.ToLower() == "svn")
                {
                    _svnService = new SvnService(_settings.LocalPath, _settings.Username, _settings.Password);
                    Logger.Info("SVNサービスを初期化しました。");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"VCSサービスの初期化に失敗しました: {ex.Message}");
            }
        }

        /// <summary>
        /// 監視タイマーのイベントハンドラー。
        /// </summary>
        private void OnMonitorTimerElapsed(object sender, ElapsedEventArgs e)
        {
            CheckForChanges();
        }

        /// <summary>
        /// 変更をチェックします。
        /// </summary>
        private void CheckForChanges()
        {
            try
            {
                if (_settings.Type?.ToLower() == "git" && _gitService != null)
                {
                    CheckGitChanges();
                }
                else if (_settings.Type?.ToLower() == "svn" && _svnService != null)
                {
                    CheckSvnChanges();
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"バージョン管理の変更チェック中にエラーが発生しました: {ex.Message}");
            }
        }

        /// <summary>
        /// Gitの変更をチェックします。
        /// </summary>
        private void CheckGitChanges()
        {
            // 新しいコミットをチェック
            var commits = _gitService.GetCommitsSince(_lastCheckTime);
            
            foreach (var commit in commits)
            {
                var record = new VcsCommitRecord
                {
                    Type = "Git",
                    Hash = commit.Hash,
                    Author = commit.AuthorName,
                    Date = commit.Date,
                    Message = commit.Message,
                    ChangedFiles = _gitService.GetChangedFiles(commit.Hash)
                };

                _recentCommits.Add(record);
                
                // イベントを発火
                if (_settings.AutoRecognizeCommits)
                {
                    CommitDetected?.Invoke(this, new VcsCommitDetectedEventArgs(record));
                }

                Logger.Info($"新しいGitコミットを検出: {commit.Hash.Substring(0, 7)} - {commit.Message}");
            }

            // ステータスをチェック
            var status = _gitService.GetStatus();
            if (!status.IsClean)
            {
                var changeInfo = new VcsChangeInfo
                {
                    Type = "Git",
                    ModifiedFiles = status.ModifiedFiles,
                    AddedFiles = new List<string>(),
                    DeletedFiles = new List<string>(),
                    UntrackedFiles = status.UntrackedFiles
                };

                ChangeDetected?.Invoke(this, new VcsChangeDetectedEventArgs(changeInfo));
            }

            _lastCheckTime = DateTime.Now;
        }

        /// <summary>
        /// SVNの変更をチェックします。
        /// </summary>
        private void CheckSvnChanges()
        {
            // 新しいコミットをチェック
            var commits = _svnService.GetCommitsSince(_lastCheckTime);
            
            foreach (var commit in commits)
            {
                var record = new VcsCommitRecord
                {
                    Type = "SVN",
                    Hash = $"r{commit.Revision}",
                    Author = commit.Author,
                    Date = commit.Date,
                    Message = commit.Message,
                    ChangedFiles = new List<string>()
                };

                _recentCommits.Add(record);
                
                // イベントを発火
                if (_settings.AutoRecognizeCommits)
                {
                    CommitDetected?.Invoke(this, new VcsCommitDetectedEventArgs(record));
                }

                Logger.Info($"新しいSVNコミットを検出: r{commit.Revision} - {commit.Message}");
            }

            // ステータスをチェック
            var status = _svnService.GetStatus();
            if (!status.IsClean)
            {
                var changeInfo = new VcsChangeInfo
                {
                    Type = "SVN",
                    ModifiedFiles = status.ModifiedFiles,
                    AddedFiles = status.AddedFiles,
                    DeletedFiles = status.DeletedFiles,
                    UntrackedFiles = new List<string>()
                };

                ChangeDetected?.Invoke(this, new VcsChangeDetectedEventArgs(changeInfo));
            }

            _lastCheckTime = DateTime.Now;
        }

        #endregion

        #region IDisposable

        /// <summary>
        /// リソースを解放します。
        /// </summary>
        public void Dispose()
        {
            _monitorTimer?.Stop();
            _monitorTimer?.Dispose();
        }

        #endregion
    }

    #region イベント引数クラス

    /// <summary>
    /// コミット検出イベントの引数です。
    /// </summary>
    public class VcsCommitDetectedEventArgs : EventArgs
    {
        public VcsCommitRecord Commit { get; }

        public VcsCommitDetectedEventArgs(VcsCommitRecord commit)
        {
            Commit = commit;
        }
    }

    /// <summary>
    /// 変更検出イベントの引数です。
    /// </summary>
    public class VcsChangeDetectedEventArgs : EventArgs
    {
        public VcsChangeInfo ChangeInfo { get; }

        public VcsChangeDetectedEventArgs(VcsChangeInfo changeInfo)
        {
            ChangeInfo = changeInfo;
        }
    }

    #endregion

    #region データクラス

    /// <summary>
    /// VCSコミット記録を表すクラスです。
    /// </summary>
    public class VcsCommitRecord
    {
        /// <summary>
        /// VCSの種類（Git/SVN）
        /// </summary>
        public string Type { get; set; }

        /// <summary>
        /// コミットハッシュまたはリビジョン番号
        /// </summary>
        public string Hash { get; set; }

        /// <summary>
        /// 作成者
        /// </summary>
        public string Author { get; set; }

        /// <summary>
        /// コミット日時
        /// </summary>
        public DateTime Date { get; set; }

        /// <summary>
        /// コミットメッセージ
        /// </summary>
        public string Message { get; set; }

        /// <summary>
        /// 変更されたファイル一覧
        /// </summary>
        public List<string> ChangedFiles { get; set; }

        /// <summary>
        /// 作業内容として認識済みかどうか
        /// </summary>
        public bool IsRecognized { get; set; }
    }

    /// <summary>
    /// VCS変更情報を表すクラスです。
    /// </summary>
    public class VcsChangeInfo
    {
        /// <summary>
        /// VCSの種類（Git/SVN）
        /// </summary>
        public string Type { get; set; }

        /// <summary>
        /// 変更されたファイル一覧
        /// </summary>
        public List<string> ModifiedFiles { get; set; }

        /// <summary>
        /// 追加されたファイル一覧
        /// </summary>
        public List<string> AddedFiles { get; set; }

        /// <summary>
        /// 削除されたファイル一覧
        /// </summary>
        public List<string> DeletedFiles { get; set; }

        /// <summary>
        /// 未追跡のファイル一覧
        /// </summary>
        public List<string> UntrackedFiles { get; set; }
    }

    #endregion
}
