<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { EstimatePhase } from '$lib/types/estimate';
	import { apiClient } from '$lib/api/client';

	export let phases: EstimatePhase[] = [];
	export let estimateId: number;

	const dispatch = createEventDispatcher();

	let showAddModal = false;
	let editingPhase: EstimatePhase | null = null;
	let formData: Partial<EstimatePhase> = {};

	function openAddModal() {
		editingPhase = null;
		formData = {
			phase_name: '',
			phase_order: phases.length + 1,
			effort: 0,
			duration_days: 0,
			team_size: 1,
			use_ai: false,
			ai_efficiency_ratio: 0.2,
			ai_efficiency_auto: true
		};
		showAddModal = true;
	}

	function openEditModal(phase: EstimatePhase) {
		editingPhase = phase;
		formData = { ...phase };
		showAddModal = true;
	}

	async function savePhase() {
		try {
			// Convert snake_case to camelCase for backend
			const phasePayload = {
				id: formData.id,
				phaseName: formData.phase_name,
				phaseOrder: formData.phase_order,
				effort: formData.effort,
				durationDays: formData.duration_days,
				teamSize: formData.team_size,
				startDate: formData.start_date,
				endDate: formData.end_date,
				dependencies: formData.dependencies,
				useAi: formData.use_ai,
				aiEfficiencyRatio: formData.ai_efficiency_ratio,
				aiEfficiencyAuto: formData.ai_efficiency_auto
			};

			await apiClient.saveEstimatePhase(estimateId, phasePayload);
			showAddModal = false;
			dispatch('update');
		} catch (e) {
			alert('フェーズの保存に失敗しました');
			console.error(e);
		}
	}

	async function handleDeletePhase() {
		if (!editingPhase || !editingPhase.id) return;

		if (!confirm(`「${editingPhase.phase_name}」を削除してもよろしいですか？`)) {
			return;
		}

		try {
			await apiClient.deleteEstimatePhase(estimateId, editingPhase.id);
			showAddModal = false;
			dispatch('update');
		} catch (e) {
			alert('フェーズの削除に失敗しました');
			console.error(e);
		}
	}

	$: if (formData.use_ai && formData.ai_efficiency_auto) {
		// AI効率化比率を自動設定（簡易版）
		const phaseName = formData.phase_name?.toLowerCase() || '';
		if (
			phaseName.includes('実装') ||
			phaseName.includes('開発') ||
			phaseName.includes('コーディング')
		) {
			formData.ai_efficiency_ratio = 0.4;
		} else if (phaseName.includes('テスト')) {
			formData.ai_efficiency_ratio = 0.35;
		} else if (phaseName.includes('設計')) {
			formData.ai_efficiency_ratio = 0.25;
		} else {
			formData.ai_efficiency_ratio = 0.2;
		}
	}

	$: effortWithAi =
		formData.use_ai && formData.effort
			? formData.effort * (1 - (formData.ai_efficiency_ratio || 0))
			: formData.effort;

	$: durationWithAi =
		formData.use_ai && formData.duration_days
			? Math.ceil(formData.duration_days * (1 - (formData.ai_efficiency_ratio || 0)))
			: formData.duration_days;
</script>

<div class="phase-list-panel">
	<div class="panel-header">
		<h3>フェーズ一覧</h3>
		<button class="add-btn" on:click={openAddModal}>
			<i class="bi bi-plus-circle"></i>
		</button>
	</div>

	<div class="phase-list">
		{#if phases.length === 0}
			<div class="empty-state">
				<i class="bi bi-inbox"></i>
				<p>フェーズがありません</p>
				<button class="btn-add-first" on:click={openAddModal}> 最初のフェーズを追加 </button>
			</div>
		{:else}
			{#each phases as phase}
				<div class="phase-item" on:click={() => openEditModal(phase)}>
					<div class="phase-header">
						<span class="phase-order">{phase.phase_order}</span>
						<span class="phase-name">{phase.phase_name}</span>
					</div>
					<div class="phase-stats">
						<div class="stat-item">
							<i class="bi bi-clock"></i>
							{phase.use_ai ? phase.effort_with_ai?.toFixed(1) : phase.effort}人日
						</div>
						<div class="stat-item">
							<i class="bi bi-calendar"></i>
							{phase.use_ai ? phase.duration_with_ai : phase.duration_days}日
						</div>
					</div>
					{#if phase.use_ai}
						<div class="ai-badge">
							<i class="bi bi-robot"></i>
							AI {(phase.ai_efficiency_ratio * 100).toFixed(0)}%削減
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

{#if showAddModal}
	<div class="modal-overlay" on:click={() => (showAddModal = false)}>
		<div class="modal-content" on:click|stopPropagation>
			<div class="modal-header">
				<h3>{editingPhase ? 'フェーズ編集' : 'フェーズ追加'}</h3>
				<button class="close-btn" on:click={() => (showAddModal = false)}>
					<i class="bi bi-x"></i>
				</button>
			</div>

			<div class="modal-body">
				<div class="form-group">
					<label>フェーズ名</label>
					<input type="text" bind:value={formData.phase_name} placeholder="例: 要件定義" />
				</div>

				<div class="form-row">
					<div class="form-group">
						<label>工数（人日）</label>
						<input type="number" bind:value={formData.effort} min="0" step="0.5" />
					</div>
					<div class="form-group">
						<label>期間（日）</label>
						<input type="number" bind:value={formData.duration_days} min="0" />
					</div>
					<div class="form-group">
						<label>人数</label>
						<input type="number" bind:value={formData.team_size} min="1" step="0.5" />
					</div>
				</div>

				<!-- AI効率化設定 -->
				<div class="ai-settings-section">
					<div class="section-header">
						<i class="bi bi-robot"></i>
						<h4>AI効率化設定</h4>
					</div>

					<div class="form-group checkbox-group">
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={formData.use_ai} />
							<span>このフェーズでAIツールを活用する</span>
						</label>
					</div>

					{#if formData.use_ai}
						<div class="ai-settings-detail">
							<div class="form-group checkbox-group">
								<label class="checkbox-label">
									<input type="checkbox" bind:checked={formData.ai_efficiency_auto} />
									<span>効率化比率を自動判断</span>
								</label>
							</div>

							<div class="form-group">
								<label>
									効率化比率: {((formData.ai_efficiency_ratio || 0) * 100).toFixed(0)}%削減
								</label>
								<input
									type="range"
									bind:value={formData.ai_efficiency_ratio}
									min="0"
									max="0.5"
									step="0.05"
									disabled={formData.ai_efficiency_auto}
									class="efficiency-slider"
								/>
								<div class="slider-labels">
									<span>0%</span>
									<span>50%</span>
								</div>
							</div>

							<div class="ai-preview">
								<div class="preview-item">
									<span class="label">AI活用前:</span>
									<span class="value">{formData.effort}人日 / {formData.duration_days}日</span>
								</div>
								<i class="bi bi-arrow-down"></i>
								<div class="preview-item highlight">
									<span class="label">AI活用後:</span>
									<span class="value">{effortWithAi?.toFixed(1)}人日 / {durationWithAi}日</span>
								</div>
								<div class="savings">
									削減: {(formData.effort! - effortWithAi!).toFixed(1)}人日
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="modal-footer">
				{#if editingPhase}
					<button class="btn-danger" on:click={handleDeletePhase}>
						<i class="bi bi-trash"></i> 削除
					</button>
				{/if}
				<button class="btn-secondary" on:click={() => (showAddModal = false)}> キャンセル </button>
				<button class="btn-primary" on:click={savePhase}> 保存 </button>
			</div>
		</div>
	</div>
{/if}

<style>
	.phase-list-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.panel-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.add-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		border: none;
		border-radius: 6px;
		font-size: 16px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.add-btn:hover {
		transform: scale(1.1);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.phase-list {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 200px;
		gap: 12px;
		color: #9ca3af;
	}

	.empty-state i {
		font-size: 48px;
	}

	.empty-state p {
		margin: 0;
		font-size: 14px;
	}

	.btn-add-first {
		padding: 8px 16px;
		background: #667eea;
		color: #ffffff;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.phase-item {
		padding: 16px;
		margin-bottom: 8px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.phase-item:hover {
		background: #ffffff;
		border-color: #667eea;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
	}

	.phase-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}

	.phase-order {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #667eea;
		color: #ffffff;
		border-radius: 50%;
		font-size: 12px;
		font-weight: 700;
	}

	.phase-name {
		flex: 1;
		font-size: 14px;
		font-weight: 700;
		color: #111827;
	}

	.phase-stats {
		display: flex;
		gap: 12px;
		margin-bottom: 8px;
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: #6b7280;
	}

	.ai-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
		border-radius: 12px;
		color: #667eea;
		font-size: 11px;
		font-weight: 600;
	}

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
	}

	.modal-content {
		width: 90%;
		max-width: 600px;
		max-height: 90vh;
		background: #ffffff;
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		color: #111827;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: #6b7280;
		font-size: 24px;
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
	}

	.form-group {
		margin-bottom: 20px;
	}

	.form-group label {
		display: block;
		margin-bottom: 8px;
		font-size: 14px;
		font-weight: 600;
		color: #374151;
	}

	.form-group input[type='text'],
	.form-group input[type='number'] {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 14px;
	}

	.form-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
	}

	.checkbox-group {
		margin-bottom: 16px;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox'] {
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.ai-settings-section {
		margin-top: 24px;
		padding: 20px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 16px;
	}

	.section-header i {
		font-size: 20px;
		color: #667eea;
	}

	.section-header h4 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.ai-settings-detail {
		margin-top: 16px;
		padding: 16px;
		background: #ffffff;
		border-radius: 6px;
	}

	.efficiency-slider {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		outline: none;
		-webkit-appearance: none;
		background: linear-gradient(to right, #e5e7eb 0%, #667eea 100%);
	}

	.efficiency-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #667eea;
		cursor: pointer;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
	}

	.efficiency-slider:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 4px;
		font-size: 11px;
		color: #9ca3af;
	}

	.ai-preview {
		margin-top: 16px;
		padding: 16px;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: center;
	}

	.preview-item {
		display: flex;
		justify-content: space-between;
		width: 100%;
		padding: 8px 12px;
		background: #ffffff;
		border-radius: 4px;
		font-size: 13px;
	}

	.preview-item.highlight {
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
		font-weight: 700;
		color: #667eea;
	}

	.preview-item .label {
		color: #6b7280;
	}

	.preview-item .value {
		font-weight: 600;
	}

	.savings {
		font-size: 12px;
		font-weight: 700;
		color: #10b981;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 20px 24px;
		border-top: 1px solid #e5e7eb;
	}

	.btn-primary,
	.btn-secondary,
	.btn-danger {
		padding: 10px 20px;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
	}

	.btn-secondary {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		color: #374151;
	}

	.btn-danger {
		background: #fee2e2;
		color: #ef4444;
		border: 1px solid #fecaca;
		margin-right: auto;
	}

	.btn-danger:hover {
		background: #fecaca;
	}
</style>
