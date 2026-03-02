<script lang="ts">
	export let results: any[] = [];

	function toFiniteNumber(value: unknown, fallback = 0): number {
		const num = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(num) ? num : fallback;
	}

	function formatFixed(value: unknown, digits = 1): string {
		return toFiniteNumber(value).toFixed(digits);
	}

	function formatPercent(value: unknown): string {
		return `${(toFiniteNumber(value) * 100).toFixed(0)}%`;
	}

	function getResultTypeName(type: string): string {
		const names: Record<string, string> = {
			optimistic: '楽観的',
			standard: '標準',
			pessimistic: '悲観的'
		};
		return names[type] || type;
	}

	function getResultTypeColor(type: string): string {
		const colors: Record<string, string> = {
			optimistic: '#10b981',
			standard: '#667eea',
			pessimistic: '#f59e0b'
		};
		return colors[type] || '#6b7280';
	}
</script>

<div class="result-panel">
	{#if results.length === 0}
		<div class="empty-state">
			<i class="bi bi-graph-up"></i>
			<h3>見積もり結果がありません</h3>
			<p>「見積もり計算」ボタンをクリックして結果を生成してください</p>
		</div>
	{:else}
		<!-- プロジェクト全体サマリーヘッダー -->
		<div class="project-summary-header">
			<div class="summary-icon">
				<i class="bi bi-diagram-3"></i>
			</div>
			<div class="summary-content">
				<h2>プロジェクト全体の見積もり結果</h2>
				<p class="summary-description">
					全フェーズを合計した見積もりです。下記の3パターン（楽観的・標準・悲観的）から状況に応じて選択してください。
				</p>
			</div>
		</div>

		<div class="results-grid">
			{#each results as result}
				<div class="result-card" style="border-color: {getResultTypeColor(result.result_type)}">
					<div class="card-header" style="background: {getResultTypeColor(result.result_type)}15">
						<h3 style="color: {getResultTypeColor(result.result_type)}">
							{getResultTypeName(result.result_type)}
						</h3>
						<span class="confidence">
							信頼度: {formatPercent(result.confidence_level)}
						</span>
					</div>

					<div class="card-body">
						<div class="metric-row">
							<div class="metric">
								<i class="bi bi-clock"></i>
								<div class="metric-content">
									<span class="metric-label">総工数</span>
									<span class="metric-value">{formatFixed(result.total_effort)} 人日</span>
								</div>
							</div>
							<div class="metric">
								<i class="bi bi-calendar"></i>
								<div class="metric-content">
									<span class="metric-label">期間</span>
									<span class="metric-value">{result.duration_days} 日</span>
								</div>
							</div>
						</div>

						<div class="metric-row">
							<div class="metric">
								<i class="bi bi-people"></i>
								<div class="metric-content">
									<span class="metric-label">平均人数</span>
									<span class="metric-value">{formatFixed(result.team_size)} 人</span>
								</div>
							</div>
							{#if result.total_cost}
								<div class="metric">
									<i class="bi bi-currency-yen"></i>
									<div class="metric-content">
										<span class="metric-label">総コスト</span>
										<span class="metric-value">
											{toFiniteNumber(result.total_cost).toLocaleString()} 円
										</span>
									</div>
								</div>
							{/if}
						</div>

						{#if result.breakdown?.aiSavings && result.breakdown.aiSavings > 0}
							<div class="ai-savings-banner">
								<i class="bi bi-robot"></i>
								<div>
									<div class="savings-title">AI活用による削減効果</div>
									<div class="savings-value">
										{formatFixed(result.breakdown.aiSavings)} 人日の工数削減
									</div>
								</div>
							</div>
						{/if}

						{#if result.breakdown?.phases}
							<div class="phases-breakdown">
								<div class="phases-header">
									<i class="bi bi-list-nested"></i>
									<h4>フェーズ別内訳（{result.breakdown.phases.length}フェーズ）</h4>
								</div>
								<div class="phases-list">
									{#each result.breakdown.phases as phase}
										<div class="phase-row">
											<span class="phase-name">{phase.name}</span>
											<div class="phase-metrics">
												<span class="phase-effort">{formatFixed(phase.effort)}人日</span>
												<span class="phase-duration">{phase.duration}日</span>
												{#if phase.useAi}
													<span class="phase-ai-badge">
														<i class="bi bi-robot"></i>
														AI {formatPercent(phase.aiEfficiencyRatio)}
													</span>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<div class="comparison-summary">
			<div class="comparison-header">
				<i class="bi bi-table"></i>
				<div>
					<h3>プロジェクト全体の見積もり比較</h3>
					<p class="comparison-note">全フェーズ合計値の比較です</p>
				</div>
			</div>
			<div class="comparison-table">
				<table>
					<thead>
						<tr>
							<th>項目</th>
							<th>楽観的</th>
							<th>標準</th>
							<th>悲観的</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>総工数</td>
							{#each results as result}
								<td>{formatFixed(result.total_effort)} 人日</td>
							{/each}
						</tr>
						<tr>
							<td>期間</td>
							{#each results as result}
								<td>{result.duration_days} 日</td>
							{/each}
						</tr>
						<tr>
							<td>平均人数</td>
							{#each results as result}
								<td>{formatFixed(result.team_size)} 人</td>
							{/each}
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<style>
	.result-panel {
		padding: 24px;
	}

	/* プロジェクト全体サマリーヘッダー */
	.project-summary-header {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 24px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 12px;
		margin-bottom: 24px;
		color: white;
	}

	.summary-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		flex-shrink: 0;
	}

	.summary-icon i {
		font-size: 28px;
		color: white;
	}

	.summary-content h2 {
		margin: 0 0 8px;
		font-size: 22px;
		font-weight: 700;
		color: white;
	}

	.summary-description {
		margin: 0;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.9);
		line-height: 1.5;
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

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 24px;
		margin-bottom: 32px;
	}

	.result-card {
		background: #ffffff;
		border: 2px solid;
		border-radius: 12px;
		overflow: hidden;
	}

	.card-header {
		padding: 20px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.card-header h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
	}

	.confidence {
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
	}

	.card-body {
		padding: 20px;
	}

	.metric-row {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin-bottom: 16px;
	}

	.metric {
		display: flex;
		gap: 12px;
		padding: 16px;
		background: #f9fafb;
		border-radius: 8px;
	}

	.metric i {
		font-size: 24px;
		color: #667eea;
	}

	.metric-content {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.metric-label {
		font-size: 12px;
		color: #6b7280;
	}

	.metric-value {
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.ai-savings-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1));
		border-left: 4px solid #10b981;
		border-radius: 8px;
		margin-bottom: 20px;
	}

	.ai-savings-banner i {
		font-size: 32px;
		color: #10b981;
	}

	.savings-title {
		font-size: 12px;
		color: #059669;
		font-weight: 600;
	}

	.savings-value {
		font-size: 16px;
		font-weight: 700;
		color: #10b981;
	}

	.phases-breakdown {
		margin-top: 20px;
		padding-top: 20px;
		border-top: 1px solid #e5e7eb;
	}

	.phases-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}

	.phases-header i {
		font-size: 16px;
		color: #667eea;
	}

	.phases-breakdown h4 {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: #374151;
	}

	.phases-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.phase-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px;
		background: #f9fafb;
		border-radius: 6px;
	}

	.phase-name {
		font-size: 13px;
		font-weight: 600;
		color: #111827;
	}

	.phase-metrics {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 12px;
		color: #6b7280;
	}

	.phase-ai-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
		border-radius: 10px;
		color: #667eea;
		font-weight: 600;
	}

	.comparison-summary {
		margin-top: 32px;
		padding: 24px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
	}

	.comparison-header {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 20px;
	}

	.comparison-header i {
		font-size: 24px;
		color: #667eea;
		margin-top: 2px;
	}

	.comparison-summary h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.comparison-note {
		margin: 4px 0 0;
		font-size: 13px;
		color: #6b7280;
	}

	.comparison-table {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	thead th {
		padding: 12px;
		background: #f9fafb;
		border-bottom: 2px solid #e5e7eb;
		text-align: left;
		font-size: 13px;
		font-weight: 700;
		color: #374151;
	}

	tbody td {
		padding: 12px;
		border-bottom: 1px solid #f3f4f6;
		font-size: 14px;
		color: #111827;
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	tbody td:first-child {
		font-weight: 600;
		color: #6b7280;
	}
</style>
