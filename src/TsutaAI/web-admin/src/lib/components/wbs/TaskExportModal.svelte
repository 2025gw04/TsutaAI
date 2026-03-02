<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { apiClient } from '$lib/api/client';

	export let projectId: number;
	export let show = false;

	const dispatch = createEventDispatcher<{
		close: void;
	}>();

	let format: 'json' | 'csv' = 'json';
	let isExporting = false;

	async function handleExport() {
		isExporting = true;
		try {
			const authJson = window.localStorage.getItem('tsutaai.auth');
			let token = null;
			if (authJson) {
				try {
					const auth = JSON.parse(authJson);
					token = auth.token;
				} catch (e) {
					console.error('Failed to parse auth token', e);
				}
			}

			const headers: HeadersInit = {};
			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
			}

			const response = await fetch(
				`${apiClient.getBaseUrl()}/tasks/export/${projectId}?format=${format}`,
				{
					method: 'GET',
					headers
				}
			);

			if (!response.ok) {
				throw new Error('エクスポートに失敗しました');
			}

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;

			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			a.download = `tasks-${projectId}-${timestamp}.${format}`;

			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);

			dispatch('close');
		} catch (error) {
			console.error('Export error:', error);
			alert('エクスポートに失敗しました。');
		} finally {
			isExporting = false;
		}
	}

	function handleClose() {
		show = false;
		dispatch('close');
	}
</script>

<div class="overlay" on:click={handleClose} role="button" tabindex="0">
	<div class="modal-window" on:click|stopPropagation role="dialog">
		<div class="modal-header">
			<h2>タスクをエクスポート</h2>
			<button class="btn-close" on:click={handleClose}>&times;</button>
		</div>

		<div class="modal-body">
			<p class="description">
				プロジェクトの全タスクをエクスポートします。<br />
				形式を選択してください。
			</p>

			<div class="form-group">
				<label class="radio-label">
					<input type="radio" bind:group={format} value="json" />
					<span class="radio-text">
						<strong>JSON</strong>
						<span class="hint"
							>システム間のデータ移行やバックアップに適しています。階層構造が保持されます。</span
						>
					</span>
				</label>

				<label class="radio-label">
					<input type="radio" bind:group={format} value="csv" />
					<span class="radio-text">
						<strong>CSV</strong>
						<span class="hint">Excelやスプレッドシートでの編集に適しています。</span>
					</span>
				</label>
			</div>

			<div class="modal-actions">
				<button class="btn btn-secondary" on:click={handleClose}> キャンセル </button>
				<button class="btn btn-primary" on:click={handleExport} disabled={isExporting}>
					{#if isExporting}
						エクスポート中...
					{:else}
						エクスポート実行
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		padding: 20px;
	}

	.modal-window {
		background: white;
		border-radius: 12px;
		max-width: 500px;
		width: 90%;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: #1a202c;
	}

	.btn-close {
		width: 32px;
		height: 32px;
		border: none;
		background: transparent;
		font-size: 2rem;
		color: #9ca3af;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.2s;
	}

	.btn-close:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.modal-body {
		padding: 2rem;
	}

	.description {
		color: #4b5563;
		margin-bottom: 1.5rem;
		line-height: 1.5;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.radio-label {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.radio-label:hover {
		background-color: #f9fafb;
		border-color: #d1d5db;
	}

	.radio-label input {
		margin-top: 4px;
	}

	.radio-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.hint {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background-color: #f3f4f6;
		color: #374151;
	}

	.btn-secondary:hover:not(:disabled) {
		background-color: #e5e7eb;
	}

	.btn-primary {
		background-color: #3b82f6;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: #2563eb;
	}
</style>
