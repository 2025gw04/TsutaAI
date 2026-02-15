<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { apiClient } from '$lib/api/client';

	let userId: number;
	let isLoading = true;
	let growthReport: any = null;
	let skillHistory: any[] = [];
	let performanceMetrics: any[] = [];
	let contributions: any[] = [];
	let goals: any[] = [];
	let message = '';
	let selectedMonths = 6;

	$: userId = Number($page.params.id);

	onMount(async () => {
		await loadGrowthData();
	});

	async function loadGrowthData() {
		try {
			isLoading = true;
			message = '';

			// 成長レポートを取得
			const reportResponse = await apiClient.fetchGrowthReport(userId, {
				months: selectedMonths,
				includeGoals: true,
				includeContributions: true
			});
			growthReport = reportResponse.data;

			// スキル成長履歴を取得
			const skillResponse = await apiClient.fetchSkillGrowthHistory(userId, {
				months: selectedMonths
			});
			skillHistory = skillResponse.data;

			// パフォーマンスメトリクスを取得
			const metricsResponse = await apiClient.fetchPerformanceMetrics(userId, selectedMonths);
			performanceMetrics = metricsResponse.data;

			// 貢献記録を取得
			const endDate = new Date().toISOString().split('T')[0];
			const startDate = new Date(Date.now() - selectedMonths * 30 * 24 * 60 * 60 * 1000)
				.toISOString()
				.split('T')[0];
			const contributionsResponse = await apiClient.fetchContributions(userId, {
				startDate,
				endDate
			});
			contributions = contributionsResponse.data;

			// 成長目標を取得
			const goalsResponse = await apiClient.fetchGrowthGoals(userId);
			goals = goalsResponse.data;
		} catch (error) {
			message = error instanceof Error ? error.message : '成長データの取得に失敗しました。';
			console.error('Error loading growth data:', error);
		} finally {
			isLoading = false;
		}
	}

	function formatDate(dateStr: string) {
		if (!dateStr) return '未設定';
		return new Date(dateStr).toLocaleDateString('ja-JP');
	}

	function getContributionTypeLabel(type: string) {
		const labels: Record<string, string> = {
			task_completion: 'タスク完了',
			mentoring: 'メンタリング',
			documentation: 'ドキュメント作成',
			innovation: '改善・革新',
			other: 'その他'
		};
		return labels[type] || type;
	}

	function getImpactBadgeClass(impact: string) {
		if (impact === 'high') return 'badge-high';
		if (impact === 'medium') return 'badge-medium';
		return 'badge-low';
	}

	function getStatusBadgeClass(status: string) {
		if (status === 'completed') return 'badge-success';
		if (status === 'active') return 'badge-primary';
		return 'badge-secondary';
	}

	function getStatusLabel(status: string) {
		const labels: Record<string, string> = {
			active: 'アクティブ',
			completed: '完了',
			cancelled: 'キャンセル'
		};
		return labels[status] || status;
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<a href="/members" class="back-btn-mobile">
				<i class="bi bi-arrow-left"></i>
			</a>
			<div>
				<h1>
					<i class="bi bi-graph-up"></i>
					成長レポート
				</h1>
				<p>スキル成長と貢献状況</p>
			</div>
		</div>
	</header>
</div>

<section class="growth-page">
	<div class="page-actions">
		<label class="period-selector">
			期間:
			<select bind:value={selectedMonths} on:change={loadGrowthData}>
				<option value={3}>過去3ヶ月</option>
				<option value={6}>過去6ヶ月</option>
				<option value={12}>過去12ヶ月</option>
			</select>
		</label>
		<a href="/members" class="btn ghost desktop-back-btn">
			<i class="bi bi-arrow-left"></i>メンバー一覧に戻る
		</a>
	</div>

	{#if message}
		<div class="flash error">{message}</div>
	{/if}

	{#if isLoading}
		<p class="state">読み込み中です…</p>
	{:else if growthReport}
		<div class="growth-content">
			<!-- 概要セクション -->
			<section class="card summary-card">
				<h2>概要</h2>
				<div class="summary-grid">
					<div class="summary-item">
						<span class="label">総スキル数</span>
						<strong class="value">{growthReport.summary?.totalSkills || 0}</strong>
					</div>
					<div class="summary-item">
						<span class="label">平均スキルレベル</span>
						<strong class="value">{growthReport.summary?.avgSkillLevel?.toFixed(1) || 0}</strong>
					</div>
					<div class="summary-item">
						<span class="label">成長したスキル</span>
						<strong class="value">{growthReport.summary?.improvedSkills || 0}</strong>
					</div>
					<div class="summary-item">
						<span class="label">アクティブな目標</span>
						<strong class="value">{goals.filter((g: any) => g.status === 'active').length}</strong>
					</div>
				</div>
			</section>

			<!-- スキル成長履歴 -->
			<section class="card">
				<h2>スキル成長履歴</h2>
				{#if skillHistory.length === 0}
					<p class="empty">スキル成長履歴がありません。</p>
				{:else}
					<div class="table-container">
						<table class="data-table">
							<thead>
								<tr>
									<th>記録日</th>
									<th>スキル名</th>
									<th>レベル</th>
									<th>変更理由</th>
									<th>備考</th>
								</tr>
							</thead>
							<tbody>
								{#each skillHistory as record}
									<tr>
										<td>{formatDate(record.recordedDate)}</td>
										<td><strong>{record.skillName}</strong></td>
										<td>
											<div class="level-indicator">
												<div class="level-bar">
													<div class="level-fill" style="width: {record.skillLevel * 10}%"></div>
												</div>
												<span>{record.skillLevel}/10</span>
											</div>
										</td>
										<td>{record.changeReason || '-'}</td>
										<td class="notes">{record.notes || '-'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>

			<!-- パフォーマンスメトリクス -->
			<section class="card">
				<h2>パフォーマンスメトリクス</h2>
				{#if performanceMetrics.length === 0}
					<p class="empty">パフォーマンスメトリクスがありません。</p>
				{:else}
					<div class="table-container">
						<table class="data-table">
							<thead>
								<tr>
									<th>月</th>
									<th>タスク完了率</th>
									<th>バグ率</th>
									<th>ヘルプ回数</th>
									<th>平均集中度</th>
									<th>完了タスク数</th>
								</tr>
							</thead>
							<tbody>
								{#each performanceMetrics as metric}
									<tr>
										<td><strong>{metric.metricDate}</strong></td>
										<td>{metric.taskCompletionRate?.toFixed(1) || 0}%</td>
										<td>{metric.bugRate?.toFixed(1) || 0}%</td>
										<td>{metric.helpCount || 0}回</td>
										<td>{metric.focusLevelAvg?.toFixed(1) || 0}</td>
										<td>{metric.tasksCompleted || 0}件</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>

			<!-- 貢献記録 -->
			<section class="card">
				<h2>主な貢献</h2>
				{#if contributions.length === 0}
					<p class="empty">貢献記録がありません。</p>
				{:else}
					<div class="contributions-list">
						{#each contributions as contribution}
							<div class="contribution-item">
								<div class="contribution-header">
									<div>
										<h3>{contribution.title}</h3>
										<div class="contribution-meta">
											<span class="date">{formatDate(contribution.contributionDate)}</span>
											<span class="type-badge"
												>{getContributionTypeLabel(contribution.contributionType)}</span
											>
											<span class={`impact-badge ${getImpactBadgeClass(contribution.impactLevel)}`}>
												{contribution.impactLevel}
											</span>
										</div>
									</div>
								</div>
								{#if contribution.description}
									<p class="contribution-desc">{contribution.description}</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<!-- 成長目標 -->
			<section class="card">
				<h2>成長目標</h2>
				{#if goals.length === 0}
					<p class="empty">成長目標が設定されていません。</p>
				{:else}
					<div class="goals-list">
						{#each goals as goal}
							<div class="goal-item">
								<div class="goal-header">
									<h3>{goal.goalTitle}</h3>
									<span class={`status-badge ${getStatusBadgeClass(goal.status)}`}>
										{getStatusLabel(goal.status)}
									</span>
								</div>
								{#if goal.goalDescription}
									<p class="goal-desc">{goal.goalDescription}</p>
								{/if}
								<div class="goal-details">
									{#if goal.targetSkill}
										<span class="detail-item">
											<i class="bi bi-trophy"></i>
											目標スキル: {goal.targetSkill} (Lv.{goal.targetLevel || '?'})
										</span>
									{/if}
									{#if goal.estimatedDurationWeeks}
										<span class="detail-item">
											<i class="bi bi-calendar"></i>
											推定期間: {goal.estimatedDurationWeeks}週間
										</span>
									{/if}
								</div>
								{#if goal.status === 'active'}
									<div class="progress-bar">
										<div class="progress-fill" style="width: {goal.progress || 0}%"></div>
										<span class="progress-text">{goal.progress || 0}%</span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>
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

	.growth-page {
		/* Use standard page layout */
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #f9fafb;
		flex: 1;
		overflow-x: hidden;
		padding: 24px;
		box-sizing: border-box;
		max-width: 1400px;
		margin: 0 auto;
		width: 100%;
	}

	.page-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 24px;
		background: #ffffff;
		padding: 16px 24px;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
	}

	.period-selector {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 14px;
		color: #374151;
	}

	.period-selector select {
		padding: 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 14px;
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
			align-items: center;
			gap: 16px;
			height: 100%;
		}

		.header-content div {
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

		.growth-page {
			padding: 16px;
		}

		.page-actions {
			flex-direction: column;
			gap: 16px;
			align-items: flex-start;
			padding: 16px;
		}

		.desktop-back-btn {
			display: none; /* Hide desktop back button, use header back button */
		}
	}

	.back-btn-mobile {
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
		text-decoration: none;
	}

	.back-btn-mobile:hover {
		background: rgba(255, 255, 255, 0.2);
		color: #ffffff;
	}

	.flash {
		padding: 1rem;
		margin-bottom: 1rem;
		background: #fee;
		border: 1px solid #fcc;
		border-radius: 4px;
		color: #c33;
	}

	.state {
		text-align: center;
		padding: 3rem;
		color: #999;
	}

	.growth-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.card {
		background: white;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 1.5rem;
	}

	.card h2 {
		margin: 0 0 1rem 0;
		font-size: 1.25rem;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.summary-item .label {
		font-size: 0.875rem;
		color: #666;
	}

	.summary-item .value {
		font-size: 2rem;
		color: #333;
	}

	.table-container {
		overflow-x: auto;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
	}

	.data-table th {
		text-align: left;
		padding: 0.75rem;
		background: #f8f9fa;
		border-bottom: 2px solid #dee2e6;
		font-weight: 600;
	}

	.data-table td {
		padding: 0.75rem;
		border-bottom: 1px solid #dee2e6;
	}

	.data-table td.notes {
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.level-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.level-bar {
		flex: 1;
		height: 8px;
		background: #e9ecef;
		border-radius: 4px;
		overflow: hidden;
	}

	.level-fill {
		height: 100%;
		background: linear-gradient(to right, #4caf50, #8bc34a);
		transition: width 0.3s;
	}

	.contributions-list,
	.goals-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.contribution-item,
	.goal-item {
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 6px;
		border-left: 4px solid #007bff;
	}

	.contribution-header,
	.goal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.contribution-header h3,
	.goal-header h3 {
		margin: 0;
		font-size: 1.1rem;
	}

	.contribution-meta {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.contribution-meta .date {
		color: #666;
		font-size: 0.875rem;
	}

	.type-badge,
	.impact-badge,
	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.type-badge {
		background: #e3f2fd;
		color: #1976d2;
	}

	.impact-badge.badge-high {
		background: #ffebee;
		color: #c62828;
	}

	.impact-badge.badge-medium {
		background: #fff3e0;
		color: #ef6c00;
	}

	.impact-badge.badge-low {
		background: #e8f5e9;
		color: #2e7d32;
	}

	.status-badge.badge-success {
		background: #e8f5e9;
		color: #2e7d32;
	}

	.status-badge.badge-primary {
		background: #e3f2fd;
		color: #1976d2;
	}

	.status-badge.badge-secondary {
		background: #f5f5f5;
		color: #666;
	}

	.contribution-desc,
	.goal-desc {
		margin: 0.5rem 0 0 0;
		color: #666;
		font-size: 0.9rem;
	}

	.goal-details {
		display: flex;
		gap: 1rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.detail-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.875rem;
		color: #666;
	}

	.detail-item i {
		color: #999;
	}

	.progress-bar {
		position: relative;
		width: 100%;
		height: 24px;
		background: #e9ecef;
		border-radius: 4px;
		overflow: hidden;
		margin-top: 0.75rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(to right, #007bff, #0056b3);
		transition: width 0.3s;
	}

	.progress-text {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 0.75rem;
		font-weight: 600;
		color: #333;
	}

	.empty {
		text-align: center;
		padding: 2rem;
		color: #999;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: white;
		color: #333;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn:hover {
		background: #f8f9fa;
	}

	.btn.ghost {
		background: transparent;
	}
</style>
