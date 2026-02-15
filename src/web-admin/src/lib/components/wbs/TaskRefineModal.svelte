<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from '$lib/components/wbs/types';

	/** 対象タスク */
	export let task: WbsTask;

	/** API呼び出し中かどうか */
	export let isProcessing = false;

	const dispatch = createEventDispatcher();

	let desiredOutcome = task.deliverable ?? '';
	let qualityFocus = '';
	let riskNotes = '';

	/** モーダルを閉じる */
	function close() {
		dispatch('close');
	}

	/** フォーム送信時の処理 */
	function handleSubmit() {
		dispatch('confirm', { desiredOutcome, qualityFocus, riskNotes });
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
			<h3>AIでタスクをブラッシュアップ</h3>
			<button type="button" class="close" on:click={close} aria-label="閉じる">
				<i class="bi bi-x-lg"></i>
			</button>
		</header>

		<p class="lead">
			タスク内容をAIに見直させ、成果物や工程の抜け漏れを改善します。こだわりたい観点やリスク懸念を指定してください。
		</p>

		<form on:submit|preventDefault={handleSubmit} class="form">
			<label>
				<span>期待する成果物 / ゴール</span>
				<textarea
					rows="3"
					bind:value={desiredOutcome}
					placeholder="例: テスト観点一覧とレビューコメントを取りまとめる"
				></textarea>
			</label>

			<label>
				<span>重点的に補強したい観点</span>
				<input
					type="text"
					bind:value={qualityFocus}
					placeholder="例: 品質管理、ステークホルダー合意"
				/>
			</label>

			<label>
				<span>考慮してほしいリスク・制約</span>
				<textarea
					rows="3"
					bind:value={riskNotes}
					placeholder="例: 3営業日以内に完了、他チームとの調整コストを最小化"
				></textarea>
			</label>

			<div class="actions">
				<button type="button" class="btn ghost" on:click={close}>キャンセル</button>
				<button type="submit" class="btn primary" disabled={isProcessing}>
					{#if isProcessing}
						<span class="spinner"></span> 再構築中…
					{:else}
						<i class="bi bi-stars"></i> タスクを改善
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
		width: min(560px, 100%);
		border-radius: 20px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		padding: 26px 30px;
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

	input,
	textarea {
		border-radius: 14px;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		color: #111827;
		padding: 12px 14px;
		font-size: 13px;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: #8b5cf6;
		box-shadow: 0 0 0 3px #ede9fe;
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
		background: linear-gradient(135deg, #8b5cf6, #3b82f6);
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
</style>
