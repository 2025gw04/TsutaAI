// WebSocketクライアントサービス - リアルタイム通信を管理
import { writable, type Writable } from 'svelte/store';
import { WEBSOCKET_URL } from '$lib/api/client';

export type WebSocketMessage = {
	type:
		| 'notification'
		| 'project_update'
		| 'task_update'
		| 'worklog_created'
		| 'ai_alert'
		| 'auth_success'
		| 'pong'
		| 'error';
	projectId?: number;
	taskId?: number;
	userId?: number;
	data?: any;
	timestamp?: string;
	message?: string;
};

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

class WebSocketClient {
	private ws: WebSocket | null = null;
	private reconnectTimer: number | null = null;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 10;
	private reconnectDelay = 3000;
	private userId: number | null = null;
	private heartbeatTimer: number | null = null;

	// ストア
	public status: Writable<WebSocketStatus> = writable('disconnected');
	public lastMessage: Writable<WebSocketMessage | null> = writable(null);
	public projectUpdates: Writable<WebSocketMessage[]> = writable([]);
	public taskUpdates: Writable<WebSocketMessage[]> = writable([]);
	public aiAlerts: Writable<WebSocketMessage[]> = writable([]);

	/**
	 * WebSocketサーバーに接続します
	 * @param userId ユーザーID
	 */
	connect(userId: number): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			console.log('WebSocketは既に接続されています');
			return;
		}

		this.userId = userId;
		this.status.set('connecting');

		try {
			this.ws = new WebSocket(WEBSOCKET_URL);

			this.ws.onopen = () => {
				console.log('WebSocket接続が確立されました');
				this.status.set('connected');
				this.reconnectAttempts = 0;

				// 認証メッセージを送信
				this.send({ type: 'auth', userId: this.userId });

				// ハートビート開始（60秒間隔）
				this.startHeartbeat();
			};

			this.ws.onmessage = (event) => {
				try {
					const message: WebSocketMessage = JSON.parse(event.data);
					this.handleMessage(message);
				} catch (error) {
					console.error('メッセージのパースに失敗しました:', error);
				}
			};

			this.ws.onerror = (error) => {
				console.error('WebSocketエラー:', error);
			};

			this.ws.onclose = () => {
				console.log('WebSocket接続が切断されました');
				this.status.set('disconnected');
				this.stopHeartbeat();
				this.attemptReconnect();
			};
		} catch (error) {
			console.error('WebSocket接続に失敗しました:', error);
			this.status.set('disconnected');
			this.attemptReconnect();
		}
	}

	/**
	 * WebSocketサーバーから切断します
	 */
	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		this.stopHeartbeat();

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.status.set('disconnected');
		this.reconnectAttempts = 0;
	}

	/**
	 * メッセージを送信します
	 * @param message 送信するメッセージ
	 */
	send(message: any): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		} else {
			console.warn('WebSocketが接続されていません');
		}
	}

	/**
	 * 受信メッセージを処理します
	 * @param message 受信したメッセージ
	 */
	private handleMessage(message: WebSocketMessage): void {
		this.lastMessage.set(message);

		switch (message.type) {
			case 'auth_success':
				console.log('認証成功:', message.userId);
				break;

			case 'notification':
				console.log('通知受信:', message.data);
				break;

			case 'project_update':
				console.log('プロジェクト更新:', message.projectId, message.data);
				this.projectUpdates.update((updates) => [...updates, message]);
				break;

			case 'task_update':
				console.log('タスク更新:', message.taskId, message.data);
				this.taskUpdates.update((updates) => [...updates, message]);
				break;

			case 'worklog_created':
				console.log('作業ログ作成:', message.userId, message.data);
				break;

			case 'ai_alert':
				console.log('AIアラート:', message.projectId, message.data);
				this.aiAlerts.update((alerts) => [...alerts, message]);
				break;

			case 'pong':
				// ハートビート応答
				break;

			case 'error':
				console.error('サーバーエラー:', message.message);
				break;

			default:
				console.warn('不明なメッセージタイプ:', message.type);
		}
	}

	/**
	 * 再接続を試みます
	 */
	private attemptReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error('最大再接続回数に達しました。再接続を中止します。');
			return;
		}

		this.reconnectAttempts++;
		this.status.set('reconnecting');

		console.log(`再接続を試みます... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

		this.reconnectTimer = window.setTimeout(() => {
			if (this.userId !== null) {
				this.connect(this.userId);
			}
		}, this.reconnectDelay);
	}

	/**
	 * ハートビートを開始します
	 */
	private startHeartbeat(): void {
		this.stopHeartbeat();

		this.heartbeatTimer = window.setInterval(() => {
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				this.send({ type: 'ping' });
			}
		}, 60000); // 60秒間隔
	}

	/**
	 * ハートビートを停止します
	 */
	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	/**
	 * 特定のイベントタイプの更新をクリアします
	 * @param type イベントタイプ
	 */
	clearUpdates(type: 'project' | 'task' | 'alert'): void {
		switch (type) {
			case 'project':
				this.projectUpdates.set([]);
				break;
			case 'task':
				this.taskUpdates.set([]);
				break;
			case 'alert':
				this.aiAlerts.set([]);
				break;
		}
	}
}

// シングルトンインスタンスをエクスポート
export const websocketClient = new WebSocketClient();
