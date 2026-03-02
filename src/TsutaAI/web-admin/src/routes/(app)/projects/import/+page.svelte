<script lang="ts">
	import { goto } from '$app/navigation';
	import FileDropzone from '$lib/components/FileDropzone.svelte';
	import { apiClient } from '$lib/api/client';

	let selectedFile: File | null = null;
	let additionalInstructions = '';
	let isUploading = false;
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

	async function handleSubmit() {
		if (isUploading) return;

		if (!selectedFile) {
			errorMessage = 'ファイルを選択してください。';
			return;
		}

		isUploading = true;
		errorMessage = '';

		try {
			const formData = new FormData();
			formData.append('file', selectedFile);
			formData.append('additionalInstructions', additionalInstructions);

			// JWTトークンを取得してAuthorizationヘッダーに追加
			const authJson =
				typeof window !== 'undefined' ? window.localStorage.getItem('tsutaai.auth') : null;
			let token: string | null = null;
			if (authJson) {
				try {
					const auth = JSON.parse(authJson);
					token = auth.token || null;
				} catch {
					token = null;
				}
			}

			const headers: HeadersInit = {};
			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
			}

			const apiUrl = `${apiClient.getBaseUrl()}/projects/import`;
			const response = await fetch(apiUrl, {
				method: 'POST',
				headers,
				body: formData
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'インポートに失敗しました。');
			}

			// 成功時はプロジェクト詳細ページへリダイレクト
			const projectId = result.data?.projectId;
			if (!projectId) {
				throw new Error('インポート結果にプロジェクトIDが含まれていません。');
			}

			goto(`/projects/${projectId}`);
		} catch (error: any) {
			console.error('Import error:', error);
			errorMessage = error.message || 'インポート中にエラーが発生しました。';
		} finally {
			isUploading = false;
		}
	}

	function handleCancel() {
		goto('/projects');
	}
</script>

<svelte:head>
	<title>プロジェクトのインポート - TsutaAI</title>
</svelte:head>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-file-earmark-arrow-up"></i>
				インポート
			</h1>
			<p>既存ファイルから作成</p>
		</div>
	</header>
</div>

<div class="container">
	<div class="content">
		<div class="section">
			<h2 class="section-title">ファイルを選択</h2>
			<p class="section-description">
				txt, csv, json, md 形式のファイルをアップロードしてください（最大10MB）
			</p>
			<FileDropzone
				bind:this={dropzoneComponent}
				on:fileSelected={handleFileSelected}
				on:error={handleFileError}
				disabled={isUploading}
			/>
		</div>

		<div class="section">
			<h2 class="section-title">追加の指示（オプション）</h2>
			<p class="section-description">
				AIにファイルの解析方法や特別な要件を伝えたい場合は、ここに記入してください。
			</p>
			<textarea
				class="textarea"
				bind:value={additionalInstructions}
				placeholder="例: このファイルは既存のプロジェクト計画書です。タスクの階層構造を維持し、担当者の情報は無視してください。"
				rows="5"
				disabled={isUploading}
			/>
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

		<div class="actions">
			<button
				type="button"
				class="btn btn-secondary"
				on:click={handleCancel}
				disabled={isUploading}
			>
				キャンセル
			</button>
			<button
				type="button"
				class="btn btn-primary"
				on:click={handleSubmit}
				disabled={!selectedFile || isUploading}
			>
				{#if isUploading}
					<svg class="spinner" viewBox="0 0 24 24">
						<circle cx="12" cy="12" r="10" stroke-width="4" />
					</svg>
					インポート中...
				{:else}
					インポート
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.container {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}

	/* Mobile/Tablet Styles (<960px) */
	@media (max-width: 960px) {
		.page-header-wrapper {
			display: block; /* Show header */
			margin: 0;
			background: #1c2638;
			color: #ffffff;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		}

		.page-header {
			width: 100%;
			height: 100%;
			display: flex;
			justify-content: flex-start;
			align-items: center;
			padding: 0 24px;
			box-sizing: border-box;
		}

		.header-content {
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 4px;
			height: 100%;
		}

		.header-content h1 {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 0;
			color: #ffffff;
			font-size: 20px;
			font-weight: 700;
			line-height: 1.2;
		}

		.header-content p {
			margin: 0;
			font-size: 13px;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.8);
			line-height: 1.4;
		}

		.container {
			padding: 16px;
		}
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: #2d3748;
		margin: 0;
	}

	.section-description {
		font-size: 0.875rem;
		color: #718096;
		margin: 0;
	}

	.textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #cbd5e0;
		border-radius: 6px;
		font-family: inherit;
		font-size: 0.875rem;
		line-height: 1.5;
		resize: vertical;
		transition: border-color 0.2s ease;
	}

	.textarea:focus {
		outline: none;
		border-color: #4299e1;
		box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
	}

	.textarea:disabled {
		background-color: #f7fafc;
		cursor: not-allowed;
	}

	.alert {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
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

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #e2e8f0;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background-color: #edf2f7;
		color: #4a5568;
	}

	.btn-secondary:hover:not(:disabled) {
		background-color: #e2e8f0;
	}

	.btn-primary {
		background-color: #4299e1;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: #3182ce;
	}

	.spinner {
		width: 16px;
		height: 16px;
		animation: spin 1s linear infinite;
	}

	.spinner circle {
		fill: none;
		stroke: currentColor;
		stroke-dasharray: 50;
		stroke-dashoffset: 25;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
