<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { RescheduleProposal, RescheduleSummary } from '$lib/stores/rescheduleStore';
	import RescheduleTimeline from './RescheduleTimeline.svelte';

	export let show = false;
	export let proposals: RescheduleProposal[] = [];
	export let summary: RescheduleSummary | null = null;
	export let triggerType: string = '';
	export let triggerDetails: any = {};

	const dispatch = createEventDispatcher();

	/** 選択されたタスク（個別承認用） */
	let selectedTaskIds: Set<string> = new Set();

	/** すべて選択 */
	let selectAll = true;

	/** 表示モード */
	let viewMode: 'list' | 'timeline' = 'list';

	/** すべて選択/解除 */
	function toggleSelectAll() {
		if (selectAll) {
			selectedTaskIds = new Set(proposals.map((p) => p.taskId));
		} else {
			selectedTaskIds = new Set();
		}
	}

	/** 個別タスクの選択切り替え */
	function toggleTask(taskId: string) {
		if (selectedTaskIds.has(taskId)) {
			selectedTaskIds.delete(taskId);
		} else {
			selectedTaskIds.add(taskId);
		}
		selectedTaskIds = selectedTaskIds; // reactive update
		selectAll = selectedTaskIds.size === proposals.length;
	}

	/** 承認（選択されたタスクのみ） */
	function handleApprove() {
		const selectedProposals = proposals.filter((p) => selectedTaskIds.has(p.taskId));
		dispatch('approve', { proposals: selectedProposals });
		closeModal();
	}

	/** 一括承認 */
	function handleApproveAll() {
		dispatch('approve', { proposals });
		closeModal();
	}

	/** キャンセル */
	function handleCancel() {
		dispatch('cancel');
		closeModal();
	}

	/** モーダルを閉じる */
	function closeModal() {
		show = false;
		selectedTaskIds = new Set();
		selectAll = true;
	}

	/** トリガータイプの表示名 */
	function getTriggerLabel(type: string): string {
		const labels: Record<string, string> = {
			delay: 'タスクの遅延',
			vacation: 'メンバーの休暇',
			blocked: 'タスクのブロック',
			reassign: '担当者変更',
			effort_change: '工数変更',
			manual: '手動実行'
		};
		return labels[type] || type;
	}

	/** 影響度の色 */
	function getImpactColor(impact: 'low' | 'medium' | 'high'): string {
		switch (impact) {
			case 'high':
				return '#ef4444';
			case 'medium':
				return '#f59e0b';
			case 'low':
				return '#10b981';
			default:
				return '#6b7280';
		}
	}

	/** 影響度の表示名 */
	function getImpactLabel(impact: 'low' | 'medium' | 'high'): string {
		const labels: Record<string, string> = {
			high: '高',
			medium: '中',
			low: '低'
		};
		return labels[impact] || impact;
	}

	/** 日付フォーマット */
	function formatDate(dateStr: string | undefined): string {
		if (!dateStr) return '未設定';
		const date = new Date(dateStr);
		return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
	}

	/** 日数差分を計算 */
	function calculateDayDiff(start: string | undefined, end: string | undefined): number {
		if (!start || !end) return 0;
		const startDate = new Date(start);
		const endDate = new Date(end);
		return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
	}

	$: if (show) {
		selectedTaskIds = new Set(proposals.map((p) => p.taskId));
		selectAll = true;
	}
</script>

{#if show}
	<div class="modal-backdrop" on:click={handleCancel}>
		<div class="modal-window" on:click|stopPropagation>
			<!-- ヘッダー -->
			<div class="modal-header">
				<div class="header-content">
					<i class="bi bi-calendar-event"></i>
					<div>
						<h2>リスケジュール提案</h2>
						<div class="trigger-info">
							トリガー: <span class="trigger-type">{getTriggerLabel(triggerType)}</span>
							{#if triggerDetails.taskName}
								- {triggerDetails.taskName}
							{/if}
						</div>
					</div>
				</div>
				<button type="button" class="close-btn" on:click={handleCancel}>
					<i class="bi bi-x"></i>
				</button>
			</div>

			<!-- サマリー -->
			{#if summary}
				<div class="summary-section">
					<div class="summary-card">
						<i class="bi bi-list-task"></i>
						<div class="summary-value">{summary.affectedTasks}</div>
						<div class="summary-label">影響タスク</div>
					</div>
					<div class="summary-card">
						<i class="bi bi-clock-history"></i>
						<div class="summary-value">{summary.delayDays}日</div>
						<div class="summary-label">遅延日数</div>
					</div>
					<div class="summary-card">
						<i class="bi bi-flag"></i>
						<div class="summary-value">{summary.criticalPathChanged ? 'あり' : 'なし'}</div>
						<div class="summary-label">クリティカルパス変更</div>
					</div>
					{#if summary.newProjectEndDate}
						<div class="summary-card">
							<i class="bi bi-calendar-check"></i>
							<div class="summary-value">{formatDate(summary.newProjectEndDate)}</div>
							<div class="summary-label">新しい終了予定日</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- ビュー切り替え -->
			<div class="view-toggle">
				<button
					type="button"
					class:active={viewMode === 'list'}
					on:click={() => (viewMode = 'list')}
				>
					<i class="bi bi-list-ul"></i>
					一覧表示
				</button>
				<button
					type="button"
					class:active={viewMode === 'timeline'}
					on:click={() => (viewMode = 'timeline')}
				>
					<i class="bi bi-diagram-3"></i>
					タイムライン表示
				</button>
			</div>

			<!-- コンテンツ -->
			<div class="modal-body">
				{#if viewMode === 'list'}
					<!-- 一覧表示 -->
					<div class="proposal-list">
						<div class="list-header">
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={selectAll} on:change={toggleSelectAll} />
								<span>すべて選択</span>
							</label>
							<span class="selected-count">{selectedTaskIds.size} / {proposals.length} 選択中</span>
						</div>

						{#each proposals as proposal (proposal.taskId)}
							<div class="proposal-item" class:selected={selectedTaskIds.has(proposal.taskId)}>
								<label class="item-checkbox">
									<input
										type="checkbox"
										checked={selectedTaskIds.has(proposal.taskId)}
										on:change={() => toggleTask(proposal.taskId)}
									/>
								</label>

								<div class="item-content">
									<div class="item-header">
										<h4 class="task-name">{proposal.taskName}</h4>
										<span
											class="impact-badge"
											style="background: {getImpactColor(
												proposal.impact
											)}20; color: {getImpactColor(proposal.impact)}; border-color: {getImpactColor(
												proposal.impact
											)}"
										>
											影響度: {getImpactLabel(proposal.impact)}
										</span>
									</div>

									<div class="date-comparison">
										<div class="date-row">
											<span class="label">現在:</span>
											<span class="date-range">
												{formatDate(proposal.currentStart)} 〜 {formatDate(proposal.currentEnd)}
												<span class="duration"
													>({calculateDayDiff(
														proposal.currentStart,
														proposal.currentEnd
													)}日間)</span
												>
											</span>
										</div>
										<div class="arrow">
											<i class="bi bi-arrow-down"></i>
										</div>
										<div class="date-row proposed">
											<span class="label">提案:</span>
											<span class="date-range">
												{formatDate(proposal.proposedStart)} 〜 {formatDate(proposal.proposedEnd)}
												<span class="duration"
													>({calculateDayDiff(
														proposal.proposedStart,
														proposal.proposedEnd
													)}日間)</span
												>
											</span>
										</div>
									</div>

									<div class="reason">
										<i class="bi bi-info-circle"></i>
										{proposal.reason}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<!-- タイムライン表示 -->
					<RescheduleTimeline {proposals} />
				{/if}
			</div>

			<!-- フッター -->
			<div class="modal-footer">
				<div class="warning-message">
					<i class="bi bi-exclamation-triangle"></i>
					<span>承認すると、選択されたタスクのスケジュールが更新されます</span>
				</div>
				<div class="footer-actions">
					<button type="button" class="btn-secondary" on:click={handleCancel}> キャンセル </button>
					<button
						type="button"
						class="btn-partial"
						disabled={selectedTaskIds.size === 0}
						on:click={handleApprove}
					>
						<i class="bi bi-check-circle"></i>
						選択項目を承認 ({selectedTaskIds.size})
					</button>
					<button type="button" class="btn-primary" on:click={handleApproveAll}>
						<i class="bi bi-check-circle-fill"></i>
						すべて承認
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		animation: fadeIn 0.2s ease;
		backdrop-filter: blur(4px);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-window {
		background: #ffffff;
		border-radius: 16px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		max-width: 900px;
		width: 95%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		animation: slideUp 0.3s ease;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 24px;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-content {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.header-content > i {
		font-size: 28px;
		color: #3b82f6;
		margin-top: 2px;
	}

	.modal-header h2 {
		margin: 0 0 6px 0;
		font-size: 22px;
		font-weight: 700;
		color: #111827;
	}

	.trigger-info {
		font-size: 13px;
		color: #6b7280;
	}

	.trigger-type {
		font-weight: 600;
		color: #3b82f6;
	}

	.close-btn {
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: #6b7280;
		font-size: 24px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s ease;
	}

	.close-btn:hover {
		background: #f3f4f6;
	}

	.summary-section {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 16px;
		padding: 20px 24px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 16px;
		background: #ffffff;
		border-radius: 12px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.summary-card > i {
		font-size: 24px;
		color: #3b82f6;
		margin-bottom: 8px;
	}

	.summary-value {
		font-size: 24px;
		font-weight: 700;
		color: #111827;
		margin-bottom: 4px;
	}

	.summary-label {
		font-size: 12px;
		color: #6b7280;
		text-align: center;
	}

	.view-toggle {
		display: flex;
		gap: 0;
		padding: 16px 24px;
		border-bottom: 1px solid #e5e7eb;
	}

	.view-toggle button {
		flex: 1;
		padding: 10px 16px;
		border: 1px solid #e5e7eb;
		background: #ffffff;
		color: #6b7280;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.view-toggle button:first-child {
		border-radius: 8px 0 0 8px;
	}

	.view-toggle button:last-child {
		border-radius: 0 8px 8px 0;
		border-left: none;
	}

	.view-toggle button.active {
		background: #3b82f6;
		color: #ffffff;
		border-color: #3b82f6;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
		padding-bottom: 12px;
		border-bottom: 1px solid #e5e7eb;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		color: #374151;
		cursor: pointer;
	}

	.selected-count {
		font-size: 13px;
		color: #6b7280;
	}

	.proposal-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.proposal-item {
		display: flex;
		gap: 12px;
		padding: 16px;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		transition: all 0.2s ease;
	}

	.proposal-item:hover {
		border-color: #d1d5db;
		background: #f9fafb;
	}

	.proposal-item.selected {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.item-checkbox {
		display: flex;
		align-items: flex-start;
		padding-top: 2px;
	}

	.item-content {
		flex: 1;
	}

	.item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.task-name {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #111827;
	}

	.impact-badge {
		padding: 4px 12px;
		border-radius: 12px;
		font-size: 12px;
		font-weight: 600;
		border: 1px solid;
	}

	.date-comparison {
		margin-bottom: 12px;
	}

	.date-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: #f9fafb;
		border-radius: 8px;
		margin-bottom: 4px;
	}

	.date-row.proposed {
		background: #eff6ff;
	}

	.date-row .label {
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
		min-width: 50px;
	}

	.date-range {
		font-size: 14px;
		color: #111827;
		font-weight: 500;
	}

	.duration {
		font-size: 12px;
		color: #6b7280;
		margin-left: 8px;
	}

	.arrow {
		text-align: center;
		color: #3b82f6;
		font-size: 16px;
		margin: 2px 0;
	}

	.reason {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 12px;
		background: #fef3c7;
		border-left: 3px solid #f59e0b;
		border-radius: 6px;
		font-size: 13px;
		color: #92400e;
		line-height: 1.5;
	}

	.reason i {
		margin-top: 2px;
		color: #f59e0b;
	}

	.modal-footer {
		padding: 20px 24px;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.warning-message {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 16px;
		padding: 12px;
		background: #fef3c7;
		border-left: 3px solid #f59e0b;
		border-radius: 6px;
		font-size: 13px;
		color: #92400e;
	}

	.warning-message i {
		color: #f59e0b;
	}

	.footer-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
	}

	.btn-primary,
	.btn-partial,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		border: 1px solid;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-primary {
		background: #3b82f6;
		border-color: #3b82f6;
		color: #ffffff;
	}

	.btn-primary:hover {
		background: #2563eb;
		border-color: #2563eb;
	}

	.btn-partial {
		background: #10b981;
		border-color: #10b981;
		color: #ffffff;
	}

	.btn-partial:hover:not(:disabled) {
		background: #059669;
		border-color: #059669;
	}

	.btn-partial:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: #ffffff;
		border-color: #e5e7eb;
		color: #374151;
	}

	.btn-secondary:hover {
		background: #f9fafb;
	}
</style>
