<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';

	export let workload: Array<{
		name: string;
		load: number;
		status: string;
		riskLevel: 'critical' | 'warning' | 'balanced';
		activeTasks: number;
		dueSoonTasks: number;
		completedThisWeek: number;
	}> = [];

	let sentiment: {
		overall_score: number;
		summary: string;
		positive_keywords: string[];
		negative_keywords: string[];
	} | null = null;

	let isLoading = true;
	let isRefreshing = false;
	let errorMessage = '';

	/**
	 * DBから最新のセンチメント分析結果を読み込みます
	 */
	async function loadSentimentFromDB() {
		try {
			const response = await apiClient.fetchSentiment();
			if (response.data) {
				// スコアを数値に変換（NaN対策）
				const score =
					typeof response.data.overallScore === 'number'
						? response.data.overallScore
						: parseFloat(response.data.overallScore) || 0;
				sentiment = {
					overall_score: score,
					summary: response.data.summary || '',
					positive_keywords: response.data.positiveKeywords || [],
					negative_keywords: response.data.negativeKeywords || []
				};
			} else {
				sentiment = null;
			}
		} catch (error) {
			console.warn('センチメント分析の読み込みに失敗しました', error);
			sentiment = null;
		} finally {
			isLoading = false;
		}
	}

	/**
	 * AIでセンチメント分析を再生成してDBに保存します
	 * バックエンドが自動的にDBから日報コメント・タスクコメントを取得してAI分析を実行します
	 */
	async function refreshSentimentWithAI() {
		try {
			isRefreshing = true;
			errorMessage = '';

			// AIで分析を実行（バックエンドがDBから実データを自動取得）
			const aiResponse = await apiClient.analyzeSentiment({ comments_json: '' });
			const sentimentData = aiResponse.data;

			// データがない場合の処理
			if (sentimentData.noData) {
				sentiment = null;
				errorMessage = '';
				isRefreshing = false;
				return;
			}

			// エラーがある場合の処理
			if (sentimentData.error) {
				errorMessage = `AI分析エラー: ${sentimentData.error}`;
				isRefreshing = false;
				return;
			}

			// AIレスポンスを処理（バックエンドで必ず有効なデータを返すようにした）
			const overallScore =
				typeof sentimentData.overall_score === 'number'
					? sentimentData.overall_score
					: parseFloat(sentimentData.overall_score) || 0;

			const summary = sentimentData.summary || 'センチメント分析結果';
			const positiveKeywords = Array.isArray(sentimentData.positive_keywords)
				? sentimentData.positive_keywords
				: [];
			const negativeKeywords = Array.isArray(sentimentData.negative_keywords)
				? sentimentData.negative_keywords
				: [];

			// DBに保存（comments_jsonはバックエンドで自動取得されたものを使用するため空で良い）
			await apiClient.saveSentiment({
				overall_score: overallScore,
				summary: summary,
				positive_keywords: positiveKeywords,
				negative_keywords: negativeKeywords,
				comments_json: ''
			});

			// 表示を更新
			sentiment = {
				overall_score: overallScore,
				summary: summary,
				positive_keywords: positiveKeywords,
				negative_keywords: negativeKeywords
			};
		} catch (error) {
			console.error('センチメント分析の更新に失敗しました', error);
			errorMessage = '感情分析の更新に失敗しました。再度お試しください。';
		} finally {
			isRefreshing = false;
		}
	}

	onMount(async () => {
		await loadSentimentFromDB();
	});

	$: totalActive = workload.reduce((sum, member) => sum + member.activeTasks, 0);
	$: totalDueSoon = workload.reduce((sum, member) => sum + member.dueSoonTasks, 0);
	$: overloadedMembers = workload.filter((member) => member.riskLevel === 'critical');
	$: attentionMembers = workload.filter((member) => member.riskLevel === 'warning');

	function getRiskBadge(risk: 'critical' | 'warning' | 'balanced') {
		if (risk === 'critical') return 'critical';
		if (risk === 'warning') return 'warning';
		return 'balanced';
	}

	function buildRecommendation(member: {
		riskLevel: 'critical' | 'warning' | 'balanced';
		dueSoonTasks: number;
		activeTasks: number;
		completedThisWeek: number;
	}) {
		if (member.riskLevel === 'critical') {
			if (member.dueSoonTasks > 0) {
				return '直近期限タスクをチームで分担し、レビュー支援者を確保してください。';
			}
			return 'タスクの優先度を見直し、工数の再見積もりと支援要員の追加を検討してください。';
		}
		if (member.riskLevel === 'warning') {
			if (member.dueSoonTasks > 0) {
				return '期限が迫るタスクの依存関係を整理し、バックアップ担当を指名してください。';
			}
			return '状況確認の1on1を設定し、負荷推移を定点観測してください。';
		}
		if (member.completedThisWeek === 0) {
			return '空き時間を活かしてドキュメント整備や他メンバーのレビュー支援を割当てましょう。';
		}
		return '現在のペースを維持し、ボトルネックの引き継ぎ準備を進めましょう。';
	}
</script>

<section class="team-widget">
	<header>
		<div>
			<h2>チームコンディション</h2>
			<p>稼働率とAI感情分析から、メンバーの負荷とサポートが必要な箇所を把握します。</p>
		</div>
	</header>

	<div class="content">
		<div class="workload">
			<h3>稼働インジケータ</h3>

			<div class="summary-grid">
				<div class="summary-card">
					<span class="label">アクティブタスク総数</span>
					<strong>{totalActive}</strong>
					<small>現在稼働中のタスク数</small>
				</div>
				<div class="summary-card">
					<span class="label">今週期限</span>
					<strong>{totalDueSoon}</strong>
					<small>7日以内に期限を迎えるタスク</small>
				</div>
				<div class="summary-card critical" class:highlight={overloadedMembers.length > 0}>
					<span class="label">要即対応</span>
					<strong>{overloadedMembers.length}</strong>
					<small>高負荷で再配分が必要なメンバー</small>
				</div>
				<div class="summary-card warning">
					<span class="label">注意レベル</span>
					<strong>{attentionMembers.length}</strong>
					<small>早期フォローが望ましいメンバー</small>
				</div>
			</div>

			<div class="table-wrapper">
				{#if workload.length === 0}
					<div class="empty">
						<i class="bi bi-people"></i>
						<span>タスクデータが不足しているため、稼働状況を計算できませんでした。</span>
					</div>
				{:else}
					<table>
						<thead>
							<tr>
								<th>メンバー</th>
								<th>稼働率</th>
								<th>稼働中</th>
								<th>今週期限</th>
								<th>今週完了</th>
								<th>推奨アクション</th>
							</tr>
						</thead>
						<tbody>
							{#each workload as member (member.name)}
								<tr>
									<td data-label="メンバー">
										<div class="member-name">
											<span>{member.name}</span>
											<span class={`status-badge ${getRiskBadge(member.riskLevel)}`}>
												{member.status}
											</span>
										</div>
									</td>
									<td data-label="稼働率">
										<div class="load-indicator">
											<span class={`load-chip ${getRiskBadge(member.riskLevel)}`}>
												{member.load}%
											</span>
										</div>
									</td>
									<td data-label="稼働中">{member.activeTasks}</td>
									<td data-label="今週期限">{member.dueSoonTasks}</td>
									<td data-label="今週完了">{member.completedThisWeek}</td>
									<td data-label="推奨アクション">{buildRecommendation(member)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>

		<div class="sentiment">
			<div class="sentiment-header">
				<h3>AIセンチメント</h3>
				<button
					type="button"
					class="refresh-button"
					on:click={refreshSentimentWithAI}
					disabled={isRefreshing}
				>
					<i class="bi bi-stars"></i>
					{isRefreshing ? '更新中...' : 'AI再生成'}
				</button>
			</div>
			{#if isLoading}
				<div class="empty">
					<div class="spinner"></div>
					<span>AIがコメントを解析中です…</span>
				</div>
			{:else if errorMessage}
				<div class="empty error">
					<i class="bi bi-emoji-frown"></i>
					<span>{errorMessage}</span>
				</div>
			{:else if sentiment}
				{@const score =
					typeof sentiment.overall_score === 'number' && !isNaN(sentiment.overall_score)
						? sentiment.overall_score
						: 0}
				<div class="score-block">
					<span class={`score ${score >= 0 ? 'positive' : 'negative'}`}>
						{score >= 0 ? '😊' : '😟'}
						{Math.round(score * 100)} pts
					</span>
					<p>{sentiment.summary}</p>
				</div>
				<div class="keywords">
					<div>
						<span class="label">ポジティブワード</span>
						<div class="chip-row">
							{#each sentiment.positive_keywords as keyword}
								<span class="chip positive">{keyword}</span>
							{/each}
						</div>
					</div>
					<div>
						<span class="label">ネガティブワード</span>
						<div class="chip-row">
							{#each sentiment.negative_keywords as keyword}
								<span class="chip negative">{keyword}</span>
							{/each}
						</div>
					</div>
				</div>
			{:else}
				<div class="empty">
					<i class="bi bi-emoji-neutral"></i>
					<span>コメントが不足しているため解析できませんでした。</span>
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.team-widget {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 22px;
		border-radius: 20px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	}

	header h2 {
		margin: 0;
		font-size: 18px;
		color: #111827;
	}

	header p {
		margin: 6px 0 0;
		font-size: 12px;
		color: #6b7280;
	}

	.content {
		display: grid;
		gap: 18px;
	}

	.workload,
	.sentiment {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
		border-radius: 18px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
	}

	h3 {
		margin: 0;
		font-size: 14px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
	}

	.sentiment-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	.refresh-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		background: #ffffff;
		color: #374151;
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.refresh-button:hover:not(:disabled) {
		background: #eff6ff;
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.refresh-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.refresh-button i {
		font-size: 13px;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 12px;
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px;
		border-radius: 14px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
	}

	.summary-card.critical {
		border-color: #fca5a5;
		background: #fef2f2;
	}

	.summary-card.warning {
		border-color: #fcd34d;
		background: #fefce8;
	}

	.summary-card .label {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
	}

	.summary-card strong {
		font-size: 22px;
		color: #111827;
	}

	.summary-card small {
		font-size: 11px;
		color: #6b7280;
	}

	.table-wrapper {
		border-radius: 16px;
		border: 1px solid #e5e7eb;
		overflow: hidden;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: #ffffff;
		min-width: 800px;
	}

	th,
	td {
		padding: 12px 14px;
		border-bottom: 1px solid #e5e7eb;
		text-align: left;
		color: #374151;
		font-size: 13px;
	}

	th {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
		background: #f9fafb;
	}

	tr:last-child td {
		border-bottom: none;
	}

	td:last-child {
		max-width: 300px;
		white-space: normal;
		line-height: 1.5;
	}

	.member-name {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 11px;
		width: fit-content;
	}

	.status-badge.critical {
		background: #fee2e2;
		color: #dc2626;
	}

	.status-badge.warning {
		background: #fef3c7;
		color: #d97706;
	}

	.status-badge.balanced {
		background: #dbeafe;
		color: #2563eb;
	}

	.load-chip {
		display: inline-flex;
		align-items: center;
		padding: 4px 8px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
	}

	.load-chip.critical {
		background: #fee2e2;
		color: #dc2626;
	}

	.load-chip.warning {
		background: #fef3c7;
		color: #d97706;
	}

	.load-chip.balanced {
		background: #dbeafe;
		color: #2563eb;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 24px 12px;
		border-radius: 12px;
		background: #f9fafb;
		color: #6b7280;
		font-size: 12px;
		text-align: center;
	}

	.empty.error {
		border: 1px solid #fca5a5;
		background: #fef2f2;
		color: #dc2626;
	}

	.spinner {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 3px solid rgba(59, 130, 246, 0.2);
		border-top-color: #3b82f6;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.score-block {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.score {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: 12px;
		font-size: 15px;
		font-weight: 600;
	}

	.score.positive {
		background: #d1fae5;
		color: #047857;
	}

	.score.negative {
		background: #fee2e2;
		color: #dc2626;
	}

	.score-block p {
		margin: 0;
		font-size: 12px;
		line-height: 1.7;
		color: #6b7280;
	}

	.keywords {
		display: grid;
		gap: 12px;
	}

	.label {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
	}

	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip {
		padding: 6px 10px;
		border-radius: 999px;
		font-size: 11px;
	}

	.chip.positive {
		background: #d1fae5;
		color: #047857;
	}

	.chip.negative {
		background: #fee2e2;
		color: #dc2626;
	}

	@media (min-width: 900px) {
		.content {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		}
	}

	/* タブレット対応 */
	@media (max-width: 768px) {
		.team-widget {
			padding: 18px;
		}

		.summary-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 10px;
		}

		table {
			min-width: 700px;
		}

		th,
		td {
			padding: 10px 12px;
			font-size: 12px;
		}

		th {
			font-size: 10px;
		}

		td:last-child {
			max-width: 250px;
			font-size: 12px;
		}
	}

	/* モバイル対応（テーブル横スクロール対策） */
	@media (max-width: 767px) {
		.table-wrapper {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
		}

		table {
			min-width: unset;
			width: 100%;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.team-widget {
			padding: 16px;
			gap: 20px;
		}

		header h2 {
			font-size: 16px;
		}

		header p {
			font-size: 11px;
		}

		.workload,
		.sentiment {
			padding: 14px;
			gap: 14px;
		}

		h3 {
			font-size: 12px;
		}

		.summary-grid {
			grid-template-columns: 1fr;
			gap: 10px;
		}

		.summary-card {
			padding: 12px;
		}

		.summary-card .label {
			font-size: 10px;
		}

		.summary-card strong {
			font-size: 20px;
		}

		.summary-card small {
			font-size: 10px;
		}

		/* モバイルではテーブルをカードレイアウトに変換 */
		.table-wrapper {
			border-radius: 12px;
			overflow: visible;
			border: none;
		}

		table {
			min-width: unset;
			width: 100%;
			display: block;
			border: none;
		}

		thead {
			display: none;
		}

		tbody {
			display: block;
		}

		tr {
			display: block;
			margin-bottom: 12px;
			border: 1px solid #e5e7eb;
			border-radius: 12px;
			background: #ffffff;
			padding: 14px;
		}

		tr:last-child {
			margin-bottom: 0;
		}

		td {
			display: block;
			padding: 0;
			border: none;
			text-align: left;
			font-size: 12px;
		}

		td::before {
			content: attr(data-label);
			display: block;
			font-size: 10px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: #9ca3af;
			margin-bottom: 4px;
			font-weight: 600;
		}

		td:not(:last-child) {
			margin-bottom: 12px;
		}

		td:last-child {
			max-width: 100%;
			font-size: 12px;
			line-height: 1.5;
			margin-top: 8px;
			padding-top: 12px;
			border-top: 1px solid #f3f4f6;
		}

		.member-name {
			flex-direction: row;
			align-items: center;
			gap: 8px;
		}

		.status-badge,
		.load-chip {
			font-size: 10px;
			padding: 3px 6px;
		}

		.load-indicator {
			display: block;
		}

		.sentiment-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
		}

		.refresh-button {
			width: 100%;
			justify-content: center;
			padding: 10px 14px;
			font-size: 12px;
			min-height: 44px;
		}

		.score {
			font-size: 14px;
			padding: 8px 10px;
		}

		.score-block p {
			font-size: 11px;
		}

		.chip {
			font-size: 10px;
			padding: 5px 8px;
		}
	}
</style>
