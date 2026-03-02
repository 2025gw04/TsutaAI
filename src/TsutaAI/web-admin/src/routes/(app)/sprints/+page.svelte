<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import { authStore as auth } from '$lib/stores/auth';

	let sprints: any[] = [];
	let projects: any[] = [];
	let selectedSprint: any = null;
	let sprintStats: any = null;
	let sprintProgress: any[] = [];
	let latestProgress: any = null;
	let memberPerformance: any[] = [];
	let aiAnalysis: any = null;

	// Filters
	let filterProject: number | null = null;
	let filterStatus: string = 'all';

	// Create form
	let showCreateForm = false;
	let createForm = {
		projectId: null as number | null,
		sprintName: '',
		sprintGoal: '',
		startDate: '',
		endDate: '',
		targetStoryPoints: null as number | null
	};

	// Active tab
	let activeTab: 'overview' | 'progress' | 'performance' | 'analysis' = 'overview';

	let loading = false;
	let error = '';
	let creatingSprint = false;
	let startingSprintId: number | null = null;
	let completingSprintId: number | null = null;
	let recordingProgress = false;
	let recordingPerformance = false;
	let analyzingGoal = false;
	let loadingDetailSprintId: number | null = null;

	function toValidId(value: unknown): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'string' && value.trim() !== '') {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : null;
		}
		return null;
	}

	function isRecord(value: unknown): value is Record<string, any> {
		return !!value && typeof value === 'object' && !Array.isArray(value);
	}

	function asArray<T = any>(value: unknown): T[] {
		return Array.isArray(value) ? (value as T[]) : [];
	}

	onMount(async () => {
		await loadInitialData();
	});

	async function loadInitialData() {
		loading = true;
		error = '';
		try {
			const projectsRes = await apiClient.fetchProjects();
			projects = asArray(projectsRes?.data);
			await loadSprints();
		} catch (err: any) {
			error = err.message || 'データの読み込みに失敗しました';
			console.error('Load error:', err);
		} finally {
			loading = false;
		}
	}

	async function loadSprints() {
		loading = true;
		error = '';
		try {
			const filters: any = {};
			const normalizedFilterProject = toValidId(filterProject);
			if (normalizedFilterProject) filters.projectId = normalizedFilterProject;
			if (filterStatus !== 'all') filters.status = filterStatus;

			const res = await apiClient.fetchSprints(filters);
			sprints = asArray(res?.data);
		} catch (err: any) {
			error = err.message || 'スプリントの読み込みに失敗しました';
			console.error('Load error:', err);
		} finally {
			loading = false;
		}
	}

	async function createSprint() {
		if (creatingSprint) return;

		const projectId = toValidId(createForm.projectId);
		const sprintName = createForm.sprintName.trim();
		const sprintGoal = createForm.sprintGoal.trim();

		if (
			!projectId ||
			!sprintName ||
			!sprintGoal ||
			!createForm.startDate ||
			!createForm.endDate
		) {
			error = 'すべての必須項目を入力してください';
			return;
		}

		const startDate = new Date(createForm.startDate);
		const endDate = new Date(createForm.endDate);
		if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
			error = '有効な日付を入力してください';
			return;
		}
		if (endDate < startDate) {
			error = '終了日は開始日以降にしてください';
			return;
		}

		const targetStoryPoints =
			typeof createForm.targetStoryPoints === 'number' && createForm.targetStoryPoints >= 0
				? createForm.targetStoryPoints
				: null;

		creatingSprint = true;
		loading = true;
		error = '';
		try {
			await apiClient.createSprint({
				projectId,
				sprintName,
				goalDescription: sprintGoal,
				startDate: createForm.startDate,
				endDate: createForm.endDate,
				targetStoryPoints: targetStoryPoints ?? undefined,
				createdBy: $auth?.id || 1
			});

			showCreateForm = false;
			resetCreateForm();
			await loadSprints();
		} catch (err: any) {
			error = err.message || 'スプリントの作成に失敗しました';
			console.error('Create error:', err);
		} finally {
			creatingSprint = false;
			loading = false;
		}
	}

	function resetCreateForm() {
		createForm = {
			projectId: null,
			sprintName: '',
			sprintGoal: '',
			startDate: '',
			endDate: '',
			targetStoryPoints: null
		};
	}

	function handleCreateProjectChange(event: Event) {
		const target = event.currentTarget as HTMLSelectElement | null;
		createForm.projectId = toValidId(target?.value ?? null);
	}

	function handleFilterProjectChange(event: Event) {
		const target = event.currentTarget as HTMLSelectElement | null;
		filterProject = toValidId(target?.value ?? null);
		loadSprints();
	}

	async function selectSprint(sprintId: number) {
		const normalizedSprintId = toValidId(sprintId);
		if (!normalizedSprintId) {
			error = '無効なスプリントIDです';
			return;
		}
		if (loadingDetailSprintId === normalizedSprintId) return;

		loadingDetailSprintId = normalizedSprintId;
		loading = true;
		error = '';
		try {
			const [sprintRes, statsRes, progressRes, latestRes] = await Promise.all([
				apiClient.fetchSprint(normalizedSprintId),
				apiClient.fetchSprintStats(normalizedSprintId),
				apiClient.fetchSprintProgress(normalizedSprintId, 30),
				apiClient.fetchLatestSprintProgress(normalizedSprintId)
			]);

			selectedSprint = isRecord(sprintRes?.data) ? sprintRes.data : null;
			sprintStats = isRecord(statsRes?.data) ? statsRes.data : null;
			sprintProgress = asArray(progressRes?.data);
			latestProgress = isRecord(latestRes?.data) ? latestRes.data : null;
			activeTab = 'overview';

			// Load performance if sprint is active or completed
			if (selectedSprint && selectedSprint.status !== 'planning') {
				try {
					const perfRes = await apiClient.fetchSprintPerformance(normalizedSprintId);
					memberPerformance = asArray(perfRes?.data);
				} catch (err) {
					console.error('Performance load error:', err);
					memberPerformance = [];
				}
			} else {
				memberPerformance = [];
			}
		} catch (err: any) {
			error = err.message || 'スプリント詳細の読み込みに失敗しました';
			console.error('Load details error:', err);
		} finally {
			loadingDetailSprintId = null;
			loading = false;
		}
	}

	async function startSprint(sprintId: number) {
		const normalizedSprintId = toValidId(sprintId);
		if (!normalizedSprintId || startingSprintId === normalizedSprintId) return;
		if (!confirm('このスプリントを開始しますか？')) return;

		startingSprintId = normalizedSprintId;
		loading = true;
		error = '';
		try {
			await apiClient.startSprint(normalizedSprintId);
			await loadSprints();
			if (toValidId(selectedSprint?.id) === normalizedSprintId) {
				await selectSprint(normalizedSprintId);
			}
		} catch (err: any) {
			error = err.message || 'スプリントの開始に失敗しました';
			console.error('Start error:', err);
		} finally {
			startingSprintId = null;
			loading = false;
		}
	}

	async function completeSprint(sprintId: number) {
		const normalizedSprintId = toValidId(sprintId);
		if (!normalizedSprintId || completingSprintId === normalizedSprintId) return;
		if (!confirm('このスプリントを完了しますか？')) return;

		completingSprintId = normalizedSprintId;
		loading = true;
		error = '';
		try {
			await apiClient.completeSprint(normalizedSprintId);
			await loadSprints();
			if (toValidId(selectedSprint?.id) === normalizedSprintId) {
				await selectSprint(normalizedSprintId);
			}
		} catch (err: any) {
			error = err.message || 'スプリントの完了に失敗しました';
			console.error('Complete error:', err);
		} finally {
			completingSprintId = null;
			loading = false;
		}
	}

	async function recordProgress() {
		const sprintId = toValidId(selectedSprint?.id);
		if (!sprintId || recordingProgress) return;

		recordingProgress = true;
		loading = true;
		error = '';
		try {
			await apiClient.recordSprintProgress(sprintId);
			const [progressRes, latestRes] = await Promise.all([
				apiClient.fetchSprintProgress(sprintId, 30),
				apiClient.fetchLatestSprintProgress(sprintId)
			]);
			sprintProgress = asArray(progressRes?.data);
			latestProgress = isRecord(latestRes?.data) ? latestRes.data : null;
		} catch (err: any) {
			error = err.message || '進捗の記録に失敗しました';
			console.error('Record progress error:', err);
		} finally {
			recordingProgress = false;
			loading = false;
		}
	}

	async function recordPerformance() {
		const sprintId = toValidId(selectedSprint?.id);
		if (!sprintId || recordingPerformance) return;

		recordingPerformance = true;
		loading = true;
		error = '';
		try {
			await apiClient.recordSprintPerformance(sprintId);
			const perfRes = await apiClient.fetchSprintPerformance(sprintId);
			memberPerformance = asArray(perfRes?.data);
		} catch (err: any) {
			error = err.message || 'パフォーマンスの記録に失敗しました';
			console.error('Record performance error:', err);
		} finally {
			recordingPerformance = false;
			loading = false;
		}
	}

	async function analyzeGoal() {
		const sprintId = toValidId(selectedSprint?.id);
		if (!sprintId || analyzingGoal) return;

		analyzingGoal = true;
		loading = true;
		error = '';
		try {
			const res = await apiClient.analyzeSprintGoal(sprintId);
			aiAnalysis = isRecord(res?.data) ? res.data : null;
			activeTab = 'analysis';
		} catch (err: any) {
			error = err.message || 'ゴール分析に失敗しました';
			console.error('Analysis error:', err);
		} finally {
			analyzingGoal = false;
			loading = false;
		}
	}

	function getStatusBadge(status: string): string {
		switch (status) {
			case 'planning':
				return '計画中';
			case 'active':
				return 'アクティブ';
			case 'completed':
				return '完了';
			default:
				return status;
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'planning':
				return '#6b7280';
			case 'active':
				return '#3b82f6';
			case 'completed':
				return '#22c55e';
			default:
				return '#6b7280';
		}
	}

	function getMomentumColor(momentum: string): string {
		switch (momentum) {
			case 'accelerating':
				return '#22c55e';
			case 'steady':
				return '#3b82f6';
			case 'slowing':
				return '#f97316';
			case 'stalled':
				return '#ef4444';
			default:
				return '#6b7280';
		}
	}

	function getMomentumLabel(momentum: string): string {
		switch (momentum) {
			case 'accelerating':
				return '加速中';
			case 'steady':
				return '安定';
			case 'slowing':
				return '減速中';
			case 'stalled':
				return '停滞';
			default:
				return momentum;
		}
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		return date.toLocaleDateString('ja-JP');
	}

	function formatDateTime(dateStr: string): string {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		return (
			date.toLocaleDateString('ja-JP') +
			' ' +
			date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
		);
	}

	function getChartData(sprint: any, progressData: any[]) {
		if (!sprint || !sprint.startDate || !sprint.endDate) return null;

		const startDate = new Date(sprint.startDate);
		const endDate = new Date(sprint.endDate);
		const totalDays =
			Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

		const width = 800;
		const height = 300;
		const padding = 40;
		const graphWidth = width - padding * 2;
		const graphHeight = height - padding * 2;
		const totalSteps = Math.max(totalDays - 1, 1);

		const maxPoints = sprint.targetStoryPoints || 100;

		// 座標変換ヘルパー
		const getX = (dateStr: string) => {
			const d = new Date(dateStr);
			const diff = Math.ceil((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
			return padding + (diff / totalSteps) * graphWidth;
		};

		const getY = (points: number) => {
			return height - padding - (points / maxPoints) * graphHeight;
		};

		// 理想線 (開始日:Max -> 終了日:0)
		const idealLine = `M${padding},${padding} L${width - padding},${height - padding}`;

		// 実績線
		// 開始日はMaxPointsとする
		let points = [{ x: getX(sprint.startDate), y: getY(maxPoints) }];

		// プログレスデータから点を生成
		const sortedProgress = [...progressData].sort(
			(a, b) => new Date(a.progress_date).getTime() - new Date(b.progress_date).getTime()
		);

		sortedProgress.forEach((p) => {
			points.push({
				x: getX(p.progress_date),
				y: getY(p.remaining_story_points || 0)
			});
		});

		const actualLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

		// 目盛り線とラベル
		const xLabels = [];
		for (let i = 0; i < totalDays; i += Math.ceil(totalDays / 10)) {
			// 最大10目盛り
			const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
			xLabels.push({
				x: padding + (i / totalSteps) * graphWidth,
				y: height - padding + 20,
				text: d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
			});
		}

		const yLabels = [];
		for (let i = 0; i <= 5; i++) {
			const val = Math.round((maxPoints / 5) * i);
			yLabels.push({
				x: padding - 10,
				y: getY(val),
				text: val.toString()
			});
		}

		return { width, height, idealLine, actualLine, xLabels, yLabels, points };
	}

	$: chartData = selectedSprint ? getChartData(selectedSprint, sprintProgress) : null;

	function closeSprintDetails() {
		selectedSprint = null;
		sprintStats = null;
		sprintProgress = [];
		latestProgress = null;
		memberPerformance = [];
		aiAnalysis = null;
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-calendar-check"></i>
				スプリント
			</h1>
			<p>計画・追跡・分析</p>
		</div>
	</header>
</div>

<div class="sprints-page">
	<div class="page-actions">
		<button class="btn-primary" on:click={() => (showCreateForm = !showCreateForm)}>
			<i class="bi bi-plus-circle"></i>
			新規スプリント作成
		</button>
	</div>

	{#if error}
		<div class="error-message">
			<i class="bi bi-exclamation-triangle-fill"></i>
			<span>{error}</span>
		</div>
	{/if}

	<!-- Create Form -->
	{#if showCreateForm}
		<div class="create-form">
			<h3>新規スプリント作成</h3>
			<div class="form-grid">
				<div class="form-group">
					<label for="projectId">プロジェクト *</label>
					<select id="projectId" bind:value={createForm.projectId} on:change={handleCreateProjectChange}>
						<option value="">選択してください</option>
						{#each projects as project}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
				</div>

				<div class="form-group">
					<label for="sprintName">スプリント名 *</label>
					<input
						type="text"
						id="sprintName"
						bind:value={createForm.sprintName}
						placeholder="例: Sprint 1"
					/>
				</div>

				<div class="form-group">
					<label for="startDate">開始日 *</label>
					<input type="date" id="startDate" bind:value={createForm.startDate} />
				</div>

				<div class="form-group">
					<label for="endDate">終了日 *</label>
					<input type="date" id="endDate" bind:value={createForm.endDate} />
				</div>

				<div class="form-group">
					<label for="targetStoryPoints">目標ストーリーポイント</label>
					<input
						type="number"
						id="targetStoryPoints"
						bind:value={createForm.targetStoryPoints}
						placeholder="例: 50"
					/>
				</div>

				<div class="form-group full-width">
					<label for="sprintGoal">スプリントゴール *</label>
					<textarea
						id="sprintGoal"
						bind:value={createForm.sprintGoal}
						rows="4"
						placeholder="スプリントのゴールを入力してください..."
					></textarea>
				</div>
			</div>

			<div class="form-actions">
				<button
					class="btn-secondary"
					on:click={() => {
						showCreateForm = false;
						resetCreateForm();
					}}
				>
					キャンセル
				</button>
				<button class="btn-primary" on:click={createSprint} disabled={loading}>
					{creatingSprint ? '作成中...' : 'スプリント作成'}
				</button>
			</div>
		</div>
	{/if}

	<!-- Filters -->
	<div class="filters">
		<div class="filter-group">
			<label for="filterProject">プロジェクト</label>
			<select id="filterProject" bind:value={filterProject} on:change={handleFilterProjectChange}>
				<option value="">すべて</option>
				{#each projects as project}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>
		</div>

		<div class="filter-group">
			<label for="filterStatus">ステータス</label>
			<select id="filterStatus" bind:value={filterStatus} on:change={loadSprints}>
				<option value="all">すべて</option>
				<option value="planning">計画中</option>
				<option value="active">アクティブ</option>
				<option value="completed">完了</option>
			</select>
		</div>
	</div>

	<!-- Sprints List -->
	<div class="content-layout">
		<div class="sprints-list">
			{#if loading && sprints.length === 0}
				<div class="loading">読み込み中...</div>
			{:else if sprints.length === 0}
				<div class="empty-state">スプリントがありません</div>
			{:else}
				{#each sprints as sprint}
					<div
						class="sprint-card"
						class:selected={toValidId(selectedSprint?.id) === toValidId(sprint.id)}
						on:click={() => selectSprint(sprint.id)}
						aria-busy={loadingDetailSprintId === toValidId(sprint.id)}
					>
						<div class="sprint-header">
							<div class="sprint-name">{sprint.sprintName}</div>
							<span class="badge" style="background: {getStatusColor(sprint.status)};">
								{getStatusBadge(sprint.status)}
							</span>
						</div>
						<div class="sprint-meta">
							<span>プロジェクト: {sprint.projectName || `ID:${sprint.projectId}`}</span>
							<span>{formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}</span>
						</div>
						<div class="sprint-goal">{sprint.goalDescription}</div>
						{#if sprint.targetStoryPoints}
							<div class="sprint-points">目標: {sprint.targetStoryPoints}pt</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		<!-- Sprint Details -->
		{#if selectedSprint}
			<div class="details-panel">
				<div class="details-header">
					<h3>{selectedSprint.sprintName}</h3>
					<button class="btn-close" on:click={closeSprintDetails}>×</button>
				</div>

				<!-- Action Buttons -->
				<div class="action-buttons">
					{#if selectedSprint.status === 'planning'}
						<button
							class="btn-primary"
							on:click={() => startSprint(selectedSprint.id)}
							disabled={loading || startingSprintId === toValidId(selectedSprint.id)}
						>
							スプリント開始
						</button>
					{/if}
					{#if selectedSprint.status === 'active'}
						<button
							class="btn-success"
							on:click={() => completeSprint(selectedSprint.id)}
							disabled={loading || completingSprintId === toValidId(selectedSprint.id)}
						>
							スプリント完了
						</button>
					{/if}
					<button class="btn-secondary" on:click={analyzeGoal} disabled={loading || analyzingGoal}>
						AI分析実行
					</button>
				</div>

				<!-- Tabs -->
				<div class="tabs">
					<button
						class="tab"
						class:active={activeTab === 'overview'}
						on:click={() => (activeTab = 'overview')}
					>
						概要
					</button>
					<button
						class="tab"
						class:active={activeTab === 'progress'}
						on:click={() => (activeTab = 'progress')}
					>
						進捗
					</button>
					<button
						class="tab"
						class:active={activeTab === 'performance'}
						on:click={() => (activeTab = 'performance')}
					>
						パフォーマンス
					</button>
					<button
						class="tab"
						class:active={activeTab === 'analysis'}
						on:click={() => (activeTab = 'analysis')}
					>
						AI分析
					</button>
				</div>

				<div class="tab-content">
					{#if activeTab === 'overview'}
						<div class="overview-section">
							<h4>スプリント情報</h4>
							<div class="info-grid">
								<div class="info-item">
									<span class="info-label">期間</span>
									<span class="info-value"
										>{formatDate(selectedSprint.startDate)} - {formatDate(
											selectedSprint.endDate
										)}</span
									>
								</div>
								<div class="info-item">
									<span class="info-label">ステータス</span>
									<span class="info-value" style="color: {getStatusColor(selectedSprint.status)};">
										{getStatusBadge(selectedSprint.status)}
									</span>
								</div>
								{#if selectedSprint.targetStoryPoints}
									<div class="info-item">
										<span class="info-label">目標ストーリーポイント</span>
										<span class="info-value">{selectedSprint.targetStoryPoints}pt</span>
									</div>
								{/if}
								{#if selectedSprint.achievabilityScore !== null}
									<div class="info-item">
										<span class="info-label">達成可能性スコア</span>
										<span class="info-value">{selectedSprint.achievabilityScore}%</span>
									</div>
								{/if}
							</div>

							<h4>スプリントゴール</h4>
							<p class="goal-text">{selectedSprint.goalDescription}</p>

							{#if sprintStats}
								<h4>統計情報</h4>
								<div class="stats-grid">
									<div class="stat-card">
										<div class="stat-label">総タスク数</div>
										<div class="stat-value">{sprintStats.totalTasks || 0}</div>
									</div>
									<div class="stat-card">
										<div class="stat-label">完了タスク</div>
										<div class="stat-value" style="color: #22c55e;">
											{sprintStats.completedTasks || 0}
										</div>
									</div>
									<div class="stat-card">
										<div class="stat-label">進行中タスク</div>
										<div class="stat-value" style="color: #3b82f6;">
											{sprintStats.inProgressTasks || 0}
										</div>
									</div>
									<div class="stat-card">
										<div class="stat-label">残りタスク</div>
										<div class="stat-value" style="color: #f97316;">
											{sprintStats.remainingTasks || 0}
										</div>
									</div>
									{#if sprintStats.totalStoryPoints}
										<div class="stat-card">
											<div class="stat-label">総ストーリーポイント</div>
											<div class="stat-value">{sprintStats.totalStoryPoints}pt</div>
										</div>
									{/if}
									{#if sprintStats.completedStoryPoints}
										<div class="stat-card">
											<div class="stat-label">完了ポイント</div>
											<div class="stat-value" style="color: #22c55e;">
												{sprintStats.completedStoryPoints}pt
											</div>
										</div>
									{/if}
									{#if sprintStats.progressPercentage !== null}
										<div class="stat-card">
											<div class="stat-label">進捗率</div>
											<div class="stat-value">{sprintStats.progressPercentage.toFixed(1)}%</div>
										</div>
									{/if}
									{#if sprintStats.velocity}
										<div class="stat-card">
											<div class="stat-label">ベロシティ</div>
											<div class="stat-value">{sprintStats.velocity.toFixed(1)}pt/日</div>
										</div>
									{/if}
								</div>
							{/if}

							{#if latestProgress}
								<h4>最新進捗</h4>
								<div class="progress-info">
									<div class="info-item">
										<span class="info-label">記録日時</span>
										<span class="info-value">{formatDate(latestProgress.progress_date)}</span>
									</div>
									<div class="info-item">
										<span class="info-label">モメンタム</span>
										<span
											class="info-value"
											style="color: {getMomentumColor(latestProgress.momentum_trend)};"
										>
											{getMomentumLabel(latestProgress.momentum_trend)}
										</span>
									</div>
									<div class="info-item">
										<span class="info-label">モメンタムスコア</span>
										<span class="info-value"
											>{latestProgress.momentum_score
												? latestProgress.momentum_score.toFixed(1)
												: '0.0'}/100</span
										>
									</div>
									{#if latestProgress.daily_velocity}
										<div class="info-item">
											<span class="info-label">デイリーベロシティ</span>
											<span class="info-value">{latestProgress.daily_velocity.toFixed(2)}pt/日</span
											>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{:else if activeTab === 'progress'}
						<div class="progress-section">
							<div class="section-header">
								<h4>進捗トラッキング</h4>
								<button
									class="btn-small"
									on:click={recordProgress}
									disabled={loading || recordingProgress || selectedSprint.status !== 'active'}
								>
									進捗記録
								</button>
							</div>

							{#if chartData}
								<div class="burndown-chart-container">
									<h5>バーンダウンチャート</h5>
									<div class="chart-wrapper">
										<svg viewBox="0 0 {chartData.width} {chartData.height}" class="burndown-chart">
											<!-- グリッド線 -->
											{#each chartData.yLabels as label}
												<line
													x1="40"
													y1={label.y}
													x2={chartData.width - 40}
													y2={label.y}
													stroke="#e5e7eb"
													stroke-width="1"
												/>
											{/each}

											<!-- 目盛りラベル -->
											{#each chartData.xLabels as label}
												<text
													x={label.x}
													y={label.y}
													font-size="10"
													text-anchor="middle"
													fill="#6b7280">{label.text}</text
												>
											{/each}
											{#each chartData.yLabels as label}
												<text
													x={label.x}
													y={label.y + 4}
													font-size="10"
													text-anchor="end"
													fill="#6b7280">{label.text}</text
												>
											{/each}

											<!-- 理想線 -->
											<path
												d={chartData.idealLine}
												fill="none"
												stroke="#9ca3af"
												stroke-width="2"
												stroke-dasharray="5,5"
											/>

											<!-- 実績線 -->
											<path
												d={chartData.actualLine}
												fill="none"
												stroke="#3b82f6"
												stroke-width="3"
											/>

											<!-- ポイント -->
											{#each chartData.points as p}
												<circle
													cx={p.x}
													cy={p.y}
													r="4"
													fill="#3b82f6"
													stroke="white"
													stroke-width="2"
												/>
											{/each}
										</svg>
									</div>
									<div class="chart-legend">
										<div class="legend-item">
											<span class="line ideal"></span> 理想
										</div>
										<div class="legend-item">
											<span class="line actual"></span> 実績
										</div>
									</div>
								</div>
							{/if}

							{#if sprintProgress.length > 0}
								<div class="progress-table">
									<table>
										<thead>
											<tr>
												<th>日付</th>
												<th>完了SP</th>
												<th>残りSP</th>
												<th>デイリーベロシティ</th>
												<th>モメンタム</th>
												<th>スコア</th>
											</tr>
										</thead>
										<tbody>
											{#each sprintProgress as progress}
												<tr>
													<td>{formatDate(progress.progress_date)}</td>
													<td>{progress.completed_story_points || 0}</td>
													<td>{progress.remaining_story_points || 0}</td>
													<td
														>{progress.daily_velocity
															? progress.daily_velocity.toFixed(2)
															: '-'}</td
													>
													<td style="color: {getMomentumColor(progress.momentum_trend)};">
														{getMomentumLabel(progress.momentum_trend)}
													</td>
													<td
														>{progress.momentum_score
															? progress.momentum_score.toFixed(1)
															: '0.0'}/100</td
													>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{:else}
								<div class="empty-state">進捗データがありません</div>
							{/if}
						</div>
					{:else if activeTab === 'performance'}
						<div class="performance-section">
							<div class="section-header">
								<h4>チームパフォーマンス</h4>
								<button
									class="btn-small"
									on:click={recordPerformance}
									disabled={loading || recordingPerformance || selectedSprint.status === 'planning'}
								>
									パフォーマンス記録
								</button>
							</div>

							{#if memberPerformance.length > 0}
								<div class="performance-table">
									<table>
										<thead>
											<tr>
												<th>順位</th>
												<th>メンバー</th>
												<th>完了タスク</th>
												<th>完了SP</th>
												<th>貢献率</th>
												<th>パフォーマンススコア</th>
											</tr>
										</thead>
										<tbody>
											{#each memberPerformance as perf}
												<tr>
													<td>{perf.performance_rank}</td>
													<td>{perf.member_name || `ID:${perf.member_id}`}</td>
													<td>{perf.completed_tasks}</td>
													<td>{perf.completed_story_points}</td>
													<td
														>{perf.contribution_percentage
															? perf.contribution_percentage.toFixed(1)
															: '0.0'}%</td
													>
													<td>{perf.performance_score}/100</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{:else}
								<div class="empty-state">パフォーマンスデータがありません</div>
							{/if}
						</div>
					{:else if activeTab === 'analysis'}
						<div class="analysis-section">
							<div class="section-header">
								<h4>AI分析結果</h4>
								{#if !aiAnalysis}
									<button class="btn-small" on:click={analyzeGoal} disabled={loading || analyzingGoal}>
										分析実行
									</button>
								{/if}
							</div>

							{#if aiAnalysis}
								{#if aiAnalysis.achievabilityAnalysis}
									<div class="analysis-card">
										<h5>達成可能性分析</h5>
										<div class="score-display">
											<div
												class="score-circle"
												style="border-color: {aiAnalysis.achievabilityAnalysis.achievabilityScore *
													100 >=
												70
													? '#22c55e'
													: aiAnalysis.achievabilityAnalysis.achievabilityScore * 100 >= 50
														? '#eab308'
														: '#ef4444'};"
											>
												<span class="score-value"
													>{(aiAnalysis.achievabilityAnalysis.achievabilityScore * 100).toFixed(
														1
													)}</span
												>
												<span class="score-label">%</span>
											</div>
										</div>

										{#if aiAnalysis.achievabilityAnalysis.achievementProbability !== undefined}
											<div class="analysis-item">
												<strong>達成確率:</strong>
												{aiAnalysis.achievabilityAnalysis.achievementProbability.toFixed(0)}%
											</div>
										{/if}

										{#if aiAnalysis.achievabilityAnalysis.riskLevel}
											<div class="analysis-item">
												<strong>リスクレベル:</strong>
												<span
													class="badge"
													style="background: {aiAnalysis.achievabilityAnalysis.riskLevel === 'low'
														? '#22c55e'
														: aiAnalysis.achievabilityAnalysis.riskLevel === 'medium'
															? '#eab308'
															: aiAnalysis.achievabilityAnalysis.riskLevel === 'high'
																? '#f97316'
																: '#ef4444'};"
												>
													{aiAnalysis.achievabilityAnalysis.riskLevel === 'low'
														? '低'
														: aiAnalysis.achievabilityAnalysis.riskLevel === 'medium'
															? '中'
															: aiAnalysis.achievabilityAnalysis.riskLevel === 'high'
																? '高'
																: '重大'}
												</span>
											</div>
										{/if}

										{#if aiAnalysis.achievabilityAnalysis.predictedCompletionPoints}
											<div class="analysis-item">
												<strong>予測完了ポイント:</strong>
												{aiAnalysis.achievabilityAnalysis.predictedCompletionPoints}pt
											</div>
										{/if}
									</div>
								{/if}

								{#if aiAnalysis.progressAnalysis}
									<div class="analysis-card">
										<h5>進捗分析</h5>
										{#if aiAnalysis.progressAnalysis.currentProgressRate !== undefined}
											<div class="analysis-item">
												<strong>現在の進捗率:</strong>
												{aiAnalysis.progressAnalysis.currentProgressRate.toFixed(1)}%
											</div>
										{/if}
										{#if aiAnalysis.progressAnalysis.requiredProgressRate !== undefined}
											<div class="analysis-item">
												<strong>必要な進捗率:</strong>
												{aiAnalysis.progressAnalysis.requiredProgressRate.toFixed(1)}%
											</div>
										{/if}
										{#if aiAnalysis.progressAnalysis.burndownStatus}
											<div class="analysis-item">
												<strong>バーンダウンステータス:</strong>
												{aiAnalysis.progressAnalysis.burndownStatus}
											</div>
										{/if}
									</div>
								{/if}

								{#if aiAnalysis.riskFactors && aiAnalysis.riskFactors.length > 0}
									<div class="analysis-card">
										<h5>リスク要因</h5>
										<ul class="risk-list">
											{#each aiAnalysis.riskFactors as risk}
												<li>
													<div class="risk-item">
														<span class="risk-badge severity-{risk.severity}"
															>{risk.severity === 'low'
																? '低'
																: risk.severity === 'medium'
																	? '中'
																	: risk.severity === 'high'
																		? '高'
																		: '重大'}</span
														>
														<strong>{risk.risk}</strong>
														<p class="risk-impact">{risk.impact}</p>
														{#if risk.mitigation}
															<p class="risk-mitigation">対策: {risk.mitigation}</p>
														{/if}
													</div>
												</li>
											{/each}
										</ul>
									</div>
								{/if}

								{#if aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0}
									<div class="analysis-card">
										<h5>推奨事項</h5>
										<ul class="recommendation-list">
											{#each aiAnalysis.recommendations as rec}
												<li>
													<div class="recommendation-item">
														<div class="rec-header">
															<span class="priority-badge priority-{rec.priority}"
																>{rec.priority === 'high'
																	? '高'
																	: rec.priority === 'medium'
																		? '中'
																		: '低'}</span
															>
															<span class="category-badge"
																>{rec.category === 'scope'
																	? 'スコープ'
																	: rec.category === 'velocity'
																		? 'ベロシティ'
																		: rec.category === 'team'
																			? 'チーム'
																			: 'プロセス'}</span
															>
														</div>
														<p class="rec-action">{rec.action}</p>
														{#if rec.expectedImpact}
															<p class="rec-impact">期待効果: {rec.expectedImpact}</p>
														{/if}
													</div>
												</li>
											{/each}
										</ul>
									</div>
								{/if}

								{#if aiAnalysis.motivationalMessage}
									<div class="analysis-card motivational">
										<h5>チームへのメッセージ</h5>
										<p class="motivational-text">{aiAnalysis.motivationalMessage}</p>
									</div>
								{/if}

								{#if aiAnalysis.teamContributions && aiAnalysis.teamContributions.length > 0}
									<div class="analysis-card">
										<h5>チーム貢献度分析</h5>
										<div class="contributions-list">
											{#each aiAnalysis.teamContributions as contrib}
												<div class="contribution-item">
													<div class="contrib-header">
														<span class="member-name">{contrib.memberName}</span>
														<span class="contrib-percent"
															>{typeof contrib.contributionPercentage === 'number'
																? contrib.contributionPercentage.toFixed(1)
																: contrib.contributionPercentage}%</span
														>
													</div>
													<div class="contrib-details">
														<span>完了タスク: {contrib.tasksCompleted}</span>
														<span>完了SP: {contrib.storyPointsCompleted}</span>
													</div>
													{#if contrib.feedback}
														<div class="contrib-feedback">{contrib.feedback}</div>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								{/if}
							{:else}
								<div class="empty-state">AI分析を実行してください</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.page-actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 24px;
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
			gap: 4px; /* Ensure 4px gap */
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
			margin: 8px 0 0 0;
			font-size: 13px;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.8);
			line-height: 1.4;
		}

		.sprints-page {
			padding: 16px;
			gap: 16px;
		}

		.page-actions {
			margin-bottom: 16px;
		}

		.page-actions .btn-primary {
			width: 100%;
			justify-content: center;
		}
	}

	.sprints-page {
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		padding: 24px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 0px;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
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

	.create-form {
		background: white;
		padding: 2rem;
		border-radius: 20px;
		box-shadow: 0 8px 25px rgba(59, 130, 246, 0.1);
		margin-bottom: 2rem;
		border: 1px solid #e5e7eb;
		animation: slideDown 0.3s ease;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.create-form h3 {
		margin-top: 0;
		margin-bottom: 1.5rem;
		color: #1f2937;
		font-size: 1.5rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.create-form h3::before {
		content: '📝';
		font-size: 1.75rem;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group.full-width {
		grid-column: 1 / -1;
	}

	.form-group label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #4b5563;
	}

	.form-group input[type='text'],
	.form-group input[type='number'],
	.form-group input[type='date'],
	.form-group select,
	.form-group textarea {
		padding: 0.75rem 1rem;
		border: 2px solid #f3f4f6;
		border-radius: 12px;
		font-size: 1rem;
		transition: all 0.2s;
		background: #f9fafb;
	}

	.form-group input:focus,
	.form-group select:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
		background: white;
	}

	.form-group textarea {
		resize: vertical;
		min-height: 100px;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
	}

	.filters {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		padding: 1.5rem;
		background: white;
		border-radius: 15px;
		box-shadow: 0 4px 15px rgba(59, 130, 246, 0.1);
		border: 2px solid rgba(59, 130, 246, 0.1);
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		min-width: 200px;
		flex: 1;
	}

	.filter-group label {
		font-size: 0.75rem;
		font-weight: 700;
		color: #1f2937;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.filter-group select {
		padding: 0.75rem;
		border: 2px solid #e5e7eb;
		border-radius: 10px;
		font-size: 0.875rem;
		font-weight: 500;
		background: white;
		transition: all 0.3s;
		cursor: pointer;
	}

	.filter-group select:hover {
		border-color: #3b82f6;
	}

	.filter-group select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.content-layout {
		display: grid;
		/* grid-template-columns: 400px 1fr; */
		gap: 1.5rem;
	}

	.sprints-list {
		background: white;
		border-radius: 20px;
		box-shadow: 0 8px 25px rgba(59, 130, 246, 0.15);
		padding: 2rem;
		max-height: 800px;
		overflow-y: auto;
		border: 2px solid rgba(59, 130, 246, 0.1);
	}

	.sprint-card {
		border: 2px solid #e5e7eb;
		border-radius: 15px;
		padding: 1.5rem;
		margin-bottom: 1rem;
		cursor: pointer;
		transition: all 0.3s;
		background: white;
	}

	.sprint-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 8px 20px rgba(59, 130, 246, 0.15);
		transform: translateY(-3px);
	}

	.sprint-card.selected {
		border-color: #3b82f6;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(99, 102, 241, 0.05));
		box-shadow: 0 8px 20px rgba(59, 130, 246, 0.2);
	}

	.sprint-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.sprint-name {
		font-weight: 600;
		color: #1f2937;
	}

	.badge {
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 500;
		color: white;
	}

	.sprint-meta {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 0.5rem;
	}

	.sprint-goal {
		font-size: 0.875rem;
		color: #374151;
		margin-bottom: 0.5rem;
		line-height: 1.4;
	}

	.sprint-points {
		font-size: 0.875rem;
		color: #3b82f6;
		font-weight: 500;
	}

	.details-panel {
		background: white;
		border-radius: 20px;
		box-shadow: 0 8px 25px rgba(59, 130, 246, 0.15);
		padding: 2rem;
		max-height: 800px;
		overflow-y: auto;
		border: 2px solid rgba(59, 130, 246, 0.1);
	}

	.details-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.details-header h3 {
		margin: 0;
		color: #1f2937;
	}

	.btn-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #6b7280;
		padding: 0;
		width: 30px;
		height: 30px;
	}

	.btn-close:hover {
		color: #1f2937;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.tabs {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.tab {
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		padding: 0.875rem 1.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.3s;
	}

	.tab:hover {
		border-color: #3b82f6;
		color: #3b82f6;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
	}

	.tab.active {
		background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
		color: white;
		border-color: transparent;
		box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
	}

	.tab-content {
		min-height: 400px;
	}

	.overview-section h4,
	.progress-section h4,
	.performance-section h4,
	.analysis-section h4 {
		color: #1f2937;
		margin-top: 0;
		margin-bottom: 1rem;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
	}

	.info-label {
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 0.25rem;
	}

	.info-value {
		font-size: 1rem;
		font-weight: 600;
		color: #1f2937;
	}

	.goal-text {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(99, 102, 241, 0.05));
		padding: 1.5rem;
		border-radius: 15px;
		line-height: 1.8;
		color: #1f2937;
		border-left: 4px solid #3b82f6;
		font-weight: 500;
		box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(99, 102, 241, 0.05));
		padding: 1.5rem;
		border-radius: 15px;
		border: 2px solid rgba(59, 130, 246, 0.1);
		transition: all 0.3s;
		position: relative;
		overflow: hidden;
	}

	.stat-card::before {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		width: 60px;
		height: 60px;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.1));
		border-radius: 0 0 0 100%;
	}

	.stat-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 8px 20px rgba(59, 130, 246, 0.15);
		transform: translateY(-3px);
	}

	.stat-label {
		font-size: 0.75rem;
		color: #6b7280;
		margin-bottom: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.progress-info {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.progress-table,
	.performance-table {
		overflow-x: auto;
		margin-bottom: 2rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	th {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(20, 184, 166, 0.1));
		padding: 1rem 0.75rem;
		text-align: left;
		font-weight: 700;
		color: #1f2937;
		border-bottom: 3px solid #10b981;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.5px;
	}

	td {
		padding: 1rem 0.75rem;
		border-bottom: 1px solid #e5e7eb;
		color: #1f2937;
		font-weight: 500;
	}

	tbody tr {
		transition: all 0.2s;
	}

	tbody tr:hover {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(20, 184, 166, 0.05));
		transform: scale(1.01);
		box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
	}

	.chart-placeholder {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(20, 184, 166, 0.05));
		border: 3px dashed rgba(16, 185, 129, 0.3);
		border-radius: 20px;
		padding: 4rem 3rem;
		text-align: center;
		color: #6b7280;
		transition: all 0.3s;
	}

	.chart-placeholder:hover {
		border-color: #10b981;
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(20, 184, 166, 0.1));
	}

	.chart-placeholder p {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0.5rem 0;
	}

	.chart-note {
		font-size: 0.875rem;
		margin-top: 0.75rem;
		color: #9ca3af;
	}

	.analysis-card {
		background: white;
		padding: 2rem;
		border-radius: 20px;
		margin-bottom: 1.5rem;
		border: 2px solid rgba(16, 185, 129, 0.2);
		box-shadow: 0 4px 15px rgba(16, 185, 129, 0.1);
		transition: all 0.3s;
	}

	.analysis-card:hover {
		border-color: #10b981;
		box-shadow: 0 8px 25px rgba(16, 185, 129, 0.2);
		transform: translateY(-3px);
	}

	.analysis-card h5 {
		margin-top: 0;
		margin-bottom: 1.5rem;
		color: #1f2937;
		font-size: 1.25rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.analysis-card h5::before {
		content: '✨';
		font-size: 1.5rem;
	}

	.score-display {
		display: flex;
		justify-content: center;
		margin: 2rem 0;
	}

	.score-circle {
		width: 180px;
		height: 180px;
		border-radius: 50%;
		border: 10px solid;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		position: relative;
		animation: pulse 2s infinite;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.05);
		}
	}

	.score-value {
		font-size: 3.5rem;
		font-weight: 700;
		background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.score-label {
		font-size: 1.1rem;
		color: #6b7280;
		font-weight: 600;
	}

	.analysis-item {
		margin-bottom: 1rem;
	}

	.analysis-item strong {
		color: #374151;
	}

	.analysis-item p {
		margin-top: 0.5rem;
		line-height: 1.6;
		color: #1f2937;
	}

	.risk-list,
	.recommendation-list {
		margin: 0;
		padding-left: 0;
		list-style: none;
	}

	.risk-list li,
	.recommendation-list li {
		margin-bottom: 1rem;
		color: #1f2937;
		line-height: 1.6;
		padding: 1rem;
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(20, 184, 166, 0.05));
		border-radius: 10px;
		border-left: 3px solid #10b981;
		transition: all 0.2s;
	}

	.risk-list li:hover,
	.recommendation-list li:hover {
		transform: translateX(5px);
		box-shadow: 0 2px 8px rgba(16, 185, 129, 0.15);
	}

	.risk-item,
	.recommendation-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.risk-badge,
	.priority-badge,
	.category-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.risk-badge.severity-low {
		background: #d1fae5;
		color: #065f46;
	}

	.risk-badge.severity-medium {
		background: #fef3c7;
		color: #92400e;
	}

	.risk-badge.severity-high {
		background: #fed7aa;
		color: #9a3412;
	}

	.risk-badge.severity-critical {
		background: #fee2e2;
		color: #991b1b;
	}

	.priority-badge.priority-high {
		background: #fee2e2;
		color: #991b1b;
	}

	.priority-badge.priority-medium {
		background: #fef3c7;
		color: #92400e;
	}

	.priority-badge.priority-low {
		background: #dbeafe;
		color: #1e40af;
	}

	.category-badge {
		background: #e0e7ff;
		color: #3730a3;
	}

	.rec-header {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.rec-action {
		font-weight: 500;
		color: #1f2937;
		margin: 0;
	}

	.rec-impact {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0;
		font-style: italic;
	}

	.risk-impact,
	.risk-mitigation {
		font-size: 0.875rem;
		color: #374151;
		margin: 0.25rem 0 0 0;
	}

	.risk-mitigation {
		color: #059669;
		font-weight: 500;
	}

	.motivational {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(20, 184, 166, 0.1));
		border: 2px solid #10b981;
	}

	.motivational-text {
		font-size: 1rem;
		line-height: 1.8;
		color: #1f2937;
		font-weight: 500;
		margin: 0;
	}

	.contributions-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.contribution-item {
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(20, 184, 166, 0.05));
		padding: 1.5rem;
		border-radius: 15px;
		border-left: 4px solid #10b981;
		transition: all 0.3s;
		box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
	}

	.contribution-item:hover {
		border-left-width: 6px;
		box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2);
		transform: translateX(5px);
	}

	.contrib-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.member-name {
		font-weight: 600;
		color: #1f2937;
	}

	.contrib-percent {
		font-size: 1.5rem;
		font-weight: 700;
		background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.contrib-details {
		display: flex;
		gap: 1rem;
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 0.5rem;
	}

	.contrib-feedback {
		font-size: 0.875rem;
		color: #374151;
		font-style: italic;
	}

	.btn-primary {
		background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%);
		color: white;
		border: none;
		padding: 0.875rem 1.75rem;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s;
		box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
	}

	.btn-primary:disabled {
		background: #9ca3af;
		cursor: not-allowed;
		opacity: 0.6;
	}

	.btn-primary i {
		font-size: 1.2rem;
	}

	.btn-secondary {
		background: #6b7280;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-secondary:hover {
		background: #4b5563;
	}

	.btn-success {
		background: #22c55e;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-success:hover {
		background: #16a34a;
	}

	.btn-small {
		background: #3b82f6;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-small:hover:not(:disabled) {
		background: #2563eb;
	}

	.btn-small:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.loading {
		text-align: center;
		padding: 3rem;
		color: #10b981;
		font-size: 1.1rem;
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

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: #6b7280;
		background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(20, 184, 166, 0.05));
		border-radius: 20px;
		margin: 2rem 0;
		border: 2px dashed rgba(16, 185, 129, 0.3);
		font-size: 1.1rem;
		font-weight: 600;
	}

	.empty-state::before {
		content: '📭';
		display: block;
		font-size: 4rem;
		margin-bottom: 1rem;
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

	@media (max-width: 1200px) {
		.content-layout {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 768px) {
		.form-grid {
			grid-template-columns: 1fr;
		}

		.stats-grid {
			grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		}

		.btn-primary {
			width: 100%;
			justify-content: center;
		}

		.action-buttons {
			flex-direction: column;
		}

		.action-buttons button {
			width: 100%;
		}

		.tabs {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
		}

		.tab {
			white-space: nowrap;
			flex-shrink: 0;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.sprints-page {
			padding: 1rem;
		}

		.btn-primary {
			padding: 0.875rem 1.25rem;
			min-height: 48px; /* タッチターゲット確保 */
		}

		.create-form {
			padding: 1.25rem;
		}

		.create-form h3 {
			font-size: 1.25rem;
		}

		.filters {
			padding: 1rem;
			gap: 1rem;
		}

		.sprint-card {
			padding: 1rem;
		}

		.sprint-name {
			font-size: 0.9375rem;
		}

		.sprint-meta,
		.sprint-goal {
			font-size: 0.8125rem;
		}

		.details-panel {
			padding: 1.25rem;
		}

		.details-header h3 {
			font-size: 1.125rem;
		}

		.btn-close {
			width: 36px;
			height: 36px;
			font-size: 1.75rem;
		}

		.action-buttons {
			gap: 0.5rem;
		}

		.tabs {
			gap: 0.5rem;
		}

		.tab {
			padding: 0.75rem 1rem;
			font-size: 0.8125rem;
		}

		.info-grid,
		.stats-grid {
			grid-template-columns: 1fr;
		}

		.stat-card {
			padding: 1rem;
		}

		.stat-label {
			font-size: 0.6875rem;
		}

		.stat-value {
			font-size: 1.5rem;
		}

		.goal-text {
			padding: 1rem;
			font-size: 0.875rem;
		}

		.btn-small {
			padding: 0.625rem 0.875rem;
			font-size: 0.8125rem;
			min-height: 40px;
		}

		/* テーブルをカード表示に切り替え */
		.progress-table table,
		.progress-table thead,
		.progress-table tbody,
		.progress-table tr,
		.performance-table table,
		.performance-table thead,
		.performance-table tbody,
		.performance-table tr {
			display: block;
		}

		.progress-table thead,
		.performance-table thead {
			display: none;
		}

		.progress-table tr,
		.performance-table tr {
			margin-bottom: 0.75rem;
			border: 2px solid rgba(16, 185, 129, 0.2);
			border-radius: 12px;
			padding: 0.875rem;
			background: white;
		}

		.progress-table td,
		.performance-table td {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0.5rem 0;
			border-bottom: 1px solid #f3f4f6;
			font-size: 0.8125rem;
		}

		.progress-table td:last-child,
		.performance-table td:last-child {
			border-bottom: none;
		}

		.progress-table td::before,
		.performance-table td::before {
			content: attr(data-label);
			font-weight: 600;
			color: #6b7280;
			margin-right: 0.75rem;
			flex-shrink: 0;
			font-size: 0.75rem;
		}

		.chart-wrapper {
			min-width: 320px;
		}

		.analysis-card {
			padding: 1.25rem;
		}

		.analysis-card h5 {
			font-size: 1.125rem;
		}

		.score-circle {
			width: 140px;
			height: 140px;
			border-width: 8px;
		}

		.score-value {
			font-size: 2.75rem;
		}

		.score-label {
			font-size: 1rem;
		}
	}
</style>
