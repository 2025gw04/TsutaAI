<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';
	import type { Estimate } from '$lib/types/estimate';

	let estimates: Estimate[] = [];
	let loading = true;
	let error = '';
	let isDeleting = false;

	onMount(async () => {
		await loadEstimates();
	});

	async function loadEstimates() {
		try {
			loading = true;
			error = '';
			const response = await apiClient.fetchEstimates();
			estimates = response.data;
		} catch (e) {
			error = e instanceof Error ? e.message : '見積もりの取得に失敗しました';
			console.error('見積もり取得エラー:', e);
		} finally {
			loading = false;
		}
	}

	function getPatternIcon(patternType: string): string {
		const icons: Record<string, string> = {
			duration_unknown: '⏱️',
			duration_fixed: '📅',
			task_based: '📋',
			budget_fixed: '💰'
		};
		return icons[patternType] || '📊';
	}

	function getPatternName(patternType: string): string {
		const names: Record<string, string> = {
			duration_unknown: '期間未定型',
			duration_fixed: '期間固定型',
			task_based: 'タスクベース型',
			budget_fixed: '予算固定型'
		};
		return names[patternType] || patternType;
	}

	function getStatusBadge(status: string): string {
		const badges: Record<string, string> = {
			draft: 'badge-draft',
			in_progress: 'badge-progress',
			completed: 'badge-completed'
		};
		return badges[status] || 'badge-draft';
	}

	function getStatusText(status: string): string {
		const texts: Record<string, string> = {
			draft: '下書き',
			in_progress: '作業中',
			completed: '完了'
		};
		return texts[status] || status;
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
	}

	async function handleDeleteEstimate(id: number, title: string) {
		const confirmed = confirm(
			`本当に「${title}」を削除しますか？\n\n` + `この操作は取り消せません。`
		);

		if (!confirmed) return;

		try {
			isDeleting = true;
			await apiClient.deleteEstimate(id);
			await loadEstimates();
			alert('見積もりを削除しました。');
		} catch (e) {
			const message = e instanceof Error ? e.message : '見積もりの削除に失敗しました。';
			alert(`削除エラー: ${message}`);
		} finally {
			isDeleting = false;
		}
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-calculator"></i>
				見積もり管理
			</h1>
			<p>AI効率化見積もり</p>
		</div>
	</header>
</div>

<div class="estimates-page">
	{#if error}
		<div class="error-banner">
			<i class="bi bi-exclamation-triangle"></i>
			{error}
		</div>
	{/if}

	<div class="estimates-container">
		<div class="page-actions">
			<button class="btn-primary" on:click={() => goto('/estimates/new')}>
				<i class="bi bi-plus-circle"></i>
				新規見積もり
			</button>
		</div>
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>読み込み中...</p>
			</div>
		{:else if estimates.length === 0}
			<div class="empty-state">
				<i class="bi bi-calculator"></i>
				<h3>見積もりがありません</h3>
				<p>新しい見積もりを作成して、プロジェクトの計画を始めましょう</p>
				<button class="btn-primary" on:click={() => goto('/estimates/new')}>
					<i class="bi bi-plus-circle"></i>
					新規見積もり作成
				</button>
			</div>
		{:else}
			<div class="estimates-grid">
				{#each estimates as estimate}
					<div class="estimate-card" on:click={() => goto(`/estimates/${estimate.id}`)}>
						<div class="card-header">
							<div class="header-main">
								<div class="pattern-badge">
									<span class="pattern-icon">{getPatternIcon(estimate.pattern_type)}</span>
									<span class="pattern-name">{getPatternName(estimate.pattern_type)}</span>
								</div>
								<span class="status-badge {getStatusBadge(estimate.status)}">
									{getStatusText(estimate.status)}
								</span>
							</div>
							<button
								class="delete-btn"
								on:click|stopPropagation={() => handleDeleteEstimate(estimate.id, estimate.title)}
								disabled={isDeleting}
								title="見積もりを削除"
							>
								🗑️
							</button>
						</div>

						<div class="card-body">
							<h3>{estimate.title}</h3>
							{#if estimate.description}
								<p class="description">{estimate.description}</p>
							{/if}
						</div>

						<div class="card-footer">
							<div class="meta-info">
								<i class="bi bi-calendar"></i>
								作成日: {formatDate(estimate.created_at)}
							</div>
							{#if estimate.completed_at}
								<div class="meta-info">
									<i class="bi bi-check-circle"></i>
									完了日: {formatDate(estimate.completed_at)}
								</div>
							{/if}
						</div>
					</div>
				{/each}
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

	.estimates-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #f9fafb;
		flex: 1;
		overflow: hidden;
	}

	.page-actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 24px;
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
	}

	.btn-primary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.btn-primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
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

	.estimates-container {
		flex: 1;
		padding: 32px;
		overflow-y: auto;
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

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 400px;
		gap: 16px;
		text-align: center;
	}

	.empty-state i {
		font-size: 64px;
		color: #d1d5db;
	}

	.empty-state h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: #374151;
	}

	.empty-state p {
		margin: 0;
		font-size: 14px;
		color: #6b7280;
	}

	.estimates-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 24px;
	}

	.estimate-card {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 20px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.estimate-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
		border-color: #667eea;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.pattern-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: #f3f4f6;
		border-radius: 6px;
	}

	.header-main {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.delete-btn {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid #fca5a5;
		border-radius: 8px;
		background: #fee2e2;
		color: #dc2626;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
	}

	.estimate-card:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover:not(:disabled) {
		background: #fecaca;
		border-color: #f87171;
		transform: scale(1.1);
	}

	.delete-btn:active:not(:disabled) {
		transform: scale(0.95);
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.pattern-icon {
		font-size: 18px;
	}

	.pattern-name {
		font-size: 12px;
		font-weight: 600;
		color: #374151;
	}

	.status-badge {
		padding: 4px 12px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.badge-draft {
		background: #f3f4f6;
		color: #6b7280;
	}

	.badge-progress {
		background: #dbeafe;
		color: #1e40af;
	}

	.badge-completed {
		background: #d1fae5;
		color: #065f46;
	}

	.card-body h3 {
		margin: 0 0 8px;
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.description {
		margin: 0;
		font-size: 14px;
		color: #6b7280;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-footer {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid #f3f4f6;
	}

	.meta-info {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #9ca3af;
		margin-bottom: 4px;
	}

	.meta-info i {
		font-size: 14px;
	}

	/* タブレット対応 */
	@media (max-width: 768px) {
		.page-header {
			flex-direction: column;
			align-items: flex-start;
			padding: 20px 24px;
		}

		.btn-primary {
			width: 100%;
			justify-content: center;
		}

		.estimates-grid {
			grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
			gap: 20px;
		}

		.estimate-card {
			padding: 18px;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.estimates-page {
			height: auto;
		}

		.page-header {
			padding: 16px;
		}

		.btn-primary {
			padding: 14px 20px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保 */
		}

		.estimates-container {
			padding: 20px 16px;
		}

		.estimates-grid {
			grid-template-columns: 1fr;
			gap: 16px;
		}

		.estimate-card {
			padding: 16px;
		}

		.card-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
			margin-bottom: 12px;
		}

		.pattern-badge {
			padding: 4px 10px;
		}

		.pattern-icon {
			font-size: 16px;
		}

		.pattern-name {
			font-size: 11px;
		}

		.status-badge {
			padding: 3px 10px;
			font-size: 10px;
		}

		.card-body h3 {
			font-size: 16px;
		}

		.description {
			font-size: 13px;
		}

		.meta-info {
			font-size: 11px;
		}

		.empty-state {
			height: auto;
			padding: 60px 16px;
		}

		.empty-state i {
			font-size: 48px;
		}

		.empty-state h3 {
			font-size: 18px;
		}

		.empty-state p {
			font-size: 13px;
		}
	}
</style>
