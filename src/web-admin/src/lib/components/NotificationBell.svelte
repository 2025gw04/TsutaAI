<script lang="ts">
	import {
		notifications,
		unreadCount,
		markAsRead,
		markAllAsRead,
		removeNotification
	} from '$lib/stores/notificationStore';
	import { goto } from '$app/navigation';

	/** ドロップダウン表示フラグ */
	let showDropdown = false;

	/** ドロップダウンを切り替え */
	function toggleDropdown() {
		showDropdown = !showDropdown;
	}

	/** ドロップダウンを閉じる */
	function closeDropdown() {
		showDropdown = false;
	}

	/** 通知をクリック */
	function handleNotificationClick(notification: any) {
		markAsRead(notification.id);

		// タスクIDとプロジェクトIDがある場合は該当ページに遷移
		if (notification.taskId && notification.projectId) {
			goto(`/projects/${notification.projectId}/wbs?task=${notification.taskId}`);
		} else if (notification.projectId) {
			goto(`/projects/${notification.projectId}/wbs`);
		}

		closeDropdown();
	}

	/** すべて既読にする */
	function handleMarkAllAsRead() {
		markAllAsRead();
	}

	/** 通知を削除 */
	function handleRemove(event: Event, notificationId: string) {
		event.stopPropagation();
		removeNotification(notificationId);
	}

	/** 通知タイプに応じたアイコン */
	function getIcon(type: string): string {
		switch (type) {
			case 'comment':
				return 'bi-chat-left-text';
			case 'task_completed':
				return 'bi-check-circle';
			case 'task_assigned':
				return 'bi-person-plus';
			case 'due_soon':
				return 'bi-clock';
			case 'mention':
				return 'bi-at';
			case 'system':
				return 'bi-info-circle';
			default:
				return 'bi-bell';
		}
	}

	/** 通知タイプに応じた色 */
	function getColor(type: string): string {
		switch (type) {
			case 'comment':
				return '#3b82f6';
			case 'task_completed':
				return '#10b981';
			case 'task_assigned':
				return '#8b5cf6';
			case 'due_soon':
				return '#f59e0b';
			case 'mention':
				return '#ec4899';
			case 'system':
				return '#6b7280';
			default:
				return '#9ca3af';
		}
	}

	/** 経過時間を表示 */
	function formatTimeAgo(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'たった今';
		if (diffMins < 60) return `${diffMins}分前`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}時間前`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}日前`;
	}

	/** 外側クリックで閉じる */
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.notification-bell')) {
			closeDropdown();
		}
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="notification-bell">
	<button type="button" class="bell-button" on:click|stopPropagation={toggleDropdown}>
		<i class="bi bi-bell"></i>
		{#if $unreadCount > 0}
			<span class="badge">{$unreadCount > 9 ? '9+' : $unreadCount}</span>
		{/if}
	</button>

	{#if showDropdown}
		<div class="notification-dropdown">
			<div class="dropdown-header">
				<h3>通知</h3>
				{#if $unreadCount > 0}
					<button type="button" class="mark-all-read" on:click={handleMarkAllAsRead}>
						すべて既読
					</button>
				{/if}
			</div>

			<div class="notification-list">
				{#if $notifications.length === 0}
					<div class="empty-state">
						<i class="bi bi-bell-slash"></i>
						<p>通知はありません</p>
					</div>
				{:else}
					{#each $notifications.slice(0, 10) as notification (notification.id)}
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							class="notification-item"
							class:unread={!notification.read}
							on:click={() => handleNotificationClick(notification)}
						>
							<div class="notification-icon" style="background: {getColor(notification.type)}">
								<i class={getIcon(notification.type)}></i>
							</div>
							<div class="notification-content">
								<div class="notification-title">{notification.title}</div>
								<div class="notification-message">{notification.message}</div>
								<div class="notification-time">{formatTimeAgo(notification.createdAt)}</div>
							</div>
							<button
								type="button"
								class="remove-btn"
								on:click={(e) => handleRemove(e, notification.id)}
							>
								<i class="bi bi-x"></i>
							</button>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.notification-bell {
		position: relative;
	}

	.bell-button {
		position: relative;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 10px;
		background: #f3f4f6;
		color: #6b7280;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.bell-button:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.bell-button i {
		font-size: 18px;
	}

	.badge {
		position: absolute;
		top: 4px;
		right: 4px;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: #ef4444;
		color: #ffffff;
		font-size: 10px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.notification-dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 360px;
		max-height: 500px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
		display: flex;
		flex-direction: column;
		z-index: 1000;
	}

	.dropdown-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.dropdown-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.mark-all-read {
		padding: 6px 12px;
		border: none;
		border-radius: 6px;
		background: #dbeafe;
		color: #1e40af;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.mark-all-read:hover {
		background: #bfdbfe;
	}

	.notification-list {
		overflow-y: auto;
		flex: 1;
	}

	.empty-state {
		padding: 40px 20px;
		text-align: center;
		color: #9ca3af;
	}

	.empty-state i {
		font-size: 36px;
		margin-bottom: 12px;
	}

	.empty-state p {
		margin: 0;
		font-size: 14px;
	}

	.notification-item {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px 20px;
		border-bottom: 1px solid #f3f4f6;
		background: #ffffff;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.notification-item:hover {
		background: #f9fafb;
	}

	.notification-item.unread {
		background: #eff6ff;
	}

	.notification-item.unread:hover {
		background: #dbeafe;
	}

	.notification-icon {
		width: 36px;
		height: 36px;
		border-radius: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: #ffffff;
	}

	.notification-icon i {
		font-size: 16px;
	}

	.notification-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.notification-title {
		font-size: 13px;
		font-weight: 700;
		color: #111827;
	}

	.notification-message {
		font-size: 12px;
		color: #6b7280;
		line-height: 1.4;
	}

	.notification-time {
		font-size: 11px;
		color: #9ca3af;
	}

	.remove-btn {
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #9ca3af;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.remove-btn:hover {
		background: #fee2e2;
		color: #dc2626;
	}

	@media (max-width: 768px) {
		.notification-dropdown {
			width: 320px;
			max-height: 400px;
		}
	}

	/* 極小画面（480px以下）で全画面表示 */
	@media (max-width: 480px) {
		.notification-dropdown {
			position: fixed;
			top: 0;
			right: 0;
			left: 0;
			bottom: 0;
			width: 100%;
			max-height: 100vh;
			border-radius: 0;
		}

		.bell-button {
			width: 36px;
			height: 36px;
		}

		.bell-button i {
			font-size: 16px;
		}

		.badge {
			top: 2px;
			right: 2px;
			min-width: 16px;
			height: 16px;
			font-size: 9px;
		}

		.dropdown-header {
			padding: 12px 16px;
		}

		.notification-item {
			padding: 12px 16px;
		}
	}
</style>
