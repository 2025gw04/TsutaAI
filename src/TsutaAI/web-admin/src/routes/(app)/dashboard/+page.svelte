<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import { websocketClient } from '$lib/services/websocket';
	import type { WebSocketMessage } from '$lib/services/websocket';
	import ProjectCard from '$lib/components/dashboard/ProjectCard.svelte';
	import AlertsPanel from '$lib/components/dashboard/AlertsPanel.svelte';
	import TeamStatusWidget from '$lib/components/dashboard/TeamStatusWidget.svelte';

	/** プロジェクト一覧 */
	let projects: any[] = [];

	/** タスク一覧 */
	let tasks: any[] = [];

	/** プロジェクト別のAIサマリー結果 */
	let projectSummaries: Record<string, any> = {};

	/** プロジェクト別のタスク統計値 */
	let projectTaskStats: Record<
		string,
		{ totalTasks: number; completedTasks: number; upcomingCount: number }
	> = {};

	/** メトリクス表示用の集計値 */
	let metrics = {
		totalProjects: 0,
		runningProjects: 0,
		overdueTasks: 0,
		upcomingDeadlines: 0
	};

	/** メンバー稼働状況の一覧 */
	let workloadSummary: Array<{
		name: string;
		load: number;
		status: string;
		riskLevel: 'critical' | 'warning' | 'balanced';
		activeTasks: number;
		dueSoonTasks: number;
		completedThisWeek: number;
	}> = [];

	/** AIアラート情報 */
	let alerts: Array<{
		projectId: string | number | null;
		severity: 'high' | 'medium' | 'low';
		message: string;
	}> = [];

	/** データのロード状態 */
	let isLoadingDashboard = true;

	/** アラート取得時の状態 */
	let isLoadingAlerts = true;

	/** アラート取得エラー */
	let alertsError = '';

	// WebSocketメッセージを監視してリアルタイム更新
	let unsubscribeProject: (() => void) | null = null;
	let unsubscribeTask: (() => void) | null = null;
	let unsubscribeAlert: (() => void) | null = null;

	onMount(async () => {
		await loadDashboard();

		// WebSocketでプロジェクト更新を監視
		unsubscribeProject = websocketClient.projectUpdates.subscribe((updates) => {
			if (updates.length > 0) {
				const latestUpdate = updates[updates.length - 1];
				handleProjectUpdate(latestUpdate);
			}
		});

		// WebSocketでタスク更新を監視
		unsubscribeTask = websocketClient.taskUpdates.subscribe((updates) => {
			if (updates.length > 0) {
				loadDashboard(); // タスク更新があった場合、全体を再読み込み
			}
		});

		// WebSocketでAIアラートを監視
		unsubscribeAlert = websocketClient.aiAlerts.subscribe((newAlerts) => {
			if (newAlerts.length > 0) {
				const latestAlert = newAlerts[newAlerts.length - 1];
				handleAiAlert(latestAlert);
			}
		});
	});

	onDestroy(() => {
		if (unsubscribeProject) unsubscribeProject();
		if (unsubscribeTask) unsubscribeTask();
		if (unsubscribeAlert) unsubscribeAlert();
	});

	/** メンバー一覧 */
	let users: any[] = [];

	/** ダッシュボード全体のデータを読み込む */
	async function loadDashboard(skipLoadingState = false) {
		try {
			if (!skipLoadingState) isLoadingDashboard = true;
			const [projectResponse, taskResponse, userResponse] = await Promise.all([
				apiClient.fetchProjects(),
				apiClient.fetchTasks(),
				apiClient.fetchUsers()
			]);

			projects = projectResponse.data ?? [];
			tasks = taskResponse.data ?? [];
			users = userResponse.data ?? [];

			computeMetrics();
			computeProjectTaskStats();
			buildWorkloadSummary();
			await loadProjectSummariesFromDB();
			await loadAlertsFromDB();
		} catch (error) {
			console.error('ダッシュボードデータの取得に失敗しました', error);
		} finally {
			if (!skipLoadingState) isLoadingDashboard = false;
		}
	}

	/** プロジェクト全体のメトリクスを算出する */
	function computeMetrics() {
		const today = new Date();
		const upcomingThreshold = new Date();
		upcomingThreshold.setDate(today.getDate() + 7);

		metrics.totalProjects = projects.length;
		metrics.runningProjects = projects.filter(
			(p) => (p.status ?? '').toLowerCase() !== 'completed'
		).length;

		metrics.overdueTasks = tasks.filter((task) => {
			if (!task.dueDate) return false;
			return (
				new Date(task.dueDate) < today &&
				(task.status ?? '').toLowerCase() !== 'done' &&
				(task.status ?? '').toLowerCase() !== 'completed'
			);
		}).length;

		metrics.upcomingDeadlines = tasks.filter((task) => {
			if (!task.dueDate) return false;
			const due = new Date(task.dueDate);
			return due >= today && due <= upcomingThreshold;
		}).length;
	}

	/** プロジェクトごとのタスク集計を作成する */
	function computeProjectTaskStats() {
		const stats: Record<
			string,
			{ totalTasks: number; completedTasks: number; upcomingCount: number }
		> = {};
		const today = new Date();
		const upcomingThreshold = new Date();
		upcomingThreshold.setDate(today.getDate() + 7);

		for (const task of tasks) {
			const key = String(task.projectId ?? 'unknown');
			if (!stats[key]) {
				stats[key] = { totalTasks: 0, completedTasks: 0, upcomingCount: 0 };
			}
			stats[key].totalTasks += 1;
			const status = (task.status ?? '').toLowerCase();
			if (status === 'done' || status === 'completed') {
				stats[key].completedTasks += 1;
			}
			if (task.dueDate) {
				const due = new Date(task.dueDate);
				if (due >= today && due <= upcomingThreshold) {
					stats[key].upcomingCount += 1;
				}
			}
		}

		projectTaskStats = stats;
	}

	/** メンバーごとの稼働率を集計する */
	function buildWorkloadSummary() {
		// ユーザーIDをキーにしたマップを作成
		const userMap = new Map(users.map((u) => [String(u.id), u]));
		// ユーザー名（username）をキーにしたマップも作成（後方互換のため）
		const usernameMap = new Map(users.map((u) => [u.username, u]));

		const summaryMap = new Map<
			string,
			{ user: any; activeCount: number; dueSoon: number; completedCount: number }
		>();

		// 全ユーザーを初期化（アドミン以外）
		for (const user of users) {
			if (user.role !== 'admin') {
				summaryMap.set(String(user.id), { user, activeCount: 0, dueSoon: 0, completedCount: 0 });
			}
		}

		const today = new Date();
		const upcomingThreshold = new Date();
		upcomingThreshold.setDate(today.getDate() + 7);

		for (const task of tasks) {
			// assignedTo は ID または username の可能性がある
			let userId = String(task.assignedTo || '');

			// ユーザー特定
			let targetUser = userMap.get(userId);
			if (!targetUser && usernameMap.has(userId)) {
				targetUser = usernameMap.get(userId);
				userId = String(targetUser.id);
			}

			if (targetUser && summaryMap.has(userId)) {
				const entry = summaryMap.get(userId)!;
				const status = (task.status ?? '').toLowerCase();

				if (status === 'done' || status === 'completed') {
					entry.completedCount += 1;
				} else if (status !== 'cancelled') {
					// キャンセルは除外
					entry.activeCount += 1;
				}

				if (task.dueDate) {
					const due = new Date(task.dueDate);
					if (
						due >= today &&
						due <= upcomingThreshold &&
						status !== 'done' &&
						status !== 'completed'
					) {
						entry.dueSoon += 1;
					}
				}
			}
		}

		workloadSummary = Array.from(summaryMap.values()).map(
			({ user, activeCount, dueSoon, completedCount }) => {
				// 稼働率計算ロジック（デモ用に調整）
				// 基本負荷: アクティブタスク * 15% + 今週期限 * 10%
				let baseLoad = activeCount * 15 + dueSoon * 10;

				// デモ用ランダム要素（ユーザーIDに基づく擬似ランダムで、リロードしても同じ値になるようにする）
				// これにより、データが少なくてもグラフに動きが出る
				const pseudoRandom = (user.id * 17) % 30;
				let load = baseLoad + 30 + pseudoRandom; // ベースラインを確保

				// 完了タスクが多いと少し達成感（負荷減）
				load -= completedCount * 2;

				// 範囲制限
				const normalized = Math.max(10, Math.min(load, 120));

				let statusLabel = '余裕あり';
				let riskLevel: 'critical' | 'warning' | 'balanced' = 'balanced';

				if (normalized >= 100) {
					statusLabel = '過負荷';
					riskLevel = 'critical';
				} else if (normalized >= 80) {
					statusLabel = '高稼働';
					riskLevel = 'warning';
				} else if (normalized >= 50) {
					statusLabel = '適正';
				}

				return {
					name: user.fullName || user.username, // 名前を表示
					load: Math.round(normalized),
					status: statusLabel,
					riskLevel,
					activeTasks: activeCount,
					dueSoonTasks: dueSoon,
					completedThisWeek: completedCount
				};
			}
		);

		// 負荷が高い順にソート
		workloadSummary.sort((a, b) => b.load - a.load);
	}

	/** DBからプロジェクトサマリーを読み込む */
	async function loadProjectSummariesFromDB() {
		try {
			const response = await apiClient.fetchAllProjectSummaries();
			const summaries = response.data ?? [];

			// プロジェクトIDをキーとしたマップに変換
			const summaryMap: Record<string, any> = {};
			for (const summary of summaries) {
				summaryMap[String(summary.projectId)] = {
					progress_percentage: summary.progressPercentage,
					current_phase: summary.currentPhase,
					summary_text: summary.summaryText
				};
			}

			projectSummaries = summaryMap;
		} catch (error) {
			console.warn('プロジェクトサマリーの読み込みに失敗しました', error);
			projectSummaries = {};
		}
	}

	/** AIでプロジェクトサマリーを更新してDBに保存する */
	async function refreshProjectSummariesWithAI(skipLoadingState = false) {
		try {
			if (!skipLoadingState) isLoadingDashboard = true;

			const summaryEntries = await Promise.all(
				projects.map(async (project) => {
					try {
						// プロジェクトに関連するタスクを取得
						const projectIdKey = String(project.id);
						const projectTasks = tasks.filter(
							(task) => String(task.projectId ?? '') === projectIdKey
						);

						// タスクをWBS形式に変換（簡易版）
						const wbsData = projectTasks.map((task) => ({
							name: task.title || task.name,
							status: task.status || 'pending',
							assignee: task.assignedTo || task.assigneeUserId,
							start_date: task.startDate,
							end_date: task.endDate || task.dueDate,
							effort_days:
								task.effortDays != null
									? Number(task.effortDays)
									: task.estimatedMinutes != null
										? Math.ceil(Number(task.estimatedMinutes) / 480)
										: null
						}));

						const payload = {
							project_name: project.name,
							project_goal: project.description ?? '',
							duration: `${project.startDate ?? '未定'} ~ ${project.endDate ?? '未定'}`,
							wbs_json: JSON.stringify(wbsData)
						};

						const response = await apiClient.summarizeProject(payload);
						const summaryData = response.data;

						// DBに保存
						await apiClient.saveProjectSummary(project.id, summaryData);

						return [String(project.id), summaryData] as const;
					} catch (error) {
						console.warn('プロジェクトサマリーの生成に失敗しました', project.id, error);
						return [String(project.id), null] as const;
					}
				})
			);

			projectSummaries = Object.fromEntries(summaryEntries);
		} catch (error) {
			console.error('AIサマリー更新に失敗しました', error);
		} finally {
			if (!skipLoadingState) isLoadingDashboard = false;
		}
	}

	/** データ取得とAI更新を一括で行う */
	async function handleCombinedRefresh() {
		try {
			isLoadingDashboard = true;
			// 1. 最新データのロード (loading操作はスキップ)
			await loadDashboard(true);
			// 2. AIによる再生成 (loading操作はスキップ)
			await refreshProjectSummariesWithAI(true);
		} finally {
			isLoadingDashboard = false;
		}
	}

	/** DBからアラートを読み込む */
	async function loadAlertsFromDB() {
		try {
			isLoadingAlerts = true;
			alertsError = '';

			const response = await apiClient.fetchAllAlerts();
			alerts = response.data ?? [];
		} catch (error) {
			alertsError = 'アラートの読み込みに失敗しました。';
			alerts = [];
		} finally {
			isLoadingAlerts = false;
		}
	}

	/** AIでリスクアラートを更新してDBに保存する（改善版：差分更新） */
	async function refreshAlertsWithAI() {
		try {
			isLoadingAlerts = true;
			alertsError = '';

			// 新しいAPIエンドポイントを呼び出し（差分更新方式）
			const response = await apiClient.refreshAlerts({
				forceFullRefresh: false
			});

			if (response.success && response.data) {
				const { newAlertsCount, resolvedAlertsCount } = response.data;

				console.log('[Dashboard] アラート更新完了:', response.data);

				// アラート一覧を再読み込み
				await loadAlertsFromDB();
			}
		} catch (error) {
			alertsError = 'AIアラートの更新に失敗しました。接続環境をご確認ください。';
			console.error('[Dashboard] アラート更新エラー:', error);
		} finally {
			isLoadingAlerts = false;
		}
	}

	/** WebSocketでプロジェクト更新があった場合の処理 */
	function handleProjectUpdate(update: WebSocketMessage) {
		if (!update.data || !update.projectId) return;

		const action = update.data.action;
		if (action === 'created') {
			// 新規プロジェクトが追加された場合
			projects = [...projects, update.data.project];
			computeMetrics();
		} else if (action === 'updated') {
			// プロジェクトが更新された場合
			const index = projects.findIndex((p) => p.id === update.projectId);
			if (index !== -1) {
				projects[index] = { ...projects[index], ...update.data.project };
				projects = [...projects]; // リアクティブ更新
			}
			computeMetrics();
		}
	}

	/** WebSocketでAIアラートがあった場合の処理 */
	function handleAiAlert(alertUpdate: WebSocketMessage) {
		if (!alertUpdate.data) return;

		const newAlert = {
			projectId: alertUpdate.projectId ?? null,
			severity: alertUpdate.data.severity ?? 'medium',
			message: alertUpdate.data.message ?? 'AIから新しいアラートがあります'
		};

		alerts = [...alerts, newAlert];
	}
</script>

<div class="dashboard-header-wrapper">
	<header class="dashboard-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-speedometer2"></i>
				ダッシュボード
			</h1>
			<p>進捗とAIインサイト</p>
		</div>
	</header>
</div>

<div class="dashboard-page">
	<section class="metric-grid">
		<div class="metric-card">
			<span class="label">総プロジェクト数</span>
			<span class="value">{metrics.totalProjects}</span>
			<span class="hint">登録済みの全案件が対象です。</span>
		</div>
		<div class="metric-card">
			<span class="label">アクティブ案件</span>
			<span class="value accent">{metrics.runningProjects}</span>
			<span class="hint">完了済み以外の案件がカウントされています。</span>
		</div>
		<div class="metric-card">
			<span class="label">期限超過タスク</span>
			<span class="value warn">{metrics.overdueTasks}</span>
			<span class="hint">Due日を過ぎて未完了のタスク数です。</span>
		</div>
		<div class="metric-card">
			<span class="label">今週の締切</span>
			<span class="value">{metrics.upcomingDeadlines}</span>
			<span class="hint">7日以内に期限を迎えるタスク数です。</span>
		</div>
	</section>

	<section class="content-sections">
		<div class="section-full">
			<div class="section-header">
				<div>
					<h2>プロジェクトハイライト</h2>
					<p>AIサマリーと生タスクを掛け合わせた重点ウォッチを表示しています。</p>
				</div>
				<div class="button-group">
					<button
						type="button"
						class="refresh-button ai"
						on:click={handleCombinedRefresh}
						disabled={isLoadingDashboard}
					>
						<i class="bi bi-stars"></i>
						AI再生成
					</button>
				</div>
			</div>

			{#if isLoadingDashboard}
				<div class="loading">
					<div class="spinner"></div>
					<p>データを読み込んでいます…</p>
				</div>
			{:else if projects.length === 0}
				<div class="empty">
					<i class="bi bi-archive"></i>
					<p>
						プロジェクトがまだ登録されていません。新規案件を追加してモニタリングを開始しましょう。
					</p>
				</div>
			{:else}
				<div class="project-grid">
					{#each projects as project (project.id)}
						<ProjectCard
							{project}
							summary={projectSummaries[String(project.id)]}
							stats={projectTaskStats[String(project.id)] ?? {
								totalTasks: 0,
								completedTasks: 0,
								upcomingCount: 0
							}}
						/>
					{/each}
				</div>
			{/if}
		</div>

		<div class="section-full">
			<AlertsPanel
				{alerts}
				isLoading={isLoadingAlerts}
				errorMessage={alertsError}
				onRefresh={refreshAlertsWithAI}
			/>
		</div>

		<div class="section-full">
			<TeamStatusWidget workload={workloadSummary} />
		</div>
	</section>
</div>

<style>
	/* Main page layout */
	.dashboard-header-wrapper {
		display: none; /* Hide on desktop */
		margin: 0;
		background: #f9fafb; /* Light background matching body */
		color: #111827; /* Dark text */
		padding: 0;
		box-shadow: none;
		height: 80px;
		width: 100%;
	}

	.dashboard-header {
		width: 100%;
		margin: 0;
		padding: 0 24px; /* Align with dashboard-page default padding */
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
		color: #6b7280; /* Gray text for desktop */
		margin: 8px 0 0 0;
		font-weight: 500;
	}

	/* Mobile/Tablet Header: Dark Theme (<960px) */
	@media (max-width: 960px) {
		.dashboard-header-wrapper {
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

	.dashboard-page {
		display: flex;
		flex-direction: column;
		gap: 28px;
		padding: 24px;
		max-width: 1400px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
		overflow-x: hidden;
	}

	.metric-grid {
		display: grid;
		gap: 18px;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		width: 100%;
	}

	.metric-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px 20px;
		border-radius: 18px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
		box-sizing: border-box;
		min-width: 0;
	}

	.metric-card .label {
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
	}

	.metric-card .value {
		font-size: 28px;
		font-weight: 700;
		color: #111827;
	}

	.metric-card .value.accent {
		color: #3b82f6;
	}

	.metric-card .value.warn {
		color: #ef4444;
	}

	.metric-card .hint {
		font-size: 11px;
		color: #6b7280;
	}

	.content-sections {
		display: flex;
		flex-direction: column;
		gap: 28px;
		width: 100%;
		box-sizing: border-box;
	}

	.section-full {
		display: flex;
		flex-direction: column;
		gap: 18px;
		width: 100%;
		box-sizing: border-box;
		overflow-x: hidden;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
		flex-wrap: wrap;
		width: 100%;
	}

	.section-header h2 {
		margin: 0;
		font-size: 20px;
		color: #111827;
	}

	.section-header p {
		margin: 6px 0 0;
		font-size: 12px;
		color: #6b7280;
	}

	.button-group {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.refresh-button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-radius: 12px;
		background: #dbeafe;
		border: 1px solid #93c5fd;
		color: #1e40af;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			opacity 0.2s ease,
			box-shadow 0.2s ease;
	}

	.refresh-button.ai {
		background: #e0e7ff;
		border-color: #c7d2fe;
		color: #4338ca;
	}

	.refresh-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.refresh-button:not(:disabled):hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(59, 130, 246, 0.15);
	}

	.project-grid {
		display: grid;
		gap: 18px;
		grid-template-columns: 1fr;
		width: 100%;
		box-sizing: border-box;
	}

	@media (min-width: 640px) {
		.project-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 1024px) {
		.project-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.loading,
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 48px 24px;
		border-radius: 18px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		color: #6b7280;
		text-align: center;
	}

	.loading .spinner {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 3px solid #dbeafe;
		border-top-color: #3b82f6;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.empty i {
		font-size: 28px;
		color: #9ca3af;
	}

	@media (max-width: 768px) {
		.dashboard-page {
			padding: 16px;
		}

		.metric-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 12px;
		}

		.section-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}

		.button-group {
			width: 100%;
			flex-direction: column;
		}

		.button-group button {
			width: 100%;
			justify-content: center;
			min-height: 44px;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.dashboard-page {
			padding: 12px;
			gap: 20px;
		}

		.metric-grid {
			grid-template-columns: 1fr;
			gap: 12px;
		}

		.metric-card {
			padding: 16px;
			box-sizing: border-box;
		}

		.metric-card .label {
			font-size: 11px;
		}

		.metric-card .value {
			font-size: 24px;
		}

		.metric-card .hint {
			font-size: 10px;
		}

		.section-header h2 {
			font-size: 18px;
		}

		.section-header p {
			font-size: 11px;
		}

		.button-group {
			gap: 8px;
		}

		.refresh-button {
			padding: 14px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
			width: 100%;
			box-sizing: border-box;
		}

		.project-grid {
			gap: 16px;
		}

		.loading,
		.empty {
			padding: 32px 16px;
		}

		/* Mobile Header Adjustments */
		.dashboard-header-wrapper {
			margin: 0;
			height: 80px;
			min-height: 80px;
		}

		.dashboard-header {
			padding: 0 16px; /* Symmetrical padding */
		}

		/* Reduce body padding on mobile as requested */
		.dashboard-page {
			padding: 16px;
		}

		.header-content h1 {
			font-size: 20px;
		}
	}

	@media (max-width: 390px) {
		.dashboard-header-wrapper {
			margin: 0;
		}

		.dashboard-page {
			padding: 12px;
		}

		.dashboard-header {
			padding: 0 12px;
		}
	}
</style>
