using System.Collections.Generic;

namespace TsutaAI.Models
{
    /// <summary>
    /// 作業内容のサマリー情報を表すクラスです。
    /// </summary>
    public class WorkContentSummary
    {
        /// <summary>
        /// 変更されたファイルの総数
        /// </summary>
        public int TotalFilesChanged { get; set; }

        /// <summary>
        /// 追加された行の総数
        /// </summary>
        public int TotalLinesAdded { get; set; }

        /// <summary>
        /// 削除された行の総数
        /// </summary>
        public int TotalLinesRemoved { get; set; }

        /// <summary>
        /// ファイル拡張子ごとの変更数
        /// </summary>
        public Dictionary<string, int> FilesByExtension { get; set; }

        /// <summary>
        /// 個別のファイル変更詳細リスト
        /// </summary>
        public List<FileChangeDetail> FileChanges { get; set; }
    }

    /// <summary>
    /// 個別ファイルの変更詳細を表すクラスです。
    /// </summary>
    public class FileChangeDetail
    {
        /// <summary>
        /// 相対ファイルパス
        /// </summary>
        public string FilePath { get; set; }

        /// <summary>
        /// 絶対ファイルパス
        /// </summary>
        public string FullPath { get; set; }

        /// <summary>
        /// ファイル拡張子
        /// </summary>
        public string Extension { get; set; }

        /// <summary>
        /// 変更タイプ(新規作成、変更、削除)
        /// </summary>
        public string ChangeType { get; set; }

        /// <summary>
        /// 追加された行数
        /// </summary>
        public int LinesAdded { get; set; }

        /// <summary>
        /// 削除された行数
        /// </summary>
        public int LinesRemoved { get; set; }

        /// <summary>
        /// 差分の要約
        /// </summary>
        public string DiffSummary { get; set; }

        /// <summary>
        /// 差分の詳細内容
        /// </summary>
        public string DiffContent { get; set; }
    }
}
