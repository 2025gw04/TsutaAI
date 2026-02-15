<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';

	// チームサマリーデータ
	let teamSummary: any = null;
	let needSupportUsers: any[] = [];
	let isLoading = true;
	let error = '';

	// 選択されたユーザーの詳細
	let selectedUser: any = null;
	let selectedUserTrend: any = null;
	let selectedUserActivity: any = null;
	let aiAnalysis: any = null;
	let isAnalyzing = false;
	let analysisError = '';

	onMount(async () => {
		await loadDashboard();
	});

	async function loadDashboard() {
		isLoading = true;
		error = '';

		try {
			// チームサマリーを取得
			const summaryRes = await apiClient.fetchTeamMentalHealthSummary(7);
			teamSummary = summaryRes.data;

			// サポート必要ユーザーはteamSummaryに含まれている
			needSupportUsers = teamSummary.alerts?.needSupportUsers || [];
		} catch (err: any) {
			error = err.message || 'データの取得に失敗しました';
			console.error('Mental health dashboard error:', err);
		} finally {
			isLoading = false;
		}
	}

	async function selectUser(user: any) {
		selectedUser = user;
		selectedUserTrend = null;
		selectedUserActivity = null;
		aiAnalysis = null;
		analysisError = '';

		try {
			// ユーザーの詳細データを取得
			const [trendRes, activityRes] = await Promise.all([
				apiClient.analyzeMentalHealthTrend(user.userId, 4),
				apiClient.detectActivityAnomaly(user.userId)
			]);

			selectedUserTrend = trendRes.data;
			selectedUserActivity = activityRes.data;
		} catch (err: any) {
			console.error('Error fetching user details:', err);
		}
	}

	async function runAIAnalysis() {
		if (!selectedUser) return;

		isAnalyzing = true;
		analysisError = '';
		aiAnalysis = null;

		try {
			const result = await apiClient.analyzeDailyReportTrendsAI(selectedUser.userId);

			if (result.success) {
				aiAnalysis = result.analysis;
			} else {
				analysisError = result.error || 'AI分析に失敗しました';
			}
		} catch (err: any) {
			analysisError = err.message || 'AI分析中にエラーが発生しました';
			console.error('AI analysis error:', err);
		} finally {
			isAnalyzing = false;
		}
	}

	function getMoodEmoji(mood: number | null): string {
		if (!mood) return '❓';
		if (mood >= 4.5) return '😄';
		if (mood >= 3.5) return '🙂';
		if (mood >= 2.5) return '😐';
		if (mood >= 1.5) return '😟';
		return '😢';
	}

	function getStressColor(stress: number | null): string {
		if (!stress) return 'gray';
		if (stress >= 4) return 'red';
		if (stress >= 3) return 'orange';
		return 'green';
	}

	function getTrendEmoji(trend: string): string {
		if (trend === 'improving') return '📈 改善中';
		if (trend === 'worsening') return '📉 悪化';
		return '➡️ 安定';
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-heart-pulse"></i>
				メンタルヘルス
			</h1>
			<p>チームの健康状態</p>
		</div>
	</header>
</div>

<div class="mental-health-dashboard">
	<div class="page-actions">
		<button class="btn-primary" on:click={loadDashboard} disabled={isLoading}>
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
		<div class="loading">読み込み中...</div>
	{:else if teamSummary}
		<!-- チームサマリー -->
		<section class="summary-section">
			<h2>
				<i class="bi bi-people-fill"></i>
				チーム全体のメンタルヘルス（過去7日間）
			</h2>
			<div class="summary-grid">
				<div class="summary-card mood">
					<div class="card-icon">
						<i class="bi bi-emoji-smile"></i>
					</div>
					<div class="card-content">
						<div class="card-label">平均気分</div>
						<div class="card-value">
							{#if teamSummary.teamAverages?.mood}
								{getMoodEmoji(teamSummary.teamAverages.mood)}
								{teamSummary.teamAverages.mood.toFixed(1)} / 5
							{:else}
								<span style="color: #9ca3af;">データなし</span>
							{/if}
						</div>
					</div>
				</div>
				<div class="summary-card stress">
					<div class="card-icon">
						<i class="bi bi-activity"></i>
					</div>
					<div class="card-content">
						<div class="card-label">平均ストレスレベル</div>
						<div
							class="card-value"
							style="color: {teamSummary.teamAverages?.stress
								? getStressColor(teamSummary.teamAverages.stress)
								: '#9ca3af'}"
						>
							{#if teamSummary.teamAverages?.stress}
								{teamSummary.teamAverages.stress.toFixed(1)} / 5
							{:else}
								データなし
							{/if}
						</div>
					</div>
				</div>
				<div class="summary-card blockers">
					<div class="card-icon">
						<i class="bi bi-exclamation-octagon"></i>
					</div>
					<div class="card-content">
						<div class="card-label">ブロッカー報告</div>
						<div class="card-value">
							{teamSummary.alerts?.blockerCount || 0} 件
						</div>
					</div>
				</div>
				<div class="summary-card support">
					<div class="card-icon">
						<i class="bi bi-hand-thumbs-up"></i>
					</div>
					<div class="card-content">
						<div class="card-label">サポート希望</div>
						<div class="card-value">
							{teamSummary.alerts?.needSupportCount || 0} 件
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- サポートが必要なメンバー -->
		{#if needSupportUsers.length > 0}
			<section class="support-section">
				<h2>
					<i class="bi bi-person-heart"></i>
					サポートが必要なメンバー ({needSupportUsers.length}名)
				</h2>
				<div class="users-grid">
					{#each needSupportUsers as user}
						<button
							class="user-card"
							class:selected={selectedUser?.userId === user.userId}
							on:click={() => selectUser(user)}
						>
							<div class="user-header">
								<strong>{user.fullName}</strong>
								<span class="user-username">@{user.username}</span>
							</div>
							<div class="user-stats">
								<div class="stat">
									<span class="stat-label">気分:</span>
									<span class="stat-value">
										{getMoodEmoji(user.avgMood)}
										{user.avgMood?.toFixed(1) || 'N/A'}
									</span>
								</div>
								<div class="stat">
									<span class="stat-label">ストレス:</span>
									<span class="stat-value" style="color: {getStressColor(user.avgStress)}">
										{user.avgStress?.toFixed(1) || 'N/A'}
									</span>
								</div>
							</div>
							{#if user.supportNeeds > 0}
								<div class="support-badge">サポート希望: {user.supportNeeds}件</div>
							{/if}
						</button>
					{/each}
				</div>
			</section>
		{:else}
			<section class="no-alerts">
				<p>✅ 現在、サポートが必要なメンバーはいません。</p>
			</section>
		{/if}

		<!-- 選択されたユーザーの詳細 -->
		{#if selectedUser}
			<section class="user-details">
				<h2>
					<i class="bi bi-person-circle"></i>
					{selectedUser.fullName} の詳細
				</h2>

				<div class="details-grid">
					<!-- 最近のレポート一覧 -->
					<div class="detail-card full-width">
						<h3>最近のレポート（過去30日）</h3>
						{#await apiClient.fetchMentalHealthLogs(selectedUser.userId, { days: 30 }) then logsRes}
							{#if logsRes.data && logsRes.data.length > 0}
								<div class="logs-list">
									{#each logsRes.data as log}
										<div class="log-item">
											<div class="log-header">
												<span class="log-date">{log.reportDate}</span>
												<div class="log-metrics">
													<span class="metric" title="気分">
														{getMoodEmoji(log.mood)}
														{log.mood}/5
													</span>
													<span
														class="metric"
														title="ストレス"
														style="color: {getStressColor(log.stressLevel)}"
													>
														💪 {log.stressLevel}/5
													</span>
												</div>
											</div>

											<div class="log-content">
												{#if log.hasBlocker}
													<div class="content-block blocker">
														<strong>🚧 ブロッカー:</strong>
														<p>{log.blockerDetails || '詳細なし'}</p>
													</div>
												{/if}

												{#if log.needSupport}
													<div class="content-block support-needed">
														<strong>🤝 サポート希望:</strong>
														<p>{log.supportDetails || '詳細なし'}</p>
													</div>
												{/if}

												{#if !log.hasBlocker && !log.needSupport}
													<div class="content-block none">
														<p class="text-muted">特記事項なし</p>
													</div>
												{/if}

												{#if log.aiAdvice}
													<div class="content-block ai-advice">
														<strong>🤖 AIアドバイス:</strong>
														<p>{log.aiAdvice}</p>
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<p>記録がありません。</p>
							{/if}
						{:catch err}
							<p class="error">ログの取得に失敗しました: {err.message}</p>
						{/await}
					</div>

					<!-- 日報満足度トレンド -->
					<div class="detail-card full-width">
						<h3>日報満足度トレンド（過去14日）</h3>
						{#await apiClient.fetchReports({ userId: selectedUser.userId }) then reportsRes}
							{@const reports = (reportsRes.data || []).slice(0, 14).reverse()}
							{#if reports.length > 0}
								<div class="satisfaction-timeline">
									{#each reports as report}
										{@const level = report.satisfaction_level}
										{@const levelClass = Math.round(level)}
										{@const isLow = level <= 2}
										<div class="timeline-item" class:low-satisfaction={isLow}>
											<div class="timeline-date">
												{new Date(report.report_date).toLocaleDateString('ja-JP', {
													month: '2-digit',
													day: '2-digit'
												})}
											</div>
											<div class="timeline-bar">
												<div
													class="bar-fill level-{levelClass}"
													style="width: {(level / 5) * 100}%"
												></div>
											</div>
											<div class="timeline-value">{level}/5</div>
											{#if isLow}
												<span class="low-badge">⚠️</span>
											{/if}
										</div>
									{/each}
								</div>

								<!-- 統計サマリー -->
								{@const avgSatisfaction =
									reports.reduce((sum, r) => sum + r.satisfaction_level, 0) / reports.length}
								{@const lowDays = reports.filter((r) => r.satisfaction_level <= 2).length}
								<div class="satisfaction-summary">
									<div class="summary-stat">
										<span class="stat-label">平均満足度:</span>
										<span class="stat-value">{avgSatisfaction.toFixed(1)}/5</span>
									</div>
									<div class="summary-stat">
										<span class="stat-label">低満足度の日:</span>
										<span class="stat-value" class:warning={lowDays >= 3}>{lowDays}日</span>
									</div>
									{#if lowDays >= 3}
										<div class="alert-message">
											⚠️ 低い満足度が続いています。フォローアップを検討してください。
										</div>
									{/if}
								</div>
							{:else}
								<p>日報データがありません。</p>
							{/if}
						{:catch err}
							<p class="error">日報の取得に失敗しました: {err.message}</p>
						{/await}
					</div>

					<!-- AI分析セクション -->
					<div class="detail-card full-width ai-analysis-card">
						<div class="ai-header">
							<h3>🤖 AI日報トレンド分析</h3>
							<button class="btn-ai-analyze" on:click={runAIAnalysis} disabled={isAnalyzing}>
								{#if isAnalyzing}
									<i class="bi bi-arrow-repeat spin"></i>
									分析中...
								{:else}
									<i class="bi bi-stars"></i>
									AI分析実行
								{/if}
							</button>
						</div>

						{#if analysisError}
							<div class="analysis-error">
								<i class="bi bi-exclamation-circle"></i>
								{analysisError}
							</div>
						{:else if aiAnalysis}
							<div class="analysis-results">
								<!-- 緊急度バッジ -->
								<div class="urgency-badge urgency-{aiAnalysis.urgency}">
									{#if aiAnalysis.urgency === 'high'}
										⚠️ 高緊急
									{:else if aiAnalysis.urgency === 'medium'}
										🟡 中緊急
									{:else}
										✅ 低緊急
									{/if}
								</div>

								<!-- サマリー -->
								<div class="analysis-section">
									<h4>📊 全体的な傾向</h4>
									<p>{aiAnalysis.summary}</p>
								</div>

								<!-- 懸念点 -->
								{#if aiAnalysis.concerns && aiAnalysis.concerns.length > 0}
									<div class="analysis-section concerns">
										<h4>⚠️ 懸念点</h4>
										<ul>
											{#each aiAnalysis.concerns as concern}
												<li>{concern}</li>
											{/each}
										</ul>
									</div>
								{/if}

								<!-- 良い点 -->
								{#if aiAnalysis.positive_points && aiAnalysis.positive_points.length > 0}
									<div class="analysis-section positive">
										<h4>✨ 良い点</h4>
										<ul>
											{#each aiAnalysis.positive_points as point}
												<li>{point}</li>
											{/each}
										</ul>
									</div>
								{/if}

								<!-- 推奨アクション -->
								{#if aiAnalysis.recommended_actions && aiAnalysis.recommended_actions.length > 0}
									<div class="analysis-section actions">
										<h4>🎯 推奨アクション</h4>
										<ol>
											{#each aiAnalysis.recommended_actions as action}
												<li>{action}</li>
											{/each}
										</ol>
									</div>
								{/if}

								<!-- 1on1質問 -->
								{#if aiAnalysis.follow_up_questions && aiAnalysis.follow_up_questions.length > 0}
									<div class="analysis-section questions">
										<h4>💬 1on1で確認すべき質問</h4>
										<ul>
											{#each aiAnalysis.follow_up_questions as question}
												<li>{question}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						{:else}
							<div class="analysis-placeholder">
								<i class="bi bi-lightbulb"></i>
								<p>「AI分析実行」ボタンをクリックして、日報データの詳細な分析を取得します。</p>
							</div>
						{/if}
					</div>

					<!-- トレンド分析 -->
					{#if selectedUserTrend}
						<div class="detail-card">
							<h3>メンタルヘルストレンド（過去4週間）</h3>
							<div class="trend-status">
								<strong>トレンド:</strong>
								{getTrendEmoji(selectedUserTrend.trend)}
							</div>
							{#if selectedUserTrend.weeklyData && selectedUserTrend.weeklyData.length > 0}
								<div class="weekly-data">
									{#each selectedUserTrend.weeklyData as week}
										<div class="week-row">
											<span class="week-label">Week {week.week}</span>
											<span class="week-stats">
												気分: {getMoodEmoji(week.avgMood)}
												{week.avgMood?.toFixed(1) || 'N/A'}
												/ ストレス: {week.avgStress?.toFixed(1) || 'N/A'}
											</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					<!-- アクティビティ異常検知 -->
					{#if selectedUserActivity}
						<div class="detail-card">
							<h3>アクティビティ分析（過去7日間）</h3>
							{#if selectedUserActivity.hasAnomaly}
								<div class="anomaly-alert">
									⚠️ 異常検知
									<ul>
										{#each selectedUserActivity.anomalies as anomaly}
											<li>{anomaly}</li>
										{/each}
									</ul>
								</div>
							{:else}
								<p>✅ 異常は検知されていません</p>
							{/if}
							<div class="activity-stats">
								<div class="stat">
									平均アクティビティスコア:
									<strong>{selectedUserActivity.stats?.avgActivityScore?.toFixed(1) || 0}</strong>
								</div>
								<div class="stat">
									ログ数: <strong>{selectedUserActivity.stats?.totalLogs || 0}</strong>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.mental-health-dashboard {
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

		.mental-health-dashboard {
			padding: 16px;
		}
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
		padding: 0.875rem 1.75rem;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
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
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-primary i {
		font-size: 1.2rem;
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

	.loading {
		text-align: center;
		padding: 3rem;
		font-size: 1.1rem;
		color: #667eea;
		font-weight: 600;
		animation: pulse 2s infinite;
	}

	.loading::before {
		content: '⏳';
		display: block;
		font-size: 3rem;
		margin-bottom: 1rem;
		animation: spin 2s linear infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.summary-section {
		margin-bottom: 2rem;
	}

	.summary-section h2 {
		font-size: 1.5rem;
		margin-bottom: 1.5rem;
		color: #1f2937;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.summary-section h2 i {
		font-size: 1.75rem;
		color: #667eea;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
	}

	.summary-card {
		background: white;
		border: 2px solid rgba(102, 126, 234, 0.1);
		border-radius: 20px;
		padding: 2rem;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		transition: all 0.3s;
		box-shadow: 0 4px 15px rgba(102, 126, 234, 0.1);
	}

	.summary-card:hover {
		border-color: #667eea;
		transform: translateY(-5px);
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.2);
	}

	.card-icon {
		width: 60px;
		height: 60px;
		border-radius: 15px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		color: white;
		flex-shrink: 0;
	}

	.summary-card.mood .card-icon {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	}

	.summary-card.stress .card-icon {
		background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
	}

	.summary-card.blockers .card-icon {
		background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
	}

	.summary-card.support .card-icon {
		background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);
	}

	.card-content {
		flex: 1;
	}

	.card-label {
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.card-value {
		font-size: 2rem;
		font-weight: 700;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.support-section {
		margin-bottom: 2rem;
	}

	.support-section h2 {
		font-size: 1.5rem;
		margin-bottom: 1.5rem;
		color: #1f2937;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.support-section h2 i {
		font-size: 1.75rem;
		color: #667eea;
	}

	.users-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1.5rem;
	}

	.user-card {
		background: white;
		border: 2px solid rgba(102, 126, 234, 0.2);
		border-radius: 20px;
		padding: 1.5rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.3s;
		box-shadow: 0 4px 15px rgba(102, 126, 234, 0.1);
	}

	.user-card:hover {
		border-color: #667eea;
		transform: translateY(-5px);
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.2);
	}

	.user-card.selected {
		border-color: #667eea;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
	}

	.user-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid rgba(102, 126, 234, 0.1);
	}

	.user-header strong {
		font-size: 1.1rem;
		color: #1f2937;
		font-weight: 700;
	}

	.user-username {
		color: #6b7280;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.user-stats {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 1rem;
	}

	.stat {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
		border-radius: 10px;
	}

	.stat-label {
		color: #6b7280;
		font-weight: 600;
	}

	.stat-value {
		font-weight: 700;
		color: #1f2937;
	}

	.support-badge {
		display: inline-block;
		background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 10px;
		font-size: 0.75rem;
		font-weight: 700;
		margin-top: 0.5rem;
		box-shadow: 0 2px 8px rgba(251, 191, 36, 0.3);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.blocker-badge {
		display: inline-block;
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 10px;
		font-size: 0.75rem;
		font-weight: 700;
		margin-top: 0.5rem;
		margin-left: 0.5rem;
		box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.no-alerts {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.1));
		border: 2px solid rgba(34, 197, 94, 0.3);
		color: #065f46;
		padding: 2rem;
		border-radius: 20px;
		text-align: center;
		font-size: 1.1rem;
		font-weight: 600;
		box-shadow: 0 4px 15px rgba(34, 197, 94, 0.1);
	}

	.no-alerts p {
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}

	.no-alerts p::before {
		content: '✅';
		font-size: 2rem;
	}

	.user-details {
		background: white;
		border: 2px solid rgba(102, 126, 234, 0.2);
		border-radius: 20px;
		padding: 2rem;
		margin-top: 2rem;
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.15);
	}

	.user-details h2 {
		font-size: 1.5rem;
		margin-bottom: 1.5rem;
		color: #1f2937;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid rgba(102, 126, 234, 0.2);
	}

	.user-details h2 i {
		font-size: 1.75rem;
		color: #667eea;
	}

	.details-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: 1.5rem;
	}

	.detail-card {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
		border: 2px solid rgba(102, 126, 234, 0.2);
		border-radius: 20px;
		padding: 2rem;
		transition: all 0.3s;
		box-shadow: 0 4px 15px rgba(102, 126, 234, 0.1);
	}

	.detail-card:hover {
		border-color: #667eea;
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.2);
		transform: translateY(-3px);
	}

	.detail-card h3 {
		font-size: 1.2rem;
		margin-bottom: 1.5rem;
		color: #1f2937;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.detail-card h3::before {
		content: '📊';
		font-size: 1.5rem;
	}

	.trend-status {
		font-size: 1.1rem;
		margin-bottom: 1.5rem;
		padding: 1rem 1.5rem;
		background: white;
		border-radius: 15px;
		border-left: 4px solid #667eea;
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
	}

	.trend-status strong {
		color: #667eea;
	}

	.weekly-data {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.week-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: white;
		border-radius: 12px;
		border: 2px solid rgba(102, 126, 234, 0.1);
		transition: all 0.2s;
	}

	.week-row:hover {
		border-color: #667eea;
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
		transform: translateX(5px);
	}

	/* Logs List Styles */
	.full-width {
		grid-column: 1 / -1;
	}

	.logs-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-height: 500px;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.log-item {
		background: white;
		border: 1px solid rgba(102, 126, 234, 0.2);
		border-radius: 12px;
		padding: 1.5rem;
		position: relative;
	}

	.log-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid #f3f4f6;
	}

	.log-date {
		font-weight: 600;
		color: #4b5563;
	}

	.log-metrics {
		display: flex;
		gap: 1rem;
	}

	.metric {
		font-weight: 500;
	}

	.log-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content-block {
		padding: 1rem;
		border-radius: 8px;
		background: #f9fafb;
		border-left: 4px solid #e5e7eb;
	}

	.content-block strong {
		display: block;
		margin-bottom: 0.5rem;
		color: #374151;
		font-size: 0.9rem;
	}

	.content-block p {
		margin: 0;
		color: #4b5563;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.content-block.blocker {
		background: #fef2f2;
		border-left-color: #ef4444;
	}

	.content-block.blocker strong {
		color: #991b1b;
	}

	.content-block.support-needed {
		background: #fffbeb;
		border-left-color: #f59e0b;
	}

	.content-block.support-needed strong {
		color: #92400e;
	}

	.content-block.ai-advice {
		background: #eff6ff;
		border-left-color: #667eea;
	}

	.content-block.ai-advice strong {
		color: #1e40af;
	}

	.content-block.none {
		background: transparent;
		border: 1px dashed #e5e7eb;
		text-align: center;
		padding: 0.75rem;
	}

	/* Existing Styles */
	.week-label {
		font-weight: 700;
		color: #1f2937;
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.week-stats {
		font-weight: 600;
		color: #6b7280;
	}

	.anomaly-alert {
		background: linear-gradient(135deg, #fef3c7, #fde68a);
		border: 2px solid #fbbf24;
		border-radius: 15px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		box-shadow: 0 4px 15px rgba(251, 191, 36, 0.2);
	}

	.anomaly-alert ul {
		margin: 1rem 0 0 0;
		padding-left: 0;
		list-style: none;
	}

	.anomaly-alert li {
		padding: 0.75rem;
		background: white;
		border-radius: 10px;
		margin-bottom: 0.5rem;
		border-left: 3px solid #fbbf24;
		font-weight: 500;
	}

	.anomaly-alert li::before {
		content: '⚠️';
		margin-right: 0.75rem;
	}

	.activity-stats {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.activity-stats .stat {
		background: white;
		padding: 1rem 1.5rem;
		border-radius: 12px;
		border: 2px solid rgba(102, 126, 234, 0.1);
		font-weight: 600;
		color: #1f2937;
	}

	.activity-stats .stat strong {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		font-size: 1.2rem;
	}

	/* 日報満足度タイムライン */
	.satisfaction-timeline {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.timeline-item {
		display: grid;
		grid-template-columns: 60px 1fr 50px 30px;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: white;
		border-radius: 10px;
		border: 2px solid rgba(102, 126, 234, 0.1);
		transition: all 0.2s;
	}

	.timeline-item:hover {
		border-color: rgba(102, 126, 234, 0.3);
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
	}

	.timeline-item.low-satisfaction {
		border-color: rgba(239, 68, 68, 0.3);
		background: rgba(254, 242, 242, 0.5);
	}

	.timeline-date {
		font-size: 0.875rem;
		font-weight: 600;
		color: #6b7280;
	}

	.timeline-bar {
		height: 24px;
		background: #f3f4f6;
		border-radius: 12px;
		overflow: hidden;
		position: relative;
	}

	.bar-fill {
		height: 100%;
		border-radius: 12px;
		transition: width 0.3s ease;
	}

	.bar-fill.level-1 {
		background: linear-gradient(90deg, #ef4444, #dc2626);
	}

	.bar-fill.level-2 {
		background: linear-gradient(90deg, #f97316, #ea580c);
	}

	.bar-fill.level-3 {
		background: linear-gradient(90deg, #eab308, #ca8a04);
	}

	.bar-fill.level-4 {
		background: linear-gradient(90deg, #3b82f6, #2563eb);
	}

	.bar-fill.level-5 {
		background: linear-gradient(90deg, #10b981, #059669);
	}

	.timeline-value {
		font-size: 0.875rem;
		font-weight: 700;
		color: #1f2937;
		text-align: right;
	}

	.low-badge {
		font-size: 1.2rem;
	}

	.satisfaction-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		padding: 1.5rem;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
		border-radius: 12px;
		border: 2px solid rgba(102, 126, 234, 0.1);
	}

	.summary-stat {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.summary-stat .stat-label {
		font-size: 0.875rem;
		color: #6b7280;
		font-weight: 600;
	}

	.summary-stat .stat-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: #1f2937;
	}

	.summary-stat .stat-value.warning {
		color: #dc2626;
	}

	.alert-message {
		flex-basis: 100%;
		padding: 1rem;
		background: #fef2f2;
		border-left: 4px solid #ef4444;
		border-radius: 8px;
		color: #991b1b;
		font-weight: 600;
		font-size: 0.875rem;
	}

	/* AI分析セクション */
	.ai-analysis-card {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.03), rgba(118, 75, 162, 0.03));
		border: 2px solid rgba(102, 126, 234, 0.2);
	}

	.ai-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid rgba(102, 126, 234, 0.2);
	}

	.btn-ai-analyze {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: white;
		border: none;
		border-radius: 12px;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.3s;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.btn-ai-analyze:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.btn-ai-analyze:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-ai-analyze .spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.analysis-error {
		padding: 1rem;
		background: #fef2f2;
		border-left: 4px solid #ef4444;
		border-radius: 8px;
		color: #991b1b;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.analysis-placeholder {
		text-align: center;
		padding: 3rem;
		color: #6b7280;
	}

	.analysis-placeholder i {
		font-size: 3rem;
		margin-bottom: 1rem;
		display: block;
		opacity: 0.5;
	}

	.analysis-results {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.urgency-badge {
		padding: 0.75rem 1.5rem;
		border-radius: 12px;
		font-weight: 700;
		font-size: 0.875rem;
		text-align: center;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.urgency-badge.urgency-high {
		background: linear-gradient(135deg, #fee2e2, #fecaca);
		color: #991b1b;
		border: 2px solid #fca5a5;
	}

	.urgency-badge.urgency-medium {
		background: linear-gradient(135deg, #fef3c7, #fde68a);
		color: #92400e;
		border: 2px solid #fbbf24;
	}

	.urgency-badge.urgency-low {
		background: linear-gradient(135deg, #d1fae5, #a7f3d0);
		color: #065f46;
		border: 2px solid #6ee7b7;
	}

	.analysis-section {
		padding: 1.5rem;
		background: white;
		border-radius: 12px;
		border: 2px solid rgba(102, 126, 234, 0.1);
	}

	.analysis-section h4 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		font-weight: 700;
		color: #1f2937;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.analysis-section p {
		margin: 0;
		line-height: 1.6;
		color: #374151;
	}

	.analysis-section ul,
	.analysis-section ol {
		margin: 0;
		padding-left: 1.5rem;
	}

	.analysis-section li {
		margin-bottom: 0.75rem;
		line-height: 1.6;
		color: #374151;
	}

	.analysis-section.concerns {
		border-left: 4px solid #f59e0b;
		background: #fffbeb;
	}

	.analysis-section.positive {
		border-left: 4px solid #10b981;
		background: #f0fdf4;
	}

	.analysis-section.actions {
		border-left: 4px solid #667eea;
		background: #eff6ff;
	}

	.analysis-section.questions {
		border-left: 4px solid #8b5cf6;
		background: #faf5ff;
	}

	@media (max-width: 768px) {
		.summary-grid,
		.users-grid,
		.details-grid {
			grid-template-columns: 1fr;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.mental-health-dashboard {
			padding: 12px;
		}

		.page-header {
			padding: 16px;
			border-radius: 16px;
			margin-bottom: 16px;
		}

		.page-header h1 {
			font-size: 20px;
			margin: 0 0 4px;
		}

		.btn-primary {
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
			width: 100%;
		}

		.summary-grid,
		.users-grid {
			gap: 12px;
		}

		.summary-card {
			padding: 16px;
			gap: 12px;
			border-radius: 16px;
		}

		.card-icon {
			width: 48px;
			height: 48px;
			font-size: 24px;
			border-radius: 12px;
		}

		.card-label {
			font-size: 11px;
		}

		.card-value {
			font-size: 32px;
		}

		.support-section,
		.user-details {
			padding: 16px;
			border-radius: 16px;
			margin-bottom: 16px;
		}

		.user-card {
			padding: 14px;
			border-radius: 12px;
		}

		.details-grid {
			gap: 12px;
		}

		.detail-card {
			padding: 16px;
			border-radius: 12px;
		}

		.week-row {
			padding: 10px;
			border-radius: 10px;
		}

		.week-label {
			font-size: 12px;
		}

		.anomaly-alert {
			padding: 12px;
			border-radius: 12px;
			margin-bottom: 12px;
		}

		.anomaly-alert li {
			padding: 10px;
			border-radius: 8px;
			font-size: 13px;
		}

		.activity-stats .stat {
			padding: 12px;
			border-radius: 10px;
			font-size: 13px;
		}
	}
</style>
