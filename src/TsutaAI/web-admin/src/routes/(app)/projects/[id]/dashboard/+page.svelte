<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { apiClient } from '$lib/api/client';
	import type { WbsTask } from '$lib/components/wbs/types';

	/** プロジェクト情報 */
	let projectData: any = null;

	/** WBSタスク一覧 */
	let tasks: WbsTask[] = [];

	/** ローディング状態 */
	let isLoading = true;

	/** ダッシュボード統計データ */
	let stats = {
		totalTasks: 0,
		completedTasks: 0,
		inProgressTasks: 0,
		notStartedTasks: 0,
		overdueTasks: 0,
		blockedTasks: 0,
		completionRate: 0,
		avgProgress: 0,
		priorityDistribution: {
			high: 0,
			medium: 0,
			low: 0,
			none: 0
		},
		statusDistribution: {
			'not-started': 0,
			planning: 0,
			'in-progress': 0,
			'in-review': 0,
			blocked: 0,
			completed: 0
		},
		assigneeDistribution: [] as Array<{ name: string; count: number }>
	};

	onMount(async () => {
		const projectId = Number(get(page).params.id);
		await loadDashboardData(projectId);
		isLoading = false;
	});

	/** ダッシュボードデータを読み込む */
	async function loadDashboardData(projectId: number) {
		try {
			// プロジェクト情報を取得
			const projectResponse = await apiClient.fetchProject(projectId);
			projectData = projectResponse.data;

			// タスク一覧を取得
			const taskResponse = await apiClient.fetchTasks(projectId);
			tasks = taskResponse.data || [];

			// 統計を計算
			calculateStats(tasks);
		} catch (error) {
			console.error('ダッシュボードデータの読み込みに失敗しました:', error);
		}
	}

	/** 統計を計算 */
	function calculateStats(taskList: WbsTask[]) {
		const flatTasks = flattenTasks(taskList);

		stats.totalTasks = flatTasks.length;
		stats.completedTasks = flatTasks.filter((t) => t.status === 'completed' || t.status === 'done').length;
		stats.inProgressTasks = flatTasks.filter(
			(t) => t.status === 'in-progress' || t.status === 'in_progress'
		).length;
		stats.notStartedTasks = flatTasks.filter(
			(t) => t.status === 'not-started' || t.status === 'todo' || !t.status
		).length;
		stats.blockedTasks = flatTasks.filter((t) => t.status === 'blocked').length;

		// 期限超過タスク
		const today = new Date().toISOString().split('T')[0];
		stats.overdueTasks = flatTasks.filter(
			(t) => t.endDate && t.endDate < today && t.status !== 'completed' && t.status !== 'done'
		).length;

		// 完了率
		stats.completionRate =
			stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

		// 平均進捗率
		const totalProgress = flatTasks.reduce((sum, t) => sum + (t.progress || 0), 0);
		stats.avgProgress = stats.totalTasks > 0 ? Math.round(totalProgress / stats.totalTasks) : 0;

		// 優先度分布
		stats.priorityDistribution = {
			high: flatTasks.filter((t) => t.priority === 'high').length,
			medium: flatTasks.filter((t) => t.priority === 'medium').length,
			low: flatTasks.filter((t) => t.priority === 'low').length,
			none: flatTasks.filter((t) => !t.priority || t.priority === 'none').length
		};

		// ステータス分布
		stats.statusDistribution = {
			'not-started': flatTasks.filter(
				(t) => !t.status || t.status === 'not-started' || t.status === 'todo'
			).length,
			planning: flatTasks.filter((t) => t.status === 'planning').length,
			'in-progress': flatTasks.filter(
				(t) => t.status === 'in-progress' || t.status === 'in_progress'
			).length,
			'in-review': flatTasks.filter((t) => t.status === 'in-review').length,
			blocked: flatTasks.filter((t) => t.status === 'blocked').length,
			completed: flatTasks.filter((t) => t.status === 'completed' || t.status === 'done').length
		};

		// 担当者分布
		const assigneeMap = new Map<string, number>();
		flatTasks.forEach((t) => {
			const assignee =
				t.assignee || ((t as any).assignedTo ? String((t as any).assignedTo) : '未割り当て');
			assigneeMap.set(assignee, (assigneeMap.get(assignee) || 0) + 1);
		});
		stats.assigneeDistribution = Array.from(assigneeMap.entries())
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);
	}

	/** タスクツリーをフラット化 */
	function flattenTasks(taskList: WbsTask[]): WbsTask[] {
		let result: WbsTask[] = [];
		for (const task of taskList) {
			if (!task.archived) {
				result.push(task);
				const children = Array.isArray(task.children) ? task.children : [];
				if (children.length > 0) {
					result = result.concat(flattenTasks(children));
				}
			}
		}
		return result;
	}

	/** 優先度の色 */
	function getPriorityColor(priority: string): string {
		switch (priority) {
			case 'high':
				return '#ef4444';
			case 'medium':
				return '#f59e0b';
			case 'low':
				return '#10b981';
			default:
				return '#9ca3af';
		}
	}

	/** ステータスの色 */
	function getStatusColor(status: string): string {
		switch (status) {
			case 'completed':
				return '#10b981';
			case 'in-progress':
				return '#3b82f6';
			case 'in-review':
				return '#8b5cf6';
			case 'blocked':
				return '#ef4444';
			case 'planning':
				return '#f59e0b';
			default:
				return '#9ca3af';
		}
	}

	/** ステータスのラベル */
	function getStatusLabel(status: string): string {
		switch (status) {
			case 'not-started':
				return '未着手';
			case 'planning':
				return '計画中';
			case 'in-progress':
				return '進行中';
			case 'in-review':
				return 'レビュー待ち';
			case 'blocked':
				return 'ブロック中';
			case 'completed':
				return '完了';
			default:
				return '未着手';
		}
	}
</script>

<div class="dashboard">
	{#if isLoading}
		<div class="loading">
			<i class="bi bi-hourglass-split"></i>
			<p>ダッシュボードを読み込んでいます...</p>
		</div>
	{:else}
		<header class="dashboard-header">
			<div>
				<h1>
					<i class="bi bi-bar-chart-line"></i>
					プロジェクトダッシュボード
				</h1>
				<p>{projectData?.name || projectData?.project_name || 'プロジェクト'}</p>
			</div>
			<a href="/projects/{get(page).params.id}/wbs" class="back-btn">
				<i class="bi bi-arrow-left"></i>
				WBSに戻る
			</a>
		</header>

		<!-- サマリーカード -->
		<div class="summary-cards">
			<div class="card">
				<div class="card-icon" style="background: #dbeafe;">
					<i class="bi bi-list-task" style="color: #3b82f6;"></i>
				</div>
				<div class="card-content">
					<div class="card-label">総タスク数</div>
					<div class="card-value">{stats.totalTasks}</div>
				</div>
			</div>

			<div class="card">
				<div class="card-icon" style="background: #dcfce7;">
					<i class="bi bi-check-circle" style="color: #10b981;"></i>
				</div>
				<div class="card-content">
					<div class="card-label">完了タスク</div>
					<div class="card-value">{stats.completedTasks}</div>
				</div>
			</div>

			<div class="card">
				<div class="card-icon" style="background: #fef3c7;">
					<i class="bi bi-clock-history" style="color: #f59e0b;"></i>
				</div>
				<div class="card-content">
					<div class="card-label">進行中タスク</div>
					<div class="card-value">{stats.inProgressTasks}</div>
				</div>
			</div>

			<div class="card">
				<div class="card-icon" style="background: #fee2e2;">
					<i class="bi bi-exclamation-triangle" style="color: #ef4444;"></i>
				</div>
				<div class="card-content">
					<div class="card-label">期限超過</div>
					<div class="card-value">{stats.overdueTasks}</div>
				</div>
			</div>

			<div class="card">
				<div class="card-icon" style="background: #e0e7ff;">
					<i class="bi bi-slash-circle" style="color: #6366f1;"></i>
				</div>
				<div class="card-content">
					<div class="card-label">ブロック中</div>
					<div class="card-value">{stats.blockedTasks}</div>
				</div>
			</div>

			<div class="card highlight">
				<div class="card-icon" style="background: #ddd6fe;">
					<i class="bi bi-graph-up-arrow" style="color: #8b5cf6;"></i>
				</div>
				<div class="card-content">
					<div class="card-label">完了率</div>
					<div class="card-value">{stats.completionRate}%</div>
				</div>
			</div>
		</div>

		<!-- チャートセクション -->
		<div class="charts-grid">
			<!-- 優先度分布 -->
			<div class="chart-card">
				<h3>
					<i class="bi bi-flag"></i>
					優先度別タスク分布
				</h3>
				<div class="chart-content">
					{#each Object.entries(stats.priorityDistribution) as [priority, count]}
						<div class="bar-chart-row">
							<div class="bar-label">
								{#if priority === 'high'}高
								{:else if priority === 'medium'}中
								{:else if priority === 'low'}低
								{:else}なし
								{/if}
							</div>
							<div class="bar-container">
								<div
									class="bar"
									style="width: {stats.totalTasks > 0
										? (count / stats.totalTasks) * 100
										: 0}%; background: {getPriorityColor(priority)};"
								></div>
							</div>
							<div class="bar-value">{count}</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- ステータス分布 -->
			<div class="chart-card">
				<h3>
					<i class="bi bi-diagram-3"></i>
					ステータス別タスク分布
				</h3>
				<div class="chart-content">
					{#each Object.entries(stats.statusDistribution) as [status, count]}
						{#if count > 0}
							<div class="bar-chart-row">
								<div class="bar-label">{getStatusLabel(status)}</div>
								<div class="bar-container">
									<div
										class="bar"
										style="width: {stats.totalTasks > 0
											? (count / stats.totalTasks) * 100
											: 0}%; background: {getStatusColor(status)};"
									></div>
								</div>
								<div class="bar-value">{count}</div>
							</div>
						{/if}
					{/each}
				</div>
			</div>

			<!-- 担当者分布 -->
			<div class="chart-card">
				<h3>
					<i class="bi bi-people"></i>
					担当者別タスク数
				</h3>
				<div class="chart-content">
					{#each stats.assigneeDistribution as assignee}
						<div class="bar-chart-row">
							<div class="bar-label">{assignee.name}</div>
							<div class="bar-container">
								<div
									class="bar"
									style="width: {stats.totalTasks > 0
										? (assignee.count / stats.totalTasks) * 100
										: 0}%; background: #3b82f6;"
								></div>
							</div>
							<div class="bar-value">{assignee.count}</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- 進捗概要 -->
			<div class="chart-card">
				<h3>
					<i class="bi bi-speedometer2"></i>
					プロジェクト進捗
				</h3>
				<div class="progress-overview">
					<div class="progress-circle">
						<svg width="200" height="200" viewBox="0 0 200 200">
							<circle cx="100" cy="100" r="90" fill="none" stroke="#e5e7eb" stroke-width="20" />
							<circle
								cx="100"
								cy="100"
								r="90"
								fill="none"
								stroke="#3b82f6"
								stroke-width="20"
								stroke-dasharray="{(stats.avgProgress / 100) * 565.48} 565.48"
								stroke-linecap="round"
								transform="rotate(-90 100 100)"
							/>
							<text
								x="100"
								y="100"
								text-anchor="middle"
								dy=".3em"
								font-size="32"
								font-weight="700"
								fill="#111827"
							>
								{stats.avgProgress}%
							</text>
						</svg>
					</div>
					<div class="progress-details">
						<div class="progress-item">
							<span class="progress-label">平均進捗率</span>
							<span class="progress-value">{stats.avgProgress}%</span>
						</div>
						<div class="progress-item">
							<span class="progress-label">完了タスク</span>
							<span class="progress-value">{stats.completedTasks} / {stats.totalTasks}</span>
						</div>
						<div class="progress-item">
							<span class="progress-label">完了率</span>
							<span class="progress-value">{stats.completionRate}%</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.dashboard {
		padding: 24px;
		max-width: 1400px;
		margin: 0 auto;
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		gap: 16px;
		color: #6b7280;
	}

	.loading i {
		font-size: 48px;
		animation: spin 2s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.dashboard-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 32px;
	}

	.dashboard-header h1 {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0 0 8px 0;
		font-size: 28px;
		font-weight: 700;
		color: #111827;
	}

	.dashboard-header p {
		margin: 0;
		font-size: 16px;
		color: #6b7280;
	}

	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		background: #ffffff;
		color: #374151;
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		transition:
			background 0.2s ease,
			border-color 0.2s ease;
	}

	.back-btn:hover {
		background: #f3f4f6;
		border-color: #d1d5db;
	}

	.summary-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 20px;
		margin-bottom: 32px;
	}

	.card {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 20px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.card.highlight {
		border: 2px solid #8b5cf6;
		background: linear-gradient(135deg, #faf5ff, #ffffff);
	}

	.card-icon {
		width: 56px;
		height: 56px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
	}

	.card-content {
		flex: 1;
	}

	.card-label {
		font-size: 13px;
		color: #6b7280;
		margin-bottom: 6px;
	}

	.card-value {
		font-size: 28px;
		font-weight: 700;
		color: #111827;
	}

	.charts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
		gap: 24px;
	}

	.chart-card {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 24px;
	}

	.chart-card h3 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 20px 0;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.chart-content {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.bar-chart-row {
		display: grid;
		grid-template-columns: 100px 1fr 60px;
		align-items: center;
		gap: 12px;
	}

	.bar-label {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.bar-container {
		height: 32px;
		background: #f3f4f6;
		border-radius: 8px;
		overflow: hidden;
	}

	.bar {
		height: 100%;
		border-radius: 8px;
		transition: width 0.6s ease;
	}

	.bar-value {
		font-size: 14px;
		font-weight: 700;
		color: #111827;
		text-align: right;
	}

	.progress-overview {
		display: flex;
		align-items: center;
		gap: 32px;
	}

	.progress-circle {
		flex-shrink: 0;
	}

	.progress-details {
		display: flex;
		flex-direction: column;
		gap: 16px;
		flex: 1;
	}

	.progress-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		background: #f9fafb;
		border-radius: 8px;
	}

	.progress-label {
		font-size: 14px;
		color: #6b7280;
	}

	.progress-value {
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	@media (max-width: 768px) {
		.summary-cards {
			grid-template-columns: 1fr;
		}

		.charts-grid {
			grid-template-columns: 1fr;
		}

		.progress-overview {
			flex-direction: column;
		}
	}
</style>
