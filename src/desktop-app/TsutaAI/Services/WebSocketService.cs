using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using TsutaAI.Utils;

namespace TsutaAI.Services
{
    /// <summary>
    /// WebSocketによるリアルタイム通信サービス
    /// backend-apiのWebSocketサーバーと接続し、プロジェクト/タスク更新通知を受信
    /// </summary>
    public class WebSocketService : IDisposable
    {
        private ClientWebSocket _client;
        private CancellationTokenSource _cancellationTokenSource;
        private readonly string _wsUrl;
        private bool _isConnected;
        private Timer _heartbeatTimer;

        // イベント
        public event EventHandler<ProjectUpdateEventArgs> ProjectUpdated;
        public event EventHandler<TaskUpdateEventArgs> TaskUpdated;
        public event EventHandler<WorkLogEventArgs> WorkLogCreated;
        public event EventHandler<AiAlertEventArgs> AiAlertReceived;
        public event EventHandler Connected;
        public event EventHandler Disconnected;
        public event EventHandler<string> ErrorOccurred;

        public bool IsConnected
        {
            get { return _isConnected; }
        }

        public WebSocketService(string baseUrl)
        {
            // http://localhost:3000 -> ws://localhost:3000/ws
            _wsUrl = baseUrl.Replace("http://", "ws://").Replace("https://", "wss://") + "/ws";
            Logger.Info($"WebSocketService初期化: {_wsUrl}");
        }

        /// <summary>
        /// WebSocketサーバーに接続
        /// </summary>
        public async Task ConnectAsync(string token)
        {
            try
            {
                if (_isConnected)
                {
                    Logger.Warn("WebSocketは既に接続されています");
                    return;
                }

                _client = new ClientWebSocket();
                _cancellationTokenSource = new CancellationTokenSource();

                Logger.Info($"WebSocket接続開始: {_wsUrl}");
                await _client.ConnectAsync(new Uri(_wsUrl), _cancellationTokenSource.Token);
                _isConnected = true;

                Logger.Info("WebSocket接続成功");

                // 認証メッセージ送信
                await SendAuthMessageAsync(token);

                // ハートビート開始（60秒間隔）
                StartHeartbeat();

                // 受信ループ開始(バックグラウンドで実行)
                _ = Task.Run(() => ReceiveLoopAsync());

                if (Connected != null)
                {
                    Connected.Invoke(this, EventArgs.Empty);
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"WebSocket接続エラー: {ex.Message}");
                _isConnected = false;

                if (ErrorOccurred != null)
                {
                    ErrorOccurred.Invoke(this, $"接続エラー: {ex.Message}");
                }

                throw;
            }
        }

        /// <summary>
        /// WebSocketサーバーから切断
        /// </summary>
        public async Task DisconnectAsync()
        {
            try
            {
                if (_client != null && _isConnected)
                {
                    Logger.Info("WebSocket切断開始");

                    // ハートビート停止
                    StopHeartbeat();

                    // キャンセル
                    if (_cancellationTokenSource != null)
                    {
                        _cancellationTokenSource.Cancel();
                    }

                    // 接続を閉じる
                    if (_client.State == WebSocketState.Open)
                    {
                        await _client.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                    }

                    _isConnected = false;

                    if (Disconnected != null)
                    {
                        Disconnected.Invoke(this, EventArgs.Empty);
                    }

                    Logger.Info("WebSocket切断完了");
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"WebSocket切断エラー: {ex.Message}");
            }
        }

        /// <summary>
        /// 認証メッセージ送信
        /// </summary>
        private async Task SendAuthMessageAsync(string token)
        {
            try
            {
                var authMessage = new
                {
                    type = "auth",
                    token = token
                };

                var json = JsonConvert.SerializeObject(authMessage);
                var bytes = Encoding.UTF8.GetBytes(json);
                await _client.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cancellationTokenSource.Token);

                Logger.Info("WebSocket認証メッセージ送信完了");
            }
            catch (Exception ex)
            {
                Logger.Error($"WebSocket認証エラー: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// ハートビート開始
        /// </summary>
        private void StartHeartbeat()
        {
            _heartbeatTimer = new Timer(async (state) =>
            {
                try
                {
                    if (_isConnected && _client != null && _client.State == WebSocketState.Open)
                    {
                        var pingMessage = new { type = "ping" };
                        var json = JsonConvert.SerializeObject(pingMessage);
                        var bytes = Encoding.UTF8.GetBytes(json);
                        await _client.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                }
                catch (Exception ex)
                {
                    Logger.Error($"ハートビートエラー: {ex.Message}");
                }
            }, null, TimeSpan.FromSeconds(60), TimeSpan.FromSeconds(60));
        }

        /// <summary>
        /// ハートビート停止
        /// </summary>
        private void StopHeartbeat()
        {
            if (_heartbeatTimer != null)
            {
                _heartbeatTimer.Dispose();
                _heartbeatTimer = null;
            }
        }

        /// <summary>
        /// メッセージ受信ループ
        /// </summary>
        private async Task ReceiveLoopAsync()
        {
            var buffer = new byte[4096];

            try
            {
                while (_isConnected && !_cancellationTokenSource.Token.IsCancellationRequested)
                {
                    var result = await _client.ReceiveAsync(new ArraySegment<byte>(buffer), _cancellationTokenSource.Token);

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        Logger.Info("WebSocketサーバーから切断要求");
                        await DisconnectAsync();
                        break;
                    }

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        await HandleMessageAsync(json);
                    }
                }
            }
            catch (OperationCanceledException)
            {
                Logger.Info("WebSocket受信ループがキャンセルされました");
            }
            catch (Exception ex)
            {
                Logger.Error($"WebSocket受信エラー: {ex.Message}");
                _isConnected = false;

                if (Disconnected != null)
                {
                    Disconnected.Invoke(this, EventArgs.Empty);
                }

                if (ErrorOccurred != null)
                {
                    ErrorOccurred.Invoke(this, $"受信エラー: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// 受信メッセージ処理
        /// </summary>
        private async Task HandleMessageAsync(string json)
        {
            try
            {
                var message = JsonConvert.DeserializeObject<WebSocketMessage>(json);

                switch (message.Type)
                {
                    case "project_update":
                        if (ProjectUpdated != null && message.ProjectId.HasValue)
                        {
                            ProjectUpdated.Invoke(this, new ProjectUpdateEventArgs
                            {
                                ProjectId = message.ProjectId.Value,
                                Data = message.Data,
                                Timestamp = message.Timestamp
                            });
                        }
                        break;

                    case "task_update":
                        if (TaskUpdated != null && message.TaskId.HasValue && message.UserId.HasValue)
                        {
                            TaskUpdated.Invoke(this, new TaskUpdateEventArgs
                            {
                                TaskId = message.TaskId.Value,
                                UserId = message.UserId.Value,
                                Data = message.Data,
                                Timestamp = message.Timestamp
                            });
                        }
                        break;

                    case "worklog_created":
                        if (WorkLogCreated != null && message.UserId.HasValue)
                        {
                            WorkLogCreated.Invoke(this, new WorkLogEventArgs
                            {
                                UserId = message.UserId.Value,
                                Data = message.Data,
                                Timestamp = message.Timestamp
                            });
                        }
                        break;

                    case "ai_alert":
                        if (AiAlertReceived != null && message.ProjectId.HasValue)
                        {
                            AiAlertReceived.Invoke(this, new AiAlertEventArgs
                            {
                                ProjectId = message.ProjectId.Value,
                                Data = message.Data,
                                Timestamp = message.Timestamp
                            });
                        }
                        break;

                    case "pong":
                        // Heartbeat応答（ログ不要）
                        break;

                    case "auth_success":
                        Logger.Info("WebSocket認証成功");
                        break;

                    case "error":
                        Logger.Error($"WebSocketサーバーエラー: {message.Data}");
                        if (ErrorOccurred != null)
                        {
                            ErrorOccurred.Invoke(this, $"サーバーエラー: {message.Data}");
                        }
                        break;

                    default:
                        Logger.Warn($"未知のWebSocketメッセージタイプ: {message.Type}");
                        break;
                }
            }
            catch (Exception ex)
            {
                Logger.Error($"WebSocketメッセージ処理エラー: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        /// <summary>
        /// リソース解放
        /// </summary>
        public void Dispose()
        {
            try
            {
                DisconnectAsync().Wait();
            }
            catch (Exception ex)
            {
                Logger.Error($"WebSocketService Dispose エラー: {ex.Message}");
            }

            if (_client != null)
            {
                _client.Dispose();
                _client = null;
            }

            if (_cancellationTokenSource != null)
            {
                _cancellationTokenSource.Dispose();
                _cancellationTokenSource = null;
            }

            StopHeartbeat();
        }
    }

    #region メッセージモデル

    /// <summary>
    /// WebSocketメッセージ
    /// </summary>
    public class WebSocketMessage
    {
        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("projectId")]
        public int? ProjectId { get; set; }

        [JsonProperty("taskId")]
        public int? TaskId { get; set; }

        [JsonProperty("userId")]
        public int? UserId { get; set; }

        [JsonProperty("data")]
        public object Data { get; set; }

        [JsonProperty("timestamp")]
        public string Timestamp { get; set; }
    }

    #endregion

    #region イベント引数

    /// <summary>
    /// プロジェクト更新イベント引数
    /// </summary>
    public class ProjectUpdateEventArgs : EventArgs
    {
        public int ProjectId { get; set; }
        public object Data { get; set; }
        public string Timestamp { get; set; }
    }

    /// <summary>
    /// タスク更新イベント引数
    /// </summary>
    public class TaskUpdateEventArgs : EventArgs
    {
        public int TaskId { get; set; }
        public int UserId { get; set; }
        public object Data { get; set; }
        public string Timestamp { get; set; }
    }

    /// <summary>
    /// 作業ログ作成イベント引数
    /// </summary>
    public class WorkLogEventArgs : EventArgs
    {
        public int UserId { get; set; }
        public object Data { get; set; }
        public string Timestamp { get; set; }
    }

    /// <summary>
    /// AIアラートイベント引数
    /// </summary>
    public class AiAlertEventArgs : EventArgs
    {
        public int ProjectId { get; set; }
        public object Data { get; set; }
        public string Timestamp { get; set; }
    }

    #endregion
}
