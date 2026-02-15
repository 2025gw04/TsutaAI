using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// 指定フォルダのバックアップを管理するサービスです。
    /// 1日1回、監視対象フォルダの内容を確認フォルダにコピーします。
    /// </summary>
    public class FolderBackupService
    {
        private readonly string _backupBasePath;
        private readonly string _lastBackupDateFile;

        /// <summary>
        /// FolderBackupServiceを初期化します。
        /// </summary>
        public FolderBackupService()
        {
            var userName = Environment.UserName;
            _backupBasePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TsutaAI",
                "Monitor"
            );
            _lastBackupDateFile = Path.Combine(_backupBasePath, "last_backup.txt");

            // バックアップディレクトリが存在しない場合は作成
            if (!Directory.Exists(_backupBasePath))
            {
                Directory.CreateDirectory(_backupBasePath);
            }
        }

        /// <summary>
        /// 本日のバックアップが必要かどうかを確認します。
        /// </summary>
        /// <returns>バックアップが必要な場合はtrue</returns>
        public bool ShouldBackupToday()
        {
            if (!File.Exists(_lastBackupDateFile))
            {
                return true;
            }

            try
            {
                var lastBackupDateStr = File.ReadAllText(_lastBackupDateFile).Trim();
                if (DateTime.TryParse(lastBackupDateStr, out DateTime lastBackupDate))
                {
                    // 最終バックアップ日と今日の日付を比較
                    return lastBackupDate.Date < DateTime.Now.Date;
                }
            }
            catch (Exception ex)
            {
                Logger.Warn($"最終バックアップ日の読み込みに失敗: {ex.Message}");
            }

            return true;
        }

        /// <summary>
        /// 指定フォルダを確認フォルダにバックアップします。
        /// </summary>
        /// <param name="sourceFolderPath">バックアップ元のフォルダパス</param>
        /// <param name="folderName">バックアップ先のフォルダ名（例: "AAA"）</param>
        /// <returns>バックアップが成功した場合はtrue</returns>
        public bool BackupFolder(string sourceFolderPath, string folderName = "AAA")
        {
            if (string.IsNullOrWhiteSpace(sourceFolderPath) || !Directory.Exists(sourceFolderPath))
            {
                Logger.Warn($"バックアップ元フォルダが存在しません: {sourceFolderPath}");
                return false;
            }

            try
            {
                var backupFolderPath = Path.Combine(_backupBasePath, folderName);

                // 既存のバックアップフォルダを削除
                if (Directory.Exists(backupFolderPath))
                {
                    Directory.Delete(backupFolderPath, true);
                }

                // 新しいバックアップフォルダを作成
                Directory.CreateDirectory(backupFolderPath);

                // ファイルとフォルダを再帰的にコピー
                CopyDirectory(sourceFolderPath, backupFolderPath);

                // 最終バックアップ日を記録
                File.WriteAllText(_lastBackupDateFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));

                Logger.Info($"フォルダバックアップ完了: {sourceFolderPath} -> {backupFolderPath}");
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error($"フォルダバックアップエラー: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// バックアップフォルダのパスを取得します。
        /// </summary>
        /// <param name="folderName">バックアップフォルダ名</param>
        /// <returns>バックアップフォルダのフルパス</returns>
        public string GetBackupFolderPath(string folderName = "AAA")
        {
            return Path.Combine(_backupBasePath, folderName);
        }

        /// <summary>
        /// バックアップフォルダと現在のフォルダを比較して、変更されたファイルのパスを取得します。
        /// </summary>
        /// <param name="currentFolderPath">現在の監視対象フォルダパス</param>
        /// <param name="folderName">バックアップフォルダ名</param>
        /// <returns>変更されたファイルのパスリスト</returns>
        public List<string> GetChangedFilesSinceBackup(string currentFolderPath, string folderName = "AAA")
        {
            var changedFiles = new List<string>();
            var backupFolderPath = GetBackupFolderPath(folderName);

            if (!Directory.Exists(backupFolderPath))
            {
                Logger.Warn($"バックアップフォルダが存在しません: {backupFolderPath}");
                return changedFiles;
            }

            if (!Directory.Exists(currentFolderPath))
            {
                Logger.Warn($"現在のフォルダが存在しません: {currentFolderPath}");
                return changedFiles;
            }

            try
            {
                // 現在のフォルダ内のすべてのファイルを取得
                var currentFiles = Directory.GetFiles(currentFolderPath, "*.*", SearchOption.AllDirectories);

                foreach (var currentFile in currentFiles)
                {
                    // 一時ファイルや隠しファイルをスキップ
                    var fileName = Path.GetFileName(currentFile);
                    if (fileName.StartsWith("~") || fileName.StartsWith("."))
                        continue;

                    // バックアップフォルダ内の対応するファイルパスを計算
                    var relativePath = currentFile.Substring(currentFolderPath.Length).TrimStart(Path.DirectorySeparatorChar);
                    var backupFile = Path.Combine(backupFolderPath, relativePath);

                    // ファイルが新規作成されたか、または変更されたかをチェック
                    if (!File.Exists(backupFile))
                    {
                        // 新規ファイル
                        changedFiles.Add(currentFile);
                    }
                    else
                    {
                        // ファイルの最終更新日時またはサイズが異なる場合は変更されたとみなす
                        var currentFileInfo = new FileInfo(currentFile);
                        var backupFileInfo = new FileInfo(backupFile);

                        if (currentFileInfo.LastWriteTime > backupFileInfo.LastWriteTime ||
                            currentFileInfo.Length != backupFileInfo.Length)
                        {
                            changedFiles.Add(currentFile);
                        }
                    }
                }

                Logger.Info($"バックアップとの比較完了: {changedFiles.Count}個のファイルが変更されています");
            }
            catch (Exception ex)
            {
                Logger.Error($"バックアップ比較エラー: {ex.Message}");
            }

            return changedFiles;
        }

        /// <summary>
        /// ディレクトリを再帰的にコピーします。
        /// </summary>
        private void CopyDirectory(string sourceDir, string destDir)
        {
            // ソースディレクトリ内のすべてのファイルをコピー
            foreach (var file in Directory.GetFiles(sourceDir))
            {
                var fileName = Path.GetFileName(file);
                
                // 一時ファイルや隠しファイルをスキップ
                if (fileName.StartsWith("~") || fileName.StartsWith("."))
                    continue;

                var destFile = Path.Combine(destDir, fileName);
                try
                {
                    File.Copy(file, destFile, true);
                }
                catch (Exception ex)
                {
                    Logger.Warn($"ファイルコピー失敗: {file} -> {destFile}, {ex.Message}");
                }
            }

            // サブディレクトリを再帰的にコピー
            foreach (var directory in Directory.GetDirectories(sourceDir))
            {
                var dirName = Path.GetFileName(directory);
                
                // 隠しディレクトリをスキップ
                if (dirName.StartsWith("."))
                    continue;

                var destSubDir = Path.Combine(destDir, dirName);
                Directory.CreateDirectory(destSubDir);
                CopyDirectory(directory, destSubDir);
            }
        }

        /// <summary>
        /// バックアップフォルダ内の対応するファイルの内容を取得します。
        /// </summary>
        /// <param name="currentFilePath">現在のファイルパス</param>
        /// <param name="sourceFolderPath">監視対象フォルダのルートパス</param>
        /// <param name="folderName">バックアップフォルダ名</param>
        /// <returns>バックアップファイルの内容（存在しない場合はnull）</returns>
        public string GetBackupFileContent(string currentFilePath, string sourceFolderPath, string folderName = "AAA")
        {
            try
            {
                var backupFolderPath = GetBackupFolderPath(folderName);
                var relativePath = currentFilePath.Substring(sourceFolderPath.Length).TrimStart(Path.DirectorySeparatorChar);
                var backupFilePath = Path.Combine(backupFolderPath, relativePath);

                if (File.Exists(backupFilePath))
                {
                    return File.ReadAllText(backupFilePath);
                }
            }
            catch (Exception ex)
            {
                Logger.Warn($"バックアップファイル読み込みエラー: {currentFilePath}, {ex.Message}");
            }

            return null;
        }
    }
}
