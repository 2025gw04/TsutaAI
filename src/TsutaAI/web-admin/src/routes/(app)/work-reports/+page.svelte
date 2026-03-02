<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';

	// 型定義
	interface DailyReport {
		report_id: number;
		user_id: number;
		report_date: string;
		summary: string;
		satisfaction_level: number;
		achievement_rate: number;
		focus_level: number;
		difficulty_level: number;
		learning_level: number;
		comment: string;
		ai_generated: number;
		created_at: string;
		user_name?: string;
	}

	interface WorkLog {
		log_id: number;
		user_id: number;
		task_id: number;
		start_time: string;
		end_time: string;
		duration_minutes: number;
		activity_type: string;
		notes: string;
		created_at: string;
		user_name?: string;
		task_name?: string;
	}

	interface User {
		id: number;
		username: string;
		fullName: string;
		role: string;
	}

	// 状態管理
	let users: User[] = [];
	let dailyReports: DailyReport[] = [];
	let workLogs: WorkLog[] = [];
	let filteredReports: DailyReport[] = [];
	let filteredWorkLogs: WorkLog[] = [];

	let selectedUserId: number | null = null;
	let selectedDate: string = '';
	let viewMode: 'reports' | 'worklogs' | 'both' = 'both';
	let isLoading = false;
	let error = '';

	// 詳細表示モーダル
	let selectedReport: DailyReport | null = null;
	let selectedWorkLog: WorkLog | null = null;
	let showReportModal = false;
	let showWorkLogModal = false;

	// データ取得
	onMount(async () => {
		await loadUsers();
		await loadData();
	});

	async function loadUsers() {
		try {
			const response = await apiClient.fetchUsers();
			users = response.data;
		} catch (e: any) {
			console.error('Failed to load users:', e);
			error = 'ユーザー情報の取得に失敗しました: ' + e.message;
		}
	}

	async function loadData() {
		isLoading = true;
		error = '';

		try {
			// 日報取得
			const reportsResponse = await apiClient.get<any[]>('/reports');
			dailyReports = reportsResponse.data.map((report: any) => ({
				...report,
				user_name: report.member_name || '不明'
			}));

			// 作業ログ取得
			const workLogsResponse = await apiClient.get<WorkLog[]>('/worklogs');
			workLogs = workLogsResponse.data;

			// 作業ログのユーザー名を追加
			workLogs = workLogs.map((log) => ({
				...log,
				user_name: users.find((u) => u.id === log.user_id)?.fullName || '不明'
			}));

			applyFilters();
		} catch (e: any) {
			error = 'データの取得に失敗しました: ' + e.message;
		} finally {
			isLoading = false;
		}
	}

	function applyFilters() {
		// 日報フィルタ
		filteredReports = dailyReports.filter((report) => {
			if (selectedUserId && report.user_id !== selectedUserId) return false;
			if (selectedDate && report.report_date !== selectedDate) return false;
			return true;
		});

		// 作業ログフィルタ
		filteredWorkLogs = workLogs.filter((log) => {
			if (selectedUserId && log.user_id !== selectedUserId) return false;
			if (selectedDate) {
				const logDate = log.start_time.slice(0, 10);
				if (logDate !== selectedDate) return false;
			}
			return true;
		});

		// 日付でソート（新しい順）
		filteredReports.sort((a, b) => b.report_date.localeCompare(a.report_date));
		filteredWorkLogs.sort((a, b) => b.start_time.localeCompare(a.start_time));
	}

	function handleFilterChange() {
		applyFilters();
	}

	function clearFilters() {
		selectedUserId = null;
		selectedDate = '';
		applyFilters();
	}

	function openReportModal(report: DailyReport) {
		selectedReport = report;
		showReportModal = true;
	}

	function closeReportModal() {
		showReportModal = false;
		selectedReport = null;
	}

	function openWorkLogModal(log: WorkLog) {
		selectedWorkLog = log;
		showWorkLogModal = true;
	}

	function closeWorkLogModal() {
		showWorkLogModal = false;
		selectedWorkLog = null;
	}

	function formatDateTime(datetime: string): string {
		if (!datetime) return '-';
		return new Date(datetime).toLocaleString('ja-JP');
	}

	function formatDate(date: string): string {
		if (!date) return '-';
		return new Date(date).toLocaleDateString('ja-JP');
	}

	function formatDuration(minutes: number): string {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return `${hours}時間${mins}分`;
	}

	function getMoodEmoji(level: number): string {
		if (level >= 4) return '😊';
		if (level >= 3) return '😐';
		return '😞';
	}

	function getActivityTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			coding: 'コーディング',
			meeting: '会議',
			review: 'レビュー',
			planning: '計画',
			testing: 'テスト',
			documentation: 'ドキュメント作成',
			research: '調査',
			other: 'その他'
		};
		return labels[type] || type;
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-clipboard-data"></i>
				作業報告
			</h1>
			<p>日報と作業ログ</p>
		</div>
	</header>
</div>

<div class="work-reports-page">
	{#if error}
		<div class="alert alert-danger">{error}</div>
	{/if}

	<!-- フィルタパネル -->
	<div class="filter-panel card mb-4">
		<div class="card-body">
			<div class="row g-3">
				<div class="col-md-3">
					<label class="form-label">メンバー</label>
					<select class="form-select" bind:value={selectedUserId} on:change={handleFilterChange}>
						<option value={null}>すべてのメンバー</option>
						{#each users as user}
							<option value={user.id}>{user.fullName}</option>
						{/each}
					</select>
				</div>

				<div class="col-md-3">
					<label class="form-label">日付</label>
					<input
						type="date"
						class="form-control"
						bind:value={selectedDate}
						on:change={handleFilterChange}
					/>
				</div>

				<div class="col-md-3">
					<label class="form-label">表示モード</label>
					<select class="form-select" bind:value={viewMode}>
						<option value="both">日報 + 作業ログ</option>
						<option value="reports">日報のみ</option>
						<option value="worklogs">作業ログのみ</option>
					</select>
				</div>

				<div class="col-md-3 d-flex align-items-end">
					<button class="btn btn-secondary w-100" on:click={clearFilters}>
						フィルタをクリア
					</button>
				</div>
			</div>
		</div>
	</div>

	{#if isLoading}
		<div class="text-center py-5">
			<div class="spinner-border text-primary" role="status">
				<span class="visually-hidden">読み込み中...</span>
			</div>
			<p class="mt-2">データを読み込んでいます...</p>
		</div>
	{:else}
		<div class="row">
			<!-- 日報セクション -->
			{#if viewMode === 'reports' || viewMode === 'both'}
				<div class="col-lg-{viewMode === 'both' ? '6' : '12'}">
					<div class="card">
						<div class="card-header bg-primary text-white">
							<h5 class="mb-0">📝 日報 ({filteredReports.length}件)</h5>
						</div>
						<div class="card-body p-0">
							{#if filteredReports.length === 0}
								<div class="text-center py-5 text-muted">
									<p>該当する日報がありません</p>
								</div>
							{:else}
								<div class="table-responsive">
									<table class="table table-hover mb-0">
										<thead class="table-light">
											<tr>
												<th>日付</th>
												<th>メンバー</th>
												<th>満足度</th>
												<th>達成率</th>
												<th>操作</th>
											</tr>
										</thead>
										<tbody>
											{#each filteredReports as report}
												<tr>
													<td data-label="日付">{formatDate(report.report_date)}</td>
													<td data-label="メンバー">{report.user_name}</td>
													<td data-label="満足度">
														<span class="badge bg-info">
															{getMoodEmoji(report.satisfaction_level)}
															{report.satisfaction_level}/5
														</span>
													</td>
													<td data-label="達成率">
														<div class="progress" style="height: 20px;">
															<div
																class="progress-bar bg-success"
																role="progressbar"
																style="width: {report.achievement_rate}%"
																aria-valuenow={report.achievement_rate}
																aria-valuemin="0"
																aria-valuemax="100"
															>
																{report.achievement_rate}%
															</div>
														</div>
													</td>
													<td data-label="操作">
														<button
															class="btn btn-sm btn-outline-primary"
															on:click={() => openReportModal(report)}
														>
															詳細
														</button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- 作業ログセクション -->
			{#if viewMode === 'worklogs' || viewMode === 'both'}
				<div class="col-lg-{viewMode === 'both' ? '6' : '12'}">
					<div class="card">
						<div class="card-header bg-success text-white">
							<h5 class="mb-0">⏱️ 作業ログ ({filteredWorkLogs.length}件)</h5>
						</div>
						<div class="card-body p-0">
							{#if filteredWorkLogs.length === 0}
								<div class="text-center py-5 text-muted">
									<p>該当する作業ログがありません</p>
								</div>
							{:else}
								<div class="table-responsive">
									<table class="table table-hover mb-0">
										<thead class="table-light">
											<tr>
												<th>開始時刻</th>
												<th>メンバー</th>
												<th>作業時間</th>
												<th>活動種別</th>
												<th>操作</th>
											</tr>
										</thead>
										<tbody>
											{#each filteredWorkLogs as log}
												<tr>
													<td data-label="開始時刻">{formatDateTime(log.start_time)}</td>
													<td data-label="メンバー">{log.user_name}</td>
													<td data-label="作業時間">
														<span class="badge bg-secondary">
															{formatDuration(log.duration_minutes)}
														</span>
													</td>
													<td data-label="活動種別">
														<span class="badge bg-primary">
															{getActivityTypeLabel(log.activity_type)}
														</span>
													</td>
													<td data-label="操作">
														<button
															class="btn btn-sm btn-outline-success"
															on:click={() => openWorkLogModal(log)}
														>
															詳細
														</button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- 日報詳細モーダル -->
{#if showReportModal && selectedReport}
	<div class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
		<div class="modal-dialog modal-lg">
			<div class="modal-content">
				<div class="modal-header bg-primary text-white">
					<h5 class="modal-title">📝 日報詳細</h5>
					<button type="button" class="btn-close btn-close-white" on:click={closeReportModal}
					></button>
				</div>
				<div class="modal-body">
					<div class="row mb-3">
						<div class="col-md-6">
							<strong>日付:</strong>
							{formatDate(selectedReport.report_date)}
						</div>
						<div class="col-md-6">
							<strong>メンバー:</strong>
							{selectedReport.user_name}
						</div>
					</div>

					<div class="row mb-3">
						<div class="col-md-3">
							<strong>満足度:</strong><br />
							<span class="badge bg-info fs-6">
								{getMoodEmoji(selectedReport.satisfaction_level)}
								{selectedReport.satisfaction_level}/5
							</span>
						</div>
						<div class="col-md-3">
							<strong>達成率:</strong><br />
							<span class="badge bg-success fs-6">{selectedReport.achievement_rate}%</span>
						</div>
						<div class="col-md-3">
							<strong>集中度:</strong><br />
							<span class="badge bg-warning fs-6">{selectedReport.focus_level}%</span>
						</div>
						<div class="col-md-3">
							<strong>難易度:</strong><br />
							<span class="badge bg-danger fs-6">{selectedReport.difficulty_level}%</span>
						</div>
					</div>

					<div class="mb-3">
						<strong>学習度:</strong>
						<div class="progress" style="height: 25px;">
							<div
								class="progress-bar bg-info"
								role="progressbar"
								style="width: {selectedReport.learning_level}%"
							>
								{selectedReport.learning_level}%
							</div>
						</div>
					</div>

					<div class="mb-3">
						<strong>要約:</strong>
						<div class="alert alert-light">{selectedReport.summary}</div>
					</div>

					{#if selectedReport.comment}
						<div class="mb-3">
							<strong>コメント:</strong>
							<div class="alert alert-secondary">{selectedReport.comment}</div>
						</div>
					{/if}

					<div class="text-muted small">
						{#if selectedReport.ai_generated}
							<span class="badge bg-warning">AI生成</span>
						{/if}
						作成日時: {formatDateTime(selectedReport.created_at)}
					</div>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary" on:click={closeReportModal}>閉じる</button
					>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- 作業ログ詳細モーダル -->
{#if showWorkLogModal && selectedWorkLog}
	<div class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
		<div class="modal-dialog modal-lg">
			<div class="modal-content">
				<div class="modal-header bg-success text-white">
					<h5 class="modal-title">⏱️ 作業ログ詳細</h5>
					<button type="button" class="btn-close btn-close-white" on:click={closeWorkLogModal}
					></button>
				</div>
				<div class="modal-body">
					<div class="row mb-3">
						<div class="col-md-6">
							<strong>メンバー:</strong>
							{selectedWorkLog.user_name}
						</div>
						<div class="col-md-6">
							<strong>活動種別:</strong>
							<span class="badge bg-primary"
								>{getActivityTypeLabel(selectedWorkLog.activity_type)}</span
							>
						</div>
					</div>

					<div class="row mb-3">
						<div class="col-md-6">
							<strong>開始時刻:</strong><br />
							{formatDateTime(selectedWorkLog.start_time)}
						</div>
						<div class="col-md-6">
							<strong>終了時刻:</strong><br />
							{formatDateTime(selectedWorkLog.end_time)}
						</div>
					</div>

					<div class="mb-3">
						<strong>作業時間:</strong>
						<div class="alert alert-info">
							<h4>{formatDuration(selectedWorkLog.duration_minutes)}</h4>
						</div>
					</div>

					{#if selectedWorkLog.notes}
						<div class="mb-3">
							<strong>メモ:</strong>
							<div class="alert alert-light">{selectedWorkLog.notes}</div>
						</div>
					{/if}

					<div class="text-muted small">
						作成日時: {formatDateTime(selectedWorkLog.created_at)}
					</div>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary" on:click={closeWorkLogModal}
						>閉じる</button
					>
				</div>
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

		.work-reports-page {
			padding: 16px;
		}
	}

	.work-reports-page {
		padding: 2rem;
	}

	.filter-panel {
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.table th {
		font-weight: 600;
		white-space: nowrap;
	}

	.table td {
		vertical-align: middle;
	}

	.card {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		margin-bottom: 1.5rem;
	}

	.card-header h5 {
		margin: 0;
	}

	.modal.show {
		display: block;
	}

	.progress {
		background-color: #e9ecef;
	}

	.text-truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 768px) {
		.work-reports-page {
			padding: 1rem;
		}

		.table-responsive {
			font-size: 0.875rem;
		}

		/* テーブルをカードレイアウトに変換 */
		.table thead {
			display: none;
		}

		.table,
		.table tbody,
		.table tr,
		.table td {
			display: block;
			width: 100%;
		}

		.table tr {
			margin-bottom: 1rem;
			border: 1px solid #dee2e6;
			border-radius: 8px;
			padding: 0.75rem;
			background: #f8f9fa;
		}

		.table td {
			text-align: left;
			padding: 0.5rem 0;
			border: none;
			position: relative;
			padding-left: 50%;
		}

		.table td::before {
			content: attr(data-label);
			position: absolute;
			left: 0;
			width: 45%;
			padding-right: 10px;
			font-weight: 600;
			text-align: left;
		}

		.table td:last-child {
			border-bottom: none;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.work-reports-page {
			padding: 12px;
		}

		.filter-panel .card-body {
			padding: 14px;
		}

		.filter-panel .row {
			gap: 12px;
		}

		.filter-panel .col-md-3 {
			width: 100%;
			padding: 0;
		}

		.form-label {
			font-size: 13px;
			font-weight: 600;
			margin-bottom: 6px;
		}

		.form-select,
		.form-control {
			padding: 10px 12px;
			font-size: 14px;
			min-height: 44px;
		}

		.btn {
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
		}

		.card {
			margin-bottom: 16px;
			border-radius: 12px;
		}

		.card-header h5 {
			font-size: 16px;
		}

		.table tr {
			padding: 12px;
			margin-bottom: 12px;
			border-radius: 10px;
		}

		.table td {
			padding: 8px 0;
			padding-left: 50%;
			font-size: 13px;
		}

		.table td::before {
			font-size: 12px;
		}

		.badge {
			padding: 6px 10px;
			font-size: 12px;
		}

		.btn-sm {
			padding: 8px 14px;
			font-size: 13px;
			min-height: 40px;
		}

		.modal-dialog {
			margin: 0;
			max-width: 100%;
			height: 100%;
		}

		.modal-content {
			height: 100%;
			border-radius: 0;
		}

		.modal-header {
			padding: 14px 16px;
		}

		.modal-title {
			font-size: 18px;
		}

		.modal-body {
			padding: 16px;
			overflow-y: auto;
		}

		.modal-body .row {
			margin-bottom: 12px;
		}

		.modal-body strong {
			font-size: 13px;
		}

		.modal-body .alert {
			padding: 10px;
			font-size: 13px;
			margin-bottom: 12px;
		}

		.modal-footer {
			padding: 12px 16px;
		}

		.modal-footer .btn {
			min-width: 100px;
		}

		.progress {
			height: 24px;
			border-radius: 12px;
		}

		.progress-bar {
			font-size: 12px;
		}

		.text-center.py-5 {
			padding: 40px 20px !important;
		}

		.spinner-border {
			width: 3rem;
			height: 3rem;
		}
	}
</style>
