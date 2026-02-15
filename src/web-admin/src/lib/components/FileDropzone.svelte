<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let accept: string = '.txt,.csv,.json,.md';
	export let maxSizeMB: number = 10;
	export let disabled: boolean = false;

	const dispatch = createEventDispatcher<{
		fileSelected: { file: File };
		error: { message: string };
	}>();

	let isDragging = false;
	let fileInput: HTMLInputElement;
	let selectedFile: File | null = null;

	function handleDragOver(event: DragEvent) {
		if (disabled) return;
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handleDrop(event: DragEvent) {
		if (disabled) return;
		event.preventDefault();
		isDragging = false;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFile(files[0]);
		}
	}

	function handleFileInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const files = target.files;
		if (files && files.length > 0) {
			handleFile(files[0]);
		}
	}

	function handleFile(file: File) {
		// ファイルサイズチェック
		const maxSizeBytes = maxSizeMB * 1024 * 1024;
		if (file.size > maxSizeBytes) {
			dispatch('error', {
				message: `ファイルサイズが${maxSizeMB}MBを超えています。`
			});
			return;
		}

		// 拡張子チェック
		const allowedExtensions = accept.split(',').map((ext) => ext.trim());
		const fileExtension = '.' + file.name.toLowerCase().split('.').pop();
		if (!allowedExtensions.includes(fileExtension)) {
			dispatch('error', {
				message: `許可されていないファイル形式です。${accept} のいずれかをアップロードしてください。`
			});
			return;
		}

		selectedFile = file;
		dispatch('fileSelected', { file });
	}

	function openFilePicker() {
		if (disabled) return;
		fileInput?.click();
	}

	function clearFile() {
		selectedFile = null;
		if (fileInput) {
			fileInput.value = '';
		}
	}

	// 外部から呼び出せるように公開
	export { clearFile };
</script>

<div
	class="dropzone"
	class:dragging={isDragging}
	class:disabled
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:drop={handleDrop}
	role="button"
	tabindex="0"
	on:click={openFilePicker}
	on:keydown={(e) => e.key === 'Enter' && openFilePicker()}
>
	<input
		type="file"
		bind:this={fileInput}
		on:change={handleFileInput}
		{accept}
		{disabled}
		style="display: none;"
	/>

	{#if selectedFile}
		<div class="file-info">
			<svg class="icon-file" viewBox="0 0 24 24" fill="none" stroke="currentColor">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
				<path d="M14 2v6h6" />
			</svg>
			<div class="file-details">
				<div class="file-name">{selectedFile.name}</div>
				<div class="file-size">
					{(selectedFile.size / 1024).toFixed(1)} KB
				</div>
			</div>
			<button
				type="button"
				class="btn-clear"
				on:click|stopPropagation={clearFile}
				aria-label="ファイルをクリア"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	{:else}
		<div class="dropzone-content">
			<svg class="icon-upload" viewBox="0 0 24 24" fill="none" stroke="currentColor">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="17 8 12 3 7 8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
			<div class="dropzone-text">
				<p class="primary-text">ファイルをドラッグ＆ドロップ または クリックして選択</p>
				<p class="secondary-text">
					対応形式: {accept.replace(/\./g, '').toUpperCase()} (最大 {maxSizeMB}MB)
				</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.dropzone {
		border: 2px dashed #cbd5e0;
		border-radius: 8px;
		padding: 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s ease;
		background-color: #f7fafc;
	}

	.dropzone:hover:not(.disabled) {
		border-color: #4299e1;
		background-color: #ebf8ff;
	}

	.dropzone.dragging {
		border-color: #3182ce;
		background-color: #bee3f8;
		transform: scale(1.02);
	}

	.dropzone.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dropzone-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.icon-upload {
		width: 48px;
		height: 48px;
		color: #4299e1;
		stroke-width: 2;
	}

	.dropzone-text {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.primary-text {
		font-size: 1rem;
		font-weight: 600;
		color: #2d3748;
		margin: 0;
	}

	.secondary-text {
		font-size: 0.875rem;
		color: #718096;
		margin: 0;
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background-color: #fff;
		border-radius: 6px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.icon-file {
		width: 40px;
		height: 40px;
		color: #4299e1;
		flex-shrink: 0;
	}

	.file-details {
		flex: 1;
		text-align: left;
	}

	.file-name {
		font-weight: 600;
		color: #2d3748;
		word-break: break-all;
	}

	.file-size {
		font-size: 0.875rem;
		color: #718096;
		margin-top: 0.25rem;
	}

	.btn-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		background-color: transparent;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.btn-clear:hover {
		background-color: #fed7d7;
	}

	.btn-clear svg {
		width: 20px;
		height: 20px;
		color: #e53e3e;
		stroke-width: 2;
	}
</style>
