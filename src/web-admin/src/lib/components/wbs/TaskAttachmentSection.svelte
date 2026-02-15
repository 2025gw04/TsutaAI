<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from '$lib/components/wbs/types';

	export let task: WbsTask;
	export let attachments: Array<{
		id: number;
		fileName: string;
		fileSize: number;
		fileType: string;
		uploadedBy: number;
		createdAt: string;
		uploaderName?: string;
	}> = [];
	export let uploadFunction: (taskId: number, file: File) => Promise<void>;

	const dispatch = createEventDispatcher();

	let isDragging = false;
	let fileInput: HTMLInputElement;
	let isUploading = false;
	let uploadError: string | null = null;

	/** ファイルサイズをフォーマット */
	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	/** ファイルタイプアイコンを取得 */
	function getFileIcon(fileType: string): string {
		if (!fileType) return 'bi-file-earmark';
		if (fileType.startsWith('image/')) return 'bi-file-image';
		if (fileType.startsWith('video/')) return 'bi-file-play';
		if (fileType.startsWith('audio/')) return 'bi-file-music';
		if (fileType.includes('pdf')) return 'bi-file-pdf';
		if (fileType.includes('word') || fileType.includes('document')) return 'bi-file-word';
		if (fileType.includes('excel') || fileType.includes('spreadsheet')) return 'bi-file-excel';
		if (fileType.includes('powerpoint') || fileType.includes('presentation')) return 'bi-file-ppt';
		if (fileType.includes('zip') || fileType.includes('compressed')) return 'bi-file-zip';
		return 'bi-file-earmark';
	}

	/** ドラッグオーバー */
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	/** ドラッグリーブ */
	function handleDragLeave() {
		isDragging = false;
	}

	/** ドロップ */
	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFiles(files);
		}
	}

	/** ファイル選択 */
	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			handleFiles(target.files);
		}
	}

	/** ファイルアップロード処理 */
	async function handleFiles(files: FileList) {
		// タスクIDが数値でない場合（新規タスクなど）
		const taskIdNum = parseInt(task.id);
		if (isNaN(taskIdNum)) {
			uploadError = 'タスクを保存してからファイルを添付してください。';
			setTimeout(() => (uploadError = null), 3000);
			return;
		}

		isUploading = true;
		uploadError = null;

		try {
			// 各ファイルを順番にアップロード
			for (const file of Array.from(files)) {
				await uploadFunction(taskIdNum, file);
			}

			// アップロード成功を通知
			dispatch('uploadComplete');
		} catch (error) {
			console.error('ファイルのアップロードに失敗しました:', error);
			uploadError = 'ファイルのアップロードに失敗しました。';
			setTimeout(() => (uploadError = null), 5000);
		} finally {
			isUploading = false;
			// ファイル入力をリセット（同じファイルを再選択できるようにする）
			if (fileInput) {
				fileInput.value = '';
			}
		}
	}

	/** 日時をフォーマット */
	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('ja-JP', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/** ダウンロード */
	function handleDownload(attachment: any) {
		dispatch('downloadFile', {
			attachmentId: attachment.id,
			fileName: attachment.fileName
		});
	}
</script>

<div class="attachment-section">
	<div class="section-header">
		<h4><i class="bi bi-paperclip"></i> 添付ファイル ({attachments.length})</h4>
	</div>

	{#if uploadError}
		<div class="error-message">
			<i class="bi bi-exclamation-circle"></i>
			{uploadError}
		</div>
	{/if}

	<div
		class="drop-zone"
		class:dragging={isDragging}
		class:disabled={isUploading}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:drop={handleDrop}
		role="button"
		tabindex="0"
		on:click={() => !isUploading && fileInput.click()}
		on:keydown={(e) => e.key === 'Enter' && !isUploading && fileInput.click()}
	>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			on:change={handleFileSelect}
			style="display: none;"
			disabled={isUploading}
		/>

		{#if isUploading}
			<div class="uploading">
				<span class="spinner"></span>
				<p>アップロード中...</p>
			</div>
		{:else}
			<i class="bi bi-cloud-upload"></i>
			<p>ファイルをドラッグ&ドロップ</p>
			<p class="hint">またはクリックしてファイルを選択</p>
		{/if}
	</div>

	<div class="attachment-list">
		{#if attachments.length === 0}
			<div class="empty-state">
				<i class="bi bi-inbox"></i>
				<p>添付ファイルがありません</p>
			</div>
		{:else}
			{#each attachments as attachment (attachment.id)}
				<div class="attachment-item">
					<div class="attachment-icon">
						<i class="bi {getFileIcon(attachment.fileType)}"></i>
					</div>
					<div class="attachment-info">
						<div class="attachment-name">{attachment.fileName}</div>
						<div class="attachment-meta">
							<span>{formatFileSize(attachment.fileSize)}</span>
							<span>•</span>
							<span>{attachment.uploaderName || 'ユーザー'}</span>
							<span>•</span>
							<span>{formatDate(attachment.createdAt)}</span>
						</div>
					</div>
					<button
						type="button"
						class="btn-download"
						on:click={() => handleDownload(attachment)}
						title="ダウンロード"
					>
						<i class="bi bi-download"></i>
					</button>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.attachment-section {
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

	.drop-zone {
		border: 2px dashed #d1d5db;
		border-radius: 12px;
		padding: 32px 20px;
		text-align: center;
		background: #f9fafb;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.drop-zone:hover:not(.disabled),
	.drop-zone.dragging:not(.disabled) {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.drop-zone.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: #fee2e2;
		border: 1px solid #fca5a5;
		border-radius: 8px;
		color: #dc2626;
		font-size: 13px;
		margin-bottom: 12px;
	}

	.error-message i {
		font-size: 16px;
	}

	.drop-zone i {
		font-size: 40px;
		color: #9ca3af;
		margin-bottom: 12px;
	}

	.drop-zone p {
		margin: 4px 0;
		font-size: 13px;
		color: #6b7280;
	}

	.drop-zone .hint {
		font-size: 12px;
		color: #9ca3af;
	}

	.uploading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.uploading p {
		margin: 0;
		font-size: 13px;
		color: #3b82f6;
		font-weight: 600;
	}

	.attachment-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 400px;
		overflow-y: auto;
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

	.attachment-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		transition: border-color 0.2s ease;
	}

	.attachment-item:hover {
		border-color: #3b82f6;
	}

	.attachment-icon {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #eff6ff;
		border-radius: 8px;
	}

	.attachment-icon i {
		font-size: 20px;
		color: #3b82f6;
	}

	.attachment-info {
		flex: 1;
		min-width: 0;
	}

	.attachment-name {
		font-size: 13px;
		font-weight: 600;
		color: #111827;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.attachment-meta {
		font-size: 11px;
		color: #9ca3af;
		margin-top: 4px;
	}

	.attachment-meta span {
		margin: 0 4px;
	}

	.attachment-meta span:first-child {
		margin-left: 0;
	}

	.btn-download {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: transparent;
		border: 1px solid #e5e7eb;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-download:hover {
		background: #3b82f6;
		border-color: #3b82f6;
		color: #ffffff;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 3px solid #dbeafe;
		border-top-color: #3b82f6;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
