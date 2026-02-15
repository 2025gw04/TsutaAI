import { writable, derived } from 'svelte/store';

/** 通知の型定義 */
export interface Notification {
	id: string;
	type: 'comment' | 'task_completed' | 'task_assigned' | 'due_soon' | 'mention' | 'system';
	title: string;
	message: string;
	taskId?: string;
	projectId?: number;
	createdAt: Date;
	read: boolean;
}

/** 通知一覧を保持するストア */
export const notifications = writable<Notification[]>([]);

/** 未読通知数 */
export const unreadCount = derived(
	notifications,
	($notifications) => $notifications.filter((n) => !n.read).length
);

/** 通知を追加 */
export function addNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) {
	notifications.update((items) => [
		{
			...notification,
			id: `notif-${Date.now()}-${Math.random()}`,
			createdAt: new Date(),
			read: false
		},
		...items
	]);
}

/** 通知を既読にする */
export function markAsRead(notificationId: string) {
	notifications.update((items) =>
		items.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
	);
}

/** すべての通知を既読にする */
export function markAllAsRead() {
	notifications.update((items) => items.map((item) => ({ ...item, read: true })));
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
