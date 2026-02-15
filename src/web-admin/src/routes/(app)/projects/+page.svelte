<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';

	let projects: any[] = [];
	let error = '';
	let isLoading = true;
	let isDeleting = false;

	onMount(async () => {
		await loadProjects();
	});

	async function loadProjects() {
		try {
			isLoading = true;
			const response = await apiClient.fetchProjects();
			projects = response.data;
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'プロジェクト取得に失敗しました。';
		} finally {
			isLoading = false;
		}
	}

	async function handleDeleteProject(projectId: number, projectName: string) {
		const confirmed = confirm(
			`本当に「${projectName}」を削除しますか？\n\n` +
				`このプロジェクトに関連するタスクもすべて削除されます。\n` +
				`この操作は取り消せません。`
		);

		if (!confirmed) return;

		try {
			isDeleting = true;
			await apiClient.deleteProject(projectId);

			// 成功したら一覧を再読み込み
			await loadProjects();

			alert('プロジェクトを削除しました。');
		} catch (e) {
			const message = e instanceof Error ? e.message : 'プロジェクトの削除に失敗しました。';
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
				<i class="bi bi-folder2-open"></i>
				プロジェクト一覧
			</h1>
			<p>案件・WBS管理</p>
		</div>
	</header>
</div>

<section class="page">
	<div class="page-actions">
		<button class="btn-secondary" on:click={() => goto('/projects/import')}>
			<span class="icon">📥</span>
			インポート
		</button>
		<button class="btn-primary" on:click={() => goto('/projects/new')}>
			<span class="icon">➕</span>
			新規作成
		</button>
	</div>

	{#if isLoading}
		<p>読み込み中です…</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		<div class="project-grid">
			{#each projects as project}
				<article>
					<div class="card-header">
						<h2 style="writing-mode: horizontal-tb; text-orientation: mixed;">{project.name}</h2>
						<button
							class="delete-btn"
							on:click={() => handleDeleteProject(project.id, project.name)}
							disabled={isDeleting}
							title="プロジェクトを削除"
						>
							🗑️
						</button>
					</div>
					<p>{project.description || '説明は登録されていません。'}</p>
					<dl>
						<div>
							<dt>期間</dt>
							<dd>{project.startDate} 〜 {project.endDate}</dd>
						</div>
						<div>
							<dt>状態</dt>
							<dd>{project.status}</dd>
						</div>
					</dl>
					<button class="view-btn" on:click={() => goto(`/projects/${project.id}`)}
						>詳細を見る</button
					>
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.page {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 24px;
		max-width: 1400px;
		margin: 0 auto;
		writing-mode: horizontal-tb;
	}

	.page-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		flex-wrap: wrap;
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

		.page {
			padding: 16px;
		}

		.page-actions {
			margin-bottom: 16px;
		}
	}

	.btn-secondary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		background: white;
		color: #374151;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-secondary:hover {
		background: #f9fafb;
		border-color: #d1d5db;
		transform: translateY(-2px);
	}

	.icon {
		font-size: 16px;
	}

	.project-grid {
		display: grid;
		gap: 24px;
		grid-template-columns: 1fr;
	}

	@media (min-width: 640px) {
		.project-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 1024px) {
		.project-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	article {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		padding: 24px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
		display: flex;
		flex-direction: column;
		gap: 16px;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
		position: relative;
		writing-mode: horizontal-tb;
	}

	article:hover {
		transform: translateY(-4px);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
	}

	.card-header {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		min-width: 0;
		width: 100%;
	}

	article h2 {
		margin: 0;
		font-size: 20px;
		color: #111827;
		flex: 1;
		min-width: 0;
		max-width: 100%;
		word-wrap: break-word;
		overflow-wrap: break-word;
		white-space: normal;
		writing-mode: horizontal-tb;
		text-orientation: mixed;
		direction: ltr;
	}

	article p {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
	}

	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	dt {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
	}

	dd {
		margin: 0;
		font-weight: 600;
		color: #111827;
	}

	.btn-primary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border-radius: 12px;
		border: none;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: white;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.btn-primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.view-btn {
		align-self: flex-start;
		padding: 10px 18px;
		border-radius: 12px;
		border: none;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: white;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.view-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.view-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.delete-btn {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 1px solid #fca5a5;
		border-radius: 8px;
		background: #fee2e2;
		color: #dc2626;
		font-size: 16px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
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

	.error {
		color: #dc2626;
	}

	/* 中画面対応 (641px-768px) */
	@media (max-width: 768px) {
		.page {
			padding: 16px;
		}

		.page-actions {
			width: 100%;
			flex-direction: column;
		}

		.page-actions button {
			width: 100%;
			justify-content: center;
		}

		.header-actions button {
			width: 100%;
			justify-content: center;
		}

		article h2 {
			font-size: 18px;
			writing-mode: horizontal-tb;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.page {
			padding: 12px;
			gap: 20px;
		}

		h1 {
			font-size: 20px;
		}

		header p {
			font-size: 13px;
			line-height: 1.5;
		}

		.header-actions {
			flex-direction: column;
			gap: 10px;
		}

		.header-actions button {
			width: 100%;
			min-width: unset;
		}

		.btn-secondary,
		.btn-primary {
			padding: 14px 18px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
		}

		.icon {
			font-size: 18px;
		}

		.project-grid {
			gap: 16px;
		}

		article {
			padding: 18px;
			gap: 14px;
			border-radius: 16px;
		}

		article h2 {
			font-size: 17px;
			line-height: 1.4;
			flex: 0 1 calc(100% - 54px);
			max-width: calc(100% - 54px);
			writing-mode: horizontal-tb !important;
			text-orientation: mixed;
			word-break: normal;
			overflow-wrap: break-word;
		}

		article p {
			font-size: 13px;
			line-height: 1.5;
		}

		.card-header {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: flex-start;
			gap: 10px;
			margin-bottom: 0;
		}

		.delete-btn {
			width: 44px;
			height: 44px;
			font-size: 18px;
			border-radius: 10px;
			flex-shrink: 0;
		}

		dl {
			gap: 12px;
		}

		dl > div {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}

		dt {
			font-size: 11px;
		}

		dd {
			font-size: 14px;
		}

		.view-btn {
			width: 100%;
			padding: 14px 18px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
			text-align: center;
			border-radius: 10px;
		}
	}
</style>
