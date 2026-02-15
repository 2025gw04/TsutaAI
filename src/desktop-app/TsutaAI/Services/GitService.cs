using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// Gitリポジトリの情報を取得するサービスです。
    /// </summary>
    public class GitService
    {
        #region フィールド

        private readonly string _repositoryPath;

        #endregion

        #region コンストラクター

        /// <summary>
        /// 新しい GitService を初期化します。
        /// </summary>
        /// <param name="repositoryPath">Gitリポジトリのパス</param>
        public GitService(string repositoryPath)
        {
            if (string.IsNullOrWhiteSpace(repositoryPath))
            {
                throw new ArgumentNullException(nameof(repositoryPath));
            }

            _repositoryPath = repositoryPath;
        }

        #endregion

        #region パブリックメソッド

        /// <summary>
        /// 指定されたパスがGitリポジトリかどうかを確認します。
        /// </summary>
        public static bool IsGitRepository(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
            {
                return false;
            }

            // .gitフォルダの存在を確認
            var gitDir = Path.Combine(path, ".git");
            if (Directory.Exists(gitDir))
            {
                return true;
            }

            // 親ディレクトリを再帰的に確認
            var parentDir = Directory.GetParent(path);
            if (parentDir != null)
            {
                return IsGitRepository(parentDir.FullName);
            }

            return false;
        }

        /// <summary>
        /// 現在のブランチ名を取得します。
        /// </summary>
        public string GetCurrentBranch()
        {
            var result = ExecuteGitCommand("rev-parse --abbrev-ref HEAD");
            return result?.Trim();
        }

        /// <summary>
        /// 本日のコミット一覧を取得します。
        /// </summary>
        public List<GitCommitInfo> GetTodayCommits()
        {
            var today = DateTime.Now.Date;
            var since = today.ToString("yyyy-MM-dd");

            // ログの取得（フォーマット: %H|%an|%ae|%ad|%s）
            var result = ExecuteGitCommand($"log --since=\"{since} 00:00:00\" --pretty=format:\"%H|%an|%ae|%ad|%s\" --date=iso");

            if (string.IsNullOrWhiteSpace(result))
            {
                return new List<GitCommitInfo>();
            }

            var commits = new List<GitCommitInfo>();
            var lines = result.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var line in lines)
            {
                var parts = line.Split('|');
                if (parts.Length >= 5)
                {
                    commits.Add(new GitCommitInfo
                    {
                        Hash = parts[0],
                        AuthorName = parts[1],
                        AuthorEmail = parts[2],
                        Date = ParseGitDate(parts[3]),
                        Message = parts[4]
                    });
                }
            }

            return commits;
        }

        /// <summary>
        /// 指定された期間のコミット一覧を取得します。
        /// </summary>
        public List<GitCommitInfo> GetCommitsSince(DateTime since)
        {
            var sinceStr = since.ToString("yyyy-MM-dd HH:mm:ss");

            // ログの取得（フォーマット: %H|%an|%ae|%ad|%s）
            var result = ExecuteGitCommand($"log --since=\"{sinceStr}\" --pretty=format:\"%H|%an|%ae|%ad|%s\" --date=iso");

            if (string.IsNullOrWhiteSpace(result))
            {
                return new List<GitCommitInfo>();
            }

            var commits = new List<GitCommitInfo>();
            var lines = result.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var line in lines)
            {
                var parts = line.Split('|');
                if (parts.Length >= 5)
                {
                    commits.Add(new GitCommitInfo
                    {
                        Hash = parts[0],
                        AuthorName = parts[1],
                        AuthorEmail = parts[2],
                        Date = ParseGitDate(parts[3]),
                        Message = parts[4]
                    });
                }
            }

            return commits;
        }

        /// <summary>
        /// 指定時刻以降のGit pushイベントを取得します。
        /// </summary>
        public List<GitPushInfo> GetPushEventsSince(DateTime since)
        {
            var sinceStr = since.ToString("yyyy-MM-dd HH:mm:ss");
            var result = ExecuteGitCommand($"reflog --date=iso --all --since=\"{sinceStr}\" --pretty=format:\"%gd|%cd|%gs\"");

            if (string.IsNullOrWhiteSpace(result))
            {
                return new List<GitPushInfo>();
            }

            var pushEvents = new List<GitPushInfo>();
            var lines = result.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var line in lines)
            {
                var parts = line.Split(new[] { '|' }, 3);
                if (parts.Length < 3)
                {
                    continue;
                }

                var reflogMessage = parts[2] ?? string.Empty;
                if (reflogMessage.IndexOf("push", StringComparison.OrdinalIgnoreCase) < 0)
                {
                    continue;
                }

                var reference = parts[0] ?? string.Empty;
                var date = ParseGitDate(parts[1]);
                var branch = reference;
                var refSplitIndex = reference.IndexOf("@{", StringComparison.Ordinal);
                if (refSplitIndex > 0)
                {
                    branch = reference.Substring(0, refSplitIndex);
                }

                pushEvents.Add(new GitPushInfo
                {
                    Date = date,
                    Branch = branch,
                    Message = reflogMessage
                });
            }

            return pushEvents
                .OrderBy(p => p.Date)
                .ToList();
        }

        /// <summary>
        /// 指定されたコミットの変更ファイル一覧を取得します。
        /// </summary>
        public List<string> GetChangedFiles(string commitHash)
        {
            var result = ExecuteGitCommand($"diff-tree --no-commit-id --name-only -r {commitHash}");

            if (string.IsNullOrWhiteSpace(result))
            {
                return new List<string>();
            }

            return result.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries).ToList();
        }

        /// <summary>
        /// 本日の変更ファイル一覧を取得します。
        /// </summary>
        public List<string> GetTodayChangedFiles()
        {
            var commits = GetTodayCommits();
            var files = new HashSet<string>();

            foreach (var commit in commits)
            {
                var changedFiles = GetChangedFiles(commit.Hash);
                foreach (var file in changedFiles)
                {
                    files.Add(file);
                }
            }

            return files.ToList();
        }

        /// <summary>
        /// 現在の変更状況（ステータス）を取得します。
        /// </summary>
        public GitStatus GetStatus()
        {
            var result = ExecuteGitCommand("status --porcelain");

            if (string.IsNullOrWhiteSpace(result))
            {
                return new GitStatus
                {
                    IsClean = true,
                    ModifiedFiles = new List<string>(),
                    UntrackedFiles = new List<string>()
                };
            }

            var modifiedFiles = new List<string>();
            var untrackedFiles = new List<string>();
            var lines = result.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var line in lines)
            {
                if (line.Length < 3)
                    continue;

                var status = line.Substring(0, 2);
                var fileName = line.Substring(3);

                if (status.Contains("?"))
                {
                    untrackedFiles.Add(fileName);
                }
                else
                {
                    modifiedFiles.Add(fileName);
                }
            }

            return new GitStatus
            {
                IsClean = modifiedFiles.Count == 0 && untrackedFiles.Count == 0,
                ModifiedFiles = modifiedFiles,
                UntrackedFiles = untrackedFiles
            };
        }

        /// <summary>
        /// 本日の作業サマリーを生成します。
        /// </summary>
        public string GenerateTodayWorkSummary()
        {
            var sb = new StringBuilder();
            var commits = GetTodayCommits();
            var changedFiles = GetTodayChangedFiles();

            sb.AppendLine("【本日のGit活動】");
            sb.AppendLine($"・コミット数: {commits.Count}件");
            sb.AppendLine($"・変更ファイル数: {changedFiles.Count}件");
            sb.AppendLine();

            if (commits.Count > 0)
            {
                sb.AppendLine("【コミット一覧】");
                foreach (var commit in commits)
                {
                    sb.AppendLine($"・{commit.Date:HH:mm} - {commit.Message}");
                }
                sb.AppendLine();
            }

            if (changedFiles.Count > 0)
            {
                sb.AppendLine("【変更ファイル】");
                var groupedFiles = changedFiles
                    .GroupBy(f => Path.GetExtension(f).ToLower())
                    .OrderByDescending(g => g.Count());

                foreach (var group in groupedFiles)
                {
                    var ext = string.IsNullOrEmpty(group.Key) ? "(拡張子なし)" : group.Key;
                    sb.AppendLine($"・{ext}: {group.Count()}件");
                }
            }

            return sb.ToString();
        }

        #endregion

        #region プライベートメソッド

        /// <summary>
        /// Gitコマンドを実行します。
        /// </summary>
        private string ExecuteGitCommand(string arguments)
        {
            try
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "git",
                        Arguments = arguments,
                        WorkingDirectory = _repositoryPath,
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true,
                        StandardOutputEncoding = Encoding.UTF8
                    }
                };

                process.Start();
                var output = process.StandardOutput.ReadToEnd();
                var error = process.StandardError.ReadToEnd();
                process.WaitForExit();

                if (process.ExitCode != 0)
                {
                    Logger.Warn($"Git command failed: {arguments}, Error: {error}");
                    return null;
                }

                return output;
            }
            catch (Exception ex)
            {
                Logger.Error($"Git command execution error: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Git日付文字列を解析します。
        /// </summary>
        private DateTime ParseGitDate(string dateStr)
        {
            if (DateTime.TryParse(dateStr, out DateTime result))
            {
                return result;
            }
            return DateTime.MinValue;
        }

        #endregion
    }

    #region データクラス

    /// <summary>
    /// Gitコミット情報を表すクラスです。
    /// </summary>
    public class GitCommitInfo
    {
        /// <summary>
        /// コミットハッシュを取得または設定します。
        /// </summary>
        public string Hash { get; set; }

        /// <summary>
        /// 作成者名を取得または設定します。
        /// </summary>
        public string AuthorName { get; set; }

        /// <summary>
        /// 作成者メールアドレスを取得または設定します。
        /// </summary>
        public string AuthorEmail { get; set; }

        /// <summary>
        /// コミット日時を取得または設定します。
        /// </summary>
        public DateTime Date { get; set; }

        /// <summary>
        /// コミットメッセージを取得または設定します。
        /// </summary>
        public string Message { get; set; }
    }

    /// <summary>
    /// Git状態情報を表すクラスです。
    /// </summary>
    public class GitStatus
    {
        /// <summary>
        /// 変更がないかどうかを取得または設定します。
        /// </summary>
        public bool IsClean { get; set; }

        /// <summary>
        /// 変更されたファイル一覧を取得または設定します。
        /// </summary>
        public List<string> ModifiedFiles { get; set; }

        /// <summary>
        /// 未追跡のファイル一覧を取得または設定します。
        /// </summary>
        public List<string> UntrackedFiles { get; set; }
    }

    /// <summary>
    /// Git push情報を表すクラスです。
    /// </summary>
    public class GitPushInfo
    {
        /// <summary>
        /// push日時を取得または設定します。
        /// </summary>
        public DateTime Date { get; set; }

        /// <summary>
        /// 対象ブランチを取得または設定します。
        /// </summary>
        public string Branch { get; set; }

        /// <summary>
        /// reflogメッセージを取得または設定します。
        /// </summary>
        public string Message { get; set; }
    }

    #endregion
}
