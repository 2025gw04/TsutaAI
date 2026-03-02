using System;

namespace TsutaAI.Models
{
    /// <summary>
    /// タスクのタイプを表現する列挙型です。
    /// プロジェクトタスク（管理者が割り当てたタスク）と個人タスク（メンバーが作成したタスク）を区別します。
    /// </summary>
    public enum TaskType
    {
        /// <summary>
        /// プロジェクトタスク：Web管理画面から割り当てられたメインのタスク
        /// ステータスと進捗率のみ変更可能で、編集・削除は禁止
        /// </summary>
        ProjectTask,

        /// <summary>
        /// 個人タスク：メンバーが自由に作成・編集できるタスク
        /// すべてのプロパティが編集・削除可能
        /// </summary>
        PersonalTask
    }
}
