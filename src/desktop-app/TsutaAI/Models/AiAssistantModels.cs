using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace TsutaAI.Models
{
    /// <summary>
    /// AIアシスタントのチャットメッセージを表現するモデルです。
    /// </summary>
    public class AiChatMessage
    {
        /// <summary>
        /// メッセージID
        /// </summary>
        [JsonProperty("id")]
        public string Id { get; set; }

        /// <summary>
        /// メッセージの役割（user または assistant）
        /// </summary>
        [JsonProperty("role")]
        public string Role { get; set; }

        /// <summary>
        /// メッセージ本文
        /// </summary>
        [JsonProperty("content")]
        public string Content { get; set; }

        /// <summary>
        /// メッセージのタイムスタンプ
        /// </summary>
        [JsonProperty("timestamp")]
        public DateTime Timestamp { get; set; }

        /// <summary>
        /// 変更プレビュー（AIからの応答時のみ）
        /// </summary>
        [JsonProperty("preview")]
        public List<ChangePreview> Preview { get; set; }

        /// <summary>
        /// ユーザーからのメッセージかどうか
        /// </summary>
        [JsonIgnore]
        public bool IsUser => string.Equals(Role, "user", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// AIチャットのリクエスト情報です。
    /// </summary>
    public class AiChatRequest
    {
        /// <summary>
        /// チャットモード（member-assistant）
        /// </summary>
        [JsonProperty("mode")]
        public string Mode { get; set; } = "member-assistant";

        /// <summary>
        /// ユーザーのメッセージ
        /// </summary>
        [JsonProperty("message")]
        public string Message { get; set; }

        /// <summary>
        /// 会話履歴
        /// </summary>
        [JsonProperty("history")]
        public List<AiChatHistoryItem> History { get; set; } = new List<AiChatHistoryItem>();

        /// <summary>
        /// プロジェクトコンテキスト情報
        /// </summary>
        [JsonProperty("projectContext")]
        public object ProjectContext { get; set; }

        /// <summary>
        /// 現在のタスク一覧（トップレベル互換）
        /// </summary>
        [JsonProperty("currentTasks")]
        public List<object> CurrentTasks { get; set; } = new List<object>();

        /// <summary>
        /// メンバーコンテキスト情報
        /// </summary>
        [JsonProperty("memberContext")]
        public MemberContext MemberContext { get; set; }
    }

    /// <summary>
    /// 会話履歴の1アイテム
    /// </summary>
    public class AiChatHistoryItem
    {
        /// <summary>
        /// 役割（user または assistant）
        /// </summary>
        [JsonProperty("role")]
        public string Role { get; set; }

        /// <summary>
        /// メッセージ内容
        /// </summary>
        [JsonProperty("content")]
        public string Content { get; set; }
    }

    /// <summary>
    /// メンバーのコンテキスト情報です。
    /// </summary>
    public class MemberContext
    {
        /// <summary>
        /// ユーザーID
        /// </summary>
        [JsonProperty("userId")]
        public int UserId { get; set; }

        /// <summary>
        /// ユーザー名
        /// </summary>
        [JsonProperty("userName")]
        public string UserName { get; set; }

        /// <summary>
        /// コンテキストの作成日時（ローカル時刻）
        /// </summary>
        [JsonProperty("currentDate")]
        public string CurrentDate { get; set; }

        /// <summary>
        /// 参加しているプロジェクトのID一覧
        /// </summary>
        [JsonProperty("projectIds")]
        public List<int> ProjectIds { get; set; } = new List<int>();

        /// <summary>
        /// ダッシュボード全体状況のスナップショット
        /// </summary>
        [JsonProperty("dashboardOverview")]
        public string DashboardOverview { get; set; }

        /// <summary>
        /// 担当タスク一覧（動的なオブジェクト）
        /// </summary>
        [JsonProperty("currentTasks")]
        public List<object> CurrentTasks { get; set; } = new List<object>();
    }

    /// <summary>
    /// AIチャットのレスポンス情報です。
    /// </summary>
    public class AiChatResponse
    {
        /// <summary>
        /// AIからの応答メッセージ
        /// </summary>
        [JsonProperty("message")]
        public string Message { get; set; }

        /// <summary>
        /// ツール呼び出し結果
        /// </summary>
        [JsonProperty("toolCalls")]
        public List<object> ToolCalls { get; set; }

        /// <summary>
        /// 変更プレビュー一覧
        /// </summary>
        [JsonProperty("preview")]
        public List<ChangePreview> Preview { get; set; }

        /// <summary>
        /// 確認が必要かどうか
        /// </summary>
        [JsonProperty("needsConfirmation")]
        public bool NeedsConfirmation { get; set; }
    }

    /// <summary>
    /// 変更プレビューを表現するモデルです。
    /// </summary>
    public class ChangePreview
    {
        /// <summary>
        /// 変更タイプ（update, create, delete）
        /// </summary>
        [JsonProperty("type")]
        public string Type { get; set; }

        /// <summary>
        /// タスクID
        /// </summary>
        [JsonProperty("taskId")]
        public string TaskId { get; set; }

        /// <summary>
        /// タスク名
        /// </summary>
        [JsonProperty("taskName")]
        public string TaskName { get; set; }

        /// <summary>
        /// 変更内容の詳細
        /// </summary>
        [JsonProperty("changes")]
        public Dictionary<string, FieldChange> Changes { get; set; }

        /// <summary>
        /// 変更タイプの表示名を取得します。
        /// </summary>
        [JsonIgnore]
        public string TypeDisplayName
        {
            get
            {
                switch (Type?.ToLowerInvariant())
                {
                    case "update": return "更新";
                    case "create": return "作成";
                    case "delete": return "削除";
                    default: return Type ?? "不明";
                }
            }
        }
    }

    /// <summary>
    /// フィールドの変更内容を表現するモデルです。
    /// </summary>
    public class FieldChange
    {
        /// <summary>
        /// 変更前の値
        /// </summary>
        [JsonProperty("before")]
        public string Before { get; set; }

        /// <summary>
        /// 変更後の値
        /// </summary>
        [JsonProperty("after")]
        public string After { get; set; }
    }

    /// <summary>
    /// チャット履歴をローカルに保存するためのモデルです。
    /// </summary>
    public class AiChatHistory
    {
        /// <summary>
        /// 履歴ID（自動採番）
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// ユーザーID
        /// </summary>
        public int UserId { get; set; }

        /// <summary>
        /// メッセージID
        /// </summary>
        public string MessageId { get; set; }

        /// <summary>
        /// 役割（user または assistant）
        /// </summary>
        public string Role { get; set; }

        /// <summary>
        /// メッセージ内容
        /// </summary>
        public string Content { get; set; }

        /// <summary>
        /// プレビューデータ（JSON形式）
        /// </summary>
        public string PreviewJson { get; set; }

        /// <summary>
        /// 作成日時
        /// </summary>
        public DateTime CreatedAt { get; set; }
    }
}
