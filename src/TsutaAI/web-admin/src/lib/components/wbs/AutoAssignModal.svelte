<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let show = false;
	export let isProcessing = false;
	export let assignments: Array<{
		taskId: string;
		taskName: string;
		assignedTo: string;
		reason: string;
		confidence: number;
		status?: string;
		priority?: string;
		dueDate?: string;
	}> = [];

	const dispatch = createEventDispatcher();

	/** 選択された割り当て */
	let selectedAssignments: Set<string> = new Set();

	/** すべて選択 */
	let selectAll = true;

	/** 信頼度によるフィルタ */
	let confidenceFilter: 'all' | 'high' | 'medium' | 'low' = 'all';

	/** フィルタリングされた割り当て */
	$: filteredAssignments = assignments.filter((a) => {
		if (confidenceFilter === 'all') return true;
		if (confidenceFilter === 'high') return a.confidence >= 0.9;
		if (confidenceFilter === 'medium') return a.confidence >= 0.7 && a.confidence < 0.9;
		if (confidenceFilter === 'low') return a.confidence < 0.7;
		return true;
	});

	/** すべて選択/解除 */
	function toggleSelectAll() {
		if (selectAll) {
			selectedAssignments = new Set(filteredAssignments.map((a) => a.taskId));
		} else {
			selectedAssignments = new Set();
		}
	}

	/** 個別タスクの選択切り替え */
	function toggleAssignment(taskId: string) {
		if (selectedAssignments.has(taskId)) {
			selectedAssignments.delete(taskId);
		} else {
			selectedAssignments.add(taskId);
		}
		selectedAssignments = selectedAssignments; // reactive update
		selectAll = selectedAssignments.size === filteredAssignments.length;
	}

	/** 承認（選択されたタスクのみ） */
	function handleApprove() {
		const selected = assignments.filter((a) => selectedAssignments.has(a.taskId));
		dispatch('approve', { assignments: selected });
		closeModal();
	}

	/** 一括承認 */
	function handleApproveAll() {
		dispatch('approve', { assignments });
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
		selectedAssignments = new Set();
		selectAll = true;
	}

	/** 信頼度の色 */
	function getConfidenceColor(confidence: number): string {
		if (confidence >= 0.9) return '#10b981'; // green
		if (confidence >= 0.7) return '#f59e0b'; // yellow
		return '#ef4444'; // red
	}

	/** 信頼度のラベル */
	function getConfidenceLabel(confidence: number): string {
		if (confidence >= 0.9) return '高';
		if (confidence >= 0.7) return '中';
		return '低';
	}

	/** パーセンテージ表示 */
	function toPercent(value: number): string {
		return `${Math.round(value * 100)}%`;
	}

	/** ステータスのラベル */
	function getStatusLabel(status?: string): string {
		const labels: Record<string, string> = {
			'not-started': '未着手',
			planning: '計画中',
			'in-progress': '進行中',
			'in-review': 'レビュー待ち',
			blocked: 'ブロック中',
			completed: '完了',
			todo: '未着手',
			in_progress: '進行中',
			done: '完了'
		};
		return status ? labels[status] || status : '未設定';
	}

	/** ステータスの色 */
	function getStatusColor(status?: string): string {
		const colors: Record<string, string> = {
			'not-started': '#9ca3af',
			planning: '#8b5cf6',
			'in-progress': '#3b82f6',
			'in-review': '#f59e0b',
			blocked: '#ef4444',
			completed: '#10b981',
			todo: '#9ca3af',
			in_progress: '#3b82f6',
			done: '#10b981'
		};
		return status ? colors[status] || '#6b7280' : '#e5e7eb';
	}

	/** 優先度のラベル */
	function getPriorityLabel(priority?: string): string {
		const labels: Record<string, string> = {
			urgent: '緊急',
			high: '高',
			medium: '中',
			low: '低'
		};
		return priority ? labels[priority] || priority : '未設定';
	}

	/** 優先度の色 */
	function getPriorityColor(priority?: string): string {
		const colors: Record<string, string> = {
			urgent: '#dc2626',
			high: '#ef4444',
			medium: '#f59e0b',
			low: '#10b981'
		};
		return priority ? colors[priority] || '#6b7280' : '#e5e7eb';
	}

	/** 日付フォーマット */
	function formatDate(dateStr?: string): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
	}

	/** 期限の状態を判定 */
	function getDeadlineStatus(dueDate?: string): 'overdue' | 'near' | 'ok' {
		if (!dueDate) return 'ok';
		const deadline = new Date(dueDate);
		const now = new Date();
		const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays < 0) return 'overdue';
		if (diffDays <= 3) return 'near';
		return 'ok';
	}

	$: if (show) {
		selectedAssignments = new Set(filteredAssignments.map((a) => a.taskId));
		selectAll = true;
	}
</script>

{#if show}
	<div class="modal-backdrop" on:click={handleCancel}>
		<div class="modal-window" on:click|stopPropagation>
			<!-- ヘッダー -->
			<div class="modal-header">
				<div class="header-content">
					<i class="bi bi-people"></i>
					<div>
						<h2>AI自動タスク割り当て</h2>
						<p class="subtitle">メンバーのスキルと負荷を考慮した割り当て提案</p>
					</div>
				</div>
				<button type="button" class="close-btn" on:click={handleCancel}>
					<i class="bi bi-x"></i>
				</button>
			</div>

			<!-- フィルター -->
			<div class="filter-bar">
				<div class="filter-group">
					<span class="filter-label">信頼度:</span>
					<button
						type="button"
						class="filter-btn"
						class:active={confidenceFilter === 'all'}
						on:click={() => (confidenceFilter = 'all')}
					>
						すべて ({assignments.length})
					</button>
					<button
						type="button"
						class="filter-btn high"
						class:active={confidenceFilter === 'high'}
						on:click={() => (confidenceFilter = 'high')}
					>
						高 ({assignments.filter((a) => a.confidence >= 0.9).length})
					</button>
					<button
						type="button"
						class="filter-btn medium"
						class:active={confidenceFilter === 'medium'}
						on:click={() => (confidenceFilter = 'medium')}
					>
						中 ({assignments.filter((a) => a.confidence >= 0.7 && a.confidence < 0.9).length})
					</button>
					<button
						type="button"
						class="filter-btn low"
						class:active={confidenceFilter === 'low'}
						on:click={() => (confidenceFilter = 'low')}
					>
						低 ({assignments.filter((a) => a.confidence < 0.7).length})
					</button>
				</div>
			</div>

			<!-- コンテンツ -->
			<div class="modal-body">
				{#if isProcessing}
					<div class="loading-state">
						<div class="spinner"></div>
						<p>AI が最適な割り当てを分析中...</p>
					</div>
				{:else if filteredAssignments.length === 0}
					<div class="empty-state">
						<i class="bi bi-inbox"></i>
						<p>該当する割り当て提案がありません</p>
					</div>
				{:else}
					<div class="assignment-list">
						<div class="list-header">
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={selectAll} on:change={toggleSelectAll} />
								<span>すべて選択</span>
							</label>
							<span class="selected-count"
								>{selectedAssignments.size} / {filteredAssignments.length} 選択中</span
							>
						</div>

						{#each filteredAssignments as assignment (assignment.taskId)}
							<div
								class="assignment-item"
								class:selected={selectedAssignments.has(assignment.taskId)}
							>
								<label class="item-checkbox">
									<input
										type="checkbox"
										checked={selectedAssignments.has(assignment.taskId)}
										on:change={() => toggleAssignment(assignment.taskId)}
									/>
								</label>

								<div class="item-content">
									<div class="item-header">
										<h4 class="task-name">{assignment.taskName}</h4>
										<div class="assignee-badge">
											<i class="bi bi-person-fill"></i>
											{assignment.assignedTo}
										</div>
									</div>

									<div class="task-meta">
										{#if assignment.status}
											<span
												class="meta-badge status"
												style="background: {getStatusColor(
													assignment.status
												)}20; color: {getStatusColor(
													assignment.status
												)}; border-color: {getStatusColor(assignment.status)}"
											>
												<i class="bi bi-circle-fill"></i>
												{getStatusLabel(assignment.status)}
											</span>
										{/if}
										{#if assignment.priority}
											<span
												class="meta-badge priority"
												style="background: {getPriorityColor(
													assignment.priority
												)}20; color: {getPriorityColor(
													assignment.priority
												)}; border-color: {getPriorityColor(assignment.priority)}"
											>
												<i class="bi bi-flag-fill"></i>
												{getPriorityLabel(assignment.priority)}
											</span>
										{/if}
										{#if assignment.dueDate}
											<span
												class="meta-badge deadline"
												class:overdue={getDeadlineStatus(assignment.dueDate) === 'overdue'}
												class:near={getDeadlineStatus(assignment.dueDate) === 'near'}
											>
												<i class="bi bi-calendar"></i>
												期限: {formatDate(assignment.dueDate)}
											</span>
										{/if}
									</div>

									<div class="confidence-row">
										<span class="confidence-label">信頼度:</span>
										<div class="confidence-bar-container">
											<div
												class="confidence-bar"
												style="width: {assignment.confidence *
													100}%; background: {getConfidenceColor(assignment.confidence)}"
											></div>
										</div>
										<span
											class="confidence-value"
											style="color: {getConfidenceColor(assignment.confidence)}"
										>
											{getConfidenceLabel(assignment.confidence)} ({toPercent(
												assignment.confidence
											)})
										</span>
									</div>

									<div class="reason">
										<i class="bi bi-lightbulb"></i>
										{assignment.reason}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- フッター -->
			{#if !isProcessing && filteredAssignments.length > 0}
				<div class="modal-footer">
					<div class="info-message">
						<i class="bi bi-info-circle"></i>
						<span>承認すると、選択されたタスクに担当者が割り当てられます</span>
					</div>
					<div class="footer-actions">
						<button type="button" class="btn-secondary" on:click={handleCancel}>
							キャンセル
						</button>
						<button
							type="button"
							class="btn-partial"
							disabled={selectedAssignments.size === 0}
							on:click={handleApprove}
						>
							<i class="bi bi-check-circle"></i>
							選択項目を承認 ({selectedAssignments.size})
						</button>
						<button type="button" class="btn-primary" on:click={handleApproveAll}>
							<i class="bi bi-check-circle-fill"></i>
							すべて承認
						</button>
					</div>
				</div>
			{/if}
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
		margin: 0 0 4px 0;
		font-size: 22px;
		font-weight: 700;
		color: #111827;
	}

	.subtitle {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
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

	.filter-bar {
		padding: 16px 24px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.filter-group {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.filter-label {
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
	}

	.filter-btn {
		padding: 6px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #ffffff;
		color: #6b7280;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.filter-btn:hover {
		border-color: #3b82f6;
	}

	.filter-btn.active {
		background: #3b82f6;
		border-color: #3b82f6;
		color: #ffffff;
	}

	.filter-btn.high.active {
		background: #10b981;
		border-color: #10b981;
	}

	.filter-btn.medium.active {
		background: #f59e0b;
		border-color: #f59e0b;
	}

	.filter-btn.low.active {
		background: #ef4444;
		border-color: #ef4444;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		color: #6b7280;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 16px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		color: #9ca3af;
	}

	.empty-state i {
		font-size: 48px;
		margin-bottom: 12px;
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

	.assignment-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.assignment-item {
		display: flex;
		gap: 12px;
		padding: 16px;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		transition: all 0.2s ease;
	}

	.assignment-item:hover {
		border-color: #d1d5db;
		background: #f9fafb;
	}

	.assignment-item.selected {
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

	.assignee-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: #dbeafe;
		border: 1px solid #3b82f6;
		border-radius: 12px;
		font-size: 13px;
		font-weight: 600;
		color: #1e40af;
	}

	.task-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}

	.meta-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border: 1px solid;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 600;
	}

	.meta-badge i {
		font-size: 10px;
	}

	.meta-badge.deadline {
		background: #f3f4f6;
		color: #6b7280;
		border-color: #d1d5db;
	}

	.meta-badge.deadline.near {
		background: #fef3c7;
		color: #92400e;
		border-color: #fbbf24;
	}

	.meta-badge.deadline.overdue {
		background: #fee2e2;
		color: #991b1b;
		border-color: #ef4444;
	}

	.confidence-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}

	.confidence-label {
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
		min-width: 60px;
	}

	.confidence-bar-container {
		flex: 1;
		height: 8px;
		background: #e5e7eb;
		border-radius: 4px;
		overflow: hidden;
	}

	.confidence-bar {
		height: 100%;
		transition: width 0.3s ease;
	}

	.confidence-value {
		font-size: 13px;
		font-weight: 700;
		min-width: 80px;
		text-align: right;
	}

	.reason {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 12px;
		background: #eff6ff;
		border-left: 3px solid #3b82f6;
		border-radius: 6px;
		font-size: 13px;
		color: #1e40af;
		line-height: 1.5;
	}

	.reason i {
		margin-top: 2px;
		color: #3b82f6;
	}

	.modal-footer {
		padding: 20px 24px;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.info-message {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 16px;
		padding: 12px;
		background: #eff6ff;
		border-left: 3px solid #3b82f6;
		border-radius: 6px;
		font-size: 13px;
		color: #1e40af;
	}

	.info-message i {
		color: #3b82f6;
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
