<script lang="ts" context="module">
	export type PromptModalMode = 'create' | 'edit';
</script>

<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let mode: PromptModalMode = 'create';
	export let catalog: Array<{ id: string; name: string; preview: string }> = [];
	export let assignment: {
		id?: number;
		promptName: string;
		responsibility: string;
		notes: string;
	} = {
		promptName: '',
		responsibility: '',
		notes: ''
	};

	const dispatch = createEventDispatcher();

	let selectedPrompt = assignment.promptName || (catalog[0]?.name ?? '');

	$: if (mode === 'edit') {
		selectedPrompt = assignment.promptName;
	}

	function close() {
		dispatch('cancel');
	}

	function handleSubmit() {
		dispatch('save', {
			promptName: selectedPrompt,
			responsibility: assignment.responsibility,
			notes: assignment.notes,
			id: assignment.id
		});
	}
</script>

<div
	class="overlay"
	role="presentation"
	tabindex="-1"
	on:click={close}
	on:keydown={(event) => event.key === 'Escape' && close()}
>
	<div
		class="modal-window"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		on:click|stopPropagation
		on:keydown|stopPropagation
	>
		<header>
			<h3>{mode === 'create' ? 'プロンプトを割り当て' : '担当プロンプトを編集'}</h3>
			<button type="button" class="close" on:click={close} aria-label="閉じる">
				<i class="bi bi-x-lg"></i>
			</button>
		</header>

		<form class="form" on:submit|preventDefault={handleSubmit}>
			<label>
				<span>プロンプト</span>
				<select bind:value={selectedPrompt} disabled={mode === 'edit'} required>
					{#each catalog as item}
						<option value={item.name}>{item.name}</option>
					{/each}
				</select>
				{#if catalog.length === 0}
					<small>使用可能なプロンプトが見つかりません。</small>
				{:else}
					<small class="preview"
						>{catalog.find((item) => item.name === selectedPrompt)?.preview}</small
					>
				{/if}
			</label>

			<label>
				<span>責任範囲</span>
				<input
					type="text"
					bind:value={assignment.responsibility}
					placeholder="例: プロンプト改善、レビュー対応"
				/>
			</label>

			<label>
				<span>補足メモ</span>
				<textarea rows="3" bind:value={assignment.notes} placeholder="引き継ぎ事項など"></textarea>
			</label>

			<div class="actions">
				<button type="button" class="btn ghost" on:click={close}>キャンセル</button>
				<button type="submit" class="btn primary">
					{mode === 'create' ? '割り当てる' : '更新する'}
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
		z-index: 210;
		padding: 24px;
	}

	.modal-window {
		width: min(500px, 100%);
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		padding: 24px 28px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #111827;
	}

	h3 {
		margin: 0;
		font-size: 18px;
	}

	.close {
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		color: #6b7280;
	}

	select,
	input,
	textarea {
		border-radius: 12px;
		border: 1px solid #d1d5db;
		background: #f9fafb;
		color: #111827;
		padding: 10px 12px;
		font-size: 13px;
	}

	textarea {
		resize: vertical;
	}

	select:focus,
	input:focus,
	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.preview {
		color: #9ca3af;
		font-size: 11px;
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
		color: #374151;
		border-color: #d1d5db;
	}

	.btn.primary {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		color: #ffffff;
	}
</style>
