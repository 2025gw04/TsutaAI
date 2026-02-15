<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let show = false;
	export let isProcessing = false;
	export let durations: Array<{
		taskId: string;
		taskName: string;
		startDate: string;
		endDate: string;
		effortDays: number;
		reasoning: string;
	}> = [];
	export let projectEndDate: string | null = null;
	export let criticalPath: string[] = [];

	const dispatch = createEventDispatcher();

	/** 選択された期間設定 */
	let selectedDurations: Set<string> = new Set();

	/** すべて選択 */
	let selectAll = true;

	/** 表示モード */
	let viewMode: 'list' | 'timeline' = 'list';

	/** すべて選択/解除 */
	function toggleSelectAll() {
		if (selectAll) {
			selectedDurations = new Set(durations.map((d) => d.taskId));
		} else {
			selectedDurations = new Set();
		}
	}

	/** 個別タスクの選択切り替え */
	function toggleDuration(taskId: string) {
		if (selectedDurations.has(taskId)) {
			selectedDurations.delete(taskId);
		} else {
			selectedDurations.add(taskId);
		}
		selectedDurations = selectedDurations; // reactive update
		selectAll = selectedDurations.size === durations.length;
	}

	/** 承認（選択されたタスクのみ） */
	function handleApprove() {
		const selected = durations.filter((d) => selectedDurations.has(d.taskId));
		dispatch('approve', { durations: selected });
		closeModal();
	}

	/** 一括承認 */
	function handleApproveAll() {
		dispatch('approve', { durations });
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
		selectedDurations = new Set();
		selectAll = true;
	}

	/** 日付フォーマット */
	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
	}

	/** 日数差分を計算 */
	function calculateDayDiff(start: string, end: string): number {
		const startDate = new Date(start);
		const endDate = new Date(end);
		return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
	}

	/** クリティカルパスに含まれるか */
	function isInCriticalPath(taskId: string): boolean {
		return criticalPath.includes(taskId);
	}

	/** タイムライン表示用のデータを取得 */
	function getTimelineRange() {
		if (durations.length === 0) return { min: new Date(), max: new Date() };

		let min = new Date(durations[0].startDate);
		let max = new Date(durations[0].endDate);

		durations.forEach((d) => {
			const start = new Date(d.startDate);
			const end = new Date(d.endDate);
			if (start < min) min = start;
			if (end > max) max = end;
		});

		return { min, max };
	}

	/** タスクの位置（パーセント） */
	function getTaskPosition(startDate: string, range: { min: Date; max: Date }): number {
		const start = new Date(startDate);
		const totalMs = range.max.getTime() - range.min.getTime();
		const offsetMs = start.getTime() - range.min.getTime();
		return (offsetMs / totalMs) * 100;
	}

	/** タスクの幅（パーセント） */
	function getTaskWidth(
		startDate: string,
		endDate: string,
		range: { min: Date; max: Date }
	): number {
		const start = new Date(startDate);
		const end = new Date(endDate);
		const totalMs = range.max.getTime() - range.min.getTime();
		const durationMs = end.getTime() - start.getTime();
		return (durationMs / totalMs) * 100;
	}

	$: timelineRange = getTimelineRange();

	$: if (show) {
		selectedDurations = new Set(durations.map((d) => d.taskId));
		selectAll = true;
	}
</script>

{#if show}
	<div class="modal-backdrop" on:click={handleCancel}>
		<div class="modal-window" on:click|stopPropagation>
			<!-- ヘッダー -->
			<div class="modal-header">
				<div class="header-content">
					<i class="bi bi-clock-history"></i>
					<div>
						<h2>AI自動期間設定</h2>
						<p class="subtitle">タスクの複雑度と依存関係を考慮した期間提案</p>
					</div>
				</div>
				<button type="button" class="close-btn" on:click={handleCancel}>
					<i class="bi bi-x"></i>
				</button>
			</div>

			<!-- サマリー -->
			{#if projectEndDate}
				<div class="summary-section">
					<div class="summary-card">
						<i class="bi bi-list-task"></i>
						<div class="summary-value">{durations.length}</div>
						<div class="summary-label">対象タスク</div>
					</div>
					<div class="summary-card">
						<i class="bi bi-calendar-check"></i>
						<div class="summary-value">{formatDate(projectEndDate)}</div>
						<div class="summary-label">プロジェクト終了予定</div>
					</div>
					{#if criticalPath.length > 0}
						<div class="summary-card critical">
							<i class="bi bi-lightning"></i>
							<div class="summary-value">{criticalPath.length}</div>
							<div class="summary-label">クリティカルパス</div>
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
				{#if isProcessing}
					<div class="loading-state">
						<div class="spinner"></div>
						<p>AI が最適な期間を分析中...</p>
					</div>
				{:else if durations.length === 0}
					<div class="empty-state">
						<i class="bi bi-inbox"></i>
						<p>期間設定の提案がありません</p>
					</div>
				{:else if viewMode === 'list'}
					<!-- 一覧表示 -->
					<div class="duration-list">
						<div class="list-header">
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={selectAll} on:change={toggleSelectAll} />
								<span>すべて選択</span>
							</label>
							<span class="selected-count"
								>{selectedDurations.size} / {durations.length} 選択中</span
							>
						</div>

						{#each durations as duration (duration.taskId)}
							<div
								class="duration-item"
								class:selected={selectedDurations.has(duration.taskId)}
								class:critical={isInCriticalPath(duration.taskId)}
							>
								<label class="item-checkbox">
									<input
										type="checkbox"
										checked={selectedDurations.has(duration.taskId)}
										on:change={() => toggleDuration(duration.taskId)}
									/>
								</label>

								<div class="item-content">
									<div class="item-header">
										<h4 class="task-name">
											{duration.taskName}
											{#if isInCriticalPath(duration.taskId)}
												<span class="critical-badge">
													<i class="bi bi-lightning-fill"></i>
													クリティカルパス
												</span>
											{/if}
										</h4>
										<div class="effort-badge">
											<i class="bi bi-hourglass-split"></i>
											{duration.effortDays}日間
										</div>
									</div>

									<div class="date-range">
										<div class="date-item">
											<span class="date-label">開始:</span>
											<span class="date-value">{formatDate(duration.startDate)}</span>
										</div>
										<i class="bi bi-arrow-right"></i>
										<div class="date-item">
											<span class="date-label">終了:</span>
											<span class="date-value">{formatDate(duration.endDate)}</span>
										</div>
										<div class="date-total">
											({calculateDayDiff(duration.startDate, duration.endDate)}日間)
										</div>
									</div>

									<div class="reasoning">
										<i class="bi bi-lightbulb"></i>
										{duration.reasoning}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<!-- タイムライン表示 -->
					<div class="timeline-view">
						<div class="timeline-header">
							<div class="task-col">タスク名</div>
							<div class="timeline-col">
								<span>{formatDate(timelineRange.min.toISOString())}</span>
								<span>{formatDate(timelineRange.max.toISOString())}</span>
							</div>
						</div>
						<div class="timeline-items">
							{#each durations as duration (duration.taskId)}
								<div class="timeline-item" class:critical={isInCriticalPath(duration.taskId)}>
									<div class="task-col">
										<span class="task-name-short">{duration.taskName}</span>
										{#if isInCriticalPath(duration.taskId)}
											<i class="bi bi-lightning-fill critical-icon"></i>
										{/if}
									</div>
									<div class="timeline-col">
										<div
											class="timeline-bar"
											class:critical-bar={isInCriticalPath(duration.taskId)}
											style="
                        left: {getTaskPosition(duration.startDate, timelineRange)}%;
                        width: {getTaskWidth(duration.startDate, duration.endDate, timelineRange)}%;
                      "
										>
											<span class="bar-label">{duration.effortDays}日</span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- フッター -->
			{#if !isProcessing && durations.length > 0}
				<div class="modal-footer">
					<div class="info-message">
						<i class="bi bi-info-circle"></i>
						<span>承認すると、選択されたタスクの開始日・終了日が更新されます</span>
					</div>
					<div class="footer-actions">
						<button type="button" class="btn-secondary" on:click={handleCancel}>
							キャンセル
						</button>
						<button
							type="button"
							class="btn-partial"
							disabled={selectedDurations.size === 0}
							on:click={handleApprove}
						>
							<i class="bi bi-check-circle"></i>
							選択項目を適用 ({selectedDurations.size})
						</button>
						<button type="button" class="btn-primary" on:click={handleApproveAll}>
							<i class="bi bi-check-circle-fill"></i>
							すべて適用
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
		color: #06b6d4;
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
		color: #06b6d4;
		margin-bottom: 8px;
	}

	.summary-card.critical > i {
		color: #f59e0b;
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
		background: #06b6d4;
		color: #ffffff;
		border-color: #06b6d4;
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
		border-top-color: #06b6d4;
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

	.duration-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.duration-item {
		display: flex;
		gap: 12px;
		padding: 16px;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		transition: all 0.2s ease;
	}

	.duration-item:hover {
		border-color: #d1d5db;
		background: #f9fafb;
	}

	.duration-item.selected {
		border-color: #06b6d4;
		background: #ecfeff;
	}

	.duration-item.critical {
		border-color: #fbbf24;
		background: #fffbeb;
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
		flex-wrap: wrap;
		gap: 8px;
	}

	.task-name {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #111827;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.critical-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: #fef3c7;
		border: 1px solid #fbbf24;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 600;
		color: #92400e;
	}

	.effort-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: #dbeafe;
		border: 1px solid #06b6d4;
		border-radius: 12px;
		font-size: 13px;
		font-weight: 600;
		color: #0e7490;
	}

	.date-range {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: #f9fafb;
		border-radius: 8px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}

	.date-item {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.date-label {
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
	}

	.date-value {
		font-size: 14px;
		font-weight: 600;
		color: #111827;
	}

	.date-total {
		font-size: 13px;
		color: #6b7280;
	}

	.reasoning {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 12px;
		background: #ecfeff;
		border-left: 3px solid #06b6d4;
		border-radius: 6px;
		font-size: 13px;
		color: #0e7490;
		line-height: 1.5;
	}

	.reasoning i {
		margin-top: 2px;
		color: #06b6d4;
	}

	.timeline-view {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
	}

	.timeline-header {
		display: flex;
		background: #f9fafb;
		border-bottom: 2px solid #e5e7eb;
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
	}

	.task-col {
		width: 220px;
		flex-shrink: 0;
		padding: 12px 16px;
		border-right: 1px solid #e5e7eb;
	}

	.timeline-col {
		flex: 1;
		padding: 12px 16px;
		position: relative;
		display: flex;
		justify-content: space-between;
	}

	.timeline-items {
		max-height: 400px;
		overflow-y: auto;
	}

	.timeline-item {
		display: flex;
		border-bottom: 1px solid #e5e7eb;
		transition: background 0.2s ease;
	}

	.timeline-item:hover {
		background: #f9fafb;
	}

	.timeline-item.critical {
		background: #fffbeb;
	}

	.timeline-item .task-col {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.task-name-short {
		font-size: 14px;
		font-weight: 600;
		color: #111827;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.critical-icon {
		color: #fbbf24;
		font-size: 14px;
	}

	.timeline-bar {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 24px;
		background: #bae6fd;
		border: 2px solid #06b6d4;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
		color: #0e7490;
		transition: all 0.2s ease;
	}

	.timeline-bar:hover {
		transform: translateY(-50%) scale(1.05);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
	}

	.timeline-bar.critical-bar {
		background: #fef3c7;
		border-color: #fbbf24;
		color: #92400e;
	}

	.bar-label {
		white-space: nowrap;
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
		background: #ecfeff;
		border-left: 3px solid #06b6d4;
		border-radius: 6px;
		font-size: 13px;
		color: #0e7490;
	}

	.info-message i {
		color: #06b6d4;
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
		background: #06b6d4;
		border-color: #06b6d4;
		color: #ffffff;
	}

	.btn-primary:hover {
		background: #0891b2;
		border-color: #0891b2;
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
