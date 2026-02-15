<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';

	let projects: any[] = [];
	let selectedProjectId: number | null = null;
	let selectedProject: any = null;

	// Health Score data
	let healthScore: any = null;
	let healthHistory: any[] = [];

	// Burndown data
	let burndownData: any[] = [];

	// Critical Path data
	let criticalPathData: any[] = [];

	let isLoading = false;
	let isCalculating = false;
	let error = '';
	let activeTab: 'health' | 'burndown' | 'critical' = 'health';

	// ローディング状態とメッセージ
	$: showLoading = isLoading || isCalculating;
	$: loadingMessage = isCalculating
		? 'クリティカルパスを分析中...'
		: isLoading
			? 'データを読み込んでいます...'
			: '処理中...';

	/**
	 * 安全にJSON文字列をパースする
	 * エラー時は簡易修復を試みる
	 */
	function safeJsonParse(value: any, defaultValue: any = null): any {
		// すでにオブジェクトの場合はそのまま返す
		if (typeof value !== 'string') {
			return value || defaultValue;
		}

		try {
			return JSON.parse(value);
		} catch (error) {
			console.warn('JSON解析エラー:', error);

			// 簡易修復を試みる
			try {
				let fixed = value.trim();

				// Markdownコードブロックを除去
				if (fixed.startsWith('```json')) {
					fixed = fixed.replace(/^```json\s*/, '').replace(/\s*```$/, '');
				} else if (fixed.startsWith('```')) {
					fixed = fixed.replace(/^```\s*/, '').replace(/\s*```$/, '');
				}

				// 開始・終了のクォート不足を修復
				if (!fixed.startsWith('{') && !fixed.startsWith('[')) {
					// JSONではない可能性があるため、デフォルト値を返す
					console.error('JSON形式ではない文字列:', fixed.substring(0, 100));
					return defaultValue;
				}

				// 末尾の余分なカンマを削除
				fixed = fixed.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

				// 再度パースを試みる
				return JSON.parse(fixed);
			} catch (repairError) {
				console.error('JSON修復失敗:', repairError);
				console.error('元の値:', value.substring(0, 200));
				return defaultValue;
			}
		}
	}

	onMount(async () => {
		await loadProjects();
	});

	async function loadProjects() {
		try {
			const res = await apiClient.fetchProjects();
			projects = res.data.filter((p: any) => p.status !== 'completed');
		} catch (err: any) {
			error = err.message || 'プロジェクトの取得に失敗しました';
			console.error('Error fetching projects:', err);
		}
	}

	async function selectProject(projectId: number) {
		selectedProjectId = projectId;
		selectedProject = projects.find((p) => p.id === projectId);
		error = '';

		await Promise.all([loadHealthScore(), loadBurndown(), loadCriticalPath()]);
	}

	async function loadHealthScore() {
		if (!selectedProjectId) return;

		isLoading = true;
		try {
			const [latestRes, historyRes] = await Promise.all([
				apiClient.fetchLatestHealthScore(selectedProjectId),
				apiClient.fetchHealthScoreHistory(selectedProjectId, 30)
			]);

			healthScore = latestRes.data;
			healthHistory = historyRes.data;
		} catch (err: any) {
			console.error('Error fetching health score:', err);
		} finally {
			isLoading = false;
		}
	}

	async function calculateHealthScore() {
		if (!selectedProjectId) return;

		isCalculating = true;
		error = '';

		try {
			const res = await apiClient.calculateProjectHealthScore(selectedProjectId);
			healthScore = res.data;
			await loadHealthScore(); // Reload history
		} catch (err: any) {
			error = err.message || '健全性スコアの計算に失敗しました';
			console.error('Error calculating health score:', err);
		} finally {
			isCalculating = false;
		}
	}

	async function loadBurndown() {
		if (!selectedProjectId) return;

		try {
			const res = await apiClient.fetchProjectBurndown(selectedProjectId, 30);
			burndownData = res.data;
		} catch (err: any) {
			console.error('Error fetching burndown:', err);
		}
	}

	async function recordBurndown() {
		if (!selectedProjectId) return;

		try {
			await apiClient.recordProjectBurndown(selectedProjectId);
			await loadBurndown();
		} catch (err: any) {
			error = err.message || 'バーンダウンの記録に失敗しました';
			console.error('Error recording burndown:', err);
		}
	}

	async function loadCriticalPath() {
		if (!selectedProjectId) return;

		try {
			const res = await apiClient.fetchProjectCriticalPath(selectedProjectId);
			criticalPathData = res.data;
		} catch (err: any) {
			console.error('Error fetching critical path:', err);
		}
	}

	async function analyzeCriticalPath() {
		if (!selectedProjectId) return;

		isCalculating = true;
		try {
			const res = await apiClient.analyzeProjectCriticalPath(selectedProjectId);
			// APIレスポンスは配列または { criticalTasks: [] } の両方に対応
			const data = res.data;
			criticalPathData = Array.isArray(data) ? data : data?.criticalTasks || [];
		} catch (err: any) {
			error = err.message || 'クリティカルパスの分析に失敗しました';
			console.error('Error analyzing critical path:', err);
		} finally {
			isCalculating = false;
		}
	}

	function getHealthColor(score: number): string {
		if (score >= 80) return '#22c55e';
		if (score >= 60) return '#eab308';
		if (score >= 40) return '#f97316';
		return '#ef4444';
	}

	function getScoreLabel(score: number): string {
		if (score >= 80) return '良好';
		if (score >= 60) return '注意';
		if (score >= 40) return '警告';
		return '危険';
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-heart-pulse-fill"></i>
				プロジェクト健全性
			</h1>
			<p>健全性指標と分析</p>
		</div>
	</header>
</div>

<div class="page-container">
	<!-- Project Selection -->
	<div class="project-selector">
		<label for="project-select">
			<i class="bi bi-folder2-open"></i>
			プロジェクトを選択
		</label>
		<div class="select-wrapper">
				<select
					id="project-select"
					bind:value={selectedProjectId}
					on:change={(e) => selectProject(Number((e.currentTarget as HTMLSelectElement).value))}
				>
				<option value="">-- プロジェクトを選択してください --</option>
				{#each projects as project}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>
			<i class="bi bi-chevron-down"></i>
		</div>
	</div>

	{#if error}
		<div class="error-message">
			<i class="bi bi-exclamation-triangle-fill"></i>
			<span>{error}</span>
		</div>
	{/if}

	{#if selectedProject}
		<!-- Tabs -->
		<div class="tabs">
			<button class:active={activeTab === 'health'} on:click={() => (activeTab = 'health')}>
				<i class="bi bi-heart-pulse"></i>
				健全性スコア
			</button>
			<button class:active={activeTab === 'burndown'} on:click={() => (activeTab = 'burndown')}>
				<i class="bi bi-graph-down-arrow"></i>
				バーンダウン
			</button>
			<button class:active={activeTab === 'critical'} on:click={() => (activeTab = 'critical')}>
				<i class="bi bi-exclamation-diamond"></i>
				クリティカルパス
			</button>
		</div>

		<!-- Health Score Tab -->
		{#if activeTab === 'health'}
			<div class="tab-content">
				<div class="action-bar">
					<button class="btn-primary" on:click={calculateHealthScore} disabled={isCalculating}>
						<i class="bi bi-{isCalculating ? 'hourglass-split' : 'calculator'}"></i>
						{isCalculating ? '計算中...' : '健全性スコアを計算'}
					</button>
				</div>

				{#if healthScore}
					<div class="health-overview">
						<div
							class="health-score-card"
							style="--score-color: {getHealthColor(healthScore.healthScore || 0)}"
						>
							<div class="score-ring">
								<svg viewBox="0 0 200 200">
									<defs>
										<linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
											<stop
												offset="0%"
												style="stop-color:{getHealthColor(
													healthScore.healthScore || 0
												)};stop-opacity:1"
											/>
											<stop
												offset="100%"
												style="stop-color:{getHealthColor(
													healthScore.healthScore || 0
												)};stop-opacity:0.6"
											/>
										</linearGradient>
									</defs>
									<circle class="score-ring-bg" cx="100" cy="100" r="85" />
									<circle
										class="score-ring-fill"
										cx="100"
										cy="100"
										r="85"
										stroke-dasharray="{(healthScore.healthScore || 0) * 5.34} {534 -
											(healthScore.healthScore || 0) * 5.34}"
									/>
								</svg>
								<div class="score-center">
									<div class="score-value">{healthScore.healthScore || 0}</div>
									<div class="score-label">{getScoreLabel(healthScore.healthScore || 0)}</div>
								</div>
							</div>
						</div>

						<div class="component-scores">
							<div class="score-card">
								<div class="score-card-header">
									<i class="bi bi-graph-up"></i>
									<span>進捗達成度</span>
								</div>
								<div class="progress-bar">
									<div class="progress-fill" style="width: {healthScore.progressScore || 0}%"></div>
								</div>
								<div class="score-value-text">{healthScore.progressScore || 0}%</div>
							</div>

							<div class="score-card">
								<div class="score-card-header">
									<i class="bi bi-clock"></i>
									<span>期限順守度</span>
								</div>
								<div class="progress-bar">
									<div class="progress-fill" style="width: {healthScore.deadlineScore || 0}%"></div>
								</div>
								<div class="score-value-text">{healthScore.deadlineScore || 0}%</div>
							</div>

							<div class="score-card">
								<div class="score-card-header">
									<i class="bi bi-emoji-smile"></i>
									<span>チーム士気</span>
								</div>
								<div class="progress-bar">
									<div
										class="progress-fill"
										style="width: {healthScore.teamMoraleScore || 0}%"
									></div>
								</div>
								<div class="score-value-text">{healthScore.teamMoraleScore || 0}%</div>
							</div>

							<div class="score-card">
								<div class="score-card-header">
									<i class="bi bi-shield-exclamation"></i>
									<span>ブロッカー影響</span>
								</div>
								<div class="progress-bar">
									<div class="progress-fill" style="width: {healthScore.blockerScore || 0}%"></div>
								</div>
								<div class="score-value-text">{healthScore.blockerScore || 0}%</div>
							</div>

							<div class="score-card">
								<div class="score-card-header">
									<i class="bi bi-speedometer2"></i>
									<span>作業速度</span>
								</div>
								<div class="progress-bar">
									<div class="progress-fill" style="width: {healthScore.velocityScore || 0}%"></div>
								</div>
								<div class="score-value-text">{healthScore.velocityScore || 0}%</div>
							</div>
						</div>

						{#if healthScore.aiAnalysis || healthScore.riskFactors || healthScore.recommendations}
								{@const riskFactorsList =
									typeof healthScore.riskFactors === 'string' && healthScore.riskFactors
										? healthScore.riskFactors.split(', ').filter((r: string) => r.trim())
										: []}
								{@const recommendationsList =
									typeof healthScore.recommendations === 'string' && healthScore.recommendations
										? healthScore.recommendations.split(', ').filter((r: string) => r.trim())
										: []}
							<div class="ai-insights">
								<div class="insights-header">
									<i class="bi bi-robot"></i>
									<h3>AI分析結果</h3>
								</div>
								{#if healthScore.aiAnalysis}
									<div class="assessment">
										<i class="bi bi-lightbulb"></i>
										<p>{healthScore.aiAnalysis}</p>
									</div>
								{/if}

								{#if riskFactorsList.length > 0}
									<div class="risk-factors">
										<h4><i class="bi bi-exclamation-triangle"></i> リスク要因</h4>
										<ul>
											{#each riskFactorsList as risk}
												<li><i class="bi bi-dot"></i>{risk}</li>
											{/each}
										</ul>
									</div>
								{/if}

								{#if recommendationsList.length > 0}
									<div class="recommendations">
										<h4><i class="bi bi-check2-circle"></i> 改善提案</h4>
										<ul>
											{#each recommendationsList as rec}
												<li><i class="bi bi-arrow-right-short"></i>{rec}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else if !isLoading}
					<div class="empty-state">
						<div class="empty-icon">
							<i class="bi bi-calculator"></i>
						</div>
						<h3>健全性スコアを計算しましょう</h3>
						<p>
							上部の「健全性スコアを計算」ボタンをクリックして、プロジェクトの健全性を評価してください
						</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Burndown Tab -->
		{#if activeTab === 'burndown'}
			<div class="tab-content">
				<div class="action-bar">
					<button class="btn-primary" on:click={recordBurndown}>
						<i class="bi bi-plus-circle"></i>
						本日のバーンダウンを記録
					</button>
				</div>

				{#if burndownData.length > 0}
					<div class="burndown-chart">
						<div class="chart-header">
							<i class="bi bi-graph-down"></i>
							<h3>バーンダウンチャート（過去30日）</h3>
						</div>
						<div class="chart-stats">
							<div class="stat-card">
								<i class="bi bi-calendar3"></i>
								<div>
									<div class="stat-label">データ件数</div>
									<div class="stat-value">{burndownData.length}日</div>
								</div>
							</div>
							<div class="stat-card">
								<i class="bi bi-list-task"></i>
								<div>
									<div class="stat-label">残タスク</div>
									<div class="stat-value">
										{burndownData[burndownData.length - 1]?.actualRemainingTasks || 0}
									</div>
								</div>
							</div>
							<div class="stat-card">
								<i class="bi bi-clock-history"></i>
								<div>
									<div class="stat-label">残工数</div>
									<div class="stat-value">
										{burndownData[burndownData.length - 1]?.actualRemainingHours || 0}h
									</div>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<div class="empty-state">
						<div class="empty-icon">
							<i class="bi bi-graph-down-arrow"></i>
						</div>
						<h3>バーンダウンを記録しましょう</h3>
						<p>
							上部の「本日のバーンダウンを記録」をクリックして、プロジェクトの進捗を追跡してください
						</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Critical Path Tab -->
		{#if activeTab === 'critical'}
			<div class="tab-content">
				<div class="action-bar">
					<button class="btn-primary" on:click={analyzeCriticalPath} disabled={isCalculating}>
						<i class="bi bi-{isCalculating ? 'hourglass-split' : 'search'}"></i>
						{isCalculating ? '分析中...' : 'クリティカルパスを分析'}
					</button>
				</div>

				{#if criticalPathData.length > 0}
					<div class="critical-path-list">
						<div class="list-header">
							<i class="bi bi-diagram-3"></i>
							<h3>クリティカルパス上のタスク</h3>
						</div>
						<div class="table-container">
							<table>
								<thead>
									<tr>
										<th><i class="bi bi-file-text"></i> タスク名</th>
										<th><i class="bi bi-person"></i> 担当者</th>
										<th><i class="bi bi-percent"></i> 進捗</th>
										<th><i class="bi bi-flag"></i> ステータス</th>
										<th><i class="bi bi-calendar-event"></i> スラック(日)</th>
										<th><i class="bi bi-link"></i> ブロック数</th>
									</tr>
								</thead>
								<tbody>
									{#each criticalPathData.filter((t) => t.isCritical || t.is_critical) as task}
										<tr class="critical-task">
											<td class="task-name">{task.taskName || task.name}</td>
											<td>{task.assignedTo || '未割当'}</td>
											<td>
												<div class="progress-mini">
													<div
														class="progress-mini-fill"
														style="width: {task.progress || 0}%"
													></div>
												</div>
												<span>{task.progress || 0}%</span>
											</td>
											<td
												><span class="badge critical"
													><i class="bi bi-exclamation-circle"></i> クリティカル</span
												></td
											>
											<td>{task.slackDays || task.slack_days || 0}</td>
											<td
												><span class="block-count"
													>{task.blockingTaskCount || task.blocking_task_count || 0}</span
												></td
											>
										</tr>
									{/each}

									{#each criticalPathData.filter((t) => !t.isCritical && !t.is_critical) as task}
										<tr>
											<td class="task-name">{task.taskName || task.name}</td>
											<td>{task.assignedTo || '未割当'}</td>
											<td>
												<div class="progress-mini">
													<div
														class="progress-mini-fill"
														style="width: {task.progress || 0}%"
													></div>
												</div>
												<span>{task.progress || 0}%</span>
											</td>
											<td
												><span class="badge normal"><i class="bi bi-check-circle"></i> 通常</span
												></td
											>
											<td>{task.slackDays || task.slack_days || 0}</td>
											<td
												><span class="block-count"
													>{task.blockingTaskCount || task.blocking_task_count || 0}</span
												></td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{:else if !isCalculating}
					<div class="empty-state">
						<div class="empty-icon">
							<i class="bi bi-diagram-3"></i>
						</div>
						<h3>クリティカルパスを分析しましょう</h3>
						<p>
							上部の「クリティカルパスを分析」をクリックして、ボトルネックとなるタスクを特定してください
						</p>
					</div>
				{/if}
			</div>
		{/if}
	{:else}
		<div class="empty-state main">
			<div class="empty-icon">
				<i class="bi bi-folder2-open"></i>
			</div>
			<h3>プロジェクトを選択してください</h3>
			<p>上部のドロップダウンからプロジェクトを選択して、健全性ダッシュボードを表示します</p>
		</div>
	{/if}

	<!-- ローディングオーバーレイ -->
	<LoadingOverlay show={showLoading} message={loadingMessage} />
</div>

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.page-container {
		padding: 24px;
		max-width: 1400px;
		margin: 0 auto;
		animation: fadeIn 0.5s ease;
		display: flex;
		flex-direction: column;
		height: 100%; /* Ensure layout consistency */
		box-sizing: border-box;
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

		.page-container {
			padding: 16px;
		}
	}

	.project-selector {
		margin-bottom: 2rem;
		background: white;
		padding: 1.5rem;
		border-radius: 15px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.project-selector label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: #374151;
		white-space: nowrap;
	}

	.project-selector label i {
		font-size: 1.2rem;
		color: #667eea;
	}

	.select-wrapper {
		position: relative;
		flex: 1;
		max-width: 500px;
	}

	.select-wrapper select {
		width: 100%;
		padding: 0.75rem 2.5rem 0.75rem 1rem;
		font-size: 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 10px;
		background: white;
		cursor: pointer;
		transition: all 0.2s;
		appearance: none;
	}

	.select-wrapper select:hover {
		border-color: #667eea;
	}

	.select-wrapper select:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.select-wrapper i {
		position: absolute;
		right: 1rem;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
		color: #6b7280;
	}

	.tabs {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.tabs button {
		padding: 0.875rem 1.5rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		cursor: pointer;
		font-size: 1rem;
		color: #6b7280;
		font-weight: 600;
		transition: all 0.3s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tabs button i {
		font-size: 1.2rem;
	}

	.tabs button:hover {
		border-color: #667eea;
		color: #667eea;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
	}

	.tabs button.active {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border-color: transparent;
		box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
	}

	.tab-content {
		background: white;
		padding: 2rem;
		border-radius: 20px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
		animation: slideIn 0.3s ease;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.action-bar {
		margin-bottom: 2rem;
	}

	.btn-primary {
		padding: 0.875rem 1.75rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		transition: all 0.3s;
		box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
	}

	.btn-primary:disabled {
		background: #9ca3af;
		cursor: not-allowed;
		opacity: 0.6;
	}

	.btn-primary i {
		font-size: 1.2rem;
	}

	.health-overview {
		display: grid;
		gap: 2rem;
	}

	.health-score-card {
		text-align: center;
		padding: 3rem;
		border-radius: 20px;
		background: radial-gradient(circle at top right, rgba(102, 126, 234, 0.05), white 70%);
		border: 3px solid var(--score-color, #667eea);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
	}

	.score-ring {
		position: relative;
		width: 200px;
		height: 200px;
		margin: 0 auto;
	}

	.score-ring svg {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.score-ring-bg {
		fill: none;
		stroke: #e5e7eb;
		stroke-width: 12;
	}

	.score-ring-fill {
		fill: none;
		stroke: url(#scoreGradient);
		stroke-width: 12;
		stroke-linecap: round;
		transition: stroke-dasharray 1s ease;
	}

	.score-center {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
	}

	.score-center .score-value {
		font-size: 3.5rem;
		font-weight: 800;
		color: var(--score-color, #667eea);
		line-height: 1;
		margin-bottom: 0.5rem;
	}

	.score-center .score-label {
		font-size: 1.1rem;
		color: #6b7280;
		font-weight: 600;
	}

	.component-scores {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	.score-card {
		background: white;
		padding: 1.5rem;
		border-radius: 15px;
		border: 2px solid #e5e7eb;
		transition: all 0.3s;
	}

	.score-card:hover {
		border-color: #667eea;
		box-shadow: 0 8px 20px rgba(102, 126, 234, 0.15);
		transform: translateY(-3px);
	}

	.score-card-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		font-weight: 600;
		color: #374151;
	}

	.score-card-header i {
		font-size: 1.5rem;
		color: #667eea;
	}

	.progress-bar {
		height: 12px;
		background: #e5e7eb;
		border-radius: 999px;
		overflow: hidden;
		margin-bottom: 0.75rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #667eea, #764ba2);
		transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
		border-radius: 999px;
	}

	.score-value-text {
		font-size: 1.5rem;
		font-weight: 700;
		color: #667eea;
		text-align: right;
	}

	.ai-insights {
		margin-top: 2rem;
		padding: 2rem;
		background: linear-gradient(
			135deg,
			rgba(102, 126, 234, 0.05) 0%,
			rgba(118, 75, 162, 0.05) 100%
		);
		border-radius: 15px;
		border: 2px solid rgba(102, 126, 234, 0.2);
	}

	.insights-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.insights-header i {
		font-size: 1.8rem;
		color: #667eea;
	}

	.insights-header h3 {
		margin: 0;
		color: #374151;
		font-size: 1.5rem;
	}

	.assessment {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1.5rem;
		background: white;
		border-radius: 12px;
		margin-bottom: 1.5rem;
		border-left: 4px solid #667eea;
	}

	.assessment i {
		font-size: 1.5rem;
		color: #667eea;
		flex-shrink: 0;
		margin-top: 0.2rem;
	}

	.assessment p {
		margin: 0;
		color: #374151;
		line-height: 1.7;
	}

	.risk-factors,
	.recommendations {
		background: white;
		padding: 1.5rem;
		border-radius: 12px;
		margin-bottom: 1rem;
	}

	.risk-factors h4,
	.recommendations h4 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 1rem;
		color: #374151;
		font-size: 1.1rem;
	}

	.risk-factors h4 i {
		color: #ef4444;
	}

	.recommendations h4 i {
		color: #22c55e;
	}

	.ai-insights ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ai-insights li {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		color: #6b7280;
		line-height: 1.6;
	}

	.ai-insights li i {
		color: #667eea;
		flex-shrink: 0;
		margin-top: 0.3rem;
	}

	.burndown-chart,
	.critical-path-list {
		margin-top: 1rem;
	}

	.chart-header,
	.list-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.chart-header i,
	.list-header i {
		font-size: 1.8rem;
		color: #667eea;
	}

	.chart-header h3,
	.list-header h3 {
		margin: 0;
		color: #374151;
		font-size: 1.5rem;
	}

	.chart-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
	}

	.stat-card {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 1.5rem;
		border-radius: 15px;
		display: flex;
		align-items: center;
		gap: 1rem;
		color: white;
		box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
		transition: transform 0.3s;
	}

	.stat-card:hover {
		transform: translateY(-3px);
	}

	.stat-card i {
		font-size: 2rem;
		opacity: 0.9;
	}

	.stat-label {
		font-size: 0.875rem;
		opacity: 0.9;
		margin-bottom: 0.25rem;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
	}

	.table-container {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 1rem;
	}

	th,
	td {
		padding: 1rem 0.75rem;
		text-align: left;
		border-bottom: 2px solid #e5e7eb;
	}

	th {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
		font-weight: 700;
		color: #374151;
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	th i {
		margin-right: 0.5rem;
		color: #667eea;
	}

	tbody tr {
		transition: all 0.2s;
	}

	tbody tr:hover {
		background: rgba(102, 126, 234, 0.05);
	}

	.critical-task {
		background: rgba(239, 68, 68, 0.05);
	}

	.critical-task:hover {
		background: rgba(239, 68, 68, 0.1);
	}

	.task-name {
		font-weight: 600;
		color: #374151;
	}

	.progress-mini {
		display: inline-block;
		width: 60px;
		height: 8px;
		background: #e5e7eb;
		border-radius: 999px;
		margin-right: 0.5rem;
		overflow: hidden;
		vertical-align: middle;
	}

	.progress-mini-fill {
		height: 100%;
		background: linear-gradient(90deg, #667eea, #764ba2);
		border-radius: 999px;
	}

	.badge {
		padding: 0.375rem 0.875rem;
		border-radius: 999px;
		font-size: 0.875rem;
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	.badge.critical {
		background: linear-gradient(135deg, #fee2e2, #fecaca);
		color: #991b1b;
	}

	.badge.normal {
		background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
		color: #4338ca;
	}

	.block-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: #667eea;
		color: white;
		border-radius: 50%;
		font-weight: 700;
		font-size: 0.875rem;
	}

	.empty-state {
		padding: 4rem 2rem;
		text-align: center;
		animation: fadeIn 0.5s ease;
	}

	.empty-state.main {
		margin-top: 3rem;
	}

	.empty-icon {
		width: 100px;
		height: 100px;
		margin: 0 auto 1.5rem;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.empty-icon i {
		font-size: 3rem;
		color: #667eea;
	}

	.empty-state h3 {
		margin: 0 0 1rem;
		color: #374151;
		font-size: 1.5rem;
	}

	.empty-state p {
		margin: 0;
		color: #6b7280;
		max-width: 500px;
		margin: 0 auto;
		line-height: 1.7;
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

	@media (max-width: 768px) {
		.page-header {
			padding: 1.5rem;
		}

		.title-section {
			flex-direction: column;
			text-align: center;
		}

		.component-scores {
			grid-template-columns: 1fr;
		}

		.tabs {
			flex-direction: column;
		}

		.chart-stats {
			grid-template-columns: 1fr;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.project-health {
			padding: 12px;
		}

		.page-header {
			padding: 16px;
			border-radius: 16px;
			margin-bottom: 16px;
		}

		.icon-wrapper {
			width: 48px;
			height: 48px;
			font-size: 24px;
			border-radius: 12px;
		}

		.page-header h1 {
			font-size: 20px;
			margin: 0 0 4px;
		}

		.subtitle {
			font-size: 13px;
		}

		.refresh-btn {
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
			width: 100%;
		}

		.overview-section,
		.components-section,
		.details-section {
			padding: 16px;
			border-radius: 16px;
			margin-bottom: 16px;
		}

		.section-title {
			gap: 8px;
			margin-bottom: 12px;
		}

		.section-title i {
			font-size: 20px;
		}

		.section-title h2 {
			font-size: 18px;
		}

		.health-score-display {
			padding: 16px;
		}

		.score-circle {
			width: 140px;
			height: 140px;
		}

		.score-circle svg {
			width: 140px;
			height: 140px;
		}

		.score-circle text {
			font-size: 32px;
		}

		.score-info h3 {
			font-size: 20px;
		}

		.score-info p {
			font-size: 13px;
		}

		.component-scores {
			gap: 12px;
		}

		.component-card {
			padding: 14px;
			border-radius: 12px;
		}

		.component-header h4 {
			font-size: 15px;
		}

		.tabs {
			gap: 8px;
			padding: 0;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
		}

		.tab {
			padding: 10px 16px;
			font-size: 13px;
			min-height: 44px;
			flex-shrink: 0;
		}

		.tab-content {
			padding: 16px;
		}

		.detail-card {
			padding: 14px;
			border-radius: 12px;
		}

		.detail-header h4 {
			font-size: 16px;
		}

		.chart-stats {
			gap: 12px;
		}

		.stat-item {
			padding: 12px;
			font-size: 13px;
		}

		.stat-value {
			font-size: 20px;
		}

		.badge {
			padding: 6px 10px;
			font-size: 11px;
		}

		.block-count {
			width: 28px;
			height: 28px;
			font-size: 12px;
		}

		.empty-state {
			padding: 40px 16px;
		}

		.empty-icon {
			width: 80px;
			height: 80px;
			margin-bottom: 12px;
		}

		.empty-icon i {
			font-size: 36px;
		}

		.empty-state h3 {
			font-size: 18px;
			margin-bottom: 8px;
		}

		.empty-state p {
			font-size: 14px;
		}
	}
</style>
