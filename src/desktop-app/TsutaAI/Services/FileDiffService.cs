using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using TsutaAI.Models;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// ファイルの差分計算を行うサービス
    /// </summary>
    public class FileDiffService
    {
        private readonly LocalDatabaseService _localDatabaseService;
        private readonly Dictionary<string, string> _fileSnapshots; // ファイルパス -> 内容のスナップショット
        private readonly HashSet<string> _monitoredExtensions;

        public FileDiffService(LocalDatabaseService localDatabaseService)
        {
            _localDatabaseService = localDatabaseService;
            _fileSnapshots = new Dictionary<string, string>();
            _monitoredExtensions = new HashSet<string>
            {
                ".cs", ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".cpp", ".c", ".h",
                ".css", ".scss", ".html", ".vue", ".go", ".rs", ".rb", ".php", ".sql"
            };
        }

        /// <summary>
        /// ファイル内容のスナップショットを保存します
        /// </summary>
        public void SaveSnapshot(string filePath)
        {
            if (!ShouldMonitorFile(filePath))
                return;

            try
            {
                if (File.Exists(filePath))
                {
                    var content = File.ReadAllText(filePath);
                    _fileSnapshots[filePath] = content;
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"スナップショット保存エラー: {filePath}, {ex.Message}");
            }
        }

        /// <summary>
        /// ファイルの差分を計算します
        /// </summary>
        public FileDiff CalculateDiff(string filePath, int userId)
        {
            if (!ShouldMonitorFile(filePath))
                return null;

            try
            {
                if (!File.Exists(filePath))
                {
                    // ファイルが削除された場合
                    if (_fileSnapshots.ContainsKey(filePath))
                    {
                        var deletedLines = _fileSnapshots[filePath].Split('\n').Length;
                        _fileSnapshots.Remove(filePath);

                        return new FileDiff
                        {
                            UserId = userId,
                            FilePath = filePath,
                            ChangeType = "deleted",
                            DiffContent = "",
                            LinesAdded = 0,
                            LinesRemoved = deletedLines,
                            Timestamp = DateTime.Now
                        };
                    }
                    return null;
                }

                var newContent = File.ReadAllText(filePath);

                if (!_fileSnapshots.ContainsKey(filePath))
                {
                    // 新規ファイル
                    _fileSnapshots[filePath] = newContent;
                    var addedLines = newContent.Split('\n').Length;

                    return new FileDiff
                    {
                        UserId = userId,
                        FilePath = filePath,
                        ChangeType = "added",
                        DiffContent = "",
                        LinesAdded = addedLines,
                        LinesRemoved = 0,
                        Timestamp = DateTime.Now
                    };
                }

                var oldContent = _fileSnapshots[filePath];
                if (oldContent == newContent)
                {
                    return null; // 変更なし
                }

                // 差分計算
                var diff = ComputeDiff(oldContent, newContent);
                _fileSnapshots[filePath] = newContent;

                return new FileDiff
                {
                    UserId = userId,
                    FilePath = filePath,
                    ChangeType = "modified",
                    DiffContent = diff.DiffText,
                    LinesAdded = diff.LinesAdded,
                    LinesRemoved = diff.LinesRemoved,
                    Timestamp = DateTime.Now
                };
            }
            catch (Exception ex)
            {
                Logger.Error($"差分計算エラー: {filePath}, {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// ファイルを監視対象とするかチェック
        /// </summary>
        private bool ShouldMonitorFile(string filePath)
        {
            var extension = Path.GetExtension(filePath).ToLower();
            return _monitoredExtensions.Contains(extension);
        }

        /// <summary>
        /// 2つのテキストの差分を計算（シンプルなline-by-line diff）
        /// </summary>
        private (string DiffText, int LinesAdded, int LinesRemoved) ComputeDiff(string oldText, string newText)
        {
            var oldLines = oldText.Split('\n');
            var newLines = newText.Split('\n');

            var diffText = new StringBuilder();
            int linesAdded = 0;
            int linesRemoved = 0;

            // 簡易的なLCS（最長共通部分列）ベースの差分計算
            var lcs = LongestCommonSubsequence(oldLines, newLines);
            var lcsSet = new HashSet<int>(lcs);

            int oldIndex = 0;
            int newIndex = 0;

            while (oldIndex < oldLines.Length || newIndex < newLines.Length)
            {
                if (oldIndex < oldLines.Length && !lcsSet.Contains(oldIndex))
                {
                    // 削除行
                    diffText.AppendLine($"- {oldLines[oldIndex]}");
                    linesRemoved++;
                    oldIndex++;
                }
                else if (newIndex < newLines.Length && (oldIndex >= oldLines.Length || oldLines[oldIndex] != newLines[newIndex]))
                {
                    // 追加行
                    diffText.AppendLine($"+ {newLines[newIndex]}");
                    linesAdded++;
                    newIndex++;
                }
                else
                {
                    // 共通行
                    oldIndex++;
                    newIndex++;
                }
            }

            return (diffText.ToString(), linesAdded, linesRemoved);
        }

        /// <summary>
        /// 最長共通部分列（LCS）を計算
        /// </summary>
        private List<int> LongestCommonSubsequence(string[] oldLines, string[] newLines)
        {
            int m = oldLines.Length;
            int n = newLines.Length;
            int[,] dp = new int[m + 1, n + 1];

            for (int i = 1; i <= m; i++)
            {
                for (int j = 1; j <= n; j++)
                {
                    if (oldLines[i - 1] == newLines[j - 1])
                    {
                        dp[i, j] = dp[i - 1, j - 1] + 1;
                    }
                    else
                    {
                        dp[i, j] = Math.Max(dp[i - 1, j], dp[i, j - 1]);
                    }
                }
            }

            // LCSのインデックスを復元
            var lcsIndices = new List<int>();
            int x = m, y = n;
            while (x > 0 && y > 0)
            {
                if (oldLines[x - 1] == newLines[y - 1])
                {
                    lcsIndices.Add(x - 1);
                    x--;
                    y--;
                }
                else if (dp[x - 1, y] > dp[x, y - 1])
                {
                    x--;
                }
                else
                {
                    y--;
                }
            }

            lcsIndices.Reverse();
            return lcsIndices;
        }

        /// <summary>
        /// スナップショットをクリア
        /// </summary>
        public void ClearSnapshots()
        {
            _fileSnapshots.Clear();
        }
    }
}
