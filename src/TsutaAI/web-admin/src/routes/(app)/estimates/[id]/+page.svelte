<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';
	import type { Estimate, EstimateConversation, EstimatePhase } from '$lib/types/estimate';
	import EstimateChatPanel from '$lib/components/estimate/EstimateChatPanel.svelte';
	import EstimatePhaseList from '$lib/components/estimate/EstimatePhaseList.svelte';
	import EstimateResultPanel from '$lib/components/estimate/EstimateResultPanel.svelte';
	import ExportToWbsModal from '$lib/components/estimate/ExportToWbsModal.svelte';

	let estimateId: number;
	let estimate: Estimate | null = null;
	let conversations: EstimateConversation[] = [];
	let phases: EstimatePhase[] = [];
	let results: any[] = [];
	let loading = true;
	let error = '';
	let currentView: 'chat' | 'phases' | 'results' = 'chat';
	let showExportModal = false;
	let isDeleting = false;
	let isCalculating = false;
	let isStatusUpdating = false;

	$: {
		const parsedId = parseInt($page.params.id ?? '', 10);
		estimateId = Number.isFinite(parsedId) ? parsedId : 0;
	}

	onMount(async () => {
		if (estimateId <= 0) {
			error = '無効な見積もりIDです。';
			loading = false;
			return;
		}

		const loaded = await loadEstimate();
		if (!loaded) return;

		await loadConversations();
		await loadPhases();
		await loadResults();
	});

	async function loadEstimate() {
		try {
			loading = true;
			error = '';
			const response = await apiClient.fetchEstimate(estimateId);
			if (!response?.data) {
				throw new Error('見積もりデータが取得できませんでした');
			}
			estimate = response.data;
			return true;
		} catch (e) {
			error = e instanceof Error ? e.message : '見積もりの取得に失敗しました';
			console.error('見積もり取得エラー:', e);
			return false;
		} finally {
			loading = false;
		}
	}

	async function loadConversations() {
		try {
			const response = await apiClient.fetchEstimateConversations(estimateId);
			conversations = Array.isArray(response.data) ? response.data : [];
		} catch (e) {
			console.error('会話履歴取得エラー:', e);
		}
	}

	async function loadPhases() {
		try {
			const response = await apiClient.fetchEstimatePhases(estimateId);
			phases = Array.isArray(response.data) ? response.data : [];
		} catch (e) {
			console.error('フェーズ取得エラー:', e);
		}
	}

	async function loadResults() {
		try {
			const response = await apiClient.fetchEstimateResults(estimateId);
			results = Array.isArray(response.data) ? response.data : [];
		} catch (e) {
			console.error('結果取得エラー:', e);
		}
	}

	async function handleConversationsUpdated(event: CustomEvent<{ conversations: any[] }>) {
		conversations = Array.isArray(event.detail.conversations) ? event.detail.conversations : [];
	}

	async function handlePhasesUpdated() {
		await loadPhases();
		await loadResults();
	}

	async function handlePhaseUpdate() {
		await loadPhases();
		await loadResults();
	}

	async function handleCalculate() {
		if (isCalculating || isDeleting || phases.length === 0) return;

		try {
			isCalculating = true;
			const response = await apiClient.calculateEstimateResult(estimateId);
			results = Array.isArray(response.data) ? response.data : [];
			currentView = 'results';
		} catch (e) {
			error = e instanceof Error ? e.message : '見積もり計算に失敗しました';
			console.error('計算エラー:', e);
		} finally {
			isCalculating = false;
		}
	}

	async function handleComplete() {
		if (isDeleting || isStatusUpdating || !estimate || estimate.status === 'completed') return;
		if (results.length === 0) return;

		try {
			isStatusUpdating = true;
			await apiClient.updateEstimate(estimateId, { status: 'completed' });
			await loadEstimate();
			alert('見積もりを完了しました');
		} catch (e) {
			error = e instanceof Error ? e.message : '見積もりの完了に失敗しました';
			console.error('完了エラー:', e);
		} finally {
			isStatusUpdating = false;
		}
	}

	async function handleReopen() {
		if (isDeleting || isStatusUpdating || !estimate || estimate.status !== 'completed') return;

		try {
			isStatusUpdating = true;
			await apiClient.updateEstimate(estimateId, { status: 'draft' });
			await loadEstimate();
			alert('見積もりを再編集モードに戻しました');
		} catch (e) {
			error = e instanceof Error ? e.message : '見積もりの再開に失敗しました';
			console.error('再開エラー:', e);
		} finally {
			isStatusUpdating = false;
		}
	}

	async function handleDelete() {
		if (isDeleting || isStatusUpdating) return;

		const confirmed = confirm(
			`本当に「${estimate?.title}」を削除しますか？\n\n` + `この操作は取り消せません。`
		);

		if (!confirmed) return;

		try {
			isDeleting = true;
			await apiClient.deleteEstimate(estimateId);
			alert('見積もりを削除しました');
			goto('/estimates');
		} catch (e) {
			error = e instanceof Error ? e.message : '見積もりの削除に失敗しました';
			console.error('削除エラー:', e);
		} finally {
			isDeleting = false;
		}
	}

	function getPatternName(patternType: string): string {
		const names: Record<string, string> = {
			duration_unknown: '期間未定型',
			duration_fixed: '期間固定型',
			task_based: 'タスクベース型',
			budget_fixed: '予算固定型'
		};
		return names[patternType] || patternType;
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<button class="back-btn" on:click={() => goto('/estimates')}>
				<i class="bi bi-arrow-left"></i>
			</button>
			<div>
				{#if estimate}
					<h1>
						<i class="bi bi-calculator"></i>
						{estimate.title}
					</h1>
					<p>{getPatternName(estimate.pattern_type)}</p>
				{:else}
					<h1>読み込み中...</h1>
				{/if}
			</div>
		</div>
	</header>
</div>

<div class="estimate-detail-page">
	<div class="page-actions">
		<button class="action-btn secondary desktop-back-btn" on:click={() => goto('/estimates')}>
			<i class="bi bi-arrow-left"></i>
			一覧に戻る
		</button>
		<div class="action-group">
			<!-- 見積もり計算は常に利用可能 -->
			<button
				class="action-btn secondary"
				on:click={handleCalculate}
				disabled={phases.length === 0 || isDeleting || isStatusUpdating || isCalculating}
			>
				<i class="bi bi-calculator"></i>
				{results.length > 0 ? '再計算' : '見積もり計算'}
			</button>
			<button
				class="action-btn secondary"
				on:click={() => (showExportModal = true)}
				disabled={phases.length === 0}
			>
				<i class="bi bi-download"></i>
				WBSにエクスポート
			</button>
			{#if estimate?.status === 'completed'}
				<button class="action-btn warning" on:click={handleReopen} disabled={isDeleting || isStatusUpdating}>
					<i class="bi bi-pencil"></i>
					再編集
				</button>
			{:else}
				<button
					class="action-btn primary"
					on:click={handleComplete}
					disabled={results.length === 0 || isDeleting || isStatusUpdating}
				>
					<i class="bi bi-check-circle"></i>
					完了
				</button>
			{/if}
			<button class="action-btn danger" on:click={handleDelete} disabled={isDeleting || isStatusUpdating}>
				<i class="bi bi-trash"></i>
				削除
			</button>
		</div>
	</div>

	{#if error}
		<div class="error-banner">
			<i class="bi bi-exclamation-triangle"></i>
			{error}
			<button class="close-error" on:click={() => (error = '')}>
				<i class="bi bi-x"></i>
			</button>
		</div>
	{/if}

	<div class="main-content">
		<!-- 左パネル: フェーズ一覧 -->
		<aside class="left-pane">
			<EstimatePhaseList {phases} {estimateId} on:update={handlePhaseUpdate} />
		</aside>

		<!-- 中央パネル: ビュー切り替え -->
		<main class="center-pane">
			<div class="view-tabs">
				<button
					class="tab"
					class:active={currentView === 'chat'}
					on:click={() => (currentView = 'chat')}
				>
					<i class="bi bi-chat-dots"></i>
					AI対話
				</button>
				<button
					class="tab"
					class:active={currentView === 'phases'}
					on:click={() => (currentView = 'phases')}
				>
					<i class="bi bi-list-task"></i>
					フェーズ詳細
				</button>
				<button
					class="tab"
					class:active={currentView === 'results'}
					on:click={() => (currentView = 'results')}
				>
					<i class="bi bi-graph-up"></i>
					見積もり結果
				</button>
			</div>

			<div class="view-content">
				{#if currentView === 'chat'}
					<div class="chat-view">
						<p class="chat-instruction">
							AIと対話しながら見積もりを作成します。プロジェクトの詳細を教えてください。
						</p>
					</div>
				{:else if currentView === 'phases'}
					<div class="phases-view">
						<h3>フェーズ詳細</h3>
						{#if phases.length === 0}
							<p class="empty-message">
								まだフェーズが登録されていません。AIとの対話でフェーズを作成してください。
							</p>
						{:else}
							<div class="phases-detail-list">
								{#each phases as phase}
									<div class="phase-detail-card">
										<h4>{phase.phase_name}</h4>
										<div class="phase-stats">
											<div class="stat">
												<span class="label">工数:</span>
												<span class="value">{phase.effort}人日</span>
											</div>
											<div class="stat">
												<span class="label">期間:</span>
												<span class="value">{phase.duration_days}日</span>
											</div>
											<div class="stat">
												<span class="label">人数:</span>
												<span class="value">{phase.team_size}人</span>
											</div>
										</div>
										{#if phase.use_ai}
											<div class="ai-efficiency-info">
												<i class="bi bi-robot"></i>
												AI活用: {(phase.ai_efficiency_ratio * 100).toFixed(0)}%削減 → {phase.effort_with_ai?.toFixed(
													1
												)}人日 / {phase.duration_with_ai}日
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{:else if currentView === 'results'}
					<EstimateResultPanel {results} />
				{/if}
			</div>
		</main>

		<!-- 右パネル: AIチャット -->
		<aside class="right-pane">
			<EstimateChatPanel
				{conversations}
				{estimateId}
				currentPhases={phases}
				on:conversationsUpdated={handleConversationsUpdated}
				on:phasesUpdated={handlePhasesUpdated}
			/>
		</aside>
	</div>
</div>

<ExportToWbsModal
	{estimateId}
	bind:isOpen={showExportModal}
	on:exported={(e) => {
		alert(`プロジェクトID ${e.detail.projectId} にエクスポートしました`);
		goto(`/projects/${e.detail.projectId}/wbs`);
	}}
/>

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.estimate-detail-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #f9fafb;
		flex: 1;
		overflow: hidden;
	}

	.page-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.action-group {
		display: flex;
		gap: 12px;
		margin-left: auto;
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

		.header-content h1 {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 0;
			color: #ffffff;
			font-size: 20px;
			font-weight: 700;
		}

		.header-content p {
			margin: 8px 0 0 0;
			font-size: 13px;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.8);
		}

		/* Hide desktop back button on mobile since header has one */
		.desktop-back-btn {
			display: none !important;
		}

		.page-actions {
			padding: 12px 16px;
			flex-wrap: wrap;
		}

		.action-group {
			width: 100%;
			justify-content: flex-end;
			flex-wrap: wrap;
		}

		.estimate-detail-page {
			height: calc(100vh - 80px);
		}
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	/* Header back button (Mobile Only) */
	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.action-btn.primary {
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.action-btn.primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.action-btn.secondary {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		color: #374151;
	}

	.action-btn.secondary:hover:not(:disabled) {
		background: #f9fafb;
	}

	.action-btn.warning {
		background: #f59e0b;
		color: #ffffff;
		box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
	}

	.action-btn.warning:hover {
		background: #d97706;
		box-shadow: 0 6px 16px rgba(245, 158, 11, 0.4);
	}

	.action-btn.danger {
		background: #fee2e2;
		color: #dc2626;
		border: 1px solid #fca5a5;
	}

	.action-btn.danger:hover:not(:disabled) {
		background: #fecaca;
		border-color: #f87171;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none !important;
		box-shadow: none !important;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 32px;
		background: #fee2e2;
		border-bottom: 1px solid #fca5a5;
		color: #dc2626;
		font-size: 14px;
	}

	.close-error {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: #dc2626;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	.close-error:hover {
		background: #fca5a5;
	}

	.main-content {
		flex: 1;
		display: grid;
		grid-template-columns: 280px 1fr 380px;
		overflow: hidden;
	}

	.left-pane,
	.center-pane,
	.right-pane {
		height: calc(100vh - 80px);
		overflow: hidden;
		background: #ffffff;
	}

	.left-pane {
		border-right: 1px solid #e5e7eb;
	}

	.right-pane {
		border-left: 1px solid #e5e7eb;
	}

	.view-tabs {
		display: flex;
		border-bottom: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 16px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: #6b7280;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tab:hover {
		background: #ffffff;
		color: #374151;
	}

	.tab.active {
		background: #ffffff;
		color: #667eea;
		border-bottom-color: #667eea;
	}

	.view-content {
		height: calc(100% - 57px);
		overflow-y: auto;
		padding: 24px;
	}

	.chat-instruction {
		padding: 16px;
		background: #eff6ff;
		border-left: 4px solid #3b82f6;
		border-radius: 8px;
		color: #1e40af;
		font-size: 14px;
		margin: 0;
	}

	.phases-view h3 {
		margin: 0 0 20px;
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.empty-message {
		padding: 32px;
		text-align: center;
		color: #9ca3af;
		font-size: 14px;
	}

	.phases-detail-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.phase-detail-card {
		padding: 20px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	.phase-detail-card h4 {
		margin: 0 0 16px;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.phase-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 12px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat .label {
		font-size: 12px;
		color: #6b7280;
	}

	.stat .value {
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.ai-efficiency-info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
		border-radius: 6px;
		color: #667eea;
		font-size: 13px;
		font-weight: 600;
	}

	@media (max-width: 1200px) {
		.main-content {
			grid-template-columns: 240px 1fr 320px;
		}
	}
</style>
