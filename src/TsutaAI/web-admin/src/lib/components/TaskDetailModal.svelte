<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';

	export let task: any;
	export let projectId: number;
	export let users: Map<number, string> = new Map();

	const dispatch = createEventDispatcher();

	let activeTab: 'details' | 'comments' | 'activity' = 'details';
	let comments: any[] = [];
	let activityLog: any[] = [];
	let newComment = '';

	function getUserName(userId: number | null | undefined): string {
		if (!userId) return '未割当';
		return users.get(userId) || `User ${userId}`;
	}

	onMount(async () => {
		await loadComments();
		await loadActivityLog();
	});

	async function loadComments() {
		try {
			const response = await apiClient.get<any[]>(`/tasks/${task.id}/comments`);
			if (response.success) {
				comments = response.data;
			}
		} catch (e) {
			console.error('Failed to load comments:', e);
		}
	}

	async function loadActivityLog() {
		try {
			const response = await apiClient.get<any[]>(`/tasks/${task.id}/activity`);
			if (response.success) {
				activityLog = response.data;
			}
		} catch (e) {
			console.error('Failed to load activity log:', e);
		}
	}

	async function handleAddComment() {
		if (!newComment.trim()) return;

		try {
			const response = await apiClient.post(`/tasks/${task.id}/comments`, {
				userId: 1, // デモ用
				content: newComment
			});

			if (response.success) {
				newComment = '';
				await loadComments();
			}
		} catch (e) {
			alert('コメントの追加に失敗しました');
		}
	}

	function close() {
		dispatch('close');
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			close();
		}
	}
</script>

<div class="modal-backdrop" on:click={handleBackdropClick}>
	<div class="modal-container">
		<div class="modal-header">
			<div class="header-left">
				<h2>{task.name}</h2>
				<div class="status-badges">
					<span class="badge status-{task.status}">
						{task.status === 'todo' ? '未着手' : task.status === 'in_progress' ? '進行中' : '完了'}
					</span>
					<span class="badge priority-{task.priority}">
						{task.priority === 'urgent'
							? '緊急'
							: task.priority === 'high'
								? '高'
								: task.priority === 'medium'
									? '中'
									: '低'}
					</span>
				</div>
			</div>
			<button class="close-btn" on:click={close}>✕</button>
		</div>

		<div class="modal-tabs">
			<button
				class="tab"
				class:active={activeTab === 'details'}
				on:click={() => (activeTab = 'details')}
			>
				📝 詳細
			</button>
			<button
				class="tab"
				class:active={activeTab === 'comments'}
				on:click={() => (activeTab = 'comments')}
			>
				💬 コメント ({comments.length})
			</button>
			<button
				class="tab"
				class:active={activeTab === 'activity'}
				on:click={() => (activeTab = 'activity')}
			>
				📊 アクティビティ ({activityLog.length})
			</button>
		</div>

		<div class="modal-body">
			{#if activeTab === 'details'}
				<div class="details-section">
					<!-- タスク詳細情報 -->
					<div class="info-grid">
						<div class="info-item">
							<label>担当者</label>
							<div class="info-value">
								{getUserName(task.assignedTo)}
							</div>
						</div>
						<div class="info-item">
							<label>期限</label>
							<div class="info-value">{task.dueDate || '未設定'}</div>
						</div>
						<div class="info-item">
							<label>見積工数</label>
							<div class="info-value">{task.estimatedHours || 0}時間</div>
						</div>
						<div class="info-item">
							<label>ストーリーポイント</label>
							<div class="info-value">{task.storyPoints || 0} pt</div>
						</div>
						<div class="info-item">
							<label>実績工数</label>
							<div class="info-value">{task.actualHours || 0}時間</div>
						</div>
					</div>

					<!-- タスク説明 -->
					<div class="description-section">
						<label>タスク説明</label>
						{#if task.description}
							<div class="description-content">
								{task.description}
							</div>
							<div class="char-count">
								{task.description.length} 文字
							</div>
						{:else}
							<div class="empty-description">
								<p>説明文がまだ登録されていません</p>
							</div>
						{/if}
					</div>
				</div>
			{:else if activeTab === 'comments'}
				<div class="comments-section">
					<div class="comment-input">
						<textarea bind:value={newComment} placeholder="コメントを入力..." rows="3"></textarea>
						<button class="btn-comment" on:click={handleAddComment}> 💬 コメント追加 </button>
					</div>

					<div class="comments-list">
						{#each comments as comment}
							<div class="comment-card">
								<div class="comment-header">
									<span class="comment-author">{comment.userName || 'ユーザー'}</span>
									<span class="comment-date">{comment.createdAt}</span>
								</div>
								<p class="comment-content">{comment.content}</p>
							</div>
						{:else}
							<div class="empty-state">
								<p>まだコメントがありません</p>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="activity-section">
					<div class="activity-list">
						{#each activityLog as log}
							<div class="activity-item">
								<div class="activity-icon">
									{#if log.actionType === 'created'}
										✨
									{:else if log.actionType === 'updated'}
										✏️
									{:else if log.actionType === 'status_changed'}
										🔄
									{:else if log.actionType === 'commented'}
										💬
									{:else}
										📝
									{/if}
								</div>
								<div class="activity-content">
									<div class="activity-header">
										<span class="activity-user">{log.userName || 'ユーザー'}</span>
										<span class="activity-action">{log.description}</span>
									</div>
									<div class="activity-date">{log.createdAt}</div>
								</div>
							</div>
						{:else}
							<div class="empty-state">
								<p>アクティビティ履歴がありません</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.modal-container {
		background: #ffffff;
		border-radius: 20px;
		width: 90%;
		max-width: 900px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 24px 32px;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-left {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		color: #111827;
	}

	.status-badges {
		display: flex;
		gap: 8px;
	}

	.badge {
		padding: 4px 12px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
	}

	.badge.status-todo {
		background: #f3f4f6;
		color: #6b7280;
	}

	.badge.status-in_progress {
		background: #dbeafe;
		color: #1e40af;
	}

	.badge.status-done {
		background: #d1fae5;
		color: #065f46;
	}

	.badge.priority-urgent {
		background: #fee2e2;
		color: #991b1b;
	}

	.badge.priority-high {
		background: #fed7aa;
		color: #9a3412;
	}

	.badge.priority-medium {
		background: #dbeafe;
		color: #1e40af;
	}

	.badge.priority-low {
		background: #f3f4f6;
		color: #6b7280;
	}

	.close-btn {
		background: #f3f4f6;
		border: none;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		font-size: 18px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: #e5e7eb;
		color: #111827;
	}

	.modal-tabs {
		display: flex;
		gap: 4px;
		padding: 16px 32px 0;
		border-bottom: 1px solid #e5e7eb;
	}

	.tab {
		padding: 12px 20px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: #6b7280;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tab:hover {
		color: #111827;
		background: #f9fafb;
		border-radius: 8px 8px 0 0;
	}

	.tab.active {
		color: #3b82f6;
		border-bottom-color: #3b82f6;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px 32px;
	}

	.details-section {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.info-item label {
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.info-value {
		font-size: 15px;
		color: #111827;
		font-weight: 500;
	}

	.description-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.description-section label {
		font-size: 14px;
		font-weight: 700;
		color: #111827;
	}

	.description-content {
		background: #f9fafb;
		padding: 20px;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		line-height: 1.8;
		color: #374151;
		white-space: pre-wrap;
	}

	.char-count {
		text-align: right;
		font-size: 12px;
		color: #9ca3af;
	}

	.empty-description {
		background: #f9fafb;
		padding: 40px 20px;
		border-radius: 12px;
		border: 2px dashed #e5e7eb;
		text-align: center;
	}

	.empty-description p {
		margin: 0;
		color: #6b7280;
	}

	/* コメントセクション */
	.comments-section {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.comment-input {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.comment-input textarea {
		width: 100%;
		padding: 12px;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		font-size: 14px;
		font-family: inherit;
		resize: vertical;
	}

	.btn-comment {
		align-self: flex-end;
		padding: 10px 20px;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.comments-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.comment-card {
		background: #f9fafb;
		padding: 16px;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
	}

	.comment-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.comment-author {
		font-weight: 600;
		color: #111827;
	}

	.comment-date {
		font-size: 12px;
		color: #9ca3af;
	}

	.comment-content {
		margin: 0;
		color: #374151;
		line-height: 1.6;
	}

	/* アクティビティセクション */
	.activity-section {
		display: flex;
		flex-direction: column;
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.activity-item {
		display: flex;
		gap: 12px;
		padding: 12px;
		background: #f9fafb;
		border-radius: 10px;
	}

	.activity-icon {
		font-size: 20px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ffffff;
		border-radius: 8px;
	}

	.activity-content {
		flex: 1;
	}

	.activity-header {
		display: flex;
		gap: 8px;
		margin-bottom: 4px;
	}

	.activity-user {
		font-weight: 600;
		color: #111827;
	}

	.activity-action {
		color: #6b7280;
	}

	.activity-date {
		font-size: 12px;
		color: #9ca3af;
	}

	.empty-state {
		padding: 40px 20px;
		text-align: center;
		color: #9ca3af;
	}
</style>
