import { writable, derived, get } from 'svelte/store';
import { apiClient } from '$lib/api/client';
import { websocketClient, type WebSocketMessage } from '$lib/services/websocket';

export type NotificationType =
	| 'comment'
	| 'task_completed'
	| 'task_assigned'
	| 'due_soon'
	| 'mention'
	| 'system'
	| 'project_update'
	| 'task_update'
	| 'worklog_created'
	| 'ai_alert';

/** 通知の型定義 */
export interface Notification {
	id: string;
	/** バックエンド上の通知ID（存在する場合のみ） */
	serverId?: number;
	type: NotificationType;
	title: string;
	message: string;
	taskId?: number;
	projectId?: number;
	createdAt: Date;
	read: boolean;
}

type BackendNotification = {
	id?: number | string;
	type?: string;
	title?: string;
	message?: string;
	related_entity_type?: string | null;
	related_entity_id?: number | string | null;
	project_id?: number | string | null;
	task_id?: number | string | null;
	created_at?: string | Date;
	is_read?: boolean | number;
};

/** 通知一覧を保持するストア */
export const notifications = writable<Notification[]>([]);

/** 未読通知数 */
export const unreadCount = derived(
	notifications,
	($notifications) => $notifications.filter((n) => !n.read).length
);

let websocketSubscription: (() => void) | null = null;

function toSafeDate(value: string | Date | undefined): Date {
	const parsed = value ? new Date(value) : new Date();
	return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toNumber(value: unknown): number | undefined {
	if (value === null || value === undefined || value === '') return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

function toBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (!normalized) return false;
		if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
			return false;
		}
		return true;
	}
	return Boolean(value);
}

function normalizeType(type: unknown): NotificationType {
	switch (type) {
		case 'comment':
		case 'task_completed':
		case 'task_assigned':
		case 'due_soon':
		case 'mention':
		case 'system':
		case 'project_update':
		case 'task_update':
		case 'worklog_created':
		case 'ai_alert':
			return type;
		default:
			return 'system';
	}
}

function upsertNotification(notification: Notification): void {
	notifications.update((items) => {
		const index = items.findIndex((item) => item.id === notification.id);
		if (index === -1) {
			return [notification, ...items];
		}

		const updated = [...items];
		updated[index] = { ...updated[index], ...notification };
		return updated;
	});
}

function mapBackendNotification(raw: BackendNotification): Notification {
	const relatedType = String(raw.related_entity_type || '').toLowerCase();
	const relatedId = toNumber(raw.related_entity_id);
	const projectId =
		toNumber(raw.project_id) || (relatedType === 'project' ? relatedId : undefined);
	const taskId = toNumber(raw.task_id) || (relatedType === 'task' ? relatedId : undefined);
	const serverId = toNumber(raw.id);

	return {
		id: serverId ? `server-${serverId}` : `server-${Date.now()}-${Math.random()}`,
		serverId,
		type: normalizeType(raw.type),
		title: raw.title || '通知',
		message: raw.message || '新しい通知があります',
		projectId,
		taskId,
		createdAt: toSafeDate(raw.created_at),
		read: toBoolean(raw.is_read)
	};
}

function mapRealtimeMessage(message: WebSocketMessage): Notification | null {
	if (message.type === 'notification' && message.data) {
		return mapBackendNotification(message.data as BackendNotification);
	}

	const payload = message.data || {};
	const action = typeof payload.action === 'string' ? payload.action : '';

	switch (message.type) {
		case 'project_update': {
			const name = payload.project?.name || payload.project?.projectName;
			const actionLabel =
				action === 'created' ? '作成されました' : action === 'updated' ? '更新されました' : 'が更新されました';
			return {
				id: `rt-project-${message.timestamp || Date.now()}-${message.projectId || 'unknown'}`,
				type: 'project_update',
				title: 'プロジェクト更新',
				message: name ? `「${name}」${actionLabel}` : 'プロジェクト情報が更新されました',
				projectId: message.projectId,
				createdAt: toSafeDate(message.timestamp),
				read: false
			};
		}

		case 'task_update': {
			const name = payload.task?.name || payload.task?.title;
			const status = payload.task?.status;
			const actionLabel =
				action === 'created' ? '作成されました' : action === 'updated' ? '更新されました' : 'が更新されました';
			const messageText =
				name && status
					? `タスク「${name}」が${status}に${actionLabel.replace('されました', '変更されました')}`
					: name
						? `タスク「${name}」${actionLabel}`
						: 'タスクが更新されました';

			return {
				id: `rt-task-${message.timestamp || Date.now()}-${message.taskId || 'unknown'}`,
				type: 'task_update',
				title: 'タスク更新',
				message: messageText,
				projectId: toNumber(payload.task?.project_id) || toNumber(payload.task?.projectId),
				taskId: message.taskId,
				createdAt: toSafeDate(message.timestamp),
				read: false
			};
		}

		case 'worklog_created': {
			const minutes = toNumber(payload.duration_minutes) || toNumber(payload.durationMinutes);
			const activity = payload.activity_type || payload.activityType;
			const details: string[] = [];
			if (minutes) details.push(`${minutes}分`);
			if (typeof activity === 'string' && activity.length > 0) details.push(activity);

			return {
				id: `rt-worklog-${message.timestamp || Date.now()}-${payload.id || Math.random()}`,
				type: 'worklog_created',
				title: '作業ログ作成',
				message:
					details.length > 0
						? `新しい作業ログが記録されました（${details.join(' / ')}）`
						: '新しい作業ログが記録されました',
				taskId: toNumber(payload.task_id) || toNumber(payload.taskId),
				createdAt: toSafeDate(message.timestamp),
				read: false
			};
		}

		case 'ai_alert': {
			const alertMessage =
				typeof payload.message === 'string' && payload.message.trim().length > 0
					? payload.message
					: 'AIアラートが発生しました';

			return {
				id: `rt-ai-${message.timestamp || Date.now()}-${message.projectId || Math.random()}`,
				type: 'ai_alert',
				title: 'AIアラート',
				message: alertMessage,
				projectId: message.projectId,
				createdAt: toSafeDate(message.timestamp),
				read: false
			};
		}

		default:
			return null;
	}
}

/** 通知を追加 */
export function addNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) {
	upsertNotification({
		...notification,
		id: `notif-${Date.now()}-${Math.random()}`,
		createdAt: new Date(),
		read: false
	});
}

/** サーバー通知をロード */
export async function loadNotifications(): Promise<void> {
	try {
		const response = await apiClient.fetchNotifications();
		const mapped = (response.data || []).map(mapBackendNotification);
		notifications.set(mapped);
	} catch (error) {
		console.error('通知の取得に失敗しました:', error);
	}
}

/** WebSocket通知連携を開始 */
export function startNotificationSync(): void {
	if (websocketSubscription) return;

	websocketSubscription = websocketClient.lastMessage.subscribe((message) => {
		if (!message) return;
		const notification = mapRealtimeMessage(message);
		if (!notification) return;
		upsertNotification(notification);
	});
}

/** WebSocket通知連携を停止 */
export function stopNotificationSync(): void {
	if (!websocketSubscription) return;
	websocketSubscription();
	websocketSubscription = null;
}

/** 通知を既読にする */
export function markAsRead(notificationId: string) {
	const target = get(notifications).find((item) => item.id === notificationId);
	if (!target) return;

	notifications.update((items) =>
		items.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
	);

	if (target.serverId) {
		void apiClient.markNotificationAsRead(target.serverId).catch((error) => {
			console.error('通知既読の同期に失敗しました:', error);
		});
	}
}

/** すべての通知を既読にする */
export function markAllAsRead() {
	const hasUnread = get(notifications).some((item) => !item.read);
	if (!hasUnread) return;

	notifications.update((items) => items.map((item) => ({ ...item, read: true })));

	void apiClient.markAllNotificationsAsRead().catch((error) => {
		console.error('全通知既読の同期に失敗しました:', error);
	});
}

/** 通知を削除 */
export function removeNotification(notificationId: string) {
	notifications.update((items) => items.filter((item) => item.id !== notificationId));
}

/** すべての通知をクリア */
export function clearAllNotifications() {
	notifications.set([]);
}

/** サンプル通知を追加（デモ用） */
export function addSampleNotifications() {
	addNotification({
		type: 'task_assigned',
		title: 'タスクが割り当てられました',
		message: '「基本設計」タスクがあなたに割り当てられました'
	});

	addNotification({
		type: 'comment',
		title: '新しいコメント',
		message: '山田太郎さんが「企画・要件定義」にコメントしました'
	});

	addNotification({
		type: 'due_soon',
		title: '期限接近',
		message: '「要件定義書ドラフト作成」の期限が3日後に迫っています'
	});
}
