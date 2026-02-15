<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from '$lib/components/wbs/types';

	export let task: WbsTask;
	export let comments: Array<{
		id: number;
		content: string;
		userId: number;
		createdAt: string;
		userName?: string;
	}> = [];
	export let currentUserId: number | null = null;

	const dispatch = createEventDispatcher();

	let newComment = '';
	let isSubmitting = false;

	/** コメントを送信 */
	async function handleSubmitComment() {
		if (!newComment.trim()) return;

		isSubmitting = true;
		try {
			dispatch('addComment', {
				taskId: task.id,
				content: newComment.trim()
			});
			newComment = '';
		} finally {
			isSubmitting = false;
		}
	}

	/** コメントを削除 */
	async function handleDeleteComment(commentId: number) {
		if (!confirm('このコメントを削除しますか？')) return;

		dispatch('deleteComment', { commentId });
	}

	/** 日時をフォーマット */
	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'たった今';
		if (diffMins < 60) return `${diffMins}分前`;
		if (diffHours < 24) return `${diffHours}時間前`;
		if (diffDays < 7) return `${diffDays}日前`;

		return date.toLocaleDateString('ja-JP', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="comment-section">
	<div class="section-header">
		<h4><i class="bi bi-chat-left-text"></i> コメント ({comments.length})</h4>
	</div>

	<div class="comment-list">
		{#if comments.length === 0}
			<div class="empty-state">
				<i class="bi bi-chat"></i>
				<p>まだコメントがありません</p>
				<p class="hint">最初のコメントを追加して、チームと議論を始めましょう</p>
			</div>
		{:else}
			{#each comments as comment (comment.id)}
				<div class="comment-item">
					<div class="comment-avatar">
						<i class="bi bi-person-circle"></i>
					</div>
					<div class="comment-content">
						<div class="comment-header">
							<span class="comment-author">{comment.userName || 'ユーザー'}</span>
							<span class="comment-time">{formatDate(comment.createdAt)}</span>
						</div>
						<div class="comment-text">{comment.content}</div>
					</div>
					{#if currentUserId === comment.userId}
						<button
							type="button"
							class="btn-delete-comment"
							on:click={() => handleDeleteComment(comment.id)}
							title="コメントを削除"
						>
							<i class="bi bi-trash"></i>
						</button>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	<form class="comment-form" on:submit|preventDefault={handleSubmitComment}>
		<textarea
			bind:value={newComment}
			placeholder="コメントを入力..."
			rows="3"
			disabled={isSubmitting}
		></textarea>
		<div class="form-actions">
			<button type="submit" class="btn-submit" disabled={!newComment.trim() || isSubmitting}>
				{#if isSubmitting}
					<span class="spinner"></span>
					送信中...
				{:else}
					<i class="bi bi-send"></i>
					コメント
				{/if}
			</button>
		</div>
	</form>
</div>

<style>
	.comment-section {
		display: flex;
		flex-direction: column;
		gap: 16px;
		height: 100%;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.section-header h4 {
		margin: 0;
		font-size: 14px;
		color: #374151;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.section-header h4 i {
		color: #3b82f6;
	}

	.comment-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
		height: 400px;
		min-height: 400px;
	}

	.empty-state {
		text-align: center;
		padding: 40px 20px;
		color: #9ca3af;
	}

	.empty-state i {
		font-size: 48px;
		color: #d1d5db;
		margin-bottom: 12px;
	}

	.empty-state p {
		margin: 4px 0;
		font-size: 13px;
	}

	.empty-state .hint {
		font-size: 12px;
		color: #9ca3af;
	}

	.comment-item {
		display: flex;
		gap: 12px;
		padding: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
	}

	.comment-avatar {
		flex-shrink: 0;
	}

	.comment-avatar i {
		font-size: 32px;
		color: #9ca3af;
	}

	.comment-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.comment-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.comment-author {
		font-size: 13px;
		font-weight: 600;
		color: #111827;
	}

	.comment-time {
		font-size: 11px;
		color: #9ca3af;
	}

	.comment-text {
		font-size: 13px;
		line-height: 1.6;
		color: #374151;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.comment-form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid #e5e7eb;
	}

	.comment-form textarea {
		border-radius: 10px;
		border: 1px solid #e5e7eb;
		background: #ffffff;
		color: #111827;
		padding: 10px 12px;
		font-size: 13px;
		font-family: inherit;
		resize: vertical;
		min-height: 60px;
	}

	.comment-form textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px #dbeafe;
	}

	.comment-form textarea:disabled {
		background: #f3f4f6;
		cursor: not-allowed;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
	}

	.btn-submit {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: 8px;
		background: #3b82f6;
		border: none;
		color: #ffffff;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.btn-submit:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	.btn-submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.btn-delete-comment {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #9ca3af;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-delete-comment:hover {
		background: #fee2e2;
		color: #dc2626;
	}

	.btn-delete-comment i {
		font-size: 14px;
	}
</style>
