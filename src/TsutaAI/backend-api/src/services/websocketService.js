// WebSocketサービス - リアルタイム通信を管理
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // userId -> WebSocket[]
  }

  /**
   * WebSocketサーバーを初期化します
   * @param {object} server - HTTPサーバーインスタンス
   */
  initialize(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      console.log('WebSocket接続が確立されました');

      // 接続時の初期化
      ws.userId = null;
      ws.isAlive = true;

      // Pongメッセージの処理
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // メッセージ受信
      ws.on('message', (message) => {
        this.handleMessage(ws, message);
      });

      // 接続終了
      ws.on('close', () => {
        this.removeClient(ws);
        console.log('WebSocket接続が切断されました');
      });

      // エラー処理
      ws.on('error', (error) => {
        console.error('WebSocketエラー:', error);
        this.removeClient(ws);
      });
    });

    // Ping/Pongで接続維持チェック（30秒間隔）
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          this.removeClient(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log('WebSocketサーバーが起動しました (path: /ws)');
  }

  /**
   * 受信メッセージを処理します
   * @param {WebSocket} ws - WebSocketクライアント
   * @param {Buffer|string} message - 受信メッセージ
   */
  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'auth':
          // 認証: トークン検証またはユーザーID直接登録
          let userId = data.userId;

          if (data.token) {
            try {
              const decoded = jwt.verify(data.token, JWT_SECRET);
              userId = decoded.userId;
            } catch (err) {
              console.warn('WebSocket認証トークン無効:', err.message);
              ws.send(JSON.stringify({ type: 'error', message: '認証トークンが無効です' }));
              return;
            }
          }

          if (!userId) {
            ws.send(JSON.stringify({ type: 'error', message: 'ユーザーIDまたは有効なトークンが必要です' }));
            return;
          }

          this.registerClient(ws, userId);
          ws.send(JSON.stringify({ type: 'auth_success', userId: userId }));
          break;

        case 'ping':
          // Ping応答
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.warn('不明なメッセージタイプ:', data.type);
      }
    } catch (error) {
      console.error('メッセージ処理エラー:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'メッセージの解析に失敗しました' }));
    }
  }

  /**
   * クライアントを登録します
   * @param {WebSocket} ws - WebSocketクライアント
   * @param {number} userId - ユーザーID
   */
  registerClient(ws, userId) {
    ws.userId = userId;

    if (!this.clients.has(userId)) {
      this.clients.set(userId, []);
    }
    this.clients.get(userId).push(ws);

    console.log(`ユーザー ${userId} を登録しました (接続数: ${this.clients.get(userId).length})`);
  }

  /**
   * クライアントを削除します
   * @param {WebSocket} ws - WebSocketクライアント
   */
  removeClient(ws) {
    if (!ws.userId) return;

    const userClients = this.clients.get(ws.userId);
    if (userClients) {
      const index = userClients.indexOf(ws);
      if (index !== -1) {
        userClients.splice(index, 1);
      }

      if (userClients.length === 0) {
        this.clients.delete(ws.userId);
      }

      console.log(`ユーザー ${ws.userId} の接続を削除しました`);
    }
  }

  /**
   * 特定のユーザーにメッセージを送信します
   * @param {number} userId - ユーザーID
   * @param {object} message - 送信するメッセージ
   */
  sendToUser(userId, message) {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.length === 0) {
      console.log(`ユーザー ${userId} は接続していません`);
      return false;
    }

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    userClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
        sentCount++;
      }
    });

    console.log(`ユーザー ${userId} に ${sentCount} 件の接続にメッセージを送信しました`);
    return sentCount > 0;
  }

  /**
   * 全ユーザーにメッセージをブロードキャストします
   * @param {object} message - 送信するメッセージ
   */
  broadcast(message) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
        sentCount++;
      }
    });

    console.log(`${sentCount} 件の接続にブロードキャストしました`);
  }

  /**
   * プロジェクトの進捗更新を通知します
   * @param {number} projectId - プロジェクトID
   * @param {object} update - 更新情報
   */
  notifyProjectUpdate(projectId, update) {
    this.broadcast({
      type: 'project_update',
      projectId,
      data: update,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * タスクの状態変更を通知します
   * @param {number} taskId - タスクID
   * @param {number} userId - ユーザーID
   * @param {object} taskData - タスクデータ
   */
  notifyTaskUpdate(taskId, userId, taskData) {
    this.broadcast({
      type: 'task_update',
      taskId,
      userId,
      data: taskData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 作業ログが記録されたことを通知します
   * @param {number} userId - ユーザーID
   * @param {object} workLog - 作業ログデータ
   */
  notifyWorkLogCreated(userId, workLog) {
    this.broadcast({
      type: 'worklog_created',
      userId,
      data: workLog,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * AIアラートを通知します
   * @param {number} projectId - プロジェクトID
   * @param {object} alert - アラート情報
   */
  notifyAiAlert(projectId, alert) {
    this.broadcast({
      type: 'ai_alert',
      projectId,
      data: alert,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * WebSocketサーバーを停止します
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.wss) {
      this.wss.clients.forEach((ws) => {
        ws.close();
      });
      this.wss.close();
      console.log('WebSocketサーバーを停止しました');
    }
  }
}

// シングルトンインスタンスをエクスポート
module.exports = new WebSocketService();
