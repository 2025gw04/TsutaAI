using System;

namespace TsutaAI.Models
{
    /// <summary>
    /// 看板ボード上に表示されるタスクカードを表現するモデルクラスです。
    /// プロジェクトタスクと個人タスクの両方を同じモデルで管理します。
    /// </summary>
    public class KanbanCard
    {
        /// <summary>
        /// タスクの一意識別子
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// タスクのタイプ（ProjectTask または PersonalTask）
        /// このプロパティによってUIの表示と操作が制限されます
        /// </summary>
        public TaskType Type { get; set; }

        /// <summary>
        /// タスクのタイトル（表示される主要な文字列）
        /// </summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>
        /// タスクの詳細説明
        /// </summary>
        public string Description { get; set; } = string.Empty;

        /// <summary>
        /// 個人タスクのメモ内容（編集可能）
        /// プロジェクトタスクでは使用されません
        /// </summary>
        public string Notes { get; set; } = string.Empty;

        /// <summary>
        /// 日報報告時に追加される報告内容メモ
        /// </summary>
        public string ReportNotes { get; set; } = string.Empty;

        /// <summary>
        /// タスクの優先度（"High" = 高, "Medium" = 中, "Low" = 低）
        /// </summary>
        public string Priority { get; set; } = "Medium";

        /// <summary>
        /// タスクの現在のステータス
        /// "not-started" = 未着手, "in-progress" = 進行中, "done" = 完了, "on-hold" = 保留
        /// </summary>
        public string Status { get; set; } = "not-started";

        /// <summary>
        /// タスク完了の進捗率（0～100の数値）
        /// </summary>
        public int Progress { get; set; } = 0;

        /// <summary>
        /// 見積工数（分単位）
        /// </summary>
        public int EstimatedMinutes { get; set; } = 0;

        /// <summary>
        /// 実績工数（分単位）
        /// </summary>
        public int ActualMinutes { get; set; } = 0;

        /// <summary>
        /// タスクの期限日時
        /// </summary>
        public DateTime? DueDate { get; set; }

        /// <summary>
        /// このタスクに付いているコメント数
        /// プロジェクトタスクのみで使用されます
        /// </summary>
        public int CommentCount { get; set; } = 0;

        /// <summary>
        /// WBSコード（例: "WBS-123"）
        /// プロジェクトタスクのみで使用されます
        /// </summary>
        public string WbsCode { get; set; } = string.Empty;

        // ===================================================================
        // 以下は計算プロパティで、UIの表示やロジックに使用します
        // ===================================================================

        /// <summary>
        /// 計算プロパティ：タスクタイプアイコンを取得します
        /// プロジェクトタスク → "🏢"、個人タスク → "👤"
        /// </summary>
        public string TypeIcon => Type == TaskType.ProjectTask ? "🏢" : "👤";

        /// <summary>
        /// 計算プロパティ：タスクタイプラベルを取得します
        /// プロジェクトタスク → "プロジェクト"、個人タスク → "個人"
        /// </summary>
        public string TypeLabel => Type == TaskType.ProjectTask ? "プロジェクト" : "個人";

        /// <summary>
        /// 計算プロパティ：このタスクが編集可能かどうかを判定します
        /// 個人タスクのみ編集可能です
        /// </summary>
        public bool IsEditable => Type == TaskType.PersonalTask;

        /// <summary>
        /// 計算プロパティ：このタスクが削除可能かどうかを判定します
        /// 個人タスクのみ削除可能です
        /// </summary>
        public bool IsDeletable => Type == TaskType.PersonalTask;

        /// <summary>
        /// 計算プロパティ：カード枠線の色を取得します
        /// プロジェクトタスク → 青（#3B82F6）、個人タスク → 緑（#10B981）
        /// </summary>
        public string BorderColor => Type == TaskType.ProjectTask ? "#3B82F6" : "#10B981";

        /// <summary>
        /// 計算プロパティ：優先度に対応するカラーコードを取得します
        /// "High" → 赤（#EF4444）、"Medium" → オレンジ（#F59E0B）、"Low" → 緑（#10B981）
        /// </summary>
        public string PriorityColor
        {
            get
            {
                // C# 7.3 互換性: switch statement を使用
                switch (Priority)
                {
                    case "High":
                        return "#EF4444";   // 赤
                    case "Medium":
                        return "#F59E0B";   // オレンジ
                    case "Low":
                        return "#10B981";   // 緑
                    default:
                        return "#9CA3AF";   // グレー（デフォルト）
                }
            }
        }

        /// <summary>
        /// 計算プロパティ：見積工数を時間単位で取得します
        /// 例：120分 → 2時間
        /// </summary>
        public double EstimatedHours => EstimatedMinutes > 0 ? EstimatedMinutes / 60.0 : 0;

        /// <summary>
        /// 計算プロパティ：実績工数を時間単位で取得します
        /// 例：45分 → 0.75時間
        /// </summary>
        public double ActualHours => ActualMinutes > 0 ? ActualMinutes / 60.0 : 0;
    }
}
