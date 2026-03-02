<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';

	let helpRequests: any[] = [];
	let projects: any[] = [];
	let members: any[] = [];
	let tasks: any[] = [];
	let stats: any = null;
	let topHelpers: any[] = [];
	let selectedRequest: any = null;
	let helperSuggestions: any[] = [];
	let showDetailModal = false;
	let loggedInUserId: number | null = null;
	let isCreating = false;
	let isAssigning = false;
	let isResolving = false;
	let deletingRequestIds = new Set<number>();

	// Filters
	let filterStatus: string = 'all';
	let filterUrgency: string = 'all';
	let filterProject: number | null = null;

	// Create form
	let showCreateForm = false;
	let createFormProjectId: number | null = null;
	let createForm = {
		taskId: null as number | null,
		requesterId: null as number | null,
		requestTitle: '',
		requestDescription: '',
		urgency: 'medium' as 'low' | 'medium' | 'high' | 'critical',
		generateContext: true
	};

	// Assign form
	let showAssignModal = false;
	let assignRequestId: number | null = null;
	let assignHelperId: number | null = null;

	// Resolve form
	let showResolveModal = false;
	let resolveRequestId: number | null = null;
	let resolutionNote = '';
	let effectiveness: 'very_effective' | 'effective' | 'somewhat_effective' | 'not_effective' =
		'effective';

	let loading = false;
	let error = '';

	onMount(async () => {
		// ログインユーザーIDを取得
		try {
			const authJson = window.localStorage.getItem('tsutaai.auth');
			if (authJson) {
				const auth = JSON.parse(authJson);
				const authUserId = auth?.id ?? auth?.user?.id;
				const numericUserId = Number(authUserId);
				loggedInUserId = Number.isInteger(numericUserId) && numericUserId > 0 ? numericUserId : null;
			}
		} catch (e) {
			/* ignore */
		}
		await loadInitialData();
	});

	function ensureArray(data: any): any[] {
		return Array.isArray(data) ? data : [];
	}

	async function loadInitialData() {
		loading = true;
		error = '';
		try {
			const [helpRequestsRes, projectsRes, membersRes, statsRes, helpersRes] = await Promise.all([
				apiClient.fetchHelpRequests({}),
				apiClient.fetchProjects(),
				apiClient.fetchUsers(),
				apiClient.fetchHelpRequestStats(),
				apiClient.fetchTopHelpers()
			]);

			helpRequests = ensureArray(helpRequestsRes.data);
			projects = ensureArray(projectsRes.data);
			members = ensureArray(membersRes.data);
			stats = statsRes.data || null;
			topHelpers = ensureArray(helpersRes.data);
		} catch (err: any) {
			error = err.message || 'データの読み込みに失敗しました';
			console.error('Load error:', err);
		} finally {
			loading = false;
		}
	}

	async function loadHelpRequests() {
		loading = true;
		error = '';
		try {
			const filters: any = {};
			if (filterStatus !== 'all') filters.status = filterStatus;
			if (filterUrgency !== 'all') filters.urgency = filterUrgency;
			if (filterProject) filters.projectId = filterProject;

			const res = await apiClient.fetchHelpRequests(filters);
			helpRequests = ensureArray(res.data);
		} catch (err: any) {
			error = err.message || 'ヘルプリクエストの読み込みに失敗しました';
			console.error('Load error:', err);
		} finally {
			loading = false;
		}
	}

	async function createHelpRequest() {
		if (isCreating) return;

		const requesterId = createForm.requesterId || loggedInUserId;
		if (!createForm.taskId || !requesterId || !createForm.requestTitle) {
			error = 'タスク、タイトルは必須です';
			return;
		}

		loading = true;
		isCreating = true;
		error = '';
		try {
			await apiClient.createHelpRequest({
				taskId: createForm.taskId,
				requesterId: requesterId,
				requestTitle: createForm.requestTitle,
				requestDescription: createForm.requestDescription,
				urgency: createForm.urgency,
				generateContext: createForm.generateContext
			});

			showCreateForm = false;
			resetCreateForm();
			await loadHelpRequests();
		} catch (err: any) {
			error = err.message || 'ヘルプリクエストの作成に失敗しました';
			console.error('Create error:', err);
		} finally {
			isCreating = false;
			loading = false;
		}
	}

	async function onCreateFormProjectChange() {
		createForm.taskId = null;
		if (createFormProjectId) {
			try {
				const res = await apiClient.fetchTasks(createFormProjectId);
				tasks = ensureArray(res.data);
			} catch (err: any) {
				tasks = [];
			}
		} else {
			tasks = [];
		}
	}

	async function handleDelete(request: { id: number }) {
		if (deletingRequestIds.has(request.id)) return;
		if (!confirm('このリクエストを削除しますか？\nこの操作は取り消せません。')) return;

		deletingRequestIds = new Set([...deletingRequestIds, request.id]);
		try {
			await apiClient.deleteHelpRequest(request.id);
			helpRequests = helpRequests.filter((r) => r.id !== request.id);
			if (selectedRequest && selectedRequest.id === request.id) {
				selectedRequest = null;
			}
		} catch (err: any) {
			error = err.message || '削除に失敗しました。';
			console.error('Failed to delete help request:', err);
		} finally {
			const next = new Set(deletingRequestIds);
			next.delete(request.id);
			deletingRequestIds = next;
		}
	}

	function resetCreateForm() {
		createFormProjectId = null;
		tasks = [];
		createForm = {
			taskId: null,
			requesterId: null,
			requestTitle: '',
			requestDescription: '',
			urgency: 'medium',
			generateContext: true
		};
	}

	async function viewRequestDetails(requestId: number) {
		loading = true;
		error = '';
		try {
			const [requestRes, suggestionsRes] = await Promise.all([
				apiClient.fetchHelpRequest(requestId),
				apiClient.fetchHelperSuggestions(requestId)
			]);

			selectedRequest = requestRes.data;
			helperSuggestions = ensureArray(suggestionsRes.data);
			showDetailModal = true;
		} catch (err: any) {
			error = err.message || 'リクエスト詳細の読み込みに失敗しました';
			console.error('Load details error:', err);
		} finally {
			loading = false;
		}
	}

	function openAssignModal(requestId: number) {
		assignRequestId = requestId;
		assignHelperId = null;
		showAssignModal = true;
	}

	function closeAssignModal() {
		showAssignModal = false;
		assignRequestId = null;
		assignHelperId = null;
	}

	async function assignHelper() {
		if (isAssigning) return;
		if (!assignRequestId || !assignHelperId) {
			error = 'リクエストとヘルパーを選択してください';
			return;
		}

		const currentAssignRequestId = assignRequestId;
		const currentSelectedId = selectedRequest?.id;
		loading = true;
		isAssigning = true;
		error = '';
		try {
			await apiClient.assignHelpRequest(currentAssignRequestId, assignHelperId);
			closeAssignModal();
			await loadHelpRequests();
			if (currentSelectedId === currentAssignRequestId) {
				await viewRequestDetails(currentAssignRequestId);
			}
		} catch (err: any) {
			error = err.message || 'ヘルパーの割り当てに失敗しました';
			console.error('Assign error:', err);
		} finally {
			isAssigning = false;
			loading = false;
		}
	}

	function openResolveModal(requestId: number) {
		resolveRequestId = requestId;
		resolutionNote = '';
		effectiveness = 'effective';
		showResolveModal = true;
	}

	function closeResolveModal() {
		showResolveModal = false;
		resolveRequestId = null;
		resolutionNote = '';
		effectiveness = 'effective';
	}

	async function resolveRequest() {
		if (isResolving) return;
		if (!resolveRequestId || !resolutionNote) {
			error = '解決ノートを入力してください';
			return;
		}

		const currentResolveId = resolveRequestId;
		const currentSelectedId = selectedRequest?.id;
		loading = true;
		isResolving = true;
		error = '';
		try {
			await apiClient.resolveHelpRequest(currentResolveId, resolutionNote, effectiveness);
			closeResolveModal();
			await loadHelpRequests();
			if (currentSelectedId === currentResolveId) {
				await viewRequestDetails(currentResolveId);
			}
		} catch (err: any) {
			error = err.message || 'リクエストの解決に失敗しました';
			console.error('Resolve error:', err);
		} finally {
			isResolving = false;
			loading = false;
		}
	}

	function getUrgencyColor(urgency: string): string {
		switch (urgency) {
			case 'critical':
				return '#ef4444';
			case 'high':
				return '#f97316';
			case 'medium':
				return '#eab308';
			case 'low':
				return '#22c55e';
			default:
				return '#6b7280';
		}
	}

	function getStatusBadge(status: string): string {
		switch (status) {
			case 'open':
				return 'オープン';
			case 'assigned':
				return '割り当て済み';
			case 'in_progress':
				return '対応中';
			case 'resolved':
				return '解決済み';
			default:
				return status;
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'open':
				return '#eab308';
			case 'assigned':
				return '#3b82f6';
			case 'in_progress':
				return '#8b5cf6';
			case 'resolved':
				return '#27824F';
			default:
				return '#6b7280';
		}
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		return (
			date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) +
			' ' +
			date.toLocaleTimeString('ja-JP', {
				timeZone: 'Asia/Tokyo',
				hour: '2-digit',
				minute: '2-digit'
			})
		);
	}

	function closeRequestDetails() {
		selectedRequest = null;
		helperSuggestions = [];
		showDetailModal = false;
	}

	function getEffectivenessLabel(val: string): string {
		switch (val) {
			case 'very_effective':
				return '非常に効果的';
			case 'effective':
				return '効果的';
			case 'somewhat_effective':
				return 'やや効果的';
			case 'not_effective':
				return '効果なし';
			default:
				return val || '-';
		}
	}

	function parseIssues(jsonStr: string | any): string[] {
		if (!jsonStr) return [];
		try {
			const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
			return Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			return [];
		}
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-question-circle"></i>
				ヘルプリクエスト
			</h1>
			<p>AI駆動のヘルプマッチング</p>
		</div>
	</header>
</div>

<div class="help-requests-page">
	<div class="page-actions">
		<button class="refresh-btn" on:click={loadHelpRequests} disabled={loading}>
			<i class="bi bi-arrow-clockwise" class:spin={loading}></i>
			更新
		</button>
		<button class="btn-primary" on:click={() => (showCreateForm = !showCreateForm)}>
			<i class="bi bi-plus-circle"></i>
			新規リクエスト作成
		</button>
	</div>

	{#if error}
		<div class="error-message">
			<i class="bi bi-exclamation-triangle-fill"></i>
			<span>{error}</span>
		</div>
	{/if}

	<!-- Stats Dashboard -->
	{#if stats}
		<section class="stats-section">
			<h2>
				<i class="bi bi-graph-up"></i>
				統計ダッシュボード
			</h2>
			<div class="stats-grid">
				<div class="stat-card total">
					<div class="card-icon">
						<i class="bi bi-clipboard-check"></i>
					</div>
					<div class="card-content">
						<div class="stat-label">総リクエスト数</div>
						<div class="stat-value">{stats?.total || 0}</div>
					</div>
				</div>
				<div class="stat-card open">
					<div class="card-icon">
						<i class="bi bi-hourglass-split"></i>
					</div>
					<div class="card-content">
						<div class="stat-label">オープン</div>
						<div class="stat-value">{stats?.open || 0}</div>
					</div>
				</div>
				<div class="stat-card in-progress">
					<div class="card-icon">
						<i class="bi bi-gear-fill"></i>
					</div>
					<div class="card-content">
						<div class="stat-label">対応中</div>
						<div class="stat-value">{stats?.inProgress || 0}</div>
					</div>
				</div>
				<div class="stat-card resolved">
					<div class="card-icon">
						<i class="bi bi-check-circle-fill"></i>
					</div>
					<div class="card-content">
						<div class="stat-label">解決済み</div>
						<div class="stat-value">{stats?.resolved || 0}</div>
					</div>
				</div>
				<div class="stat-card rate">
					<div class="card-icon">
						<i class="bi bi-percent"></i>
					</div>
					<div class="card-content">
						<div class="stat-label">解決率</div>
						<div class="stat-value">
							{stats?.resolved && stats?.total
								? ((stats.resolved / stats.total) * 100).toFixed(1)
								: '0.0'}%
						</div>
					</div>
				</div>
				<div class="stat-card time">
					<div class="card-icon">
						<i class="bi bi-clock-history"></i>
					</div>
					<div class="card-content">
						<div class="stat-label">平均解決日数</div>
						<div class="stat-value">
							{stats?.avgResolutionDays ? stats.avgResolutionDays.toFixed(1) : '0.0'}日
						</div>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- Top Helpers -->
	{#if topHelpers.length > 0}
		<section class="top-helpers">
			<h3>
				<i class="bi bi-trophy-fill"></i>
				トップヘルパー
			</h3>
			<div class="helpers-grid">
				{#each topHelpers as helper}
					<div class="helper-card">
						<div class="helper-icon">
							<i class="bi bi-person-badge"></i>
						</div>
						<div class="helper-content">
							<div class="helper-name">{helper.full_name}</div>
							<div class="helper-stats">
								<span><i class="bi bi-check-circle-fill"></i> 解決数: {helper.resolvedHelps}</span>
								<span><i class="bi bi-list-check"></i> 総対応: {helper.totalHelps}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Create Form Modal -->
	{#if showCreateForm}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="modal-overlay"
			on:click|self={() => {
				showCreateForm = false;
				resetCreateForm();
			}}
		>
			<div class="modal-content modal-large">
				<div class="modal-header">
					<h3>
						<i class="bi bi-file-earmark-plus"></i>
						新規ヘルプリクエスト作成
					</h3>
					<button
						class="btn-close"
						on:click={() => {
							showCreateForm = false;
							resetCreateForm();
						}}>×</button
					>
				</div>

				<div class="modal-body">
					<div class="form-grid">
						<div class="form-group">
							<label for="createProjectId">プロジェクト *</label>
							<select
								id="createProjectId"
								bind:value={createFormProjectId}
								on:change={onCreateFormProjectChange}
							>
								<option value={null}>-- プロジェクトを選択 --</option>
								{#each projects as project}
									<option value={project.id}>{project.name}</option>
								{/each}
							</select>
						</div>

						<div class="form-group">
							<label for="taskId">タスク *</label>
							<select id="taskId" bind:value={createForm.taskId} disabled={!createFormProjectId}>
								<option value={null}>-- タスクを選択 --</option>
								{#each tasks as task}
									<option value={task.id}>{task.name || task.title}</option>
								{/each}
							</select>
						</div>

						<div class="form-group">
							<label for="urgency">緊急度</label>
							<select id="urgency" bind:value={createForm.urgency}>
								<option value="low">低</option>
								<option value="medium">中</option>
								<option value="high">高</option>
								<option value="critical">緊急</option>
							</select>
						</div>

						<div class="form-group full-width">
							<label for="requestTitle">タイトル *</label>
							<input
								type="text"
								id="requestTitle"
								bind:value={createForm.requestTitle}
								placeholder="例: データベース接続エラーの調査"
							/>
						</div>

						<div class="form-group full-width">
							<label for="requestDescription">説明</label>
							<textarea
								id="requestDescription"
								bind:value={createForm.requestDescription}
								rows="4"
								placeholder="詳細を入力してください..."
							></textarea>
						</div>

						<div class="form-group full-width">
							<label>
								<input type="checkbox" bind:checked={createForm.generateContext} />
								AIによるコンテキスト自動生成
							</label>
						</div>
					</div>
				</div>

				<div class="modal-footer">
					<button
						class="btn-secondary"
						on:click={() => {
							showCreateForm = false;
							resetCreateForm();
						}}
					>
						キャンセル
					</button>
					<button class="btn-primary" on:click={createHelpRequest} disabled={loading || isCreating}>
						{loading || isCreating ? '作成中...' : 'リクエスト作成'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Filters -->
	<div class="filters">
		<div class="filter-group">
			<label for="filterStatus">ステータス</label>
			<select id="filterStatus" bind:value={filterStatus} on:change={loadHelpRequests}>
				<option value="all">すべて</option>
				<option value="open">オープン</option>
				<option value="assigned">割り当て済み</option>
				<option value="in_progress">対応中</option>
				<option value="resolved">解決済み</option>
			</select>
		</div>

		<div class="filter-group">
			<label for="filterUrgency">緊急度</label>
			<select id="filterUrgency" bind:value={filterUrgency} on:change={loadHelpRequests}>
				<option value="all">すべて</option>
				<option value="low">低</option>
				<option value="medium">中</option>
				<option value="high">高</option>
				<option value="critical">緊急</option>
			</select>
		</div>

		<div class="filter-group">
			<label for="filterProject">プロジェクト</label>
			<select id="filterProject" bind:value={filterProject} on:change={loadHelpRequests}>
				<option value={null}>すべて</option>
				{#each projects as project}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Help Requests List -->
	<section class="requests-section">
		<h2>
			<i class="bi bi-list-ul"></i>
			リクエスト一覧
		</h2>
		<div class="requests-container">
			{#if loading}
				<div class="loading">読み込み中...</div>
			{:else if helpRequests.length === 0}
				<div class="empty-state">ヘルプリクエストがありません</div>
			{:else}
				<div class="requests-list">
					{#each helpRequests as request}
						<div class="request-card" class:selected={selectedRequest?.id === request.id}>
							<div class="request-header">
								<div class="request-title" on:click={() => viewRequestDetails(request.id)}>
									{request.requestTitle}
								</div>
								<div class="request-badges">
									<span class="badge" style="background: {getStatusColor(request.status)};">
										{getStatusBadge(request.status)}
									</span>
									<span class="badge" style="background: {getUrgencyColor(request.urgency)};">
										{request.urgency}
									</span>
								</div>
							</div>

							<div class="request-meta">
								<span>リクエスター: {request.requesterName || `ID:${request.requesterId}`}</span>
								<span>作成: {formatDate(request.createdAt)}</span>
								{#if request.assignedTo}
									<span>ヘルパー: {request.assignedToName || `ID:${request.assignedTo}`}</span>
								{/if}
							</div>

							<div class="request-actions">
								{#if request.status === 'open'}
									<button
										class="btn-small btn-primary"
										on:click={() => openAssignModal(request.id)}
									>
										割り当て
									</button>
								{/if}
								{#if request.status === 'assigned' || request.status === 'in_progress'}
									<button
										class="btn-small btn-success"
										on:click={() => openResolveModal(request.id)}
									>
										解決
									</button>
								{/if}
								<button
									class="btn-small btn-secondary delete-btn"
									on:click|stopPropagation={() => handleDelete(request)}
									title="削除"
									disabled={deletingRequestIds.has(request.id)}
								>
									<i class="bi bi-trash"></i>
								</button>
								<button
									class="btn-small btn-secondary"
									on:click={() => viewRequestDetails(request.id)}
								>
									詳細表示
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- Request Details Modal -->
	{#if showDetailModal && selectedRequest}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" on:click|self={closeRequestDetails}>
			<div class="modal-content modal-detail">
				<div class="details-header">
					<h3>リクエスト詳細</h3>
					<div class="panel-actions">
						<button
							class="btn-close delete-btn"
							on:click={() => handleDelete(selectedRequest)}
							title="削除"
							disabled={deletingRequestIds.has(selectedRequest.id)}
						>
							<i class="bi bi-trash"></i>
						</button>
						<button class="btn-close" on:click={closeRequestDetails}>×</button>
					</div>
				</div>

				<div class="details-content">
					<div class="detail-section">
						<h4>{selectedRequest.requestTitle}</h4>
						<div class="request-badges mb-2">
							<span class="badge" style="background: {getStatusColor(selectedRequest.status)};">
								{getStatusBadge(selectedRequest.status)}
							</span>
							<span class="badge" style="background: {getUrgencyColor(selectedRequest.urgency)};">
								{selectedRequest.urgency}
							</span>
							{#if selectedRequest.assignedTo}
								<span class="badge" style="background: #3b82f6;">
									<i class="bi bi-person-check-fill"></i>
									担当: {selectedRequest.assignedToName || '不明'}
								</span>
							{/if}
						</div>
						<p class="text-pre-wrap">{selectedRequest.requestDescription || '説明なし'}</p>
					</div>

					{#if selectedRequest.problemType || selectedRequest.detectedIssues}
						<div class="detail-section">
							<h4>AIコンテキスト分析</h4>
							{#if selectedRequest.problemType}
								<div class="mb-2">
									<strong><i class="bi bi-tag-fill"></i> 問題タイプ:</strong>
									{selectedRequest.problemType}
								</div>
							{/if}
							{#if selectedRequest.detectedIssues}
								<div class="issues-list">
									<strong><i class="bi bi-exclamation-circle-fill"></i> 検出された課題:</strong>
									<ul>
										{#each parseIssues(selectedRequest.detectedIssues) as issue}
											<li>{issue}</li>
										{:else}
											<li>特になし</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/if}

					{#if helperSuggestions.length > 0}
						<div class="detail-section">
							<h4>推奨ヘルパー</h4>
							<div class="suggestions-list">
								{#each helperSuggestions as suggestion}
									<div class="suggestion-card">
										<div class="suggestion-header">
											<span class="helper-name">{suggestion.full_name}</span>
											<span
												class="recommendation-level"
												style="background: {suggestion.total_match_score >= 90
													? '#27824F'
													: suggestion.total_match_score >= 80
														? '#3b82f6'
														: '#6b7280'};"
											>
												{suggestion.total_match_score >= 90
													? '推奨(高)'
													: suggestion.total_match_score >= 80
														? '推奨'
														: '候補'}
											</span>
										</div>
										<div class="suggestion-scores">
											<span>スキル: {suggestion.skill_match_score}%</span>
											<span>可用性: {suggestion.availability_score}%</span>
											<span>経験: {suggestion.experience_score}%</span>
											<span>総合: {suggestion.total_match_score}%</span>
										</div>
										<div class="suggestion-reason">{suggestion.ai_reasoning}</div>
										{#if selectedRequest.status === 'open'}
											<button
												class="btn-small btn-primary"
												on:click={() => {
													assignHelperId = suggestion.suggested_user_id;
													assignRequestId = selectedRequest.id;
													assignHelper();
												}}
												disabled={isAssigning || loading}
											>
												{isAssigning || loading
													? '割り当て中...'
													: 'このヘルパーを割り当て'}
											</button>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if selectedRequest.resolutionNotes}
						<div class="detail-section">
							<h4>解決ノート</h4>
							<p>{selectedRequest.resolutionNotes}</p>
							<p><strong>効果:</strong> {getEffectivenessLabel(selectedRequest.effectiveness)}</p>
							<p><strong>解決日時:</strong> {formatDate(selectedRequest.resolvedAt)}</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Assign Modal -->
	{#if showAssignModal}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" on:click={closeAssignModal}>
			<div class="modal-content modal-padded" on:click|stopPropagation>
				<h3>ヘルパー割り当て</h3>
				<div class="form-group">
					<label for="assignHelper">ヘルパーを選択</label>
					<select id="assignHelper" bind:value={assignHelperId}>
						<option value={null}>選択してください</option>
						{#each members as member}
							<option value={member.id}>{member.fullName}</option>
						{/each}
					</select>
				</div>
				<div class="modal-actions">
					<button class="btn-secondary" on:click={closeAssignModal}>キャンセル</button>
					<button
						class="btn-primary"
						on:click={assignHelper}
						disabled={!assignHelperId || loading || isAssigning}
					>
						{loading || isAssigning ? '割り当て中...' : '割り当て'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Resolve Modal -->
	{#if showResolveModal}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" on:click={closeResolveModal}>
			<div class="modal-content modal-padded" on:click|stopPropagation>
				<h3>リクエスト解決</h3>
				<div class="form-group">
					<label for="resolutionNote">解決ノート *</label>
					<textarea
						id="resolutionNote"
						bind:value={resolutionNote}
						rows="4"
						placeholder="解決内容を入力してください..."
					></textarea>
				</div>
				<div class="form-group">
					<label for="effectiveness">効果</label>
					<select id="effectiveness" bind:value={effectiveness}>
						<option value="very_effective">非常に効果的</option>
						<option value="effective">効果的</option>
						<option value="somewhat_effective">やや効果的</option>
						<option value="not_effective">効果なし</option>
					</select>
				</div>
				<div class="modal-actions">
					<button class="btn-secondary" on:click={closeResolveModal}>キャンセル</button>
					<button
						class="btn-primary"
						on:click={resolveRequest}
						disabled={!resolutionNote || loading || isResolving}
					>
						{loading || isResolving ? '解決中...' : '解決'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.help-requests-page {
		/* Use standard page layout */
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #f9fafb;
		flex: 1;
		overflow-x: hidden;
		padding: 24px;
		box-sizing: border-box;
	}

	.page-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		margin-bottom: 24px;
	}

	.bi-arrow-clockwise.spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		100% {
			transform: rotate(360deg);
		}
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

		.help-requests-page {
			padding: 16px;
		}
	}

	.stats-section,
	.requests-section {
		margin-bottom: 2rem;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.stats-section h2,
	.requests-section h2 {
		font-size: 1.5rem;
		margin-bottom: 1.5rem;
		color: #1f2937;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.stats-section h2 i,
	.requests-section h2 i {
		font-size: 1.75rem;
		color: #fa709a;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1.5rem;
		margin-bottom: 2rem;
		max-width: 100%;
		box-sizing: border-box;
	}

	.stat-card {
		background: white;
		border: 2px solid rgba(250, 112, 154, 0.1);
		border-radius: 20px;
		padding: 2rem;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		transition: all 0.3s;
		box-shadow: 0 4px 15px rgba(250, 112, 154, 0.1);
		min-height: 140px;
		max-width: 100%;
		box-sizing: border-box;
	}

	.stat-card:hover {
		border-color: #fa709a;
		transform: translateY(-5px);
		box-shadow: 0 8px 25px rgba(250, 112, 154, 0.2);
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

	.stat-card.total .card-icon {
		background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
	}

	.stat-card.open .card-icon {
		background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
	}

	.stat-card.in-progress .card-icon {
		background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
	}

	.stat-card.resolved .card-icon {
		background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
	}

	.stat-card.rate .card-icon,
	.stat-card.time .card-icon {
		background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
	}

	.card-content {
		flex: 1;
	}

	.stat-label {
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.top-helpers {
		background: white;
		border: 2px solid rgba(250, 112, 154, 0.2);
		padding: 2rem;
		border-radius: 20px;
		box-shadow: 0 4px 15px rgba(250, 112, 154, 0.1);
		margin-bottom: 2rem;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.top-helpers h3 {
		margin-top: 0;
		margin-bottom: 1.5rem;
		color: #1f2937;
		font-weight: 700;
		font-size: 1.3rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.top-helpers h3 i {
		font-size: 1.5rem;
		color: #fa709a;
	}

	.helpers-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
		max-width: 100%;
		box-sizing: border-box;
	}

	.helper-card {
		background: linear-gradient(135deg, rgba(250, 112, 154, 0.05), rgba(254, 225, 64, 0.05));
		padding: 1.5rem;
		border-radius: 15px;
		border: 2px solid rgba(250, 112, 154, 0.2);
		transition: all 0.3s;
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.helper-card:hover {
		border-color: #fa709a;
		box-shadow: 0 4px 15px rgba(250, 112, 154, 0.2);
		transform: translateY(-3px);
	}

	.helper-icon {
		width: 50px;
		height: 50px;
		border-radius: 12px;
		background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.75rem;
		color: white;
		flex-shrink: 0;
	}

	.helper-content {
		flex: 1;
	}

	.helper-name {
		font-weight: 700;
		color: #1f2937;
		margin-bottom: 0.75rem;
		font-size: 1.1rem;
	}

	.helper-stats {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #6b7280;
	}

	.helper-stats span {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
	}

	.helper-stats i {
		color: #fa709a;
	}

	.create-form {
		background: white;
		padding: 2rem;
		border-radius: 20px;
		box-shadow: 0 8px 25px rgba(250, 112, 154, 0.15);
		margin-bottom: 2rem;
		border: 2px solid rgba(250, 112, 154, 0.2);
		animation: slideDown 0.3s ease;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
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

	.create-form h3 i {
		font-size: 1.75rem;
		color: #fa709a;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
	}

	.form-group.full-width {
		grid-column: 1 / -1;
	}

	.form-group label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.5rem;
	}

	.form-group input[type='text'],
	.form-group input[type='number'],
	.form-group select,
	.form-group textarea {
		padding: 0.75rem;
		border: 2px solid #e5e7eb;
		border-radius: 10px;
		font-size: 0.875rem;
		transition: all 0.3s;
		background: white;
	}

	.form-group input:focus,
	.form-group select:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: #fa709a;
		box-shadow: 0 0 0 3px rgba(250, 112, 154, 0.1);
		transform: translateY(-1px);
	}

	.form-group textarea {
		resize: vertical;
		min-height: 100px;
	}

	.form-group input[type='checkbox'] {
		margin-right: 0.5rem;
		accent-color: #fa709a;
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
		box-shadow: 0 4px 15px rgba(250, 112, 154, 0.1);
		border: 2px solid rgba(250, 112, 154, 0.1);
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
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
		border-color: #fa709a;
	}

	.filter-group select:focus {
		outline: none;
		border-color: #fa709a;
		box-shadow: 0 0 0 3px rgba(250, 112, 154, 0.1);
	}

	.requests-container {
		background: white;
		border-radius: 20px;
		box-shadow: 0 4px 15px rgba(250, 112, 154, 0.1);
		padding: 2rem;
		border: 2px solid rgba(250, 112, 154, 0.1);
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.requests-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.request-card {
		border: 2px solid rgba(250, 112, 154, 0.2);
		border-radius: 15px;
		padding: 1.5rem;
		transition: all 0.3s;
		background: white;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.request-card:hover {
		border-color: #fa709a;
		box-shadow: 0 4px 15px rgba(250, 112, 154, 0.15);
		transform: translateY(-3px);
	}

	.request-card.selected {
		border-color: #fa709a;
		background: linear-gradient(135deg, rgba(250, 112, 154, 0.05), rgba(254, 225, 64, 0.05));
		box-shadow: 0 4px 15px rgba(250, 112, 154, 0.2);
	}

	.request-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.request-title {
		font-weight: 700;
		color: #1f2937;
		cursor: pointer;
		font-size: 1.1rem;
	}

	.request-title:hover {
		color: #fa709a;
	}

	.request-badges {
		display: flex;
		gap: 0.75rem;
	}

	.badge {
		padding: 0.5rem 1rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.request-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 0.75rem;
	}

	.request-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.details-panel {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		width: 500px;
		max-width: 100%;
		background: white;
		box-shadow: -5px 0 30px rgba(250, 112, 154, 0.2);
		overflow-y: auto;
		overflow-x: hidden;
		z-index: 1000;
		border-left: 2px solid rgba(250, 112, 154, 0.2);
		box-sizing: border-box;
	}

	.details-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 2rem;
		border-bottom: 2px solid rgba(250, 112, 154, 0.2);
		position: sticky;
		top: 0;
		background: linear-gradient(135deg, #fa709a 0%, #f43f5e 100%);
		z-index: 1;
	}

	.details-header h3 {
		margin: 0;
		color: white;
		font-weight: 700;
		font-size: 1.3rem;
	}

	.btn-close {
		background: rgba(255, 255, 255, 0.9);
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #fa709a;
		padding: 0;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
	}

	.modal-header .btn-close {
		background: rgba(0, 0, 0, 0.05); /* グレー背景に変更 */
		color: #6b7280; /* グレー文字に変更 */
		box-shadow: none;
		margin-left: auto; /* 右寄せを確実に */
		flex-shrink: 0; /* 縮小しない */
	}

	.modal-header .btn-close:hover {
		background: rgba(0, 0, 0, 0.1);
		color: #1f2937;
		transform: rotate(90deg);
	}

	.btn-close:hover {
		background: white;
		transform: rotate(90deg);
		color: #f43f5e;
	}

	.btn-close.delete-btn {
		color: #ef4444;
		margin-right: 0.5rem;
	}

	.btn-close.delete-btn:hover {
		transform: none;
		background: #fee2e2;
	}

	.details-content {
		padding: 1.5rem;
		padding-bottom: 80px; /* フッター分の余白 */
	}

	.details-footer {
		display: none; /* デスクトップでは非表示 */
	}

	.btn-close-bottom {
		background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
		color: white;
		border: none;
		padding: 16px 24px;
		border-radius: 12px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: all 0.3s;
	}

	.btn-close-bottom:hover {
		opacity: 0.9;
		transform: translateY(-2px);
	}

	.btn-close-bottom i {
		font-size: 20px;
	}

	.detail-section {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: linear-gradient(135deg, rgba(250, 112, 154, 0.05), rgba(254, 225, 64, 0.05));
		border-radius: 15px;
		border: 2px solid rgba(250, 112, 154, 0.1);
	}

	.detail-section h4 {
		color: #1f2937;
		margin-top: 0;
		margin-bottom: 1rem;
		font-weight: 700;
		font-size: 1.1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.detail-section h4::before {
		content: '✨';
		font-size: 1.2rem;
	}

	.detail-section pre {
		background: white;
		padding: 1.5rem;
		border-radius: 10px;
		overflow-x: auto;
		font-size: 0.875rem;
		border: 2px solid rgba(250, 112, 154, 0.1);
	}

	.suggestions-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.suggestion-card {
		background: white;
		padding: 1.5rem;
		border-radius: 15px;
		border: 2px solid rgba(250, 112, 154, 0.2);
		transition: all 0.3s;
	}

	.suggestion-card:hover {
		border-color: #fa709a;
		box-shadow: 0 4px 15px rgba(250, 112, 154, 0.2);
		transform: translateY(-2px);
	}

	.suggestion-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid rgba(250, 112, 154, 0.1);
	}

	.helper-name {
		font-weight: 700;
		font-size: 1.1rem;
		color: #1f2937;
	}

	.recommendation-level {
		padding: 0.5rem 1rem;
		border-radius: 10px;
		font-size: 0.75rem;
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.suggestion-scores {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 1rem;
	}

	.suggestion-scores span {
		background: linear-gradient(135deg, rgba(250, 112, 154, 0.05), rgba(254, 225, 64, 0.05));
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		font-weight: 600;
	}

	.suggestion-reason {
		font-size: 0.875rem;
		color: #374151;
		margin-bottom: 1rem;
		line-height: 1.6;
		font-weight: 500;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		backdrop-filter: blur(5px);
		animation: fadeIn 0.3s ease;
	}

	.modal-content {
		background: white;
		border-radius: 20px;
		max-width: 500px;
		width: 90%;
		box-shadow: 0 20px 60px rgba(250, 112, 154, 0.3);
		border: 2px solid rgba(250, 112, 154, 0.2);
		animation: slideDown 0.3s ease;
		display: flex;
		flex-direction: column;
		max-height: 90vh;
		padding: 0;
	}

	.modal-header {
		padding: 1.5rem 2rem;
		border-bottom: 2px solid rgba(250, 112, 154, 0.1);
	}

	.modal-header h3 {
		margin: 0;
		color: #1f2937;
		font-size: 1.5rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.modal-body {
		padding: 2rem;
		overflow-y: auto;
		flex: 1;
	}

	.modal-footer {
		padding: 1.5rem 2rem;
		border-top: 2px solid rgba(250, 112, 154, 0.1);
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		background: #f9fafb;
		border-radius: 0 0 20px 20px;
	}

	.modal-content.modal-large {
		max-width: 700px;
		width: 95%;
	}

	.modal-content.modal-padded {
		padding: 2rem;
	}

	.modal-content.modal-detail {
		max-width: 800px;
		width: 95%;
		max-height: 90vh;
		overflow-y: auto;
		padding: 0;
	}

	.modal-detail .details-header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem;
		background: linear-gradient(135deg, #fa709a 0%, #f43f5e 100%);
		border-radius: 18px 18px 0 0;
		border-bottom: 2px solid rgba(250, 112, 154, 0.2);
	}

	.modal-detail .details-header h3 {
		margin: 0;
		color: white;
		font-weight: 700;
		font-size: 1.3rem;
	}

	.modal-detail .details-content {
		padding: 1.5rem 2rem 2rem;
	}

	.modal-content h3 {
		margin-top: 0;
		margin-bottom: 0;
		color: #1f2937;
		font-size: 1.5rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	/* .modal-content h3::before 削除済み */

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.btn-primary {
		background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
		color: white;
		border: none;
		padding: 0.875rem 1.75rem;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s;
		box-shadow: 0 4px 15px rgba(250, 112, 154, 0.3);
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(250, 112, 154, 0.4);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-primary i {
		font-size: 1.2rem;
	}

	.refresh-btn {
		background: white;
		color: #6b7280;
		border: 2px solid #e5e7eb;
		padding: 0.75rem 1.75rem;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
	}

	.refresh-btn:hover {
		border-color: #fa709a;
		color: #fa709a;
		transform: translateY(-2px);
		box-shadow: 0 6px 12px rgba(250, 112, 154, 0.15);
	}

	.refresh-btn i {
		font-size: 1.2rem;
	}

	.btn-secondary {
		background: white;
		color: #6b7280;
		border: 2px solid #e5e7eb; /* 枠線を少し太く */
		padding: 0.875rem 1.75rem; /* primaryと同じpadding */
		border-radius: 12px; /* primaryと同じradius */
		font-weight: 600; /* primaryと同じweight */
		cursor: pointer;
		transition: all 0.3s;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
	}

	.btn-secondary:hover {
		background: #f9fafb;
		color: #1f2937;
		border-color: #d1d5db;
		transform: translateY(-2px);
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
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

	.btn-small:hover {
		background: #2563eb;
	}

	.btn-small.btn-secondary {
		background: #6b7280;
	}

	.btn-small.btn-secondary:hover {
		background: #4b5563;
	}

	.btn-small.btn-success {
		background: #27824f;
	}

	.btn-small.btn-success:hover {
		background: #27824f;
	}

	.loading {
		text-align: center;
		padding: 3rem;
		color: #fa709a;
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

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: #6b7280;
		background: linear-gradient(135deg, rgba(250, 112, 154, 0.05), rgba(254, 225, 64, 0.05));
		border-radius: 20px;
		border: 2px dashed rgba(250, 112, 154, 0.3);
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

	@media (max-width: 768px) {
		.help-requests-page {
			padding: 1rem;
		}

		.btn-primary {
			width: 100%;
			justify-content: center;
		}

		.stats-grid,
		.helpers-grid {
			grid-template-columns: 1fr;
		}

		.details-panel {
			width: 100%;
			max-width: 100%;
		}

		.details-header .btn-close {
			display: flex; /* モバイルでも閉じるボタンを表示 */
		}

		.details-footer {
			display: block;
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			padding: 12px 16px;
			background: white;
			border-top: 2px solid rgba(250, 112, 154, 0.2);
			box-shadow: 0 -4px 15px rgba(250, 112, 154, 0.1);
			z-index: 2;
		}

		.filters {
			flex-direction: column;
			gap: 1rem;
		}

		.filter-group {
			min-width: 100%;
			width: 100%;
		}

		.request-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.75rem;
		}

		.request-badges {
			flex-wrap: wrap;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.help-requests-page {
			padding: 16px;
			max-width: 100%;
			overflow-x: hidden;
		}

		.page-header {
			padding: 16px;
			border-radius: 16px;
			margin-bottom: 16px;
			max-width: 100%;
		}

		.icon-wrapper {
			width: 48px;
			height: 48px;
			font-size: 24px;
			border-radius: 12px;
		}

		.page-header h1 {
			font-size: 20px;
			margin: 0 0 4px;
		}

		.subtitle {
			font-size: 13px;
		}

		.refresh-btn {
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
			width: 100%;
		}

		.stats-grid,
		.helpers-grid {
			gap: 12px;
		}

		.stat-card {
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

		.main-content {
			padding: 16px;
			border-radius: 16px;
			margin-bottom: 16px;
		}

		.section-header {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
			margin-bottom: 16px;
		}

		.section-title {
			gap: 8px;
		}

		.section-title i {
			font-size: 20px;
		}

		.section-title h2 {
			font-size: 18px;
		}

		.action-buttons {
			flex-direction: column;
			width: 100%;
		}

		.action-buttons .btn-primary,
		.action-buttons .btn-secondary {
			width: 100%;
			min-height: 48px;
		}

		.filters {
			gap: 10px;
		}

		.filter-group {
			flex-direction: column;
			gap: 6px;
		}

		.filter-group label {
			font-size: 12px;
		}

		.filter-group select {
			padding: 10px 12px;
			font-size: 14px;
			min-height: 44px;
		}

		.request-card {
			padding: 14px;
			border-radius: 12px;
			gap: 10px;
		}

		.request-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
		}

		.request-title {
			font-size: 15px;
		}

		.urgency-badge {
			padding: 6px 10px;
			font-size: 11px;
		}

		.request-meta {
			flex-direction: column;
			gap: 8px;
		}

		.meta-item {
			font-size: 12px;
		}

		.request-description {
			font-size: 13px;
		}

		.request-footer {
			flex-direction: column;
			gap: 8px;
		}

		.btn-small {
			padding: 10px 14px;
			font-size: 13px;
			min-height: 44px;
			width: 100%;
		}

		.details-panel {
			padding: 16px;
			border-radius: 16px;
		}

		.detail-section h3 {
			font-size: 16px;
		}

		.suggestions-list {
			gap: 10px;
		}

		.suggestion-card {
			padding: 12px;
			border-radius: 10px;
		}

		.helper-info .helper-name {
			font-size: 14px;
		}

		.modal-overlay .modal-content {
			max-width: 100%;
			width: 95%;
			padding: 0;
			border-radius: 16px;
		}

		.modal-overlay .modal-content.modal-padded {
			padding: 20px;
		}

		.modal-header h2 {
			font-size: 18px;
		}

		.form-group label {
			font-size: 13px;
		}

		.form-group input,
		.form-group select,
		.form-group textarea {
			padding: 10px 12px;
			font-size: 14px;
			min-height: 44px;
		}

		.form-group input[type='checkbox'] {
			min-height: 0px;
		}

		.modal-actions {
			flex-direction: column;
		}

		.modal-actions .btn-primary,
		.modal-actions .btn-secondary {
			width: 100%;
			min-height: 48px;
		}

		.empty-state {
			padding: 40px 16px;
			font-size: 14px;
		}

		.helper-card {
			padding: 14px;
			border-radius: 12px;
		}

		.helper-stat {
			font-size: 13px;
		}

		.helper-stat .stat-value {
			font-size: 20px;
		}

		.modal-content.modal-detail,
		.modal-content.modal-large,
		.modal-content {
			width: 100vw;
			height: 100vh;
			max-height: 100vh;
			border-radius: 0;
		}

		.modal-header {
			padding: 1rem; /* 左右を少し狭く */
		}

		.modal-body {
			padding: 1rem; /* 左右を少し狭く */
		}

		.modal-footer {
			padding: 1rem; /* 左右を少し狭く */
			gap: 0.75rem; /* ボタン間隔を少し狭く */
		}

		.modal-detail .details-content {
			padding: 12px 12px 80px; /* パディングを縮小 (左右12px) */
		}

		/* ボタンを横並びにするためにflex-direction修正 */
		.modal-footer {
			flex-direction: row;
		}

		.modal-footer .btn-primary,
		.modal-footer .btn-secondary {
			flex: 1; /* 幅を均等に */
			padding: 0.75rem 0.5rem; /* 文字数が多い場合に備えて横paddingを減らす */
			font-size: 0.9rem;
		}
	}

	/* 390px以下での最適化 */
	@media (max-width: 390px) {
		.help-requests-page {
			padding: 10px;
			max-width: 100vw;
			overflow-x: hidden;
		}

		.page-header {
			padding: 12px;
			border-radius: 14px;
			margin-bottom: 12px;
		}

		.icon-wrapper {
			width: 40px;
			height: 40px;
			font-size: 20px;
			border-radius: 10px;
		}

		.page-header h1 {
			font-size: 18px;
			margin: 0 0 4px;
		}

		.subtitle {
			font-size: 12px;
		}

		.btn-primary {
			padding: 10px 14px;
			font-size: 13px;
			min-height: 44px;
		}

		.stats-grid,
		.helpers-grid {
			gap: 10px;
		}

		.stat-card {
			padding: 12px;
			gap: 10px;
			border-radius: 14px;
			min-height: 120px;
		}

		.card-icon {
			width: 40px;
			height: 40px;
			font-size: 20px;
			border-radius: 10px;
		}

		.stat-label {
			font-size: 10px;
		}

		.stat-value {
			font-size: 24px;
		}

		.top-helpers,
		.create-form,
		.filters,
		.requests-container {
			padding: 12px;
			border-radius: 14px;
			margin-bottom: 12px;
		}

		.helper-card {
			padding: 12px;
			gap: 12px;
			border-radius: 10px;
		}

		.helper-icon {
			width: 40px;
			height: 40px;
			font-size: 20px;
			border-radius: 10px;
		}

		.helper-name {
			font-size: 14px;
		}

		.helper-stats {
			font-size: 12px;
		}

		.request-card {
			padding: 12px;
			border-radius: 10px;
		}

		.request-title {
			font-size: 14px;
		}

		.badge {
			padding: 6px 10px;
			font-size: 10px;
		}

		.request-meta {
			font-size: 12px;
			gap: 8px;
		}

		.btn-small {
			padding: 8px 12px;
			font-size: 12px;
			min-height: 40px;
		}

		.details-panel {
			width: 100%;
			max-width: 100vw;
		}

		.details-header {
			padding: 12px;
		}

		.details-header h3 {
			font-size: 16px;
		}

		.btn-close {
			width: 32px;
			height: 32px;
			font-size: 20px;
		}

		.details-content {
			padding: 12px;
		}

		.detail-section {
			padding: 12px;
			margin-bottom: 12px;
			border-radius: 12px;
		}

		.detail-section h4 {
			font-size: 14px;
		}

		.suggestion-card {
			padding: 10px;
			border-radius: 8px;
		}

		.suggestion-scores {
			grid-template-columns: 1fr;
			gap: 8px;
		}

		.modal-overlay .modal-content {
			width: 96%;
			padding: 16px;
			border-radius: 14px;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}

		.form-group input,
		.form-group select,
		.form-group textarea {
			padding: 8px 10px;
			font-size: 13px;
			min-height: 40px;
		}

		.error-message {
			padding: 12px;
			font-size: 13px;
		}
	}
	.mb-2 {
		margin-bottom: 0.5rem;
	}
	.text-pre-wrap {
		white-space: pre-wrap;
		word-break: break-all;
	}
	.delete-btn:hover {
		color: #ef4444;
		background: #fee2e2;
	}
	.panel-actions {
		display: flex;
		gap: 8px;
	}
</style>
