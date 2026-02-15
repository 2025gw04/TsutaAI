<script lang="ts">
	export let insights: {
		trends: any[];
		anomalies: any[];
		patterns: any[];
		predictions: any[];
		aiInsights: any[];
	};

	// アイコンを取得
	function getIcon(type: string): string {
		const icons: Record<string, string> = {
			positive: '✅',
			warning: '⚠️',
			critical: '🔴',
			info: 'ℹ️'
		};
		return icons[type] || 'ℹ️';
	}

	// 重要度に応じた色を取得
	function getSeverityColor(severity: string): string {
		const colors: Record<string, string> = {
			positive: '#10b981',
			warning: '#f59e0b',
			critical: '#ef4444',
			high: '#ef4444',
			medium: '#f59e0b',
			low: '#6b7280'
		};
		return colors[severity] || '#6b7280';
	}
</script>

<div class="insights-panel">
	<h3>🔍 AI洞察</h3>

	<!-- AI統合分析 -->
	{#if insights.aiInsights && insights.aiInsights.length > 0}
		<div class="section ai-insights">
			<h4>💡 重要な洞察</h4>
			<div class="insights-list">
				{#each insights.aiInsights as insight}
					<div class="insight-card" style="border-left-color: {getSeverityColor(insight.type)}">
						<div class="insight-header">
							<span class="insight-icon">{getIcon(insight.type)}</span>
							<span class="insight-text">{insight.insight}</span>
						</div>
						{#if insight.action}
							<div class="insight-action">
								<strong>推奨:</strong>
								{insight.action}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- トレンド -->
	{#if insights.trends && insights.trends.length > 0}
		<div class="section trends">
			<h4>📈 トレンド</h4>
			<div class="insights-list">
				{#each insights.trends as trend}
					<div class="insight-card" style="border-left-color: {getSeverityColor(trend.severity)}">
						<div class="insight-header">
							<span class="insight-icon">{getIcon(trend.severity)}</span>
							<strong>{trend.title}</strong>
						</div>
						<p>{trend.description}</p>
						{#if trend.value !== undefined}
							<div class="metric">
								<span class="metric-value">{trend.value.toFixed(1)}</span>
								<span class="metric-unit">{trend.unit}</span>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 異常 -->
	{#if insights.anomalies && insights.anomalies.length > 0}
		<div class="section anomalies">
			<h4>🚨 異常検知</h4>
			<div class="insights-list">
				{#each insights.anomalies as anomaly}
					<div class="insight-card" style="border-left-color: {getSeverityColor(anomaly.severity)}">
						<div class="insight-header">
							<span class="insight-icon">{getIcon(anomaly.severity)}</span>
							<strong>{anomaly.title}</strong>
						</div>
						<p>{anomaly.description}</p>
						{#if anomaly.affectedTasks && anomaly.affectedTasks.length > 0}
							<div class="affected-tasks">
								<small>影響を受けるタスク:</small>
								<ul>
									{#each anomaly.affectedTasks.slice(0, 3) as task}
										<li>{task.name}</li>
									{/each}
									{#if anomaly.affectedTasks.length > 3}
										<li>...他{anomaly.affectedTasks.length - 3}件</li>
									{/if}
								</ul>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- パターン -->
	{#if insights.patterns && insights.patterns.length > 0}
		<div class="section patterns">
			<h4>🔄 パターン</h4>
			<div class="insights-list">
				{#each insights.patterns as pattern}
					<div class="insight-card">
						<div class="insight-header">
							<strong>{pattern.title}</strong>
						</div>
						<p>{pattern.description}</p>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 予測 -->
	{#if insights.predictions && insights.predictions.length > 0}
		<div class="section predictions">
			<h4>🔮 予測</h4>
			<div class="insights-list">
				{#each insights.predictions as prediction}
					<div class="insight-card">
						<div class="insight-header">
							<strong>{prediction.title}</strong>
						</div>
						{#if prediction.predictedDate}
							<div class="prediction-date">
								<strong>予測完了日:</strong>
								{prediction.predictedDate}
								{#if prediction.daysRemaining}
									<span class="days-remaining">（残り{prediction.daysRemaining}日）</span>
								{/if}
							</div>
						{/if}
						{#if prediction.confidence}
							<div class="confidence">
								<strong>信頼度:</strong>
								<div class="confidence-bar">
									<div class="confidence-fill" style="width: {prediction.confidence * 100}%"></div>
								</div>
								<span>{(prediction.confidence * 100).toFixed(0)}%</span>
							</div>
						{/if}
						{#if prediction.comparison}
							<p class="comparison">{prediction.comparison}</p>
						{/if}
						{#if prediction.description}
							<p>{prediction.description}</p>
						{/if}
						{#if prediction.recommendation}
							<div class="recommendation">
								<strong>推奨:</strong>
								{prediction.recommendation}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.insights-panel {
		background: white;
		border-radius: 12px;
		padding: 20px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.insights-panel h3 {
		margin: 0 0 20px 0;
		font-size: 18px;
		font-weight: 600;
		color: #1f2937;
	}

	.section {
		margin-bottom: 24px;
	}

	.section:last-child {
		margin-bottom: 0;
	}

	.section h4 {
		margin: 0 0 12px 0;
		font-size: 15px;
		font-weight: 600;
		color: #374151;
	}

	.insights-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.insight-card {
		background: #f9fafb;
		border-left: 4px solid #6b7280;
		border-radius: 8px;
		padding: 12px 16px;
	}

	.insight-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.insight-icon {
		font-size: 18px;
	}

	.insight-text {
		flex: 1;
		font-weight: 500;
		color: #1f2937;
	}

	.insight-card p {
		margin: 8px 0 0 0;
		font-size: 14px;
		line-height: 1.6;
		color: #4b5563;
	}

	.insight-action {
		margin-top: 8px;
		padding: 8px 12px;
		background: #e0f2fe;
		border-radius: 6px;
		font-size: 13px;
		color: #0369a1;
	}

	.metric {
		margin-top: 8px;
		display: flex;
		align-items: baseline;
		gap: 4px;
	}

	.metric-value {
		font-size: 24px;
		font-weight: 700;
		color: #1f2937;
	}

	.metric-unit {
		font-size: 14px;
		color: #6b7280;
	}

	.affected-tasks {
		margin-top: 8px;
		font-size: 13px;
	}

	.affected-tasks small {
		color: #6b7280;
	}

	.affected-tasks ul {
		margin: 4px 0 0 0;
		padding-left: 20px;
	}

	.affected-tasks li {
		margin: 2px 0;
		color: #4b5563;
	}

	.prediction-date {
		margin: 8px 0;
		font-size: 14px;
	}

	.days-remaining {
		color: #6b7280;
		font-size: 13px;
	}

	.confidence {
		margin: 8px 0;
		font-size: 14px;
	}

	.confidence-bar {
		display: inline-block;
		width: 100px;
		height: 8px;
		background: #e5e7eb;
		border-radius: 4px;
		margin: 0 8px;
		vertical-align: middle;
	}

	.confidence-fill {
		height: 100%;
		background: linear-gradient(90deg, #10b981 0%, #059669 100%);
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.comparison {
		margin: 8px 0;
		padding: 8px 12px;
		background: #fef3c7;
		border-radius: 6px;
		font-size: 13px;
		color: #92400e;
	}

	.recommendation {
		margin-top: 8px;
		padding: 8px 12px;
		background: #dbeafe;
		border-radius: 6px;
		font-size: 13px;
		color: #1e40af;
	}
</style>
