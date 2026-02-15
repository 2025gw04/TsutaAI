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
    /// ファイル変更内容を分析し、作業内容を把握するサービスです。
    /// </summary>
    public class FileContentAnalysisService
    {
        private readonly FolderBackupService _backupService;
        private readonly FileDiffService _diffService;

        public FileContentAnalysisService(FolderBackupService backupService, FileDiffService diffService)
        {
            _backupService = backupService;
            _diffService = diffService;
        }

        /// <summary>
        /// 変更されたファイルの内容を分析し、作業内容のサマリーを生成します。
        /// </summary>
        /// <param name="changedFilePaths">変更されたファイルパスのリスト</param>
        /// <param name="sourceFolderPath">監視対象フォルダのルートパス</param>
        /// <param name="userId">ユーザーID</param>
        /// <returns>作業内容のサマリー</returns>
        public WorkContentSummary AnalyzeChangedFiles(List<string> changedFilePaths, string sourceFolderPath, int userId)
        {
            var summary = new WorkContentSummary
            {
                TotalFilesChanged = changedFilePaths.Count,
                FileChanges = new List<FileChangeDetail>()
            };

            foreach (var filePath in changedFilePaths)
            {
                try
                {
                    var fileDetail = AnalyzeFile(filePath, sourceFolderPath, userId);
                    if (fileDetail != null)
                    {
                        summary.FileChanges.Add(fileDetail);
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warn($"ファイル分析エラー: {filePath}, {ex.Message}");
                }
            }

            // 統計情報を計算
            summary.TotalLinesAdded = summary.FileChanges.Sum(f => f.LinesAdded);
            summary.TotalLinesRemoved = summary.FileChanges.Sum(f => f.LinesRemoved);
            summary.FilesByExtension = summary.FileChanges
                .GroupBy(f => Path.GetExtension(f.FilePath).ToLower())
                .ToDictionary(g => g.Key, g => g.Count());

            return summary;
        }

        /// <summary>
        /// 単一ファイルの変更内容を分析します。
        /// </summary>
        private FileChangeDetail AnalyzeFile(string currentFilePath, string sourceFolderPath, int userId)
        {
            if (!File.Exists(currentFilePath))
            {
                return null;
            }

            var extension = Path.GetExtension(currentFilePath).ToLower();
            var relativePath = currentFilePath.Substring(sourceFolderPath.Length).TrimStart(Path.DirectorySeparatorChar);

            // バックアップファイルの内容を取得
            var backupContent = _backupService.GetBackupFileContent(currentFilePath, sourceFolderPath);
            var currentContent = File.ReadAllText(currentFilePath);

            var detail = new FileChangeDetail
            {
                FilePath = relativePath,
                FullPath = currentFilePath,
                Extension = extension,
                ChangeType = backupContent == null ? "新規作成" : "変更"
            };

            if (backupContent == null)
            {
                // 新規ファイル
                detail.LinesAdded = currentContent.Split('\n').Length;
                detail.LinesRemoved = 0;
                detail.DiffSummary = $"新規ファイル作成（{detail.LinesAdded}行）";
            }
            else if (backupContent != currentContent)
            {
                // ファイルが変更された場合、差分を計算
                var diff = ComputeSimpleDiff(backupContent, currentContent);
                detail.LinesAdded = diff.LinesAdded;
                detail.LinesRemoved = diff.LinesRemoved;
                detail.DiffContent = diff.DiffText;
                detail.DiffSummary = $"+{diff.LinesAdded}行, -{diff.LinesRemoved}行";
            }
            else
            {
                // 内容が同じ（タイムスタンプのみ変更）
                detail.DiffSummary = "内容変更なし";
            }

            return detail;
        }

        /// <summary>
        /// 2つのテキストの簡易差分を計算します。
        /// </summary>
        private (string DiffText, int LinesAdded, int LinesRemoved) ComputeSimpleDiff(string oldText, string newText)
        {
            var oldLines = oldText.Split('\n');
            var newLines = newText.Split('\n');

            var diffText = new StringBuilder();
            int linesAdded = 0;
            int linesRemoved = 0;

            // 簡易的な行ベースの差分計算
            var oldSet = new HashSet<string>(oldLines);
            var newSet = new HashSet<string>(newLines);

            // 削除された行
            foreach (var line in oldLines)
            {
                if (!newSet.Contains(line))
                {
                    linesRemoved++;
                    if (diffText.Length < 5000) // 差分が大きすぎる場合は制限
                    {
                        diffText.AppendLine($"- {line.Trim()}");
                    }
                }
            }

            // 追加された行
            foreach (var line in newLines)
            {
                if (!oldSet.Contains(line))
                {
                    linesAdded++;
                    if (diffText.Length < 5000)
                    {
                        diffText.AppendLine($"+ {line.Trim()}");
                    }
                }
            }

            if (diffText.Length >= 5000)
            {
                diffText.AppendLine("\n... (差分が大きいため省略されました)");
            }

            return (diffText.ToString(), linesAdded, linesRemoved);
        }

        /// <summary>
        /// 作業内容サマリーをAI用のテキストに変換します。
        /// </summary>
        public string GenerateWorkContentText(WorkContentSummary summary)
        {
            if (summary == null || summary.TotalFilesChanged == 0)
            {
                return "";
            }

            var builder = new StringBuilder();
            builder.AppendLine("\n【ファイル変更の詳細】");
            builder.AppendLine($"- 変更ファイル数: {summary.TotalFilesChanged}件");
            builder.AppendLine($"- 追加行数: {summary.TotalLinesAdded}行");
            builder.AppendLine($"- 削除行数: {summary.TotalLinesRemoved}行");

            // ファイル種別ごとの統計
            if (summary.FilesByExtension.Any())
            {
                builder.AppendLine("\n【ファイル種別】");
                foreach (var ext in summary.FilesByExtension.OrderByDescending(x => x.Value))
                {
                    var extName = string.IsNullOrEmpty(ext.Key) ? "(拡張子なし)" : ext.Key;
                    builder.AppendLine($"  - {extName}: {ext.Value}件");
                }
            }

            // 主要な変更ファイル（最大10件）
            var topChanges = summary.FileChanges
                .OrderByDescending(f => f.LinesAdded + f.LinesRemoved)
                .Take(10)
                .ToList();

            if (topChanges.Any())
            {
                builder.AppendLine("\n【主要な変更ファイル】");
                foreach (var change in topChanges)
                {
                    builder.AppendLine($"  - {change.FilePath} ({change.ChangeType}): {change.DiffSummary}");
                }
            }

            return builder.ToString();
        }

        /// <summary>
        /// 作業内容サマリーをAI分析用の詳細テキストに変換します（差分内容を含む）。
        /// </summary>
        public string GenerateDetailedWorkContentText(WorkContentSummary summary, int maxFiles = 5)
        {
            if (summary == null || summary.TotalFilesChanged == 0)
            {
                return "";
            }

            var builder = new StringBuilder();
            builder.AppendLine("\n【ファイル変更の詳細分析】");

            // 変更量の多いファイルを優先的に表示
            var topChanges = summary.FileChanges
                .OrderByDescending(f => f.LinesAdded + f.LinesRemoved)
                .Take(maxFiles)
                .ToList();

            foreach (var change in topChanges)
            {
                builder.AppendLine($"\n■ {change.FilePath} ({change.ChangeType})");
                builder.AppendLine($"  変更量: {change.DiffSummary}");

                if (!string.IsNullOrEmpty(change.DiffContent))
                {
                    builder.AppendLine("  差分内容:");
                    var diffLines = change.DiffContent.Split('\n').Take(50); // 最大50行まで
                    foreach (var line in diffLines)
                    {
                        if (!string.IsNullOrWhiteSpace(line))
                        {
                            builder.AppendLine($"    {line.Trim()}");
                        }
                    }
                }
            }

            return builder.ToString();
        }
    }
}
