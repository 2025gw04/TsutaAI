<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';
	import TaskDetailModal from '$lib/components/TaskDetailModal.svelte';

	let project: any = null;
	let tasks: any[] = [];
	let users: Map<number, string> = new Map();
	let error = '';
	let isLoading = true;
	let viewMode: 'list' | 'board' = 'list';
	let selectedTask: any = null;
	let showTaskModal = false;

	$: projectId = Number($page.params.id);
	$: groupedTasks = groupTasksByStatus(tasks);

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		try {
			const [projectResponse, taskResponse, usersResponse] = await Promise.all([
				apiClient.fetchProject(projectId),
				apiClient.fetchTasks(projectId),
				apiClient.fetchUsers()
			]);
			project = projectResponse.data;
			tasks = taskResponse.data;

			// ユーザー情報をマップに格納（ID -> 名前）
			users = new Map();
			if (usersResponse.data && Array.isArray(usersResponse.data)) {
				usersResponse.data.forEach((user: any) => {
					users.set(user.id, user.fullName || user.username || `User ${user.id}`);
				});
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'プロジェクト情報の取得に失敗しました。';
		} finally {
			isLoading = false;
		}
	}

	function getUserName(userId: number | null | undefined): string {
		if (!userId) return '未割当';
		return users.get(userId) || `User ${userId}`;
	}

	function groupTasksByStatus(tasks: any[]) {
		const groups = {
			todo: tasks.filter((t) => t.status === 'todo'),
			in_progress: tasks.filter((t) => t.status === 'in_progress'),
			done: tasks.filter((t) => t.status === 'done')
		};
		return groups;
	}

	function getPriorityColor(priority: string) {
		const colors: Record<string, string> = {
			urgent: '#ef4444',
			high: '#f59e0b',
			medium: '#3b82f6',
			low: '#6b7280'
		};
		return colors[priority] || colors.medium;
	}

	function openTaskDetail(task: any) {
		selectedTask = task;
		showTaskModal = true;
	}

	function closeTaskModal() {
		showTaskModal = false;
		selectedTask = null;
	}

	async function handleTaskUpdate() {
		await loadData();
	}

	async function handleStartProject() {
		if (!project) return;

		if (
			!confirm(
				`プロジェクト「${project.name}」を開始しますか?\nチームメンバーがデスクトップアプリからタスクを見られるようになります。`
			)
		) {
			return;
		}

		try {
			await apiClient.updateProject(projectId, {
				...project,
				status: 'active'
			});

			// プロジェクト情報を再読み込み
			await loadData();
			alert('プロジェクトを開始しました。デスクトップアプリでタスクが表示されます。');
		} catch (e) {
			alert('プロジェクトの開始に失敗しました: ' + (e instanceof Error ? e.message : ''));
		}
	}

	async function handleExport(format: 'json' | 'md' | 'csv') {
		try {
			await apiClient.exportProject(projectId, format);
		} catch (e) {
			alert('エクスポートに失敗しました: ' + (e instanceof Error ? e.message : ''));
		}
	}

	// ボードビューのドラッグ&ドロップハンドラ
	let draggedTask: any = null;

	function handleTaskDragStart(event: DragEvent, task: any) {
		draggedTask = task;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('taskId', task.id.toString());
		}
	}

	function handleColumnDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	async function handleColumnDrop(event: DragEvent, newStatus: string) {
		event.preventDefault();

		if (!draggedTask) return;

		try {
			// ステータスのみを更新
			await apiClient.updateTask(draggedTask.id, {
				status: newStatus
			});

			// データを再読み込み
			await loadData();
			draggedTask = null;
		} catch (e) {
			alert('タスクの更新に失敗しました: ' + (e instanceof Error ? e.message : ''));
			draggedTask = null;
		}
	}
</script>

{#if isLoading}
	<section class="project-detail">
		<div class="loading">
			<div class="spinner"></div>
			<p>読み込み中...</p>
		</div>
	</section>
{:else if error}
	<section class="project-detail">
		<div class="error-box">
			<p class="error">{error}</p>
		</div>
	</section>
{:else if project}
	<div class="page-header-wrapper">
		<header class="page-header">
			<div class="header-content">
				<h1>
					<i class="bi bi-folder2-open"></i>
					プロジェクト詳細
				</h1>
				<p>{project.name}</p>
			</div>
		</header>
	</div>

	<section class="project-detail">
		<div class="page-actions">
			<div class="export-dropdown">
				<button class="btn-secondary">
					<span class="icon">📥</span>
					エクスポート
				</button>
				<div class="dropdown-menu">
					<button on:click={() => handleExport('json')}>JSON形式</button>
					<button on:click={() => handleExport('md')}>Markdown形式</button>
					<button on:click={() => handleExport('csv')}>CSV形式</button>
				</div>
			</div>
			<button class="btn-secondary" on:click={() => goto(`/projects/${projectId}/wbs`)}>
				<span class="icon">📊</span>
				WBS編集
			</button>
			<button
				class="btn-primary"
				on:click={handleStartProject}
				disabled={project?.status === 'active'}
			>
				<span class="icon">▶️</span>
				{project?.status === 'active' ? '実行中' : 'プロジェクト開始'}
			</button>
		</div>

		<!-- プロジェクトヘッダー（サマリーカード） -->
		<header class="project-header">
			<div class="header-top">
				<div class="title-section">
					<h1>{project.name}</h1>
					<span class="status-badge status-{project.status}">{project.status}</span>
				</div>
			</div>

			<p class="description">
				{project.description || 'プロジェクトの説明はまだ登録されていません。'}
			</p>

			<div class="project-meta">
				<div class="meta-item">
					<span class="meta-label">期間</span>
					<span class="meta-value">{project.startDate} 〜 {project.endDate}</span>
				</div>
				<div class="meta-item">
					<span class="meta-label">タスク数</span>
					<span class="meta-value">{tasks.length}件</span>
				</div>
				<div class="meta-item">
					<span class="meta-label">完了</span>
					<span class="meta-value">{groupedTasks.done.length}/{tasks.length}件</span>
				</div>
			</div>
		</header>

		<!-- ビュー切り替え -->
		<div class="view-controls">
			<div class="view-tabs">
				<button
					class="view-tab"
					class:active={viewMode === 'list'}
					on:click={() => (viewMode = 'list')}
				>
					<span class="icon">📋</span>
					リスト
				</button>
				<button
					class="view-tab"
					class:active={viewMode === 'board'}
					on:click={() => (viewMode = 'board')}
				>
					<span class="icon">📊</span>
					ボード
				</button>
			</div>
		</div>

		<!-- タスク表示エリア -->
		{#if viewMode === 'list'}
			<div class="list-view">
				{#each tasks as task}
					<div class="task-card" on:click={() => openTaskDetail(task)} role="button" tabindex="0">
						<div class="task-card-header">
							<div class="task-title-row">
								<div
									class="priority-indicator"
									style="background: {getPriorityColor(task.priority)}"
								></div>
								<h3 class="task-title">{task.name}</h3>
							</div>
							<span class="task-status status-{task.status}">
								{task.status === 'todo'
									? '未着手'
									: task.status === 'in_progress'
										? '進行中'
										: '完了'}
							</span>
						</div>

						{#if task.description}
							<p class="task-description">
								{task.description.substring(0, 100)}{task.description.length > 100 ? '...' : ''}
							</p>
						{/if}

						<div class="task-card-footer">
							<div class="task-meta">
								{#if task.assignedTo}
									<span class="assignee">👤 {getUserName(task.assignedTo)}</span>
								{/if}
								{#if task.startDate || task.endDate}
									<span class="period"
										>📅 {task.startDate || '未設定'} ～ {task.endDate || '未設定'}</span
									>
								{/if}
							</div>
							<div class="task-priority">
								<span class="priority-label" style="color: {getPriorityColor(task.priority)}">
									{task.priority === 'urgent'
										? '緊急'
										: task.priority === 'high'
											? '高'
											: task.priority === 'medium'
												? '中'
												: '低'}
								</span>
							</div>
						</div>
					</div>
				{/each}

				{#if tasks.length === 0}
					<div class="empty-state">
						<div class="empty-icon">📝</div>
						<h3>タスクがありません</h3>
						<p>WBS生成からタスクを作成してください</p>
					</div>
				{/if}
			</div>
		{:else if viewMode === 'board'}
			<div class="board-view">
				<div
					class="board-column"
					on:dragover={handleColumnDragOver}
					on:drop={(e) => handleColumnDrop(e, 'todo')}
				>
					<div class="column-header">
						<h3>未着手</h3>
						<span class="task-count">{groupedTasks.todo.length}</span>
					</div>
					<div class="column-tasks">
						{#each groupedTasks.todo as task}
							<div
								class="board-task-card"
								draggable="true"
								on:dragstart={(e) => handleTaskDragStart(e, task)}
								on:click={() => openTaskDetail(task)}
								role="button"
								tabindex="0"
							>
								<div
									class="priority-indicator"
									style="background: {getPriorityColor(task.priority)}"
								></div>
								<h4>{task.name}</h4>
								{#if task.description}
									<p>{task.description.substring(0, 80)}...</p>
								{/if}
								<div class="card-footer">
									{#if task.startDate || task.endDate}
										<span class="period"
											>📅 {task.startDate || '未設定'} ～ {task.endDate || '未設定'}</span
										>
									{/if}
									{#if task.assignedTo}
										<span class="assignee">👤 {getUserName(task.assignedTo)}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<div
					class="board-column"
					on:dragover={handleColumnDragOver}
					on:drop={(e) => handleColumnDrop(e, 'in_progress')}
				>
					<div class="column-header in-progress">
						<h3>進行中</h3>
						<span class="task-count">{groupedTasks.in_progress.length}</span>
					</div>
					<div class="column-tasks">
						{#each groupedTasks.in_progress as task}
							<div
								class="board-task-card"
								draggable="true"
								on:dragstart={(e) => handleTaskDragStart(e, task)}
								on:click={() => openTaskDetail(task)}
								role="button"
								tabindex="0"
							>
								<div
									class="priority-indicator"
									style="background: {getPriorityColor(task.priority)}"
								></div>
								<h4>{task.name}</h4>
								{#if task.description}
									<p>{task.description.substring(0, 80)}...</p>
								{/if}
								<div class="card-footer">
									{#if task.startDate || task.endDate}
										<span class="period"
											>📅 {task.startDate || '未設定'} ～ {task.endDate || '未設定'}</span
										>
									{/if}
									{#if task.assignedTo}
										<span class="assignee">👤 {getUserName(task.assignedTo)}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<div
					class="board-column"
					on:dragover={handleColumnDragOver}
					on:drop={(e) => handleColumnDrop(e, 'done')}
				>
					<div class="column-header done">
						<h3>完了</h3>
						<span class="task-count">{groupedTasks.done.length}</span>
					</div>
					<div class="column-tasks">
						{#each groupedTasks.done as task}
							<div
								class="board-task-card"
								draggable="true"
								on:dragstart={(e) => handleTaskDragStart(e, task)}
								on:click={() => openTaskDetail(task)}
								role="button"
								tabindex="0"
							>
								<div
									class="priority-indicator"
									style="background: {getPriorityColor(task.priority)}"
								></div>
								<h4>{task.name}</h4>
								{#if task.description}
									<p>{task.description.substring(0, 80)}...</p>
								{/if}
								<div class="card-footer">
									{#if task.startDate || task.endDate}
										<span class="period"
											>📅 {task.startDate || '未設定'} ～ {task.endDate || '未設定'}</span
										>
									{/if}
									{#if task.assignedTo}
										<span class="assignee">👤 {getUserName(task.assignedTo)}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</section>
{:else}
	<section class="project-detail">
		<div class="error-box">
			<p class="error">プロジェクトが見つかりませんでした。</p>
		</div>
	</section>
{/if}

{#if showTaskModal && selectedTask}
	<TaskDetailModal
		task={selectedTask}
		{projectId}
		{users}
		on:close={closeTaskModal}
		on:update={handleTaskUpdate}
	/>
{/if}

<style>
	.project-detail {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 32px;
		max-width: 1400px;
		margin: 0 auto;
	}

	@media (max-width: 960px) {
		.project-detail {
			padding-top: 16px; /* Reduced top padding on mobile since header is now outside */
		}
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 80px 20px;
		gap: 16px;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-box {
		padding: 24px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 16px;
	}

	.error {
		color: #dc2626;
		margin: 0;
	}

	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.page-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		flex-wrap: wrap;
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
			display: flex; /* Ensure flex for centering */
			justify-content: flex-start;
			align-items: center;
			padding: 0 24px;
			box-sizing: border-box;
			/* Reset standard header props conflicting with .project-header */
			background: transparent;
			border: none;
			box-shadow: none;
			border-radius: 0;
			margin: 0;
		}

		.header-content {
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 4px;
			height: 100%;
		}

		/* Target specific H1 in header-content to avoid conflict with project-header H1 */
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
	}

	/* プロジェクトヘッダー（サマリー） */
	.project-header {
		background: #ffffff;
		padding: 32px;
		border-radius: 20px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
		border: 1px solid #e5e7eb;
	}

	.header-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 16px;
	}

	.title-section {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.project-header h1 {
		margin: 0;
		font-size: 32px;
		font-weight: 700;
		color: #111827;
	}

	.status-badge {
		padding: 6px 14px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-right: 10px;
	}

	.status-badge.status-planning {
		background: #fef3c7;
		color: #92400e;
	}

	.status-badge.status-active {
		background: #d1fae5;
		color: #065f46;
	}

	.status-badge.status-completed {
		background: #dbeafe;
		color: #1e40af;
	}

	.export-dropdown {
		position: relative;
	}

	.export-dropdown:hover .dropdown-menu {
		display: block;
	}

	.dropdown-menu {
		display: none;
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0px;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		min-width: 180px;
		z-index: 1000;
		overflow: hidden;
	}

	.dropdown-menu button {
		display: block;
		width: 100%;
		padding: 12px 16px;
		border: none;
		background: white;
		text-align: left;
		font-size: 14px;
		color: #374151;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.dropdown-menu button:hover {
		background-color: #f3f4f6;
	}

	.dropdown-menu button:not(:last-child) {
		border-bottom: 1px solid #f3f4f6;
	}

	.btn-primary,
	.btn-secondary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border-radius: 12px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: white;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.btn-primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.btn-secondary {
		background: #f3f4f6;
		color: #374151;
		border: 1px solid #e5e7eb;
	}

	.btn-secondary:hover {
		background: #e5e7eb;
	}

	.description {
		margin: 0 0 24px 0;
		color: #6b7280;
		font-size: 15px;
		line-height: 1.6;
	}

	.project-meta {
		display: flex;
		gap: 32px;
		padding-top: 24px;
		border-top: 1px solid #e5e7eb;
	}

	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.meta-label {
		font-size: 12px;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.meta-value {
		font-size: 16px;
		color: #111827;
		font-weight: 600;
	}

	/* ビュー切り替え */
	.view-controls {
		background: #ffffff;
		padding: 16px 24px;
		border-radius: 16px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
		border: 1px solid #e5e7eb;
	}

	.view-tabs {
		display: flex;
		gap: 8px;
	}

	.view-tab {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border-radius: 10px;
		background: transparent;
		border: none;
		color: #6b7280;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.view-tab:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.view-tab.active {
		background: #3b82f6;
		color: white;
	}

	.view-tab:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.view-tab:disabled:hover {
		background: transparent;
		color: #6b7280;
	}

	.coming-soon {
		font-size: 11px;
		color: #9ca3af;
		font-weight: 500;
	}

	.icon {
		font-size: 16px;
	}

	/* リストビュー */
	.list-view {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.task-card {
		background: #ffffff;
		padding: 20px 24px;
		border-radius: 16px;
		border: 1px solid #e5e7eb;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.task-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
		border-color: #3b82f6;
	}

	.task-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.task-title-row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
	}

	.priority-indicator {
		width: 4px;
		height: 24px;
		border-radius: 2px;
	}

	.task-title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #111827;
	}

	.task-status {
		padding: 4px 12px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
	}

	.task-status.status-todo {
		background: #f3f4f6;
		color: #6b7280;
	}

	.task-status.status-in_progress {
		background: #dbeafe;
		color: #1e40af;
	}

	.task-status.status-done {
		background: #d1fae5;
		color: #065f46;
	}

	.task-description {
		margin: 0 0 12px 16px;
		color: #6b7280;
		font-size: 14px;
		line-height: 1.5;
	}

	.task-card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-left: 16px;
	}

	.task-meta {
		display: flex;
		gap: 16px;
		font-size: 13px;
		color: #6b7280;
	}

	.priority-label {
		font-size: 13px;
		font-weight: 600;
	}

	/* ボードビュー */
	.board-view {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
	}

	.board-column {
		background: #f9fafb;
		border-radius: 16px;
		padding: 20px;
		min-height: 500px;
	}

	.column-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
		padding-bottom: 12px;
		border-bottom: 2px solid #e5e7eb;
	}

	.column-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.column-header.in-progress {
		border-bottom-color: #3b82f6;
	}

	.column-header.done {
		border-bottom-color: #10b981;
	}

	.task-count {
		background: #e5e7eb;
		color: #6b7280;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 700;
	}

	.column-tasks {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.board-task-card {
		background: #ffffff;
		padding: 16px;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
		padding-left: 20px;
	}

	.board-task-card:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	.board-task-card .priority-indicator {
		position: absolute;
		left: 8px;
		top: 16px;
		width: 4px;
		height: calc(100% - 32px);
		border-radius: 2px;
	}

	.board-task-card h4 {
		margin: 0 0 8px 0;
		font-size: 14px;
		font-weight: 600;
		color: #111827;
	}

	.board-task-card p {
		margin: 0 0 12px 0;
		font-size: 13px;
		color: #6b7280;
		line-height: 1.4;
	}

	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.due-date {
		font-size: 12px;
		color: #6b7280;
	}

	/* タイムラインビュー */
	.timeline-view {
		background: #ffffff;
		padding: 80px 40px;
		border-radius: 16px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
		border: 1px solid #e5e7eb;
	}

	.timeline-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	.placeholder-icon {
		font-size: 64px;
		opacity: 0.5;
	}

	.timeline-placeholder h3 {
		margin: 0;
		font-size: 24px;
		color: #111827;
	}

	.timeline-placeholder p {
		margin: 0;
		color: #6b7280;
	}

	/* 空の状態 */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 80px 20px;
		background: #ffffff;
		border-radius: 16px;
		border: 2px dashed #e5e7eb;
	}

	.empty-icon {
		font-size: 64px;
		margin-bottom: 16px;
		opacity: 0.5;
	}

	.empty-state h3 {
		margin: 0 0 8px 0;
		font-size: 20px;
		color: #111827;
	}

	.empty-state p {
		margin: 0;
		color: #6b7280;
	}

	/* タブレット対応 */
	@media (max-width: 768px) {
		.project-detail {
			padding: 16px;
		}

		.project-header {
			padding: 24px;
		}

		.header-top {
			flex-direction: column;
			align-items: flex-start;
			gap: 16px;
		}

		.page-actions {
			width: 100%;
			flex-direction: column;
		}

		.page-actions button,
		.export-dropdown {
			width: 100%;
		}

		.page-actions button {
			justify-content: center;
		}

		.project-meta {
			flex-wrap: wrap;
			gap: 20px;
		}

		.board-view {
			grid-template-columns: 1fr;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.project-detail {
			padding: 12px;
			gap: 16px;
		}

		.project-header {
			padding: 20px;
			border-radius: 16px;
		}

		.project-header h1 {
			font-size: 24px;
		}

		.title-section {
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
		}

		.page-actions {
			gap: 10px;
		}

		.btn-primary,
		.btn-secondary {
			padding: 14px 18px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
		}

		.description {
			font-size: 14px;
		}

		.project-meta {
			flex-direction: column;
			gap: 16px;
			padding-top: 16px;
		}

		.view-controls {
			padding: 12px 16px;
		}

		.task-card {
			padding: 16px;
		}

		.task-card-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
		}

		.task-card-footer {
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
			margin-left: 0;
		}

		.task-meta {
			flex-direction: column;
			gap: 8px;
		}

		.task-description {
			margin-left: 0;
		}
	}
</style>
