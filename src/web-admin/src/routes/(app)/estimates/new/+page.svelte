<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';
	import type { EstimatePattern } from '$lib/types/estimate';

	let patterns: EstimatePattern[] = [];
	let loading = true;
	let selectedPattern: string = '';
	let title = '';
	let description = '';
	let showForm = false;
	let creating = false;
	let error = '';

	onMount(async () => {
		await loadPatterns();
	});

	async function loadPatterns() {
		try {
			loading = true;
			const response = await apiClient.fetchEstimatePatterns();
			patterns = response.data;
		} catch (e) {
			error = e instanceof Error ? e.message : 'パターンの取得に失敗しました';
			console.error('パターン取得エラー:', e);
		} finally {
			loading = false;
		}
	}

	function selectPattern(patternId: string) {
		selectedPattern = patternId;
		showForm = true;
	}

	async function createEstimate() {
		if (!title.trim()) {
			error = 'タイトルを入力してください';
			return;
		}

		try {
			creating = true;
			error = '';
			const response = await apiClient.createEstimate({
				patternType: selectedPattern,
				title: title.trim(),
				description: description.trim() || undefined
			});

			// 作成した見積もりの詳細画面に遷移
			goto(`/estimates/${response.data.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : '見積もりの作成に失敗しました';
			console.error('見積もり作成エラー:', e);
		} finally {
			creating = false;
		}
	}

	function getCategoryName(category: string): string {
		const names: Record<string, string> = {
			basic: '基本見積もり',
			project: 'プロジェクト計画',
			optimization: '最適化・分析',
			special: '特殊用途'
		};
		return names[category] || category;
	}

	$: categorizedPatterns = patterns.reduce(
		(acc, pattern) => {
			const category = pattern.category || 'basic';
			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(pattern);
			return acc;
		},
		{} as Record<string, EstimatePattern[]>
	);
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<button class="back-btn" on:click={() => goto('/estimates')}>
				<i class="bi bi-arrow-left"></i>
			</button>
			<div>
				<h1>
					<i class="bi bi-calculator"></i>
					新規見積もり作成
				</h1>
				<p>見積パターンを選択</p>
			</div>
		</div>
	</header>
</div>

<div class="pattern-selection-page">
	<div class="page-actions">
		<button class="action-btn secondary desktop-back-btn" on:click={() => goto('/estimates')}>
			<i class="bi bi-arrow-left"></i>
			一覧に戻る
		</button>
	</div>

	{#if error}
		<div class="error-banner">
			<i class="bi bi-exclamation-triangle"></i>
			{error}
			<button class="close-error" on:click={() => (error = '')}>
				<i class="bi bi-x"></i>
			</button>
		</div>
	{/if}

	<div class="content-container">
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>読み込み中...</p>
			</div>
		{:else if !showForm}
			<div class="pattern-selection">
				{#each Object.entries(categorizedPatterns) as [category, categoryPatterns]}
					<section class="pattern-category">
						<h2>{getCategoryName(category)}</h2>
						<div class="pattern-grid">
							{#each categoryPatterns as pattern}
								<button
									class="pattern-card"
									class:selected={selectedPattern === pattern.id}
									on:click={() => selectPattern(pattern.id)}
								>
									<div class="pattern-icon">{pattern.icon}</div>
									<h3>{pattern.name}</h3>
									<p>{pattern.description}</p>
								</button>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{:else}
			<div class="estimate-form">
				<div class="form-header">
					<button class="back-link" on:click={() => (showForm = false)}>
						<i class="bi bi-arrow-left"></i>
						パターン選択に戻る
					</button>
					<div class="selected-pattern">
						<span class="pattern-icon">{patterns.find((p) => p.id === selectedPattern)?.icon}</span>
						<span class="pattern-name">{patterns.find((p) => p.id === selectedPattern)?.name}</span>
					</div>
				</div>

				<div class="form-body">
					<div class="form-group">
						<label for="title">
							見積もりタイトル <span class="required">*</span>
						</label>
						<input
							id="title"
							type="text"
							bind:value={title}
							placeholder="例: 新規ECサイト開発プロジェクト"
							class="form-input"
						/>
					</div>

					<div class="form-group">
						<label for="description"> 説明（任意） </label>
						<textarea
							id="description"
							bind:value={description}
							placeholder="見積もりの概要や目的を入力してください"
							class="form-textarea"
							rows="4"
						></textarea>
					</div>

					<div class="form-actions">
						<button class="btn-secondary" on:click={() => goto('/estimates')}> キャンセル </button>
						<button
							class="btn-primary"
							on:click={createEstimate}
							disabled={creating || !title.trim()}
						>
							{#if creating}
								<div class="btn-spinner"></div>
								作成中...
							{:else}
								<i class="bi bi-check-circle"></i>
								見積もりを開始
							{/if}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.pattern-selection-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #f9fafb;
		flex: 1;
		overflow: hidden;
	}

	.page-actions {
		display: flex;
		justify-content: flex-start;
		padding: 16px 32px 0; /* Add padding for actions */
		background: #f9fafb;
		margin-bottom: 0;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid #e5e7eb;
		background: #ffffff;
		color: #374151;
	}

	.action-btn:hover {
		background: #f3f4f6;
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

		.header-content h1 {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 0;
			color: #ffffff;
			font-size: 20px;
			font-weight: 700;
		}

		.header-content p {
			margin: 8px 0 0 0;
			font-size: 13px;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.8);
		}

		/* Hide desktop back button on mobile since header has one */
		.desktop-back-btn {
			display: none !important;
		}

		.page-actions {
			display: none; /* Hide page actions wrapper if empty on mobile (or if only contains hidden back btn) */
			padding: 0;
		}
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	/* Mobile only back button in header */
	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 32px;
		background: #fee2e2;
		border-bottom: 1px solid #fca5a5;
		color: #dc2626;
		font-size: 14px;
	}

	.close-error {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: #dc2626;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	.close-error:hover {
		background: #fca5a5;
	}

	.content-container {
		flex: 1;
		overflow-y: auto;
		padding: 32px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 400px;
		gap: 16px;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid #e5e7eb;
		border-top-color: #667eea;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.pattern-selection {
		max-width: 1200px;
		margin: 0 auto;
	}

	.pattern-category {
		margin-bottom: 48px;
	}

	.pattern-category h2 {
		margin: 0 0 24px;
		font-size: 20px;
		font-weight: 700;
		color: #111827;
	}

	.pattern-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 20px;
	}

	.pattern-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 32px 24px;
		background: #ffffff;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: center;
	}

	.pattern-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
		border-color: #667eea;
	}

	.pattern-card.selected {
		border-color: #667eea;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
	}

	.pattern-icon {
		font-size: 48px;
		margin-bottom: 16px;
	}

	.pattern-card h3 {
		margin: 0 0 8px;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.pattern-card p {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
		line-height: 1.5;
	}

	.estimate-form {
		max-width: 600px;
		margin: 0 auto;
		background: #ffffff;
		border-radius: 12px;
		padding: 32px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.form-header {
		margin-bottom: 32px;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		background: transparent;
		border: none;
		color: #667eea;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.2s ease;
		margin-bottom: 16px;
	}

	.back-link:hover {
		background: #f3f4f6;
	}

	.selected-pattern {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
		border-radius: 8px;
	}

	.selected-pattern .pattern-icon {
		font-size: 32px;
	}

	.selected-pattern .pattern-name {
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.form-body {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.form-group label {
		font-size: 14px;
		font-weight: 600;
		color: #374151;
	}

	.required {
		color: #dc2626;
	}

	.form-input,
	.form-textarea {
		padding: 12px 16px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		color: #111827;
		transition: all 0.2s ease;
	}

	.form-input:focus,
	.form-textarea:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.form-textarea {
		resize: vertical;
		font-family: inherit;
	}

	.form-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		margin-top: 8px;
	}

	.btn-primary,
	.btn-secondary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.btn-secondary {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		color: #374151;
	}

	.btn-secondary:hover {
		background: #f9fafb;
	}

	.btn-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
</style>
