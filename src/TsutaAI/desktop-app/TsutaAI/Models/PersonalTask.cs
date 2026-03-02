using System;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// 個人タスク情報を表現するモデルクラスです。
    /// バックエンド API の /personal-tasks エンドポイントから返されるデータに対応します。
    /// このモデルはメンバーが自由に作成・編集できるタスク用です。
    /// </summary>
    public class PersonalTask
    {
        /// <summary>
        /// 個人タスクの内部ID（backend-api /personal-tasks/:id で使用）
        /// </summary>
        [JsonProperty("id")]
        public int Id { get; set; }

        /// <summary>
        /// 個人タスクの一意識別子（自動採番）
        /// </summary>
        [JsonProperty("taskId")]
        public int TaskId { get; set; }

        /// <summary>
        /// このタスクの所有者（作成者）のユーザーID
        /// </summary>
        [JsonProperty("userId")]
        public int UserId { get; set; }

        /// <summary>
        /// タスクのタイトル（表示される主要な文字列）
        /// </summary>
        [JsonProperty("title")]
        public string Title { get; set; } = string.Empty;

        /// <summary>
        /// タスクの詳細説明
        /// </summary>
        [JsonProperty("description")]
        public string Description { get; set; } = string.Empty;

        /// <summary>
        /// タスクのメモ内容
        /// 編集可能で、タスク実行時に記録される補足情報
        /// </summary>
        [JsonProperty("notes")]
        public string Notes { get; set; } = string.Empty;

        /// <summary>
        /// 日報報告時に追加される報告内容
        /// 実際の作業内容、成果、気づきなどを記入
        /// </summary>
        [JsonProperty("reportNotes")]
        public string ReportNotes { get; set; } = string.Empty;

        /// <summary>
        /// タスクの優先度（"High" = 高, "Medium" = 中, "Low" = 低）
        /// </summary>
        [JsonProperty("priority")]
        public string Priority { get; set; } = "Medium";

        /// <summary>
        /// タスクの現在のステータス
        /// "not-started" = 未着手
        /// "in-progress" = 進行中
        /// "done" = 完了
        /// "on-hold" = 保留
        /// </summary>
        [JsonProperty("status")]
        public string Status { get; set; } = "not-started";

        /// <summary>
        /// タスク完了の進捗率（0～100の数値）
        /// </summary>
        [JsonProperty("progress")]
        public int Progress { get; set; } = 0;

        /// <summary>
        /// 見積工数（分単位）
        /// 例：30 = 30分（0.5時間）
        /// </summary>
        [JsonProperty("estimatedMinutes")]
        public int EstimatedMinutes { get; set; } = 0;

        /// <summary>
        /// 実績工数（分単位）
        /// タスク完了後に実際にかかった時間を記録
        /// </summary>
        [JsonProperty("actualMinutes")]
        public int ActualMinutes { get; set; } = 0;

        /// <summary>
        /// タスク開始日（ISO 8601 形式）
        /// 例："2025-10-31"
        /// </summary>
        [JsonProperty("startDate")]
        public string StartDate { get; set; } = string.Empty;

        /// <summary>
        /// タスクの期限日（ISO 8601 形式）
        /// 例："2025-11-05"
        /// </summary>
        [JsonProperty("dueDate")]
        public string DueDate { get; set; } = string.Empty;

        /// <summary>
        /// タスク完了日時（ISO 8601 形式）
        /// ステータスが "done" になった日時を自動記録
        /// </summary>
        [JsonProperty("completedAt")]
        public string CompletedAt { get; set; } = string.Empty;

        /// <summary>
        /// タスク作成日時（ISO 8601 形式）
        /// 例："2025-10-31T09:00:00"
        /// </summary>
        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; } = string.Empty;

        /// <summary>
        /// タスク最終更新日時（ISO 8601 形式）
        /// タスク更新のたびに自動更新される
        /// </summary>
        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; } = string.Empty;

        // ===================================================================
        // 計算プロパティ（便利な値を取得するためのプロパティ）
        // ===================================================================

        /// <summary>
        /// 見積工数を時間単位で返す計算プロパティ
        /// 例：EstimatedMinutes=30 → 0.5時間
        /// </summary>
        public double EstimatedHours => EstimatedMinutes > 0 ? EstimatedMinutes / 60.0 : 0;

        /// <summary>
        /// 実績工数を時間単位で返す計算プロパティ
        /// 例：ActualMinutes=45 → 0.75時間
        /// </summary>
        public double ActualHours => ActualMinutes > 0 ? ActualMinutes / 60.0 : 0;

        /// <summary>
        /// タスクが完了しているかどうかを判定する計算プロパティ
        /// </summary>
        public bool IsCompleted => Status == "done";

        /// <summary>
        /// 期限を超過しているかどうかを判定する計算プロパティ
        /// </summary>
        public bool IsOverdue
        {
            get
            {
                // 期限が設定されていない、または完了済みの場合は超過していない
                if (string.IsNullOrEmpty(DueDate) || IsCompleted)
                {
                    return false;
                }

                // DueDate を DateTime に変換して超過判定
                DateTime dueDate;
                if (DateTime.TryParse(DueDate, out dueDate))
                {
                    return DateTime.Now > dueDate;
                }

                // 日付変換に失敗した場合は超過していないとみなす
                return false;
            }
        }
    }
}
