<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';

	interface Alert {
		id: number;
		projectId: number | null;
		projectName: string;
		severity: 'high' | 'medium' | 'low';
		type: 'risk' | 'suggestion' | 'warning';
		isRead: boolean;
		title: string | null;
		message: string;
		details: string | null;
		relatedTaskId: number | null;
		taskTitle: string | null;
		createdAt: string;
	}

	interface RefreshStats {
		mode: 'incremental' | 'forced';
		totalProjects: number;
		changedProjectsCount: number;
		newAlertsCount: number;
		updatedAlertsCount: number;
		resolvedAlertsCount: number;
		noChangesDetected?: boolean;
		processedProjects: number;
		skippedProjects: number;
	}

	/** プロジェクト一覧 */
	let projects: any[] = [];

	/** 生成されたアラート */
	let alerts: Alert[] = [];

	/** ロード中フラグ */
	let isLoading = true;

	/** AI更新中フラグ */
	let isRefreshing = false;

	/** エラーメッセージ */
	let errorMessage = '';
	let lastRefreshSummary = '';

	/** フィルター: 重要度 */
	let filterSeverity: string = '';

	/** フィルター: 種類 */
	let filterType: string = '';

	/** フィルター: 既読/未読 */
	let filterReadStatus: string = '';

	/** 選択中のアラート（詳細表示用） */
	let selectedAlert: Alert | null = null;

	/** 詳細モーダル表示フラグ */
	let showDetailModal = false;

	onMount(async () => {
		await loadData();
	});

	/** 初期データを読み込む */
	async function loadData() {
		isLoading = true;
		errorMessage = '';
		try {
			await Promise.all([loadProjects(), loadAlertsFromDB()]);
		} finally {
			isLoading = false;
		}
	}

	/** DBからアラートを読み込む */
	async function loadAlertsFromDB() {
		try {
			const filters: any = {};
			if (filterSeverity) filters.severity = filterSeverity;
			if (filterType) filters.type = filterType;
			if (filterReadStatus === 'unread') filters.isRead = false;
			if (filterReadStatus === 'read') filters.isRead = true;

			const response = await apiClient.fetchAllAlerts(filters);
			if (response.success && response.data) {
				alerts = response.data.map((a: any) => ({
					id: a.id,
					projectId: a.projectId,
					projectName: a.projectName || getProjectName(a.projectId),
					severity: a.severity,
					type: a.type || 'warning',
					isRead: a.isRead || false,
					title: a.title,
					message: a.message,
					details: a.details,
					relatedTaskId: a.relatedTaskId,
					taskTitle: a.taskTitle,
					createdAt: a.createdAt
				}));
			}
		} catch (error) {
			console.error('アラートの読み込みに失敗しました:', error);
		}
	}

	/** プロジェクト一覧を取得 */
	async function loadProjects() {
		try {
			const projectsResponse = await apiClient.fetchProjects();
			if (projectsResponse.success && projectsResponse.data) {
				projects = projectsResponse.data;
			} else {
				errorMessage = 'プロジェクト一覧の取得に失敗しました。';
			}
		} catch (error) {
			const errorMsg =
				error instanceof Error ? error.message : 'プロジェクト一覧の取得に失敗しました。';
			if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Network')) {
				errorMessage =
					'バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。';
			} else {
				errorMessage = errorMsg;
			}
		}
	}

	/** プロジェクトIDから名前を取得 */
	function getProjectName(id: number | string | null): string {
		if (!id) return '全般';
		const project = projects.find((p) => p.id === Number(id));
		return project ? project.name : `Project ${id}`;
	}

	/** フィルター変更時にアラートを再読み込み */
	async function onFilterChange() {
		await loadAlertsFromDB();
	}

	/** フィルターをリセット */
	async function resetFilters() {
		filterSeverity = '';
		filterType = '';
		filterReadStatus = '';
		await loadAlertsFromDB();
	}

	/** アラートを既読/未読に切り替え */
	async function toggleReadStatus(alert: Alert, event: Event) {
		event.stopPropagation();
		try {
			await apiClient.markAlertAsRead(alert.id, !alert.isRead);
			alert.isRead = !alert.isRead;
			alerts = [...alerts]; // 再レンダリング
		} catch (error) {
			console.error('既読状態の更新に失敗しました:', error);
		}
	}

	/** 全てのアラートを既読にする */
	async function markAllAsRead() {
		try {
			await apiClient.markAllAlertsAsRead();
			alerts = alerts.map((a) => ({ ...a, isRead: true }));
		} catch (error) {
			console.error('全既読に失敗しました:', error);
		}
	}

	/** アラート詳細を表示 */
	async function showAlertDetail(alert: Alert) {
		selectedAlert = alert;
		showDetailModal = true;

		// 未読なら既読にする
		if (!alert.isRead) {
			try {
				await apiClient.markAlertAsRead(alert.id, true);
				alert.isRead = true;
				alerts = [...alerts];
			} catch (error) {
				console.error('既読状態の更新に失敗しました:', error);
			}
		}
	}

	/** 詳細モーダルを閉じる */
	function closeDetailModal() {
		showDetailModal = false;
		selectedAlert = null;
	}

	/** 関連タスクへ遷移 */
	function goToTask(alert: Alert) {
		closeDetailModal();
		if (alert.projectId) {
			goto(`/projects/${alert.projectId}/wbs?task=${alert.relatedTaskId}`);
			return;
		}
		goto('/projects');
	}

	/** 重要度のラベルを取得 */
	function getSeverityLabel(severity: string): string {
		switch (severity) {
			case 'high':
				return '高';
			case 'medium':
				return '中';
			case 'low':
				return '低';
			default:
				return severity;
		}
	}

	/** 種類のラベルを取得 */
	function getTypeLabel(type: string): string {
		switch (type) {
			case 'risk':
				return 'リスク';
			case 'suggestion':
				return '提案';
			case 'warning':
				return '警告';
			default:
				return type;
		}
	}

	/** 種類のアイコンを取得 */
	function getTypeIcon(type: string): string {
		switch (type) {
			case 'risk':
				return 'bi-exclamation-triangle-fill';
			case 'suggestion':
				return 'bi-lightbulb-fill';
			case 'warning':
				return 'bi-bell-fill';
			default:
				return 'bi-info-circle-fill';
		}
	}

	/** 日時をフォーマット */
	function formatDateTime(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString('ja-JP', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/** 未読件数を取得 */
	$: unreadCount = alerts.filter((a) => !a.isRead).length;

	/** AIで更新（改善版：差分更新） */
	async function refreshWithAI() {
		if (projects.length === 0) {
			alert('プロジェクトデータがありません。');
			return;
		}

		try {
			const initialStats = await runRefresh(false);
			const initialSummary = formatRefreshSummary(initialStats);
			lastRefreshSummary = initialSummary;

			if (isNoChangeRefresh(initialStats)) {
				const shouldForceRefresh = window.confirm(
					`差分更新では変更がありませんでした。\n\n${initialSummary}\n\n強制更新を実行しますか？`
				);
				if (shouldForceRefresh) {
					const forcedStats = await runRefresh(true);
					lastRefreshSummary = formatRefreshSummary(forcedStats);
					alert(`✅ 強制更新を実行しました\n${lastRefreshSummary}`);
					return;
				}
				alert(`ℹ️ 差分更新を実行しました\n${initialSummary}`);
				return;
			}

			alert(`✅ 差分更新を実行しました\n${initialSummary}`);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'AIアラートの更新に失敗しました。';
			errorMessage = errorMsg;
			console.error('AI更新エラー:', error);
			alert(`❌ エラー: ${errorMsg}`);
		} finally {
			isRefreshing = false;
		}
	}

	/** 明示的に強制更新を実行 */
	async function forceRefreshWithAI() {
		if (projects.length === 0) {
			alert('プロジェクトデータがありません。');
			return;
		}

		const shouldRun = window.confirm(
			'強制更新では変更差分に関係なく全プロジェクトを再分析します。実行しますか？'
		);
		if (!shouldRun) return;

		try {
			const stats = await runRefresh(true);
			lastRefreshSummary = formatRefreshSummary(stats);
			alert(`✅ 強制更新を実行しました\n${lastRefreshSummary}`);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'AIアラートの強制更新に失敗しました。';
			errorMessage = errorMsg;
			console.error('AI強制更新エラー:', error);
			alert(`❌ エラー: ${errorMsg}`);
		}
	}

	async function runRefresh(forceFullRefresh: boolean): Promise<RefreshStats> {
		isRefreshing = true;
		errorMessage = '';
		try {
			const response = await apiClient.refreshAlerts({ forceFullRefresh });
			if (!response.success || !response.data) {
				throw new Error('アラート更新の応答が不正です。');
			}
			await loadAlertsFromDB();
			return response.data as RefreshStats;
		} finally {
			isRefreshing = false;
		}
	}

	function isNoChangeRefresh(stats: RefreshStats): boolean {
		return Boolean(
			stats.noChangesDetected ??
				(stats.newAlertsCount === 0 &&
					stats.updatedAlertsCount === 0 &&
					stats.resolvedAlertsCount === 0)
		);
	}

	function formatRefreshSummary(stats: RefreshStats): string {
		const modeLabel = stats.mode === 'forced' ? '強制更新' : '差分更新';
		const changedCount = stats.changedProjectsCount ?? 0;
		const totalProjects = stats.totalProjects ?? 0;
		return `${modeLabel} | 変更対象 ${changedCount}/${totalProjects}件 | 新規 ${stats.newAlertsCount}件 / 更新 ${stats.updatedAlertsCount}件 / 解決 ${stats.resolvedAlertsCount}件 / スキップ ${stats.skippedProjects}件`;
	}

	/** プロジェクトデータからアラートを生成 (ルールベース) */
	function generateAlertsFromProjects(projects: any[]): any[] {
		const newAlerts: any[] = [];
		const today = new Date();

		for (const project of projects) {
			// ステータスに基づくアラート
			if (project.status === 'at-risk' || project.status === 'on-hold') {
				newAlerts.push({
					projectId: project.id,
					projectName: project.name || 'プロジェクト',
					severity: 'high',
					type: 'risk',
					title: 'プロジェクトステータス警告',
					message: `プロジェクトが「${project.status}」状態です。早急な対応が必要です。`,
					details: `プロジェクト「${project.name}」は現在、${project.status === 'at-risk' ? 'リスク状態' : '保留状態'}にあります。プロジェクトマネージャーに連絡し、状況を確認してください。`
				});
			}

			// 終了日が近づいているプロジェクト
			if (project.endDate) {
				const endDate = new Date(project.endDate);
				const daysRemaining = Math.floor(
					(endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
				);

				if (daysRemaining < 0) {
					newAlerts.push({
						projectId: project.id,
						projectName: project.name || 'プロジェクト',
						severity: 'high',
						type: 'warning',
						title: '期限超過',
						message: `プロジェクトの終了日（${project.endDate}）を過ぎています。`,
						details: `プロジェクト「${project.name}」は予定終了日を${Math.abs(daysRemaining)}日超過しています。スケジュールの見直しが必要です。`
					});
				} else if (daysRemaining <= 7) {
					newAlerts.push({
						projectId: project.id,
						projectName: project.name || 'プロジェクト',
						severity: daysRemaining <= 3 ? 'high' : 'medium',
						type: 'warning',
						title: '期限間近',
						message: `プロジェクトの終了日まで${daysRemaining}日です。早めに完了させましょう。`,
						details: `プロジェクト「${project.name}」の終了予定日は${project.endDate}です。残り${daysRemaining}日以内に完了できるよう、タスクの優先順位を確認してください。`
					});
				}
			}

			// 説明が空のプロジェクト
			if (!project.description || project.description.trim() === '') {
				newAlerts.push({
					projectId: project.id,
					projectName: project.name || 'プロジェクト',
					severity: 'low',
					type: 'suggestion',
					title: 'プロジェクト説明の追加推奨',
					message: 'プロジェクトの説明が未入力です。詳細情報を追加してください。',
					details: `プロジェクト「${project.name}」には説明が設定されていません。チームメンバーがプロジェクトの目的を理解しやすくするため、説明を追加することをお勧めします。`
				});
			}
		}

		return newAlerts;
	}
</script>

<div class="alerts-header-wrapper">
	<header class="alerts-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-exclamation-triangle"></i>
				AIアラートセンター
			</h1>
			<p>プロジェクトのリスク検知・管理</p>
		</div>
	</header>
</div>

<section class="alerts-page">
	<div class="alert-controls">
		<div class="page-actions">
			<div class="header-actions">
				{#if unreadCount > 0}
					<button type="button" class="btn-mark-all" on:click={markAllAsRead}>
						<i class="bi bi-check2-all"></i>
						全て既読
					</button>
				{/if}
				<button
					type="button"
					class="btn-refresh"
					on:click={refreshWithAI}
					disabled={isRefreshing || isLoading}
				>
					{#if isRefreshing}
						<span class="spinner"></span>
						AI更新中...
					{:else}
						<i class="bi bi-arrow-clockwise"></i>
						AIで更新
					{/if}
				</button>
				<button
					type="button"
					class="btn-mark-all"
					on:click={forceRefreshWithAI}
					disabled={isRefreshing || isLoading}
				>
					<i class="bi bi-lightning-charge"></i>
					強制更新
				</button>
			</div>
		</div>
		{#if lastRefreshSummary}
			<p class="refresh-summary">{lastRefreshSummary}</p>
		{/if}

		<!-- フィルターセクション -->
		<div class="filters">
			<div class="filter-group">
				<label for="filter-severity">重要度</label>
				<select id="filter-severity" bind:value={filterSeverity} on:change={onFilterChange}>
					<option value="">すべて</option>
					<option value="high">高</option>
					<option value="medium">中</option>
					<option value="low">低</option>
				</select>
			</div>

			<div class="filter-group">
				<label for="filter-type">種類</label>
				<select id="filter-type" bind:value={filterType} on:change={onFilterChange}>
					<option value="">すべて</option>
					<option value="risk">リスク</option>
					<option value="suggestion">提案</option>
					<option value="warning">警告</option>
				</select>
			</div>

			<div class="filter-group">
				<label for="filter-read">状態</label>
				<select id="filter-read" bind:value={filterReadStatus} on:change={onFilterChange}>
					<option value="">すべて</option>
					<option value="unread">未読</option>
					<option value="read">既読</option>
				</select>
			</div>

			{#if filterSeverity || filterType || filterReadStatus}
				<button type="button" class="btn-reset" on:click={resetFilters}>
					<i class="bi bi-x-lg"></i>
					リセット
				</button>
			{/if}
		</div>
	</div>

	{#if isLoading}
		<p class="state">プロジェクト情報を読み込み中です…</p>
	{:else if errorMessage}
		<p class="state error">{errorMessage}</p>
	{:else if alerts.length === 0}
		<p class="state">
			{#if filterSeverity || filterType || filterReadStatus}
				条件に一致するアラートがありません。
			{:else}
				重大なアラートは検出されていません。すべてのプロジェクトは正常です。
			{/if}
		</p>
	{:else}
		<ul class="alert-list">
			{#each alerts as alert (alert.id)}
				<li
					class="item severity-{alert.severity} type-{alert.type}"
					class:unread={!alert.isRead}
					on:click={() => showAlertDetail(alert)}
					on:keydown={(e) => e.key === 'Enter' && showAlertDetail(alert)}
					role="button"
					tabindex="0"
				>
					<div class="item-header">
						<div class="type-icon">
							<i class="bi {getTypeIcon(alert.type)}"></i>
						</div>
						<div class="item-info">
							<div class="item-title">
								{#if alert.title}
									<span class="title-text">{alert.title}</span>
								{:else}
									<span class="title-text"
										>{alert.message.slice(0, 25)}{alert.message.length > 25 ? '...' : ''}</span
									>
								{/if}
								{#if !alert.isRead}
									<span class="unread-badge">NEW</span>
								{/if}
							</div>
							<div class="meta">
								<span class="project-name">{alert.projectName}</span>
								<span class="separator">•</span>
								<span class="created-at">{formatDateTime(alert.createdAt)}</span>
							</div>
						</div>
						<div class="item-actions">
							<span class="tag severity-tag">{getSeverityLabel(alert.severity)}</span>
							<span class="tag type-tag">{getTypeLabel(alert.type)}</span>
							<button
								type="button"
								class="btn-read-toggle"
								on:click={(e) => toggleReadStatus(alert, e)}
								title={alert.isRead ? '未読にする' : '既読にする'}
							>
								<i class="bi {alert.isRead ? 'bi-envelope-open' : 'bi-envelope-fill'}"></i>
							</button>
						</div>
					</div>
					{#if !alert.title}
						<p class="item-message">{alert.message}</p>
					{/if}
					{#if alert.relatedTaskId}
						<div class="related-task">
							<i class="bi bi-link-45deg"></i>
							<span>関連タスク: {alert.taskTitle || `Task #${alert.relatedTaskId}`}</span>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<!-- 詳細モーダル -->
{#if showDetailModal && selectedAlert}
	<div
		class="modal-overlay"
		on:click={closeDetailModal}
		on:keydown={(e) => e.key === 'Escape' && closeDetailModal()}
		role="button"
		tabindex="0"
	>
		<div class="modal-window" on:click|stopPropagation role="dialog" aria-modal="true">
			<div class="modal-header">
				<div class="modal-title-section">
					<div class="type-icon type-icon-{selectedAlert.type}">
						<i class="bi {getTypeIcon(selectedAlert.type)}"></i>
					</div>
					<h2>{selectedAlert.title || 'アラート詳細'}</h2>
				</div>
				<button type="button" class="btn-close" on:click={closeDetailModal}>
					<i class="bi bi-x-lg"></i>
				</button>
			</div>

			<div class="modal-body">
				<div class="detail-meta">
					<div class="meta-item">
						<span class="meta-label">重要度</span>
						<span class="tag severity-tag severity-{selectedAlert.severity}"
							>{getSeverityLabel(selectedAlert.severity)}</span
						>
					</div>
					<div class="meta-item">
						<span class="meta-label">種類</span>
						<span class="tag type-tag type-{selectedAlert.type}"
							>{getTypeLabel(selectedAlert.type)}</span
						>
					</div>
					<div class="meta-item">
						<span class="meta-label">プロジェクト</span>
						<span>{selectedAlert.projectName}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">検知日時</span>
						<span>{formatDateTime(selectedAlert.createdAt)}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">状態</span>
						<span class="read-status">{selectedAlert.isRead ? '既読' : '未読'}</span>
					</div>
				</div>

				<div class="detail-section">
					<h3>概要</h3>
					<p>{selectedAlert.message}</p>
				</div>

				{#if selectedAlert.details}
					<div class="detail-section">
						<h3>詳細情報</h3>
						<p>{selectedAlert.details}</p>
					</div>
				{/if}

				{#if selectedAlert.relatedTaskId}
					<div class="detail-section">
						<h3>関連タスク</h3>
						<button
							type="button"
							class="btn-task-link"
							on:click={() => goToTask(selectedAlert!)}
						>
							<i class="bi bi-box-arrow-up-right"></i>
							{selectedAlert.taskTitle || `Task #${selectedAlert.relatedTaskId}`}
						</button>
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button type="button" class="btn-secondary" on:click={closeDetailModal}> 閉じる </button>
				{#if selectedAlert.relatedTaskId}
					<button
						type="button"
						class="btn-primary"
						on:click={() => goToTask(selectedAlert!)}
					>
						タスクを確認
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Main page layout */
	.alerts-header-wrapper {
		display: none; /* Hide on desktop */
		margin: 0;
		background: #f9fafb;
		color: #111827;
		padding: 0;
		box-shadow: none;
		height: 80px;
		width: 100%;
	}

	.alerts-header {
		width: 100%;
		margin: 0;
		padding: 0 24px;
		box-sizing: border-box;
		position: relative;
		height: 100%;
		display: flex;
		justify-content: flex-start;
		align-items: center; /* Vertically center */
	}

	.header-content h1 {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 24px;
		font-weight: 700;
		margin: 0;
		line-height: 1.2;
		letter-spacing: 0.05em;
	}

	.header-content p {
		font-size: 13px;
		color: #6b7280;
		margin: 8px 0 0 0;
		font-weight: 500;
	}

	/* Mobile/Tablet Header: Dark Theme (<960px) */
	@media (max-width: 960px) {
		.alerts-header-wrapper {
			display: block; /* Show on mobile */
			background: #1c2638;
			color: #ffffff;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
			border-bottom: none;
		}

		.header-content h1 {
			color: #ffffff;
		}

		.header-content p {
			color: rgba(255, 255, 255, 0.8);
		}
	}

	.alerts-page {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 24px;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
	}

	.alert-controls {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.refresh-summary {
		margin: 0;
		font-size: 13px;
		color: #4b5563;
	}

	.page-actions {
		display: flex;
		justify-content: flex-end; /* Ensure right alignment */
		margin-bottom: 0;
	}

	.header-actions {
		display: flex;
		gap: 12px;
	}

	.btn-mark-all {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border-radius: 12px;
		background: #ffffff;
		border: 1px solid #d1d5db; /* Stronger border */
		color: #1f2937; /* Darker text */
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.btn-mark-all:hover {
		background: #f9fafb;
		border-color: #9ca3af;
		color: #111827;
	}

	.btn-refresh {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border-radius: 12px;
		background: linear-gradient(135deg, #8b5cf6, #6366f1);
		border: none;
		color: #ffffff;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
		white-space: nowrap;
	}

	.btn-refresh:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
	}

	.btn-refresh:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-refresh i {
		font-size: 16px;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* フィルターセクション */
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		padding: 16px 20px;
		background: #ffffff;
		border-radius: 14px;
		border: 1px solid #e5e7eb;
		align-items: flex-end;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.filter-group label {
		font-size: 12px;
		font-weight: 500;
		color: #6b7280;
	}

	.filter-group select {
		padding: 8px 32px 8px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 13px;
		color: #374151;
		background: #ffffff;
		cursor: pointer;
		min-width: 120px;
	}

	.filter-group select:focus {
		outline: none;
		border-color: #8b5cf6;
		box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
	}

	.btn-reset {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: #fee2e2;
		border: none;
		border-radius: 8px;
		color: #dc2626;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.btn-reset:hover {
		background: #fecaca;
	}

	.state {
		padding: 24px;
		border-radius: 18px;
		background: #ffffff;
		color: #6b7280;
		text-align: center;
	}

	.state.error {
		border: 1px solid #dc2626;
		color: #dc2626;
	}

	.alert-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.item {
		border-radius: 14px;
		padding: 16px 20px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.item:hover {
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
		transform: translateY(-1px);
	}

	.item.unread {
		background: linear-gradient(to right, #f0f9ff, #ffffff);
		border-left: 4px solid #3b82f6;
	}

	.item-header {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.type-icon {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.type-icon i {
		font-size: 16px;
	}

	.type-risk .type-icon,
	.item.type-risk .type-icon {
		background: #fee2e2;
		color: #dc2626;
	}

	.type-suggestion .type-icon,
	.item.type-suggestion .type-icon {
		background: #fef3c7;
		color: #d97706;
	}

	.type-warning .type-icon,
	.item.type-warning .type-icon {
		background: #dbeafe;
		color: #2563eb;
	}

	.item-info {
		flex: 1;
		min-width: 0;
	}

	.item-title {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.title-text {
		font-size: 14px;
		font-weight: 600;
		color: #111827;
	}

	.unread-badge {
		padding: 2px 6px;
		background: #3b82f6;
		color: #ffffff;
		font-size: 10px;
		font-weight: 700;
		border-radius: 4px;
		text-transform: uppercase;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
		font-size: 12px;
		color: #6b7280;
	}

	.separator {
		color: #d1d5db;
	}

	.item-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tag {
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.severity-tag {
		background: #f3f4f6;
		color: #374151;
	}

	.severity-high .severity-tag,
	.severity-tag.severity-high {
		background: #fee2e2;
		color: #dc2626;
	}

	.severity-medium .severity-tag,
	.severity-tag.severity-medium {
		background: #fef3c7;
		color: #d97706;
	}

	.severity-low .severity-tag,
	.severity-tag.severity-low {
		background: #dbeafe;
		color: #2563eb;
	}

	.type-tag {
		background: #f3f4f6;
		color: #374151;
	}

	.type-tag.type-risk {
		background: #fee2e2;
		color: #dc2626;
	}

	.type-tag.type-suggestion {
		background: #fef3c7;
		color: #d97706;
	}

	.type-tag.type-warning {
		background: #dbeafe;
		color: #2563eb;
	}

	.btn-read-toggle {
		width: 32px;
		height: 32px;
		border: none;
		background: #f3f4f6;
		border-radius: 8px;
		color: #6b7280;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.btn-read-toggle:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.item-message {
		margin: 12px 0 0 48px;
		font-size: 13px;
		line-height: 1.6;
		color: #4b5563;
	}

	.related-task {
		margin: 12px 0 0 48px;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #6366f1;
	}

	.related-task i {
		font-size: 14px;
	}

	/* モーダル */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-window {
		background: #ffffff;
		border-radius: 20px;
		width: 100%;
		max-width: 600px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px 24px;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-title-section {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.modal-title-section .type-icon {
		width: 40px;
		height: 40px;
	}

	.modal-title-section .type-icon i {
		font-size: 18px;
	}

	.type-icon-risk {
		background: #fee2e2;
		color: #dc2626;
	}

	.type-icon-suggestion {
		background: #fef3c7;
		color: #d97706;
	}

	.type-icon-warning {
		background: #dbeafe;
		color: #2563eb;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 18px;
		color: #111827;
	}

	.btn-close {
		width: 36px;
		height: 36px;
		border: none;
		background: #f3f4f6;
		border-radius: 10px;
		color: #6b7280;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.btn-close:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.modal-body {
		padding: 24px;
		overflow-y: auto;
		flex: 1;
	}

	.detail-meta {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 16px;
		padding: 16px;
		background: #f9fafb;
		border-radius: 12px;
		margin-bottom: 24px;
	}

	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.meta-label {
		font-size: 11px;
		font-weight: 500;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.meta-item span:not(.meta-label):not(.tag) {
		font-size: 13px;
		color: #111827;
	}

	.read-status {
		font-weight: 500;
	}

	.detail-section {
		margin-bottom: 20px;
	}

	.detail-section h3 {
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 600;
		color: #374151;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.detail-section p {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		color: #4b5563;
	}

	.btn-task-link {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: #f0f9ff;
		border: 1px solid #bfdbfe;
		border-radius: 10px;
		color: #2563eb;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-task-link:hover {
		background: #dbeafe;
		border-color: #93c5fd;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		border-top: 1px solid #e5e7eb;
	}

	.btn-secondary {
		padding: 10px 20px;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		color: #374151;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-secondary:hover {
		background: #e5e7eb;
	}

	.btn-primary {
		padding: 10px 20px;
		background: linear-gradient(135deg, #8b5cf6, #6366f1);
		border: none;
		border-radius: 10px;
		color: #ffffff;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
	}

	/* レスポンシブ対応 */

	/* Responsive styles */
	@media (max-width: 768px) {
		.alerts-page {
			padding: 16px;
		}

		.alerts-header-wrapper {
			margin: 0;
			height: 80px;
			min-height: 80px;
		}

		.alerts-header {
			padding: 0 16px;
		}

		.header-content h1 {
			font-size: 20px;
		}

		/* Make header actions compact on mobile */
		.header-actions {
			gap: 8px;
		}

		.btn-mark-all span {
			display: none; /* Hide text on small screens */
		}

		.btn-mark-all {
			padding: 8px;
		}

		.btn-refresh span {
			display: none; /* Icon only */
		}
	}

	@media (max-width: 390px) {
		.alerts-header-wrapper {
			margin: 0;
		}

		.alerts-page {
			padding: 12px;
		}

		.alerts-header {
			padding: 0 12px;
		}
	}
</style>
