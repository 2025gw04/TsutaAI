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
    /// SVNリポジトリの情報を取得するサービスです。
    /// </summary>
    public class SvnService
    {
        #region フィールド

        private readonly string _repositoryPath;
        private readonly string _username;
        private readonly string _password;

        #endregion

        #region コンストラクター

        /// <summary>
        /// 新しい SvnService を初期化します。
        /// </summary>
        /// <param name="repositoryPath">SVNリポジトリのパス</param>
        /// <param name="username">認証用ユーザー名（オプション）</param>
        /// <param name="password">認証用パスワード（オプション）</param>
        public SvnService(string repositoryPath, string username = null, string password = null)
        {
            if (string.IsNullOrWhiteSpace(repositoryPath))
            {
                throw new ArgumentNullException(nameof(repositoryPath));
            }

            _repositoryPath = repositoryPath;
            _username = username;
            _password = password;
        }

        #endregion

        #region パブリックメソッド

        /// <summary>
        /// 指定されたパスがSVNリポジトリかどうかを確認します。
        /// </summary>
        public static bool IsSvnRepository(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
            {
                return false;
            }

            // .svnフォルダの存在を確認
            var svnDir = Path.Combine(path, ".svn");
            if (Directory.Exists(svnDir))
            {
                return true;
            }

            // 親ディレクトリを再帰的に確認
            var parentDir = Directory.GetParent(path);
            if (parentDir != null)
            {
                return IsSvnRepository(parentDir.FullName);
            }

            return false;
        }

        /// <summary>
        /// リポジトリの情報を取得します。
        /// </summary>
        public SvnInfo GetRepositoryInfo()
        {
            var result = ExecuteSvnCommand("info --xml");
            
            if (string.IsNullOrWhiteSpace(result))
            {
                return null;
            }

            // 簡易的なXML解析（本格的にはXmlDocumentを使用）
            var info = new SvnInfo();
            
            try
            {
                var urlMatch = System.Text.RegularExpressions.Regex.Match(result, @"<url>(.*?)</url>");
                if (urlMatch.Success)
                {
                    info.Url = urlMatch.Groups[1].Value;
                }

                var revisionMatch = System.Text.RegularExpressions.Regex.Match(result, @"revision=""(\d+)""");
                if (revisionMatch.Success)
                {
                    info.Revision = int.Parse(revisionMatch.Groups[1].Value);
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"SVN info parsing error: {ex.Message}");
            }

            return info;
        }

        /// <summary>
        /// 本日のコミット一覧を取得します。
        /// </summary>
        public List<SvnCommitInfo> GetTodayCommits()
        {
            var today = DateTime.Now.Date;
            var since = today.ToString("yyyy-MM-dd");

            // ログの取得
            var result = ExecuteSvnCommand($"log -r {{{since}}}:HEAD --xml");

            if (string.IsNullOrWhiteSpace(result))
            {
                return new List<SvnCommitInfo>();
            }

            return ParseSvnLog(result);
        }

        /// <summary>
        /// 指定された期間のコミット一覧を取得します。
        /// </summary>
        public List<SvnCommitInfo> GetCommitsSince(DateTime since)
        {
            var sinceStr = since.ToString("yyyy-MM-dd");

            // ログの取得
            var result = ExecuteSvnCommand($"log -r {{{sinceStr}}}:HEAD --xml");

            if (string.IsNullOrWhiteSpace(result))
            {
                return new List<SvnCommitInfo>();
            }

            return ParseSvnLog(result);
        }

        /// <summary>
        /// 現在の変更状況（ステータス）を取得します。
        /// </summary>
        public SvnStatus GetStatus()
        {
            var result = ExecuteSvnCommand("status");

            if (string.IsNullOrWhiteSpace(result))
            {
                return new SvnStatus
                {
                    IsClean = true,
                    ModifiedFiles = new List<string>(),
                    AddedFiles = new List<string>(),
                    DeletedFiles = new List<string>()
                };
            }

            var modifiedFiles = new List<string>();
            var addedFiles = new List<string>();
            var deletedFiles = new List<string>();
            var lines = result.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var line in lines)
            {
                if (line.Length < 2)
                    continue;

                var status = line[0];
                var fileName = line.Length > 7 ? line.Substring(7).Trim() : "";

                switch (status)
                {
                    case 'M': // Modified
                        modifiedFiles.Add(fileName);
                        break;
                    case 'A': // Added
                        addedFiles.Add(fileName);
                        break;
                    case 'D': // Deleted
                        deletedFiles.Add(fileName);
                        break;
                }
            }

            return new SvnStatus
            {
                IsClean = modifiedFiles.Count == 0 && addedFiles.Count == 0 && deletedFiles.Count == 0,
                ModifiedFiles = modifiedFiles,
                AddedFiles = addedFiles,
                DeletedFiles = deletedFiles
            };
        }

        /// <summary>
        /// 本日の作業サマリーを生成します。
        /// </summary>
        public string GenerateTodayWorkSummary()
        {
            var sb = new StringBuilder();
            var commits = GetTodayCommits();

            sb.AppendLine("【本日のSVN活動】");
            sb.AppendLine($"・コミット数: {commits.Count}件");
            sb.AppendLine();

            if (commits.Count > 0)
            {
                sb.AppendLine("【コミット一覧】");
                foreach (var commit in commits)
                {
                    sb.AppendLine($"・r{commit.Revision} - {commit.Date:HH:mm} - {commit.Message}");
                }
                sb.AppendLine();
            }

            return sb.ToString();
        }

        #endregion

        #region プライベートメソッド

        /// <summary>
        /// SVNコマンドを実行します。
        /// </summary>
        private string ExecuteSvnCommand(string arguments)
        {
            try
            {
                // 認証情報を追加
                var authArgs = "";
                if (!string.IsNullOrEmpty(_username))
                {
                    authArgs = $"--username {_username}";
                    if (!string.IsNullOrEmpty(_password))
                    {
                        authArgs += $" --password {_password}";
                    }
                    authArgs += " --non-interactive --trust-server-cert";
                }

                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "svn",
                        Arguments = $"{arguments} {authArgs}",
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
                    Logger.Warn($"SVN command failed: {arguments}, Error: {error}");
                    return null;
                }

                return output;
            }
            catch (Exception ex)
            {
                Logger.Error($"SVN command execution error: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// SVNログのXMLを解析します。
        /// </summary>
        private List<SvnCommitInfo> ParseSvnLog(string xmlLog)
        {
            var commits = new List<SvnCommitInfo>();

            try
            {
                // 簡易的なXML解析（正規表現使用）
                var logEntryMatches = System.Text.RegularExpressions.Regex.Matches(
                    xmlLog, 
                    @"<logentry\s+revision=""(\d+)"">(.*?)</logentry>", 
                    System.Text.RegularExpressions.RegexOptions.Singleline
                );

                foreach (System.Text.RegularExpressions.Match match in logEntryMatches)
                {
                    var revision = int.Parse(match.Groups[1].Value);
                    var content = match.Groups[2].Value;

                    var authorMatch = System.Text.RegularExpressions.Regex.Match(content, @"<author>(.*?)</author>");
                    var dateMatch = System.Text.RegularExpressions.Regex.Match(content, @"<date>(.*?)</date>");
                    var msgMatch = System.Text.RegularExpressions.Regex.Match(content, @"<msg>(.*?)</msg>");

                    commits.Add(new SvnCommitInfo
                    {
                        Revision = revision,
                        Author = authorMatch.Success ? authorMatch.Groups[1].Value : "",
                        Date = dateMatch.Success ? ParseSvnDate(dateMatch.Groups[1].Value) : DateTime.MinValue,
                        Message = msgMatch.Success ? msgMatch.Groups[1].Value : ""
                    });
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"SVN log parsing error: {ex.Message}");
            }

            return commits;
        }

        /// <summary>
        /// SVN日付文字列を解析します。
        /// </summary>
        private DateTime ParseSvnDate(string dateStr)
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
    /// SVNリポジトリ情報を表すクラスです。
    /// </summary>
    public class SvnInfo
    {
        /// <summary>
        /// リポジトリのURL
        /// </summary>
        public string Url { get; set; }

        /// <summary>
        /// 現在のリビジョン番号
        /// </summary>
        public int Revision { get; set; }
    }

    /// <summary>
    /// SVNコミット情報を表すクラスです。
    /// </summary>
    public class SvnCommitInfo
    {
        /// <summary>
        /// リビジョン番号を取得または設定します。
        /// </summary>
        public int Revision { get; set; }

        /// <summary>
        /// 作成者名を取得または設定します。
        /// </summary>
        public string Author { get; set; }

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
    /// SVN状態情報を表すクラスです。
    /// </summary>
    public class SvnStatus
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
        /// 追加されたファイル一覧を取得または設定します。
        /// </summary>
        public List<string> AddedFiles { get; set; }

        /// <summary>
        /// 削除されたファイル一覧を取得または設定します。
        /// </summary>
        public List<string> DeletedFiles { get; set; }
    }

    #endregion
}
