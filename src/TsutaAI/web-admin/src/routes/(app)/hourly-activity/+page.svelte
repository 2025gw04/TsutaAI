<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import { authStore } from '$lib/stores/auth';

	let workSessions: any[] = [];
	let loading = true;
	let error = '';
	let selectedDate = new Date().toISOString().split('T')[0];
	let selectedUserId: number | null = null;
	let selectedProjectId: number | null = null;
	let users: any[] = [];
	let projects: any[] = [];

	$: currentUser = $authStore;
	$: isAdmin = currentUser?.role === 'admin';

	onMount(async () => {
		try {
			const promises = [apiClient.fetchProjects()];
			if (isAdmin) {
				promises.push(apiClient.fetchUsers());
			}

			const [projectsRes, usersRes] = await Promise.all(promises);
			projects = projectsRes.data;
			if (usersRes) {
				users = usersRes.data;
			}

			selectedUserId = currentUser?.id || null;
			await loadSessions();
		} catch (err: any) {
			error = err.message;
		} finally {
			loading = false;
		}
	});

	async function loadSessions() {
		if (!selectedUserId) return;

		loading = true;
		error = '';
		workSessions = [];

		try {
			const startDate = new Date(selectedDate);
			startDate.setHours(0, 0, 0, 0);
			const endDate = new Date(selectedDate);
			endDate.setHours(23, 59, 59, 999);

			const res = await apiClient.fetchWorkSessions(selectedUserId, {
				startDate: startDate.toISOString(),
				endDate: endDate.toISOString(),
				projectId: selectedProjectId || undefined,
				limit: 100
			});

			workSessions = res.data || [];
		} catch (err: any) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	function formatTime(dateStr: string) {
		const date = new Date(dateStr);
		return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
	}

	function formatDuration(seconds: number) {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (hours > 0) {
			return `${hours}時間${minutes}分`;
		}
		return `${minutes}分`;
	}

	function getProgressColor(percentage: number) {
		if (percentage >= 100) return 'bg-success';
		if (percentage >= 70) return 'bg-info';
		if (percentage >= 40) return 'bg-warning';
		return 'bg-secondary';
	}
</script>

<svelte:head>
	<title>作業セッション記録 - TsutaAI</title>
</svelte:head>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-clock-history"></i>
				作業セッション記録
			</h1>
			<p>プロジェクト・タスク単位の作業詳細と進捗状況</p>
		</div>
	</header>
</div>

<section class="page">
	<div class="page-actions">
		<div class="filter-group">
			{#if isAdmin}
				<select bind:value={selectedUserId} on:change={loadSessions} class="filter-select">
					<option value={null}>全ユーザー</option>
					{#each users as user}
						<option value={user.id}>{user.fullName || user.username}</option>
					{/each}
				</select>
			{/if}

			<select bind:value={selectedProjectId} on:change={loadSessions} class="filter-select">
				<option value={null}>全プロジェクト</option>
				{#each projects as project}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>

			<input type="date" bind:value={selectedDate} on:change={loadSessions} class="filter-date" />

			<button class="btn-refresh" on:click={loadSessions} disabled={loading}>
				<i class="bi bi-arrow-clockwise"></i>
				更新
			</button>
		</div>
	</div>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>データを読み込んでいます...</p>
		</div>
	{:else if error}
		<div class="error-banner">
			<p>エラーが発生しました: {error}</p>
		</div>
	{:else if workSessions.length === 0}
		<div class="empty-message">
			<i class="bi bi-inbox"></i>
			<p>選択された条件の作業記録がありません。</p>
			<small>デスクトップアプリで作業・コミットを行うとここに記録されます。</small>
		</div>
	{:else}
		<!-- Desktop View (Table) -->
		<div class="table-container desktop-only">
			<table class="session-table">
				<thead>
					<tr>
						<th>時間</th>
						<th>プロジェクト</th>
						<th>タスク</th>
						<th>作業時間</th>
						<th>進捗</th>
						<th>成果</th>
					</tr>
				</thead>
				<tbody>
					{#each workSessions as session}
						<tr>
							<td class="col-time">
								<div class="time-range">
									{formatTime(session.session_start)} - {formatTime(session.session_end)}
								</div>
							</td>
							<td class="col-project">
								{#if session.project_name}
									<span class="project-badge">{session.project_name}</span>
								{:else}
									<span class="text-muted">-</span>
								{/if}
							</td>
							<td class="col-task">
								<div class="task-info">
									<span class="task-title">{session.task_title || '未分類の作業'}</span>
									{#if session.session_notes}
										<span class="task-note">{session.session_notes}</span>
									{/if}
								</div>
							</td>
							<td class="col-duration">
								<span class="duration-badge">
									{formatDuration(session.work_duration_seconds)}
								</span>
							</td>
							<td class="col-progress">
								<div class="progress-wrap">
									<div class="progress">
										<div
											class="progress-bar {getProgressColor(session.progress_percentage)}"
											style="width: {session.progress_percentage}%"
										></div>
									</div>
									<span class="progress-val">{session.progress_percentage}%</span>
								</div>
							</td>
							<td class="col-stats">
								<div class="stats-badges">
									{#if session.commits_count > 0}
										<span class="stat-badge commit" title="コミット数">
											<i class="bi bi-git"></i>
											{session.commits_count}
										</span>
									{/if}
									{#if session.pushes_count > 0}
										<span class="stat-badge push" title="プッシュ数">
											<i class="bi bi-upload"></i>
											{session.pushes_count}
										</span>
									{/if}
									{#if session.files_changed > 0}
										<span class="stat-badge file" title="変更ファイル数">
											<i class="bi bi-file-earmark-code"></i>
											{session.files_changed}
										</span>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Mobile View (Compact List) -->
		<div class="mobile-list mobile-only">
			{#each workSessions as session}
				<div class="session-item">
					<div class="session-main">
						<div class="session-meta">
							<span class="time"
								>{formatTime(session.session_start)} - {formatTime(session.session_end)}</span
							>
							<span class="duration">{formatDuration(session.work_duration_seconds)}</span>
						</div>
						<div class="project-info">
							{#if session.project_name}
								<span class="project-label">{session.project_name}</span>
							{/if}
						</div>
						<div class="task-title">{session.task_title || '未分類の作業'}</div>
					</div>

					<div class="session-side">
						<div
							class="progress-circle"
							style="background: conic-gradient(var(--progress-color) {session.progress_percentage}%, #e2e8f0 0);"
						>
							<div class="inner">{session.progress_percentage}%</div>
						</div>
						<div class="activity-counts">
							{#if session.commits_count > 0}
								<div class="activity-count commit-count">
									<i class="bi bi-git"></i>
									{session.commits_count}
								</div>
							{/if}
							{#if session.pushes_count > 0}
								<div class="activity-count push-count">
									<i class="bi bi-upload"></i>
									{session.pushes_count}
								</div>
							{/if}
							{#if session.files_changed > 0}
								<div class="activity-count file-count">
									<i class="bi bi-file-earmark-code"></i>
									{session.files_changed}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	/* Header & Layout - Matches daily-reports */
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
		font-family: 'Noto Sans JP', sans-serif;
	}

	/* Actions */
	.page-actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 16px;
	}

	.filter-group {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
	}

	.filter-select,
	.filter-date {
		padding: 8px 12px;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		font-size: 14px;
		color: #475569;
		background-color: #fff;
	}

	.btn-refresh {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}
	.btn-refresh:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Desktop Table */
	.table-container {
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.session-table {
		width: 100%;
		border-collapse: collapse;
	}

	.session-table th {
		background: #f8fafc;
		padding: 12px 16px;
		text-align: left;
		font-size: 12px;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		border-bottom: 1px solid #e2e8f0;
	}

	.session-table td {
		padding: 16px;
		border-bottom: 1px solid #f1f5f9;
		vertical-align: middle;
	}

	.col-time {
		width: 140px;
		font-variant-numeric: tabular-nums;
		color: #475569;
		font-size: 13px;
	}
	.col-project {
		width: 220px;
	}
	.col-duration {
		width: 140px;
		white-space: nowrap;
	}
	.col-progress {
		width: 150px;
	}
	.col-stats {
		width: 120px;
	}

	.project-badge {
		background: #eff6ff;
		color: #3b82f6;
		border: 1px solid #dbeafe;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 500;
		display: inline-block;
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: middle;
	}

	.task-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.task-title {
		font-weight: 600;
		color: #1e293b;
		font-size: 14px;
	}
	.task-note {
		font-size: 12px;
		color: #64748b;
	}

	.duration-badge {
		background: #f1f5f9;
		color: #475569;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
	}

	.progress-wrap {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.progress {
		flex: 1;
		height: 6px;
		background: #e2e8f0;
		border-radius: 3px;
		overflow: hidden;
	}
	.progress-bar {
		height: 100%;
	}
	.progress-val {
		font-size: 12px;
		font-weight: 600;
		width: 32px;
		text-align: right;
	}

	.bg-success {
		background: #10b981;
	}
	.bg-info {
		background: #3b82f6;
	}
	.bg-warning {
		background: #f59e0b;
	}
	.bg-secondary {
		background: #94a3b8;
	}

	.stats-badges {
		display: flex;
		gap: 8px;
	}
	.stat-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		padding: 2px 6px;
		border-radius: 4px;
		font-weight: 500;
	}
	.stat-badge.commit {
		background: #fee2e2;
		color: #dc2626;
	}
	.stat-badge.push {
		background: #fef3c7;
		color: #d97706;
	}
	.stat-badge.file {
		background: #f0fdf4;
		color: #16a34a;
	}

	/* Mobile List */
	.mobile-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.session-item {
		background: #fff;
		border-radius: 12px;
		padding: 16px;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.session-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.session-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #64748b;
	}
	.duration {
		font-weight: 600;
		color: #475569;
		background: #f1f5f9;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.project-label {
		font-size: 11px;
		font-weight: 600;
		color: #3b82f6;
		text-transform: uppercase;
		background: #eff6ff;
		padding: 2px 6px;
		border-radius: 4px;
		display: inline-block;
	}

	.task-title {
		font-size: 14px;
		font-weight: 600;
		color: #1e293b;
		line-height: 1.4;
	}

	.session-side {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-left: 12px;
	}

	.progress-circle {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		--progress-color: #3b82f6;
	}
	.progress-circle .inner {
		width: 32px;
		height: 32px;
		background: #fff;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 700;
		color: #334155;
	}

	.activity-counts {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px;
	}

	.activity-count {
		font-size: 11px;
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 1px 5px;
		border-radius: 4px;
	}
	.commit-count {
		color: #dc2626;
		background: #fee2e2;
	}
	.push-count {
		color: #d97706;
		background: #fef3c7;
	}
	.file-count {
		color: #16a34a;
		background: #f0fdf4;
	}

	/* States */
	.loading-state,
	.empty-message {
		text-align: center;
		padding: 48px;
		background: #fff;
		border-radius: 12px;
		color: #64748b;
	}
	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #e2e8f0;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 16px;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Visibility */
	.mobile-only {
		display: none;
	}
	.desktop-only {
		display: block;
	}

	@media (max-width: 960px) {
		.page-header-wrapper {
			display: block;
			margin: 0;
			background: #1c2638;
			color: #fff;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		}
		.page-header {
			padding: 0 24px;
			height: 100%;
			display: flex;
			align-items: center;
		}
		.header-content h1 {
			font-size: 20px;
			font-weight: 700;
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 0;
		}
		.header-content p {
			display: none;
		}

		.page {
			padding: 16px;
		}

		.filter-group {
			flex-direction: column;
			width: 100%;
			align-items: stretch;
		}

		.desktop-only {
			display: none;
		}
		.mobile-only {
			display: flex;
		}
	}
</style>
