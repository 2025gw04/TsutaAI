<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';

	// データ
	let riskFilteredTasks: any[] = [];
	let highRiskCount = 0;
	let delayedTasks: any[] = [];
	let projects: any[] = [];
	let selectedProject: any = null;
	let projectSummary: any = null;

	// UI状態
	let isLoading = true;
	let error = '';
	let selectedRiskLevel: 'high' | 'medium' | 'low' = 'high';
	let activeTab: 'priority' | 'delayed' | 'projects' = 'priority';
	let viewMode: 'grid' | 'list' = 'list';
	let showAnalysisModal = false;
	let analysisTitle = '';
	let analysisContent = '';
	let selectedTaskName = '';

	function openAnalysisModal(title: string, taskName: string, content: string) {
		analysisTitle = title;
		selectedTaskName = taskName;
		analysisContent = content;
		showAnalysisModal = true;
	}

	function closeAnalysisModal() {
		showAnalysisModal = false;
		analysisTitle = '';
		analysisContent = '';
		selectedTaskName = '';
	}

	onMount(async () => {
		await loadDashboard();
	});

	async function loadDashboard() {
		isLoading = true;
		error = '';

		try {
			const [highOverallRes, filteredRes, delayedRes, projectsRes] = await Promise.all([
				apiClient.fetchHighRiskTasks('high'),
				apiClient.fetchHighRiskTasks(selectedRiskLevel),
				apiClient.fetchDelayedTasks(),
				apiClient.fetchProjects()
			]);

			highRiskCount = highOverallRes.data.length;
			riskFilteredTasks = filteredRes.data;
			delayedTasks = delayedRes.data;
			projects = projectsRes.data;
		} catch (err: any) {
			error = err.message || 'データの取得に失敗しました';
			console.error('Progress tracking error:', err);
		} finally {
			isLoading = false;
		}
	}

	async function selectProject(project: any) {
		selectedProject = project;

		try {
			const summaryRes = await apiClient.fetchProjectProgressSummary(project.id);
			projectSummary = summaryRes.data;
		} catch (err: any) {
			console.error('Error fetching project summary:', err);
		}
	}

	async function changeRiskLevel(level: 'high' | 'medium' | 'low') {
		selectedRiskLevel = level;
		try {
			const res = await apiClient.fetchHighRiskTasks(level);
			riskFilteredTasks = res.data;
		} catch (err: any) {
			console.error('Error fetching risk tasks:', err);
		}
	}

	function getRiskColor(risk: string): string {
		if (risk === 'high') return '#dc3545';
		if (risk === 'medium') return '#ffc107';
		return '#28a745';
	}

	function getRiskBadgeClass(risk: string): string {
		if (risk === 'high') return 'risk-high';
		if (risk === 'medium') return 'risk-medium';
		return 'risk-low';
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'N/A';
		return new Date(dateStr).toLocaleDateString('ja-JP');
	}

	function getProgressColor(progress: number): string {
		if (progress >= 80) return '#28a745';
		if (progress >= 50) return '#ffc107';
		return '#dc3545';
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-activity"></i>
				進捗トラッキング
			</h1>
			<p>進捗状況とリスク</p>
		</div>
	</header>
</div>

<div class="progress-tracking">
	<div class="page-actions">
		<button class="refresh-btn" on:click={loadDashboard} disabled={isLoading}>
			<i class="bi bi-arrow-clockwise"></i>
			{isLoading ? '更新中...' : '更新'}
		</button>
	</div>

	{#if error}
		<div class="error-message">
			<i class="bi bi-exclamation-triangle-fill"></i>
			<span>{error}</span>
		</div>
	{/if}

	{#if isLoading}
		<div class="loading-overlay">
			<div class="spinner"></div>
			<p>データを読み込んでいます...</p>
		</div>
	{:else}
		<!-- サマリー統計 -->
		<section class="summary-section">
			<div class="summary-grid">
				<div class="summary-card high-risk">
					<div class="card-icon">
						<i class="bi bi-exclamation-triangle-fill"></i>
					</div>
					<div class="card-content">
						<div class="card-label">高リスクタスク</div>
						<div class="card-value">{highRiskCount}</div>
					</div>
				</div>
				<div class="summary-card delayed">
					<div class="card-icon">
						<i class="bi bi-clock-history"></i>
					</div>
					<div class="card-content">
						<div class="card-label">遅延タスク</div>
						<div class="card-value">{delayedTasks.length}</div>
					</div>
				</div>
				<div class="summary-card in-progress">
					<div class="card-icon">
						<i class="bi bi-play-circle-fill"></i>
					</div>
					<div class="card-content">
						<div class="card-label">進行中プロジェクト</div>
						<div class="card-value">
							{projects.filter((p: any) => p.status === 'in_progress' || p.status === 'active')
								.length}
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- リスクレベル選択 -->
		<!-- Tabs Navigation -->
		<div class="tabs-nav">
			<button
				class="tab-btn"
				class:active={activeTab === 'priority'}
				on:click={() => (activeTab = 'priority')}
			>
				<i class="bi bi-shield-exclamation"></i>
				リスク管理
				<span class="badge">{highRiskCount}</span>
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'delayed'}
				on:click={() => (activeTab = 'delayed')}
			>
				<i class="bi bi-hourglass-split"></i>
				遅延タスク
				<span class="badge warning">{delayedTasks.length}</span>
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'projects'}
				on:click={() => (activeTab = 'projects')}
			>
				<i class="bi bi-folder"></i>
				プロジェクト
			</button>
		</div>

		<!-- Main Content Area -->
		<div class="tab-content">
			<!-- Priority Tasks Tab -->
			{#if activeTab === 'priority'}
				<section class="content-section">
					<div class="section-header-compact">
						<div class="risk-filter">
							{#each ['high', 'medium', 'low'] as level}
								<button
									class="filter-pill {level}"
									class:active={selectedRiskLevel === level}
									on:click={() => changeRiskLevel(level as any)}
								>
									{level === 'high' ? '高' : level === 'medium' ? '中' : '低'}リスク
								</button>
							{/each}
						</div>

						<div class="view-toggle">
							<button
								class:active={viewMode === 'list'}
								on:click={() => (viewMode = 'list')}
								title="リスト表示"
							>
								<i class="bi bi-list-ul"></i>
							</button>
							<button
								class:active={viewMode === 'grid'}
								on:click={() => (viewMode = 'grid')}
								title="グリッド表示"
							>
								<i class="bi bi-grid-fill"></i>
							</button>
						</div>
					</div>

					{#if riskFilteredTasks.length > 0}
						{#if viewMode === 'list'}
							<div class="table-container">
								<table class="task-table">
									<thead>
										<tr>
											<th>タスク名</th>
											<th>担当者</th>
											<th>進捗</th>
											<th>予測完了</th>
											<th>完了確率</th>
											<th>AI提案</th>
										</tr>
									</thead>
									<tbody>
										{#each riskFilteredTasks as task}
											<tr>
												<td>
													<div class="task-name-cell">
														<span class="risk-dot {task.risk_level}"></span>
														<strong>{task.task_name}</strong>
													</div>
												</td>
												<td>
													<div class="user-cell">
														<div class="avatar-sm placeholder">
															{task.user_full_name?.[0] || '?'}
														</div>
														<span>{task.user_full_name || '未割り当て'}</span>
													</div>
												</td>
												<td>
													<div class="progress-cell">
														<div class="progress-bar-mini">
															<div
																class="fill"
																style="width: {task.current_progress}%; background-color: {getProgressColor(
																	task.current_progress
																)}"
															></div>
														</div>
														<span>{task.current_progress}%</span>
													</div>
												</td>
												<td>{formatDate(task.predicted_completion_date)}</td>
												<td>
													<span
														class="probability-badge"
														style="--val: {task.completion_probability}"
													>
														{(task.completion_probability * 100).toFixed(0)}%
													</span>
												</td>
												<td class="ai-cell">
													{#if task.ai_suggestion}
														<button
															class="ai-suggestion-btn"
															on:click={() =>
																openAnalysisModal('AI提案', task.task_name, task.ai_suggestion)}
															title="AI提案を表示"
														>
															<i class="bi bi-lightbulb-fill"></i>
														</button>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<div class="tasks-grid">
								{#each riskFilteredTasks as task}
									<div class="task-card compact">
										<div class="task-header">
											<div class="task-title">
												<span class="risk-dot {task.risk_level}"></span>
												<strong>{task.task_name}</strong>
											</div>
											<span class="risk-badge {getRiskBadgeClass(task.risk_level)}"
												>{task.risk_level}</span
											>
										</div>
										<div class="task-body">
											<div class="meta-row">
												<span><i class="bi bi-person"></i> {task.user_full_name || 'N/A'}</span>
												<span><i class="bi bi-calendar"></i> {formatDate(task.due_date)}</span>
											</div>
											<div class="progress-row">
												<div class="progress-bar-mini">
													<div
														class="fill"
														style="width: {task.current_progress}%; background-color: {getProgressColor(
															task.current_progress
														)}"
													></div>
												</div>
												<span>{task.current_progress}%</span>
											</div>
											{#if task.ai_suggestion}
												<button
													class="ai-suggestion-btn-card"
													on:click={() =>
														openAnalysisModal('AI提案', task.task_name, task.ai_suggestion)}
												>
													<i class="bi bi-robot"></i>
													AI提案を見る
												</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{:else}
						<div class="empty-state-compact">
							<i class="bi bi-check-circle"></i>
							<p>このリスクレベルのタスクはありません</p>
						</div>
					{/if}
				</section>
			{/if}

			<!-- Delayed Tasks Tab -->
			{#if activeTab === 'delayed'}
				<section class="content-section">
					<div class="section-header-compact right">
						<div class="view-toggle">
							<button class:active={viewMode === 'list'} on:click={() => (viewMode = 'list')}
								><i class="bi bi-list-ul"></i></button
							>
							<button class:active={viewMode === 'grid'} on:click={() => (viewMode = 'grid')}
								><i class="bi bi-grid-fill"></i></button
							>
						</div>
					</div>

					{#if delayedTasks.length > 0}
						{#if viewMode === 'list'}
							<div class="table-container">
								<table class="task-table delayed-table">
									<thead>
										<tr>
											<th>タスク名</th>
											<th>担当者</th>
											<th>進捗</th>
											<th>完了確率</th>
											<th>ボトルネック</th>
										</tr>
									</thead>
									<tbody>
										{#each delayedTasks as task}
											<tr>
												<td>
													<div class="task-name-cell">
														<i class="bi bi-exclamation-triangle-fill text-danger"></i>
														<strong>{task.task_name}</strong>
													</div>
												</td>
												<td>{task.user_full_name || 'N/A'}</td>
												<td>
													<div class="progress-cell">
														<div class="progress-bar-mini">
															<div
																class="fill"
																style="width: {task.current_progress}%; background-color: {getProgressColor(
																	task.current_progress
																)}"
															></div>
														</div>
														<span>{task.current_progress}%</span>
													</div>
												</td>
												<td class="warning">{(task.completion_probability * 100).toFixed(0)}%</td>
												<td class="ai-cell">
													{#if task.bottleneck_analysis}
														<button
															class="ai-suggestion-btn"
															on:click={() =>
																openAnalysisModal(
																	'ボトルネック分析',
																	task.task_name,
																	task.bottleneck_analysis
																)}
															title="分析詳細を表示"
														>
															<i class="bi bi-search"></i>
														</button>
													{:else}
														-
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<div class="tasks-grid">
								{#each delayedTasks as task}
									<div class="task-card delayed-card compact">
										<div class="task-header">
											<div class="task-title">
												<i class="bi bi-exclamation-triangle-fill text-danger"></i>
												<strong>{task.task_name}</strong>
											</div>
											<span class="status-badge delayed">遅延</span>
										</div>
										<div class="task-body">
											<div class="meta-row">
												<span><i class="bi bi-person"></i> {task.user_full_name || 'N/A'}</span>
											</div>
											<div class="progress-row">
												<div class="progress-bar-mini">
													<div class="fill" style="width: {task.current_progress}%"></div>
												</div>
												<span>{task.current_progress}%</span>
											</div>
											{#if task.bottleneck_analysis}
												<button
													class="ai-suggestion-btn-card bottleneck-btn"
													on:click={() =>
														openAnalysisModal(
															'ボトルネック分析',
															task.task_name,
															task.bottleneck_analysis
														)}
												>
													<i class="bi bi-exclamation-octagon"></i>
													分析詳細を見る
												</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{:else}
						<div class="empty-state-compact">遅延タスクはありません</div>
					{/if}
				</section>
			{/if}

			<!-- Projects Tab -->
			{#if activeTab === 'projects'}
				<section class="projects-layout">
					<div class="projects-list-scroll">
						{#each projects.filter((p: any) => p.status === 'in_progress' || p.status === 'active' || p.status === 'planning') as project}
							<button
								class="project-row-item"
								class:selected={selectedProject?.id === project.id}
								on:click={() => selectProject(project)}
							>
								<div class="project-info">
									<strong>{project.name}</strong>
									<span class="date"
										>{formatDate(project.startDate)} - {formatDate(project.endDate)}</span
									>
								</div>
								<i class="bi bi-chevron-right"></i>
							</button>
						{/each}
					</div>

					<div class="project-details-panel">
						{#if selectedProject && projectSummary}
							<div class="panel-card">
								<div class="panel-header">
									<h2>{selectedProject.name}</h2>
									<span
										class="badge"
										style="background: {getProgressColor(projectSummary.avgProgress)}; color: white"
									>
										{projectSummary.avgProgress?.toFixed(1)}% 完了
									</span>
								</div>

								<div class="stats-grid-mini">
									<div class="stat-box">
										<label>タスク</label>
										<div class="value">{projectSummary.totalTasks}</div>
									</div>
									<div class="stat-box">
										<label>遅延</label>
										<div class="value text-danger">{projectSummary.delayedTasks}</div>
									</div>
									<div class="stat-box">
										<label>完了</label>
										<div class="value text-success">{projectSummary.completedTasks}</div>
									</div>
								</div>

								<div class="risk-distribution-compact">
									<label>リスク分布</label>
									<div class="risk-bars">
										<div
											class="risk-bar high"
											style="flex: {projectSummary.riskDistribution?.high || 1}"
											title="High"
										></div>
										<div
											class="risk-bar medium"
											style="flex: {projectSummary.riskDistribution?.medium || 1}"
											title="Medium"
										></div>
										<div
											class="risk-bar low"
											style="flex: {projectSummary.riskDistribution?.low || 1}"
											title="Low"
										></div>
									</div>
									<div class="risk-legend">
										<span
											><span class="dot high"></span> 高 ({projectSummary.riskDistribution?.high ||
												0})</span
										>
										<span
											><span class="dot medium"></span> 中 ({projectSummary.riskDistribution
												?.medium || 0})</span
										>
										<span
											><span class="dot low"></span> 低 ({projectSummary.riskDistribution?.low ||
												0})</span
										>
									</div>
								</div>
							</div>
						{:else}
							<div class="empty-panel">
								<i class="bi bi-arrow-left-circle"></i>
								<p>左のリストからプロジェクトを選択してください</p>
							</div>
						{/if}
					</div>
				</section>
			{/if}
		</div>
	{/if}
</div>

<!-- AI Suggestion/Analysis Modal -->
{#if showAnalysisModal}
	<div
		class="modal-overlay"
		on:click={closeAnalysisModal}
		on:keydown={(e) => e.key === 'Escape' && closeAnalysisModal()}
		role="button"
		tabindex="-1"
		aria-label="モーダルを閉じる"
	>
		<div
			class="modal-window"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			tabindex="0"
		>
			<div class="modal-header">
				<h2 id="modal-title">
					<i class="bi {analysisTitle === 'AI提案' ? 'bi-robot' : 'bi-search'}"></i>
					{analysisTitle}
				</h2>
				<button class="close-btn" on:click={closeAnalysisModal} aria-label="閉じる">
					<i class="bi bi-x-lg"></i>
				</button>
			</div>
			<div class="modal-body">
				<div class="task-name-display">
					<strong>タスク:</strong>
					{selectedTaskName}
				</div>
				<div class="suggestion-content">
					{analysisContent}
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-secondary" on:click={closeAnalysisModal}> 閉じる </button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.progress-tracking {
		/* Use standard page layout */
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #f9fafb;
		flex: 1;
		overflow-x: hidden;
		padding: 24px;
		box-sizing: border-box;
		max-width: 100%;
		margin: 0;
	}

	.page-actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 24px;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
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

		.progress-tracking {
			padding: 16px;
		}
	}

	.refresh-btn {
		padding: 0.875rem 1.75rem;
		background: rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(10px);
		color: white;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 12px;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		transition: all 0.3s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.refresh-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.3);
		transform: translateY(-2px);
	}

	.refresh-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		background: linear-gradient(135deg, #fee2e2, #fecaca);
		color: #991b1b;
		border-radius: 12px;
		margin-bottom: 1.5rem;
		border-left: 4px solid #ef4444;
		font-weight: 600;
	}

	.error-message i {
		font-size: 1.5rem;
	}

	.loading-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(255, 255, 255, 0.9);
		backdrop-filter: blur(5px);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 9999;
	}

	.spinner {
		width: 60px;
		height: 60px;
		border: 4px solid #e5e7eb;
		border-top-color: #f093fb;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-overlay p {
		margin-top: 1.5rem;
		color: #f093fb;
		font-weight: 600;
		font-size: 1.1rem;
	}

	.summary-section {
		margin-bottom: 2rem;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	.summary-card {
		background: white;
		border-radius: 20px;
		padding: 2rem;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
		transition: all 0.3s;
	}

	.summary-card:hover {
		transform: translateY(-5px);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
	}

	.summary-card.high-risk {
		border-left: 5px solid #dc3545;
	}

	.summary-card.delayed {
		border-left: 5px solid #ffc107;
	}

	.summary-card.in-progress {
		border-left: 5px solid #28a745;
	}

	.card-icon {
		width: 60px;
		height: 60px;
		border-radius: 15px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		flex-shrink: 0;
	}

	.high-risk .card-icon {
		background: linear-gradient(135deg, #fee2e2, #fecaca);
		color: #dc3545;
	}

	.delayed .card-icon {
		background: linear-gradient(135deg, #fef3c7, #fde68a);
		color: #ffc107;
	}

	.in-progress .card-icon {
		background: linear-gradient(135deg, #d1fae5, #a7f3d0);
		color: #28a745;
	}

	.card-content {
		flex: 1;
	}

	.card-label {
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 0.5rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.card-value {
		font-size: 2.5rem;
		font-weight: 800;
		color: #111827;
	}

	/* Tab Styles */
	.tabs-nav {
		display: flex;
		gap: 1rem;
		margin-bottom: 24px;
		border-bottom: 2px solid #e5e7eb;
		padding-bottom: 2px;
		overflow-x: auto;
		scrollbar-width: none; /* Firefox */
	}
	.tabs-nav::-webkit-scrollbar {
		display: none; /* Chrome/Safari */
	}

	.tab-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		color: #6b7280;
		margin-bottom: -4px;
		white-space: nowrap;
		transition: all 0.2s;
	}

	.tab-btn:hover {
		color: #374151;
	}

	.tab-btn.active {
		color: #f093fb;
		border-bottom-color: #f093fb;
	}

	.badge {
		background: #e5e7eb;
		color: #374151;
		padding: 2px 8px;
		border-radius: 99px;
		font-size: 0.75rem;
	}

	.badge.warning {
		background: #fee2e2;
		color: #991b1b;
	}

	/* Content Sections */
	.content-section,
	.projects-layout {
		background: white;
		border-radius: 20px;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06);
		overflow: hidden;
		animation: fadeIn 0.3s ease-out;
		min-height: 400px;
	}

	.content-section {
		padding: 1.5rem;
	}

	.section-header-compact {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.section-header-compact.right {
		justify-content: flex-end;
	}

	.risk-filter {
		display: flex;
		background: #f3f4f6;
		padding: 4px;
		border-radius: 12px;
	}

	.filter-pill {
		padding: 6px 16px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: #6b7280;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.filter-pill:hover {
		color: #374151;
	}

	.filter-pill.active {
		background: white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.filter-pill.high.active {
		color: #dc3545;
	}
	.filter-pill.medium.active {
		color: #d97706;
	}
	.filter-pill.low.active {
		color: #059669;
	}

	.view-toggle {
		display: flex;
		gap: 4px;
		background: #f3f4f6;
		padding: 4px;
		border-radius: 8px;
	}

	.view-toggle button {
		padding: 6px 10px;
		border: none;
		background: transparent;
		border-radius: 6px;
		color: #6b7280;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.view-toggle button.active {
		background: white;
		color: #f093fb;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.view-toggle button i {
		font-size: 1.1rem;
	}

	/* Tables */
	.table-container {
		overflow-x: auto;
	}

	.task-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.95rem;
	}

	.task-table th {
		text-align: left;
		padding: 12px 16px;
		font-weight: 600;
		color: #6b7280;
		border-bottom: 2px solid #f3f4f6;
		white-space: nowrap;
	}

	.task-table td {
		padding: 12px 16px;
		border-bottom: 1px solid #f3f4f6;
		color: #374151;
		vertical-align: middle;
	}

	.task-table tr:hover td {
		background: #f9fafb;
	}

	.task-name-cell {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.risk-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.risk-dot.high {
		background: #dc3545;
		box-shadow: 0 0 0 2px #fee2e2;
	}
	.risk-dot.medium {
		background: #f59e0b;
		box-shadow: 0 0 0 2px #fef3c7;
	}
	.risk-dot.low {
		background: #10b981;
		box-shadow: 0 0 0 2px #d1fae5;
	}

	/* User Cell */
	.user-cell {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.avatar-sm {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
	}
	.avatar-sm.placeholder {
		background: #e5e7eb;
		color: #6b7280;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: bold;
		min-width: 24px;
	}

	/* Progress Bar Mini */
	.progress-cell {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		max-width: 150px;
	}
	.progress-bar-mini {
		flex: 1;
		height: 6px;
		background: #e5e7eb;
		border-radius: 3px;
		overflow: hidden;
	}
	.progress-bar-mini .fill {
		height: 100%;
		border-radius: 3px;
	}

	/* Probability Badge */
	.probability-badge {
		font-weight: 600;
		color: #374151;
	}

	/* AI Cell */
	.ai-cell {
		text-align: center;
	}

	.ai-suggestion-btn {
		background: none;
		border: none;
		color: #f093fb;
		cursor: pointer;
		font-size: 1.2rem;
		padding: 4px 8px;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.ai-suggestion-btn:hover {
		background: #fdf2f8;
		transform: scale(1.1);
	}

	.ai-suggestion-btn-card {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		background: #fdf2f8;
		border: 1px solid #f093fb;
		border-radius: 8px;
		color: #db2777;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		margin-top: 0.5rem;
		width: 100%;
		justify-content: center;
	}

	.ai-suggestion-btn-card:hover {
		background: #f093fb;
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(240, 147, 251, 0.3);
	}

	.bottleneck-btn {
		background: #fef2f2;
		border-color: #fca5a5;
		color: #991b1b;
	}

	.bottleneck-btn:hover {
		background: #ef4444;
		border-color: #ef4444;
		color: white;
		box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
	}

	/* Modal Styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		animation: fadeIn 0.2s ease-out;
	}

	.modal-window {
		background: white;
		border-radius: 16px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		max-width: 600px;
		width: 90%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		color: #111827;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.modal-header h2 i {
		color: #f093fb;
		font-size: 1.5rem;
	}

	.close-btn {
		background: none;
		border: none;
		color: #6b7280;
		cursor: pointer;
		font-size: 1.25rem;
		padding: 4px;
		border-radius: 4px;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.modal-body {
		padding: 1.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.task-name-display {
		padding: 1rem;
		background: #f9fafb;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.95rem;
		color: #374151;
	}

	.suggestion-content {
		line-height: 1.7;
		color: #1f2937;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.modal-footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid #e5e7eb;
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.btn-secondary {
		padding: 0.5rem 1.5rem;
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		color: #374151;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-secondary:hover {
		background: #e5e7eb;
		border-color: #9ca3af;
	}

	/* Projects Layout */
	.projects-layout {
		display: grid;
		grid-template-columns: 350px 1fr;
		min-height: 600px;
		align-items: stretch;
	}

	.projects-list-scroll {
		border-right: 1px solid #e5e7eb;
		overflow-y: auto;
		max-height: 800px;
		display: flex;
		flex-direction: column;
	}

	.project-row-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.25rem 1.5rem;
		border: none;
		border-bottom: 1px solid #f3f4f6;
		background: transparent;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s;
		width: 100%;
	}

	.project-row-item:hover {
		background: #f9fafb;
	}

	.project-row-item.selected {
		background: #fdf2f8; /* Light pink/purple tint */
		border-right: 3px solid #f093fb;
	}

	.project-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.project-info strong {
		font-size: 1rem;
		color: #1f2937;
	}
	.project-info .date {
		font-size: 0.8rem;
		color: #9ca3af;
	}

	.tasks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	/* Compact Cards */
	.task-card.compact {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 1.25rem;
		transition: all 0.2s;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
	}

	.task-card.compact:hover {
		border-color: #f093fb;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(240, 147, 251, 0.1);
	}

	.task-card.compact .task-header {
		margin-bottom: 1rem;
	}

	.task-card.delayed-card {
		border-left: 4px solid #dc3545;
	}

	.meta-row {
		display: flex;
		gap: 1rem;
		color: #6b7280;
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
	}

	.progress-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 0.75rem;
		font-size: 0.9rem;
		font-weight: bold;
		color: #374151;
	}

	.ai-suggestion.compact {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background: #fdf2f8;
		border-radius: 8px;
		font-size: 0.85rem;
		color: #db2777;
		border: none;
		border-left: 3px solid #f093fb;
	}

	.bottleneck.compact {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background: #fef2f2;
		border-radius: 8px;
		font-size: 0.85rem;
		color: #991b1b;
		border: none;
		border-left: 3px solid #dc3545;
	}

	/* Project Details Panel */
	.project-details-panel {
		padding: 2rem;
		background: #fafafa;
		overflow-y: auto;
	}

	.panel-card {
		background: white;
		border-radius: 16px;
		padding: 2rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
		border: 1px solid #e5e7eb;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		border-bottom: 1px solid #f3f4f6;
		padding-bottom: 1rem;
	}

	.panel-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: #111827;
	}

	.stats-grid-mini {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat-box {
		text-align: center;
		padding: 1rem;
		background: #f9fafb;
		border-radius: 12px;
	}
	.stat-box label {
		display: block;
		font-size: 0.8rem;
		color: #6b7280;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
	}
	.stat-box .value {
		font-size: 1.5rem;
		font-weight: 800;
		color: #1f2937;
	}

	.risk-bars {
		display: flex;
		height: 16px;
		border-radius: 8px;
		overflow: hidden;
		margin: 10px 0;
		width: 100%;
	}
	.risk-bar.high {
		background: #dc3545;
	}
	.risk-bar.medium {
		background: #f59e0b;
	}
	.risk-bar.low {
		background: #10b981;
	}

	.risk-legend {
		display: flex;
		gap: 1rem;
		justify-content: center;
		font-size: 0.9rem;
		color: #6b7280;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: inline-block;
		margin-right: 4px;
	}
	.dot.high {
		background: #dc3545;
	}
	.dot.medium {
		background: #f59e0b;
	}
	.dot.low {
		background: #10b981;
	}

	.empty-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #9ca3af;
		gap: 1rem;
		min-height: 400px;
	}
	.empty-panel i {
		font-size: 3rem;
		opacity: 0.5;
	}

	.empty-state-compact {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		color: #9ca3af;
		gap: 1rem;
	}
	.empty-state-compact i {
		font-size: 2.5rem;
		opacity: 0.5;
	}

	/* Text Utilities */
	.text-danger {
		color: #dc3545;
	}
	.text-success {
		color: #10b981;
	}

	/* Responsive */
	@media (max-width: 960px) {
		.projects-layout {
			grid-template-columns: 1fr;
			display: flex;
			flex-direction: column;
		}
		.projects-list-scroll {
			max-height: 300px;
			border-right: none;
			border-bottom: 1px solid #e5e7eb;
		}
		.project-details-panel {
			padding: 1rem;
			background: white;
		}

		.task-table th:nth-child(4), /* Predicted */
        .task-table td:nth-child(4),
        .task-table th:nth-child(6), /* AI */
        .task-table td:nth-child(6) {
			display: none;
		}
	}

	@media (max-width: 640px) {
		.table-container {
			display: none;
		}

		.tabs-nav {
			padding-bottom: 8px;
		}

		.content-section {
			padding: 1rem;
		}

		.section-header-compact {
			flex-direction: column;
			align-items: stretch;
			gap: 0.75rem;
		}

		.risk-filter {
			overflow-x: auto;
		}

		.view-toggle {
			align-self: flex-end;
		}

		.panel-card {
			padding: 1.5rem;
		}

		.stats-grid-mini {
			grid-template-columns: 1fr;
		}
	}
</style>
