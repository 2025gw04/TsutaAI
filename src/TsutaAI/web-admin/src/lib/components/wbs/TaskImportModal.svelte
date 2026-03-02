<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import FileDropzone from '$lib/components/FileDropzone.svelte';
	import { apiClient } from '$lib/api/client';

	export let projectId: number;
	export let show = false;

	const dispatch = createEventDispatcher<{
		close: void;
		imported: { updated: number; added: number };
	}>();

	let selectedFile: File | null = null;
	let step: 'upload' | 'preview' | 'importing' = 'upload';
	let previewData: any = null;
	let errorMessage = '';
	let dropzoneComponent: any;

	function handleFileSelected(event: CustomEvent<{ file: File }>) {
		selectedFile = event.detail.file;
		errorMessage = '';
	}

	function handleFileError(event: CustomEvent<{ message: string }>) {
		errorMessage = event.detail.message;
		selectedFile = null;
	}

	async function handlePreview() {
		if (!selectedFile) {
			errorMessage = 'ファイルを選択してください。';
			return;
		}

		step = 'preview';
		errorMessage = '';

		try {
			const formData = new FormData();
			formData.append('file', selectedFile);
			formData.append('preview', 'true');

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

			const apiUrl = `${apiClient.getBaseUrl()}/tasks/import/${projectId}`;
			const response = await fetch(apiUrl, {
				method: 'POST',
				headers,
				body: formData
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'プレビューに失敗しました。');
			}

			previewData = result.preview;
		} catch (error: any) {
			console.error('Preview error:', error);
			errorMessage = error.message || 'プレビュー中にエラーが発生しました。';
			step = 'upload';
		}
	}

	async function handleExecuteImport() {
		if (!selectedFile) return;

		step = 'importing';
		errorMessage = '';

		try {
			const formData = new FormData();
			formData.append('file', selectedFile);
			formData.append('preview', 'false');

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

			const apiUrl = `${apiClient.getBaseUrl()}/tasks/import/${projectId}`;
			const response = await fetch(apiUrl, {
				method: 'POST',
				headers,
				body: formData
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'インポートに失敗しました。');
			}

			// 成功
			dispatch('imported', result.result);
			handleClose();
		} catch (error: any) {
			console.error('Import error:', error);
			errorMessage = error.message || 'インポート中にエラーが発生しました。';
			step = 'preview';
		}
	}

	function handleBack() {
		step = 'upload';
		previewData = null;
		errorMessage = '';
	}

	function handleClose() {
		show = false;
		step = 'upload';
		selectedFile = null;
		previewData = null;
		errorMessage = '';
		dropzoneComponent?.clearFile();
		dispatch('close');
	}
</script>

<div class="overlay" on:click={handleClose} role="button" tabindex="0">
	<div class="modal-window" on:click|stopPropagation role="dialog">
		<div class="modal-header">
			<h2>
				{#if step === 'upload'}
					タスクリストをインポート
				{:else if step === 'preview'}
					インポート内容を確認
				{:else}
					インポート中...
				{/if}
			</h2>
			<button class="btn-close" on:click={handleClose}>&times;</button>
		</div>

		<div class="modal-body">
			{#if step === 'upload'}
				<div class="section">
					<p class="section-description">
						JSON または CSV 形式のタスクリストをアップロードしてください。
						タスクキーが一致するタスクは更新され、新しいタスクは追加されます。
					</p>
					<FileDropzone
						bind:this={dropzoneComponent}
						accept=".json,.csv"
						on:fileSelected={handleFileSelected}
						on:error={handleFileError}
					/>
				</div>

				<div class="section">
					<h3 class="section-title">使い方</h3>
					<ol class="instructions">
						<li>プロジェクトをエクスポートしてファイルを取得</li>
						<li>Excel や テキストエディタで編集</li>
						<li>編集したファイルをここにアップロード</li>
						<li>タスクキーが同じものは更新、新しいキーは追加</li>
					</ol>
				</div>

				{#if errorMessage}
					<div class="alert alert-error">
						<svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
						<span>{errorMessage}</span>
					</div>
				{/if}

				<div class="modal-actions">
					<button class="btn btn-secondary" on:click={handleClose}> キャンセル </button>
					<button class="btn btn-primary" on:click={handlePreview} disabled={!selectedFile}>
						プレビュー
					</button>
				</div>
			{:else if step === 'preview' && previewData}
				<div class="preview-summary">
					<div class="summary-item summary-update">
						<span class="summary-icon">✏️</span>
						<span class="summary-label">更新</span>
						<span class="summary-count">{previewData.summary.toUpdate}件</span>
					</div>
					<div class="summary-item summary-add">
						<span class="summary-icon">➕</span>
						<span class="summary-label">追加</span>
						<span class="summary-count">{previewData.summary.toAdd}件</span>
					</div>
					<div class="summary-item summary-error">
						<span class="summary-icon">❌</span>
						<span class="summary-label">エラー</span>
						<span class="summary-count">{previewData.summary.errors}件</span>
					</div>
				</div>

				{#if previewData.errors && previewData.errors.length > 0}
					<div class="preview-section preview-errors">
						<h3>エラー ({previewData.errors.length}件)</h3>
						<div class="error-list">
							{#each previewData.errors as error}
								<div class="error-item">
									<span class="error-row">行{error.row}</span>
									<span class="error-key">{error.task_key || '(キーなし)'}</span>
									<span class="error-message">{error.error}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if previewData.toUpdate && previewData.toUpdate.length > 0}
					<div class="preview-section">
						<h3>更新されるタスク ({previewData.toUpdate.length}件)</h3>
						<div class="change-list">
							{#each previewData.toUpdate.slice(0, 10) as item}
								<div class="change-item">
									<div class="change-header">
										<span class="task-key">{item.task_key}</span>
										<span class="task-name">{item.current.name}</span>
									</div>
									{#if item.changes && item.changes.length > 0}
										<div class="changes">
											{#each item.changes as change}
												<div class="change-detail">
													<span class="field-name">{change.field}:</span>
													<span class="old-value">{change.old}</span>
													<span class="arrow">→</span>
													<span class="new-value">{change.new}</span>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
							{#if previewData.toUpdate.length > 10}
								<div class="more-items">
									他 {previewData.toUpdate.length - 10}件...
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if previewData.toAdd && previewData.toAdd.length > 0}
					<div class="preview-section">
						<h3>追加されるタスク ({previewData.toAdd.length}件)</h3>
						<div class="add-list">
							{#each previewData.toAdd.slice(0, 10) as task}
								<div class="add-item">
									<span class="task-name">{task.name}</span>
									{#if task.task_key}
										<span class="task-key">{task.task_key}</span>
									{:else}
										<span class="task-key-auto">(自動生成)</span>
									{/if}
								</div>
							{/each}
							{#if previewData.toAdd.length > 10}
								<div class="more-items">
									他 {previewData.toAdd.length - 10}件...
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if errorMessage}
					<div class="alert alert-error">
						<svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
						<span>{errorMessage}</span>
					</div>
				{/if}

				<div class="modal-actions">
					<button class="btn btn-secondary" on:click={handleClose}> 戻る </button>
					<button
						class="btn btn-primary"
						on:click={handleExecuteImport}
						disabled={previewData.summary.errors > 0}
					>
						{previewData.summary.errors > 0 ? 'エラーを修正してください' : 'インポート実行'}
					</button>
				</div>
			{:else if step === 'importing'}
				<div class="importing">
					<div class="spinner"></div>
					<p>インポート中...</p>
				</div>
			{/if}
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
		max-width: 800px;
		max-height: 90vh;
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
		font-size: 1.5rem;
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
		overflow-y: auto;
		flex: 1;
	}

	.section {
		margin-bottom: 2rem;
	}

	.section-description {
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 1rem;
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: #374151;
		margin-bottom: 0.75rem;
	}

	.instructions {
		font-size: 0.875rem;
		color: #4b5563;
		padding-left: 1.5rem;
		margin: 0;
	}

	.instructions li {
		margin-bottom: 0.5rem;
	}

	.preview-summary {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem;
		border-radius: 8px;
		background: #f9fafb;
	}

	.summary-item.summary-update {
		background: #fef3c7;
	}

	.summary-item.summary-add {
		background: #d1fae5;
	}

	.summary-item.summary-error {
		background: #fee2e2;
	}

	.summary-icon {
		font-size: 2rem;
		margin-bottom: 0.5rem;
	}

	.summary-label {
		font-size: 0.75rem;
		color: #6b7280;
		margin-bottom: 0.25rem;
	}

	.summary-count {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1f2937;
	}

	.preview-section {
		margin-bottom: 1.5rem;
	}

	.preview-section h3 {
		font-size: 1rem;
		font-weight: 600;
		color: #374151;
		margin-bottom: 0.75rem;
	}

	.preview-errors {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		padding: 1rem;
	}

	.error-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.error-item {
		display: flex;
		gap: 0.75rem;
		font-size: 0.875rem;
	}

	.error-row {
		font-weight: 600;
		color: #b91c1c;
		min-width: 50px;
	}

	.error-key {
		color: #6b7280;
		min-width: 100px;
	}

	.error-message {
		color: #991b1b;
		flex: 1;
	}

	.change-list,
	.add-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.change-item {
		background: #fef9c3;
		border: 1px solid #fde047;
		border-radius: 6px;
		padding: 1rem;
	}

	.change-header {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.task-key {
		font-family: monospace;
		background: #374151;
		color: white;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.task-name {
		font-weight: 600;
		color: #374151;
	}

	.changes {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
	}

	.change-detail {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.field-name {
		font-weight: 600;
		color: #6b7280;
		min-width: 120px;
	}

	.old-value {
		color: #9ca3af;
		text-decoration: line-through;
	}

	.arrow {
		color: #6b7280;
	}

	.new-value {
		color: #059669;
		font-weight: 600;
	}

	.add-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: #dcfce7;
		border: 1px solid #86efac;
		border-radius: 6px;
		padding: 0.75rem 1rem;
	}

	.task-key-auto {
		font-size: 0.75rem;
		color: #6b7280;
		font-style: italic;
	}

	.more-items {
		text-align: center;
		color: #6b7280;
		font-size: 0.875rem;
		padding: 0.5rem;
	}

	.alert {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		margin-top: 1rem;
	}

	.alert-error {
		background-color: #fff5f5;
		border: 1px solid #feb2b2;
		color: #c53030;
	}

	.alert-icon {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		stroke-width: 2;
	}

	.importing {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		padding-top: 1.5rem;
		border-top: 1px solid #e5e7eb;
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
