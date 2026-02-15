using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// タスク添付ファイル情報を表現するモデルクラスです。
    /// </summary>
    public class TaskAttachment
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        [JsonProperty("fileName")]
        public string FileName { get; set; } = string.Empty;

        [JsonProperty("filePath")]
        public string FilePath { get; set; } = string.Empty;

        [JsonProperty("fileSize")]
        public long FileSize { get; set; }

        [JsonProperty("uploadedBy")]
        public int UploadedBy { get; set; }

        [JsonProperty("createdAt")]
        public DateTime UploadedAt { get; set; }

        [JsonProperty("uploaderName")]
        public string UploaderName { get; set; } = string.Empty;

        /// <summary>
        /// ファイルサイズを人間が読みやすい形式で取得します。
        /// </summary>
        public string FileSizeFormatted
        {
            get
            {
                string[] sizes = { "B", "KB", "MB", "GB" };
                double len = FileSize;
                int order = 0;
                while (len >= 1024 && order < sizes.Length - 1)
                {
                    order++;
                    len = len / 1024;
                }
                return $"{len:0.##} {sizes[order]}";
            }
        }

        /// <summary>
        /// ファイル拡張子を取得します。
        /// </summary>
        public string FileExtension
        {
            get
            {
                var ext = System.IO.Path.GetExtension(FileName);
                return string.IsNullOrEmpty(ext) ? "" : ext.TrimStart('.').ToUpper();
            }
        }
    }
}
