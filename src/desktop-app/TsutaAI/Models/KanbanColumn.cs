using System;
using System.Collections.Generic;

namespace TsutaAI.Models
{
    /// <summary>
    /// 看板ボード上の列（カラム）を表現するモデルクラスです。
    /// 未着手、進行中、完了、保留などのステータスごとに1つのカラムが対応します。
    /// </summary>
    public class KanbanColumn
    {
        /// <summary>
        /// 列の一意識別子（"not-started", "in-progress", "done", "on-hold" など）
        /// </summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>
        /// 列の表示タイトル（"未着手", "進行中", "完了", "保留" など）
        /// </summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>
        /// 列の背景カラーコード（例: "#3B82F6" は青）
        /// </summary>
        public string ColorCode { get; set; } = string.Empty;

        /// <summary>
        /// 列の表示アイコン（例: "🔵" 青い円）
        /// </summary>
        public string IconCode { get; set; } = string.Empty;

        /// <summary>
        /// WIP制限（Work In Progress Limit）
        /// この列に置けるタスク数の最大値。nullの場合は無制限
        /// 例: 進行中列に WipLimit=3 を設定すると、3タスク以上は置けない
        /// </summary>
        public int? WipLimit { get; set; }

        /// <summary>
        /// 画面表示時の列の順序（左から右へ 0, 1, 2, 3... ）
        /// </summary>
        public int Order { get; set; }

        /// <summary>
        /// この列に含まれるタスクカードのリスト
        /// </summary>
        public List<KanbanCard> Cards { get; set; } = new List<KanbanCard>();

        /// <summary>
        /// 計算プロパティ：この列に含まれるタスク数を取得します
        /// </summary>
        public int TaskCount => Cards.Count;

        /// <summary>
        /// 計算プロパティ：WIP制限を超えているかどうかを判定します
        /// WipLimit が設定されている場合、タスク数が制限を超えていれば true を返す
        /// </summary>
        public bool IsOverWipLimit => WipLimit.HasValue && TaskCount > WipLimit.Value;
    }
}
