<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from '$lib/components/wbs/types';

	/** 対象タスク */
	export let task: WbsTask;

	/** API呼び出し中かどうか */
	export let isProcessing = false;

	const dispatch = createEventDispatcher();

	let instruction = `タスク「${task.name}」を、成果物が明確になるレベルまで分解してください。`;

	/** モーダルを閉じる */
	function close() {
		dispatch('close');
	}

	/** フォーム送信を処理する */
	function handleSubmit() {
		dispatch('confirm', { instruction });
	}
</script>

<div
	class="overlay"
	role="presentation"
	tabindex="-1"
	on:click={close}
	on:keydown={(event) => {
		if (event.key === 'Escape') {
			close();
		}
	}}
>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		on:click|stopPropagation
		on:keydown|stopPropagation
	>
		<header>
			<h3>AIでサブタスクを提案</h3>
			<button type="button" class="close" on:click={close} aria-label="閉じる">
				<i class="bi bi-x-lg"></i>
			</button>
		</header>
		<p class="lead">
			AIにタスクを渡し、具体的なサブタスクを生成します。必要があれば追加の指示を書き込んでください。
		</p>

		<div class="parent-context-info">
			<h4><i class="bi bi-diagram-3"></i> 親タスク: {task.name}</h4>

			{#if !task.description}
				<div class="warning">
					<i class="bi bi-exclamation-triangle"></i>
					<div>
						<p class="warning-title">親タスクに説明がありません</p>
						<p class="warning-text">
							サブタスクの品質向上のため、先に親タスクの説明を生成することをお勧めします。
							サブタスク生成時に自動生成を提案します。
						</p>
					</div>
				</div>
			{:else}
				<div class="parent-description">
					<p class="desc-label"><i class="bi bi-file-text"></i> 親タスクの説明</p>
					<div class="desc-content">
						{task.description.slice(0, 300)}{#if task.description.length > 300}...{/if}
					</div>
					<p class="desc-hint">この情報を元に、一貫性のあるサブタスクを生成します</p>
				</div>
			{/if}
		</div>

		<form on:submit|preventDefault={handleSubmit} class="form">
			<label>
				<span>AIへの指示</span>
				<textarea
					rows="4"
					bind:value={instruction}
					placeholder="例: テスト観点の棚卸しも含めてください"
				></textarea>
			</label>

			<div class="actions">
				<button type="button" class="btn ghost" on:click={close}>キャンセル</button>
				<button type="submit" class="btn primary" disabled={isProcessing}>
					{#if isProcessing}
						<span class="spinner"></span> 分析中…
					{:else}
						<i class="bi bi-magic"></i> サブタスクを生成
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 120;
		padding: 24px;
	}

	.modal {
		width: min(540px, 100%);
		border-radius: 20px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		padding: 24px 28px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #111827;
	}

	.close {
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
	}

	.lead {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
		line-height: 1.6;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 12px;
		color: #9ca3af;
	}

	textarea {
		border-radius: 14px;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		color: #111827;
		padding: 12px 14px;
		font-size: 13px;
		resize: vertical;
		min-height: 120px;
	}

	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px #dbeafe;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.btn.ghost {
		background: transparent;
		color: #6b7280;
		border-color: #e5e7eb;
	}

	.btn.primary {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		color: #ffffff;
	}

	.btn:disabled {
		opacity: 0.7;
		cursor: progress;
	}

	.spinner {
		width: 16px;
		height: 16px;
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

	/* 親コンテキスト情報 */
	.parent-context-info {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 14px;
		padding: 16px;
	}

	.parent-context-info h4 {
		margin: 0 0 12px 0;
		font-size: 14px;
		color: #374151;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.parent-context-info h4 i {
		color: #3b82f6;
	}

	.warning {
		display: flex;
		gap: 12px;
		padding: 12px;
		background: #fef3c7;
		border: 1px solid #fbbf24;
		border-radius: 10px;
	}

	.warning > i {
		font-size: 20px;
		color: #f59e0b;
		flex-shrink: 0;
	}

	.warning-title {
		margin: 0 0 4px 0;
		font-size: 13px;
		font-weight: 600;
		color: #92400e;
	}

	.warning-text {
		margin: 0;
		font-size: 12px;
		color: #78350f;
		line-height: 1.5;
	}

	.parent-description {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.desc-label {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.desc-label i {
		color: #3b82f6;
	}

	.desc-content {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		padding: 12px;
		font-size: 12px;
		line-height: 1.6;
		color: #374151;
		max-height: 150px;
		overflow-y: auto;
	}

	.desc-hint {
		margin: 0;
		font-size: 11px;
		color: #9ca3af;
		font-style: italic;
	}
</style>
