<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import ReportGenerator from '$lib/components/reports/ReportGenerator.svelte';
	import ReportAssistantPanel from '$lib/components/report-assistant/ReportAssistantPanel.svelte';
	import { showAssistant, updateContext } from '$lib/stores/reportAssistant';

	const reportCategories = [
		{
			id: 'project_summary',
			name: 'プロジェクトサマリー',
			type: 'project',
			description: 'プロジェクトの全体的な状況、リスク、AIインサイトを含む要約レポート',
			icon: 'bi-file-earmark-bar-graph'
		},
		{
			id: 'project_progress',
			name: '進捗レポート',
			type: 'project',
			description: 'タスクの完了状況と進捗詳細に焦点を当てたレポート',
			icon: 'bi-graph-up-arrow'
		},
		{
			id: 'project_effort',
			name: '工数レポート',
			type: 'project',
			description: '作業ログとチームの工数実績を中心としたレポート',
			icon: 'bi-clock-history'
		},
		{
			id: 'all_projects_summary',
			name: '全プロジェクトサマリー',
			type: 'all-projects',
			description: '全プロジェクトの主要メトリクスとアラートの概況',
			icon: 'bi-collection'
		},
		{
			id: 'user_work',
			name: 'ユーザー作業レポート',
			type: 'user',
			description: '特定ユーザーのタスク実行状況と作業履歴',
			icon: 'bi-person-workspace'
		}
	];

	let projects: any[] = [];
	let users: any[] = [];
	let selectedProjectId: number | null = null;
	let selectedUserId: number | null = null;

	let selectedCategory = reportCategories[0];

	$: reportType = selectedCategory.type as 'project' | 'all-projects' | 'user';

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		try {
			const [projectsResponse, usersResponse] = await Promise.all([
				apiClient.fetchProjects(),
				apiClient.fetchUsers()
			]);

			projects = Array.isArray(projectsResponse?.data)
				? projectsResponse.data
						.map((project) => ({ ...project, id: Number(project?.id) }))
						.filter((project) => Number.isFinite(project.id))
				: [];
			users = Array.isArray(usersResponse?.data)
				? usersResponse.data
						.map((user) => ({ ...user, id: Number(user?.id) }))
						.filter((user) => Number.isFinite(user.id))
				: [];

			selectedProjectId = projects.length > 0 ? projects[0].id : null;
			selectedUserId = users.length > 0 ? users[0].id : null;
		} catch (error) {
			console.error('データの取得に失敗しました:', error);
		}
	}

	function handleProjectChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const nextId = Number(target.value);
		selectedProjectId = Number.isFinite(nextId) && projects.some((p) => p.id === nextId) ? nextId : null;
	}

	function handleUserChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const nextId = Number(target.value);
		selectedUserId = Number.isFinite(nextId) && users.some((u) => u.id === nextId) ? nextId : null;
	}

	function handleCategoryChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const categoryId = target.value;
		const category = reportCategories.find((c) => c.id === categoryId);
		if (category) {
			selectedCategory = category;
		}
	}

	$: if (reportType === 'project') {
		if (selectedProjectId === null || !projects.some((project) => project.id === selectedProjectId)) {
			selectedProjectId = projects.length > 0 ? projects[0].id : null;
		}
	}

	$: if (reportType === 'user') {
		if (selectedUserId === null || !users.some((user) => user.id === selectedUserId)) {
			selectedUserId = users.length > 0 ? users[0].id : null;
		}
	}

	// AIアシスタントトグル
	function toggleAssistant() {
		showAssistant.update((v) => !v);
	}

	// 選択状態が変更されたらAIコンテキストを更新
	$: {
		const contextUpdates: any = {};

		// プロジェクトIDの更新
		if (reportType === 'project' && selectedProjectId !== null) {
			contextUpdates.projectId = selectedProjectId;
			// プロジェクト名も更新したいが、projects配列から検索する必要がある
			const project = projects.find((p) => p.id === selectedProjectId);
			if (project) {
				contextUpdates.projectName = project.name;
				contextUpdates.projectStatus = project.status;
			}
		} else {
			contextUpdates.projectId = undefined;
			contextUpdates.projectName = undefined;
		}

		// ユーザーIDの更新
		if (reportType === 'user' && selectedUserId !== null) {
			contextUpdates.userId = selectedUserId;
			const user = users.find((u) => u.id === selectedUserId);
			if (user) {
				contextUpdates.userName = user.fullName;
			}
		} else {
			contextUpdates.userId = undefined;
			contextUpdates.userName = undefined;
		}

		// レポートタイプの推定（カテゴリIDから）
		if (selectedCategory.id === 'project_progress') {
			contextUpdates.reportType = 'project-progress';
		} else if (selectedCategory.id === 'project_summary') {
			contextUpdates.reportType = 'project-progress';
		} else if (selectedCategory.id === 'all_projects_summary') {
			contextUpdates.reportType = 'risk-analysis';
		} else if (selectedCategory.id === 'user_work') {
			contextUpdates.reportType = 'team-performance';
		}

		updateContext(contextUpdates);
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-file-earmark-text"></i>
				レポート生成
			</h1>
			<p>各種レポートの生成・出力</p>
		</div>
	</header>
</div>

<!-- AIアシスタントボタン（右上固定） -->
<button class="btn-ai-assistant-float" on:click={toggleAssistant} title="AIアシスタント">
	<i class="bi bi-robot"></i>
	<span>AIアシスタント</span>
</button>

<div class="reports-page">
	<div class="selector-panel">
		<div class="form-group category-group">
			<label for="reportCategory">レポートの種類</label>
			<div class="select-wrapper">
				<i class={`bi ${selectedCategory.icon} category-icon`}></i>
				<select id="reportCategory" value={selectedCategory.id} on:change={handleCategoryChange}>
					{#each reportCategories as category}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</div>
			<p class="helper-text">{selectedCategory.description}</p>
		</div>

		{#if reportType === 'project'}
			<div class="form-group">
				<label for="projectSelect">対象プロジェクト</label>
				<select id="projectSelect" value={selectedProjectId ?? ''} on:change={handleProjectChange}>
					{#each projects as project}
						<option value={project.id}>{project.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if reportType === 'user'}
			<div class="form-group">
				<label for="userSelect">対象ユーザー</label>
				<select id="userSelect" value={selectedUserId ?? ''} on:change={handleUserChange}>
					{#each users as user}
						<option value={user.id}>{user.fullName} ({user.username})</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	<div class="generator-container">
		{#if reportType === 'project' && selectedProjectId}
			<ReportGenerator
				projectId={selectedProjectId}
				reportType="project"
				reportTemplate={selectedCategory.id}
			/>
		{:else if reportType === 'all-projects'}
			<ReportGenerator reportType="all-projects" reportTemplate={selectedCategory.id} />
		{:else if reportType === 'user' && selectedUserId}
			<ReportGenerator
				userId={selectedUserId}
				reportType="user"
				reportTemplate={selectedCategory.id}
			/>
		{:else}
			<div class="empty-state">
				<i class="bi bi-inbox"></i>
				<p>レポートタイプを選択してください。</p>
			</div>
		{/if}
	</div>
</div>

<!-- AIアシスタントパネル（オーバーレイ） -->
{#if $showAssistant}
	<div class="assistant-overlay">
		<ReportAssistantPanel />
	</div>
{/if}

<style>
	/* ヘッダー: デスクトップでは非表示 */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	/* AIアシスタントボタン（右上固定） */
	.btn-ai-assistant-float {
		position: fixed;
		top: 24px;
		right: 24px;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border-radius: 12px;
		background: linear-gradient(135deg, #8b5cf6, #6366f1);
		border: none;
		color: #ffffff;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
		white-space: nowrap;
		box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
	}

	.btn-ai-assistant-float:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
	}

	.btn-ai-assistant-float i {
		font-size: 16px;
	}

	/* レポートページ */
	.reports-page {
		padding: 24px;
		margin-top: 55px;
		max-width: 1200px;
		margin-left: auto;
		margin-right: auto;
		width: 100%;
		box-sizing: border-box;
	}

	/* セレクターパネル */
	.selector-panel {
		display: flex;
		gap: 24px;
		margin-bottom: 24px;
		padding: 24px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		align-items: flex-start;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}

	.form-group label {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.select-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.category-icon {
		position: absolute;
		left: 12px;
		color: #6b7280;
		font-size: 16px;
		pointer-events: none;
	}

	.form-group select {
		width: 100%;
		padding: 10px 14px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		background: #ffffff;
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.category-group select {
		padding-left: 36px;
	}

	.form-group select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.helper-text {
		margin: 4px 0 0;
		font-size: 12px;
		color: #6b7280;
	}

	.generator-container {
		margin-bottom: 40px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 80px 20px;
		background: #ffffff;
		border: 2px dashed #e5e7eb;
		border-radius: 12px;
		color: #9ca3af;
		text-align: center;
	}

	.empty-state i {
		font-size: 48px;
		margin-bottom: 16px;
	}

	.empty-state p {
		margin: 0;
		font-size: 16px;
	}

	/* AIアシスタントオーバーレイ */
	.assistant-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 1002;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: flex-end;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* モバイル/タブレット (<960px) */
	@media (max-width: 960px) {
		.page-header-wrapper {
			display: block;
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
			padding: 0 16px;
			box-sizing: border-box;
		}

		.header-content h1 {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 0;
			font-size: 20px;
			font-weight: 700;
			color: #ffffff;
		}

		.header-content p {
			margin: 8px 0 0 0;
			font-size: 13px;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.8);
		}

		.reports-page {
			padding: 16px;
		}

		.btn-ai-assistant-float {
			top: 90px;
			right: 16px;
		}
	}

	@media (max-width: 768px) {
		.selector-panel {
			flex-direction: column;
			gap: 16px;
		}
	}

	@media (max-width: 480px) {
		.reports-page {
			padding: 12px;
		}

		.page-header {
			padding: 0 12px;
		}

		.btn-ai-assistant-float {
			padding: 10px 16px;
			font-size: 14px;
		}

		.btn-ai-assistant-float span {
			display: none;
		}
	}
</style>
