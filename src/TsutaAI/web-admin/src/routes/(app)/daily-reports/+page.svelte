<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';

	import { page } from '$app/stores';

	// クライアントサイドフェッチ用に変数を定義
	let reports: any[] = [];
	let users: any[] = [];
	let error: string = '';
	let isLoading: boolean = true;

	let selectedUserId = $page.url.searchParams.get('userId') || '';
	let selectedDate = $page.url.searchParams.get('date') || '';

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		isLoading = true;
		error = '';
		try {
			// 並列で取得
			const [reportsRes, usersRes] = await Promise.all([
				apiClient.fetchReports({ userId: selectedUserId, date: selectedDate }),
				apiClient.fetchUsers() // ユーザー一覧もapiClient経由で
			]);

			reports = reportsRes.data || [];
			users = usersRes.data || [];
		} catch (e) {
			console.error('Failed to load reports:', e);
			error = e instanceof Error ? e.message : 'データの読み込みに失敗しました。';
		} finally {
			isLoading = false;
		}
	}

	function handleFilterChange() {
		// selectedUserIdが空文字の場合は全ユーザーを意味する（URLパラメータから削除）
		// selectedDateが空文字の場合は全期間を意味する（URLパラメータから削除）
		const params = new URLSearchParams();
		if (selectedUserId) params.set('userId', selectedUserId);
		if (selectedDate) params.set('date', selectedDate);

		// URLを更新してデータを再取得
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
		loadData();
	}

	function getSatisfactionLabel(level: number) {
		const map: Record<number, { label: string; class: string }> = {
			1: { label: '全く駄目', class: 'badge-red' },
			2: { label: '駄目', class: 'badge-orange' },
			3: { label: '普通', class: 'badge-gray' },
			4: { label: '良い', class: 'badge-blue' },
			5: { label: '最高', class: 'badge-green' }
		};
		return map[level] || { label: '-', class: 'badge-gray' };
	}

	function formatDate(dateStr: string) {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString('ja-JP', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			weekday: 'short'
		});
	}

	// 0-100の値を0-5に変換する（もし既に5以下ならそのまま）
	function normalizeScore(score: number) {
		if (score == null) return '-';
		// 数値として扱えるか確認
		const val = Number(score);
		if (isNaN(val)) return '-';

		if (val > 5) {
			// 100点満点とみなして20で割る
			return (val / 20).toFixed(1);
		}
		return val;
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-journal-text"></i>
				日報一覧
			</h1>
			<p>自己評価とAI分析</p>
		</div>
	</header>
</div>

<section class="page">
	<div class="page-actions">
		<div class="filter-group">
			<select bind:value={selectedUserId} on:change={handleFilterChange} class="filter-select">
				<option value="">全ユーザー</option>
				{#each users as user}
					<option value={user.id}>{user.fullName || user.username}</option>
				{/each}
			</select>

			<input
				type="date"
				bind:value={selectedDate}
				on:change={handleFilterChange}
				class="filter-date"
			/>
		</div>
	</div>

	{#if isLoading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>読み込み中です…</p>
		</div>
	{:else if error}
		<div class="error-banner">
			<p>エラーが発生しました: {error}</p>
		</div>
	{:else}
		<!-- Desktop View (Table) -->
		<div class="table-container desktop-only">
			<table class="data-table">
				<thead>
					<tr>
						<th>日付</th>
						<th>名前</th>
						<th>満足度</th>
						<th>集中 / 難易度</th>
						<th>サマリー</th>
						<th>AI活動分析</th>
						<th>AIステータス</th>
					</tr>
				</thead>
				<tbody>
					{#each reports as report}
						{@const satisfaction = getSatisfactionLabel(report.satisfaction_level)}
						<tr>
							<td class="col-date">
								{formatDate(report.report_date)}
							</td>
							<td class="col-name">
								{report.member_name}
							</td>
							<td class="col-satisfaction">
								<span class={`badge ${satisfaction.class}`}>
									{satisfaction.label} <small>({report.satisfaction_level})</small>
								</span>
							</td>
							<td class="col-metrics">
								<div class="metric">
									集中: <strong>{normalizeScore(report.focus_level)}</strong>/5
								</div>
								<div class="metric">
									難易度: <strong>{normalizeScore(report.difficulty_level)}</strong>/5
								</div>
							</td>
							<td class="col-summary" title={report.summary}>
								{report.summary}
							</td>
							<td class="col-ai-summary" title={report.ai_work_summary}>
								{#if report.ai_work_summary}
									<div class="ai-summary-content">
										<i class="bi bi-robot"></i>
										<span class="ai-text">{report.ai_work_summary}</span>
									</div>
								{:else}
									<span class="text-muted">-</span>
								{/if}
							</td>
							<td class="col-status">
								{#if report.ai_generated}
									<span class="badge badge-green-light">AI生成済</span>
								{:else}
									<span class="badge badge-gray-light">手動</span>
								{/if}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="7" class="empty-message"> 日報データが見つかりません </td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Mobile View (Cards) -->
		<div class="mobile-list mobile-only">
			{#each reports as report}
				{@const satisfaction = getSatisfactionLabel(report.satisfaction_level)}
				<div class="report-card">
					<div class="card-header">
						<div class="card-user">
							<span class="user-name">{report.member_name}</span>
							<span class="report-date">{formatDate(report.report_date)}</span>
						</div>
						<div class="card-status">
							{#if report.ai_generated}
								<span class="badge badge-green-light">AI生成</span>
							{/if}
						</div>
					</div>

					<div class="card-body">
						<div class="metric-row">
							<div class="card-metric">
								<span class="label">満足度</span>
								<span class={`badge ${satisfaction.class}`}>
									{satisfaction.label} ({report.satisfaction_level})
								</span>
							</div>
						</div>
						<div class="metric-row grid-2">
							<div class="card-metric">
								<span class="label">集中</span>
								<strong class="value">{normalizeScore(report.focus_level)}<small>/5</small></strong>
							</div>
							<div class="card-metric">
								<span class="label">難易度</span>
								<strong class="value"
									>{normalizeScore(report.difficulty_level)}<small>/5</small></strong
								>
							</div>
						</div>

						<div class="card-summary">
							<span class="label">サマリー</span>
							<p>{report.summary || 'サマリーなし'}</p>
						</div>

						{#if report.ai_work_summary}
							<div class="card-summary ai-summary">
								<span class="label"><i class="bi bi-robot"></i> AI活動分析</span>
								<p class="ai-text">{report.ai_work_summary}</p>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<div class="empty-message">日報データが見つかりません</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	/* Base Page Layout */
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

	/* Page Actions & Filters */
	.page-actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 24px;
	}

	.filter-group {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.filter-select,
	.filter-date {
		padding: 8px 12px;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		font-size: 14px;
		color: #475569;
		background-color: #fff;
		cursor: pointer;
		transition: border-color 0.2s;
	}

	.filter-select:hover,
	.filter-date:hover {
		border-color: #cbd5e1;
	}

	.filter-select:focus,
	.filter-date:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	/* Table Styles */
	.table-container {
		background: #fff;
		border-radius: 12px;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06);
		overflow: hidden;
		overflow-x: auto;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
		min-width: 800px; /* Ensure table doesn't collapse too much on small screens */
	}

	.data-table th {
		background-color: #f8fafc;
		padding: 16px 24px;
		text-align: left;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		color: #64748b;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	.data-table td {
		padding: 16px 24px;
		border-bottom: 1px solid #f1f5f9;
		font-size: 14px;
		color: #334155;
		vertical-align: middle;
	}

	.data-table tbody tr:hover {
		background-color: #f8fafc;
	}

	/* Column Specifics */
	.col-date {
		white-space: nowrap;
		font-feature-settings: 'tnum';
		font-variant-numeric: tabular-nums;
	}

	.col-name {
		font-weight: 500;
		color: #0f172a;
	}

	.col-metrics {
		font-size: 13px;
		color: #64748b;
	}

	.metric strong {
		color: #334155;
		font-weight: 600;
	}

	.col-summary {
		max-width: 300px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: #475569;
	}

	/* AI Summary Column */
	.col-ai-summary {
		max-width: 250px;
		vertical-align: top;
	}

	.ai-summary-content {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 6px;
		padding: 8px;
		font-size: 12px;
		color: #166534;
		line-height: 1.4;
		max-height: 80px;
		overflow-y: auto;
	}

	.ai-summary-content i {
		font-size: 14px;
		color: #15803d;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.ai-text {
		white-space: pre-wrap;
	}

	/* Card AI Summary */
	.card-summary.ai-summary {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		margin-top: 8px;
	}

	.card-summary.ai-summary .label {
		color: #15803d;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.card-summary.ai-summary .label i {
		font-size: 14px;
	}

	/* Badges */
	.badge {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 500;
		gap: 4px;
		white-space: nowrap;
	}

	.badge small {
		font-size: 10px;
		opacity: 0.8;
	}

	.badge-red {
		background-color: #fee2e2;
		color: #dc2626;
	}

	.badge-orange {
		background-color: #ffedd5;
		color: #c2410c;
	}

	.badge-gray {
		background-color: #f1f5f9;
		color: #475569;
	}

	.badge-blue {
		background-color: #dbeafe;
		color: #2563eb;
	}

	.badge-green {
		background-color: #dcfce7;
		color: #16a34a;
	}

	.badge-green-light {
		background-color: #f0fdf4;
		color: #15803d;
		border: 1px solid #bbf7d0;
	}

	.badge-gray-light {
		background-color: #f8fafc;
		color: #94a3b8;
		border: 1px solid #e2e8f0;
	}

	/* States */
	.empty-message {
		text-align: center;
		padding: 48px;
		color: #94a3b8;
		background-color: white;
		border-radius: 12px;
	}

	.error-banner {
		padding: 16px;
		background-color: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #991b1b;
		margin-bottom: 24px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 48px;
		color: #64748b;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #e2e8f0;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 12px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Card Styles for Mobile */
	.mobile-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.report-card {
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}

	.card-user {
		display: flex;
		flex-direction: column;
	}

	.user-name {
		font-weight: 600;
		color: #0f172a;
		font-size: 16px;
	}

	.report-date {
		font-size: 13px;
		color: #64748b;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.metric-row {
		display: flex;
		gap: 16px;
		align-items: center;
	}

	.metric-row.grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}

	.card-metric {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.card-metric .label {
		font-size: 11px;
		color: #64748b;
		text-transform: uppercase;
		font-weight: 600;
	}

	.card-metric .value {
		font-size: 15px;
		color: #334155;
		font-weight: 600;
	}

	.card-summary {
		background: #f8fafc;
		border-radius: 8px;
		padding: 12px;
	}

	.card-summary .label {
		font-size: 11px;
		color: #64748b;
		text-transform: uppercase;
		font-weight: 600;
		display: block;
		margin-bottom: 4px;
	}

	.card-summary p {
		margin: 0;
		font-size: 14px;
		color: #334155;
		line-height: 1.5;
	}

	/* Visibility Toggles */
	.mobile-only {
		display: none;
	}

	.desktop-only {
		display: block;
	}

	/* Mobile/Tablet Styles (<960px) */
	@media (max-width: 960px) {
		.page-header-wrapper {
			display: block;
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

		.page {
			padding: 16px;
		}

		.page-actions {
			justify-content: stretch;
		}

		.filter-group {
			flex-direction: column;
			width: 100%;
			align-items: stretch;
		}

		/* Toggle views */
		.desktop-only {
			display: none;
		}

		.mobile-only {
			display: flex;
		}
	}
</style>
