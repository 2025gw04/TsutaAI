using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace TsutaAI.Services
{
    /// <summary>
    /// 作業フォルダのファイル変更を監視するサービスです。
    /// </summary>
    public class FileChangeMonitorService : IDisposable
    {
        #region フィールド

        private FileSystemWatcher _watcher;
        private readonly List<FileChangeInfo> _changes = new List<FileChangeInfo>();
        private readonly object _lockObject = new object();
        private bool _isMonitoring = false;

        #endregion

        #region イベント

        /// <summary>
        /// ファイルが変更されたときに発生します。
        /// </summary>
        public event EventHandler<FileChangeEventArgs> FileChanged;

        #endregion

        #region プロパティ

        /// <summary>
        /// 監視が有効かどうかを取得します。
        /// </summary>
        public bool IsMonitoring => _isMonitoring;

        /// <summary>
        /// 監視中のフォルダパスを取得します。
        /// </summary>
        public string MonitoringPath { get; private set; }

        #endregion

        #region パブリックメソッド

        /// <summary>
        /// 指定されたフォルダの監視を開始します。
        /// </summary>
        /// <param name="folderPath">監視するフォルダのパス</param>
        public void Start(string folderPath)
        {
            if (_isMonitoring)
            {
                Stop();
            }

            if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
            {
                throw new ArgumentException($"無効なフォルダパスです: {folderPath}");
            }

            MonitoringPath = folderPath;

            _watcher = new FileSystemWatcher
            {
                Path = folderPath,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite | NotifyFilters.Size,
                Filter = "*.*",
                IncludeSubdirectories = true,
                EnableRaisingEvents = true
            };

            _watcher.Changed += OnFileChanged;
            _watcher.Created += OnFileCreated;
            _watcher.Deleted += OnFileDeleted;
            _watcher.Renamed += OnFileRenamed;

            _isMonitoring = true;
        }

        /// <summary>
        /// 監視を停止します。
        /// </summary>
        public void Stop()
        {
            if (!_isMonitoring)
                return;

            if (_watcher != null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Changed -= OnFileChanged;
                _watcher.Created -= OnFileCreated;
                _watcher.Deleted -= OnFileDeleted;
                _watcher.Renamed -= OnFileRenamed;
                _watcher.Dispose();
                _watcher = null;
            }

            _isMonitoring = false;
        }

        /// <summary>
        /// 記録された変更履歴を取得します。
        /// </summary>
        public List<FileChangeInfo> GetChanges()
        {
            lock (_lockObject)
            {
                return new List<FileChangeInfo>(_changes);
            }
        }

        /// <summary>
        /// 変更履歴をクリアします。
        /// </summary>
        public void ClearChanges()
        {
            lock (_lockObject)
            {
                _changes.Clear();
            }
        }

        /// <summary>
        /// 変更されたファイルの要約を取得します。
        /// </summary>
        public FileChangeSummary GetSummary()
        {
            lock (_lockObject)
            {
                return new FileChangeSummary
                {
                    TotalChanges = _changes.Count,
                    ModifiedCount = _changes.Count(c => c.ChangeType == WatcherChangeTypes.Changed),
                    CreatedCount = _changes.Count(c => c.ChangeType == WatcherChangeTypes.Created),
                    DeletedCount = _changes.Count(c => c.ChangeType == WatcherChangeTypes.Deleted),
                    RenamedCount = _changes.Count(c => c.ChangeType == WatcherChangeTypes.Renamed),
                    FileExtensions = _changes
                        .Where(c => !string.IsNullOrEmpty(Path.GetExtension(c.FilePath)))
                        .GroupBy(c => Path.GetExtension(c.FilePath).ToLower())
                        .Select(g => new FileExtensionCount
                        {
                            Extension = g.Key,
                            Count = g.Count()
                        })
                        .OrderByDescending(x => x.Count)
                        .ToList()
                };
            }
        }

        #endregion

        #region プライベートメソッド

        /// <summary>
        /// ファイル変更イベントのハンドラーです。
        /// </summary>
        private void OnFileChanged(object sender, FileSystemEventArgs e)
        {
            AddChange(e.FullPath, WatcherChangeTypes.Changed);
        }

        /// <summary>
        /// ファイル作成イベントのハンドラーです。
        /// </summary>
        private void OnFileCreated(object sender, FileSystemEventArgs e)
        {
            AddChange(e.FullPath, WatcherChangeTypes.Created);
        }

        /// <summary>
        /// ファイル削除イベントのハンドラーです。
        /// </summary>
        private void OnFileDeleted(object sender, FileSystemEventArgs e)
        {
            AddChange(e.FullPath, WatcherChangeTypes.Deleted);
        }

        /// <summary>
        /// ファイル名変更イベントのハンドラーです。
        /// </summary>
        private void OnFileRenamed(object sender, RenamedEventArgs e)
        {
            AddChange(e.FullPath, WatcherChangeTypes.Renamed, e.OldFullPath);
        }

        /// <summary>
        /// 変更情報を追加します。
        /// </summary>
        private void AddChange(string filePath, WatcherChangeTypes changeType, string oldPath = null)
        {
            // 一時ファイルや隠しファイルは除外
            var fileName = Path.GetFileName(filePath);
            if (fileName.StartsWith("~") || fileName.StartsWith("."))
                return;

            var changeInfo = new FileChangeInfo
            {
                FilePath = filePath,
                ChangeType = changeType,
                Timestamp = DateTime.Now,
                OldPath = oldPath
            };

            lock (_lockObject)
            {
                _changes.Add(changeInfo);
            }

            // イベントを発生
            FileChanged?.Invoke(this, new FileChangeEventArgs { ChangeInfo = changeInfo });
        }

        #endregion

        #region IDisposable 実装

        /// <summary>
        /// リソースを解放します。
        /// </summary>
        public void Dispose()
        {
            Stop();
        }

        #endregion
    }

    #region データクラス

    /// <summary>
    /// ファイル変更情報を表すクラスです。
    /// </summary>
    public class FileChangeInfo
    {
        /// <summary>
        /// ファイルパスを取得または設定します。
        /// </summary>
        public string FilePath { get; set; }

        /// <summary>
        /// 変更タイプを取得または設定します。
        /// </summary>
        public WatcherChangeTypes ChangeType { get; set; }

        /// <summary>
        /// タイムスタンプを取得または設定します。
        /// </summary>
        public DateTime Timestamp { get; set; }

        /// <summary>
        /// 旧パス（リネームの場合）を取得または設定します。
        /// </summary>
        public string OldPath { get; set; }
    }

    /// <summary>
    /// ファイル変更イベントの引数です。
    /// </summary>
    public class FileChangeEventArgs : EventArgs
    {
        /// <summary>
        /// 変更情報を取得または設定します。
        /// </summary>
        public FileChangeInfo ChangeInfo { get; set; }
    }

    /// <summary>
    /// ファイル変更の要約情報を表すクラスです。
    /// </summary>
    public class FileChangeSummary
    {
        /// <summary>
        /// 総変更数を取得または設定します。
        /// </summary>
        public int TotalChanges { get; set; }

        /// <summary>
        /// 変更されたファイル数を取得または設定します。
        /// </summary>
        public int ModifiedCount { get; set; }

        /// <summary>
        /// 作成されたファイル数を取得または設定します。
        /// </summary>
        public int CreatedCount { get; set; }

        /// <summary>
        /// 削除されたファイル数を取得または設定します。
        /// </summary>
        public int DeletedCount { get; set; }

        /// <summary>
        /// 名前変更されたファイル数を取得または設定します。
        /// </summary>
        public int RenamedCount { get; set; }

        /// <summary>
        /// ファイル拡張子ごとの変更数を取得または設定します。
        /// </summary>
        public List<FileExtensionCount> FileExtensions { get; set; }
    }

    /// <summary>
    /// ファイル拡張子ごとの変更数を表すクラスです。
    /// </summary>
    public class FileExtensionCount
    {
        /// <summary>
        /// ファイル拡張子を取得または設定します。
        /// </summary>
        public string Extension { get; set; }

        /// <summary>
        /// 変更数を取得または設定します。
        /// </summary>
        public int Count { get; set; }
    }

    #endregion
}
