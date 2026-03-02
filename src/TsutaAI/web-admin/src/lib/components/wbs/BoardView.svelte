<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { WbsTask } from '$lib/components/wbs/types';
	import { updateTask } from '$lib/stores/undoableWbsStore';
	import {
		boardColumnStore,
		mapStatusToColumnId,
		mapColumnIdToStatus,
		type BoardColumn
	} from '$lib/stores/boardColumnStore';
	import BoardColumnManager from './BoardColumnManager.svelte';

	export let tasks: WbsTask[] = [];
	export let selectedTaskId: string | null = null;
	export let projectId: number;

	const dispatch = createEventDispatcher();

	/** ステータス列の定義（動的） */
	let columns: BoardColumn[] = [];

	/** WIP設定ダイアログ表示フラグ */
	let showWipDialog = false;
	let editingColumnId: string | null = null;
	let wipInputValue: number | null = null;

	/** 列管理モーダル表示フラグ */
	let showColumnManager = false;
	let draggedTask: WbsTask | null = null;

	/** マウント時に列を読み込む */
	onMount(() => {
		loadColumns();
	});

	/** 列を読み込む */
	function loadColumns() {
		columns = boardColumnStore.loadColumns(projectId);
		columns = columns.sort((a, b) => a.order - b.order);
	}

	/** 列管理を開く */
	function openColumnManager() {
		showColumnManager = true;
	}

	/** 列管理を閉じる */
	function handleColumnManagerClose() {
		showColumnManager = false;
		loadColumns(); // 列を再読み込み
	}

	/** タスクをフラット化（親子関係を保持） */
	function flattenTasks(taskList: WbsTask[]): WbsTask[] {
		const result: WbsTask[] = [];
		for (const task of taskList) {
			result.push(task);
			if (task.children && task.children.length > 0) {
				result.push(...flattenTasks(task.children));
			}
		}
		return result;
	}

	/** ステータス別にタスクをグループ化 */
	function getTasksByStatus(columnId: string): WbsTask[] {
		const flatTasks = flattenTasks(tasks);
		return flatTasks.filter((task) => {
			const taskStatus = (task.status || 'not-started').toLowerCase();
			const taskColumnId = mapStatusToColumnId(taskStatus);
			return taskColumnId === columnId;
		});
	}

	/**
	 * ドラッグ操作が開始されたときに呼ばれます。
	 * ドラッグされるタスクの情報を保持し、データ転送オブジェクトにIDを設定します。
	 * @param event ドラッグイベント
	 * @param task ドラッグ対象のタスク
	 */
	function handleDragStart(event: DragEvent, task: WbsTask) {
		draggedTask = task;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', task.id);
		}
	}

	/**
	 * タスクがドロップ可能な要素の上にあるときに呼ばれます。
	 * デフォルトの動作をキャンセルしてドロップを許可します。
	 * @param event ドラッグイベント
	 * @param columnId 列のID
	 */
	function handleDragOver(event: DragEvent, columnId: string) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	/**
	 * タスクがドロップされたときに呼ばれます。
	 * タスクのステータスを更新し、UIを再描画します。
	 * @param event ドラッグイベント
	 * @param columnId ドロップ先の列ID
	 */
	function handleDrop(event: DragEvent, columnId: string) {
		event.preventDefault();

		if (draggedTask) {
			// 列IDを対応するステータスに変換します
			const newStatus = mapColumnIdToStatus(columnId);

			if (draggedTask.status !== newStatus) {
				updateTask(draggedTask.id, (current) => ({
					...current,
					status: newStatus as WbsTask['status'],
					progress:
						newStatus === 'completed'
							? 100
							: newStatus === 'in-progress'
								? current.progress || 0
								: 0
				}));
			}
		}

		draggedTask = null;
	}

	/** タスク選択 */
	function selectTask(task: WbsTask) {
		dispatch('select', task);
	}

	/** 優先度の色を取得 */
	function getPriorityColor(priority?: string): string {
		switch (priority) {
			case 'high':
				return '#ef4444';
			case 'medium':
				return '#f59e0b';
			case 'low':
				return '#10b981';
			default:
				return '#9ca3af';
		}
	}

	/** 期限の状態を判定 */
	function getDeadlineStatus(endDate?: string): 'overdue' | 'near' | 'ok' {
		if (!endDate) return 'ok';
		const deadline = new Date(endDate);
		const now = new Date();
		const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays < 0) return 'overdue';
		if (diffDays <= 3) return 'near';
		return 'ok';
	}

	/** 日付をフォーマット */
	function formatDate(dateString?: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
	}

	/** WIP制限を超えているか確認 */
	function isWipExceeded(columnId: string): boolean {
		const column = columns.find((c) => c.id === columnId);
		if (!column || column.wipLimit === null) return false;
		const taskCount = getTasksByStatus(columnId).length;
		return taskCount > column.wipLimit;
	}

	/** WIP設定ダイアログを開く */
	function openWipDialog(columnId: string) {
		editingColumnId = columnId;
		const column = columns.find((c) => c.id === columnId);
		wipInputValue = column?.wipLimit || null;
		showWipDialog = true;
	}

	/** WIP制限を設定 */
	function saveWipLimit() {
		if (editingColumnId) {
			columns = columns.map((c) =>
				c.id === editingColumnId ? { ...c, wipLimit: wipInputValue } : c
			);
		}
		showWipDialog = false;
		editingColumnId = null;
		wipInputValue = null;
	}
</script>

<div class="board-container">
	<div class="board-header">
		<div class="board-title">
			<i class="bi bi-kanban"></i>
			<span>ボードビュー</span>
		</div>
		<button type="button" class="column-manager-btn" on:click={openColumnManager} title="列を管理">
			<i class="bi bi-gear-fill"></i>
			列を管理
		</button>
	</div>

	<div class="board-view">
		{#each columns as column (column.id)}
			<div
				class="board-column"
				on:dragover={(e) => handleDragOver(e, column.id)}
				on:drop={(e) => handleDrop(e, column.id)}
			>
				<div
					class="column-header"
					style="border-color: {column.color}"
					class:wip-exceeded={isWipExceeded(column.id)}
				>
					<div class="column-title-row">
						<div class="column-title" style="color: {column.color}">
							<i class="bi bi-circle-fill"></i>
							{column.label}
						</div>
						<button
							type="button"
							class="wip-config-btn"
							on:click={() => openWipDialog(column.id)}
							title="WIP制限を設定"
						>
							<i class="bi bi-gear"></i>
						</button>
					</div>
					<div class="column-stats">
						<div class="column-count" class:over-limit={isWipExceeded(column.id)}>
							{getTasksByStatus(column.id).length}
							{#if column.wipLimit !== null}
								/ {column.wipLimit}
							{/if}
						</div>
						{#if isWipExceeded(column.id)}
							<div class="wip-warning">
								<i class="bi bi-exclamation-triangle-fill"></i>
								WIP制限超過
							</div>
						{/if}
					</div>
				</div>

				<div class="column-content">
					{#each getTasksByStatus(column.id) as task (task.id)}
						<div
							class="task-card"
							class:selected={selectedTaskId === task.id}
							draggable="true"
							on:dragstart={(e) => handleDragStart(e, task)}
							on:click={() => selectTask(task)}
							role="button"
							tabindex="0"
						>
							<div class="card-header">
								<div class="task-name">{task.name}</div>
								{#if task.children && task.children.length > 0}
									<div class="subtask-badge">
										<i class="bi bi-list-nested"></i>
										{task.children.length}
									</div>
								{/if}
							</div>

							{#if task.description}
								<div class="task-description">
									{task.description.slice(0, 100)}{#if task.description.length > 100}...{/if}
								</div>
							{/if}

							<div class="card-footer">
								<div class="task-meta">
									{#if task.assignee}
										<div class="assignee">
											<i class="bi bi-person-circle"></i>
											<span>{task.assignee}</span>
										</div>
									{/if}

									{#if task.endDate}
										<div
											class="deadline"
											class:overdue={getDeadlineStatus(task.endDate) === 'overdue'}
											class:near={getDeadlineStatus(task.endDate) === 'near'}
											title="予定期限"
										>
											<i class="bi bi-calendar"></i>
											<span>{formatDate(task.endDate)}</span>
										</div>
									{/if}

									{#if task.actualEndDate}
										<div class="actual-date" title="実績完了日">
											<i class="bi bi-check-circle-fill"></i>
											<span>{formatDate(task.actualEndDate)}</span>
										</div>
									{/if}
								</div>

								<div class="card-actions">
									{#if task.progress > 0}
										<div class="progress-indicator">
											<div class="progress-bar">
												<div class="progress-fill" style="width: {task.progress}%"></div>
											</div>
											<span class="progress-text">{task.progress}%</span>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}

					{#if getTasksByStatus(column.id).length === 0}
						<div class="empty-column">
							<i class="bi bi-inbox"></i>
							<p>タスクなし</p>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<!-- 列管理モーダル -->
{#if showColumnManager}
	<BoardColumnManager {projectId} on:close={handleColumnManagerClose} />
{/if}

<!-- WIP制限設定ダイアログ -->
{#if showWipDialog && editingColumnId}
	<div class="dialog-backdrop" on:click={() => (showWipDialog = false)}>
		<div class="dialog" on:click|stopPropagation>
			<div class="dialog-header">
				<h3>WIP制限を設定</h3>
				<button type="button" class="close-btn" on:click={() => (showWipDialog = false)}>
					<i class="bi bi-x"></i>
				</button>
			</div>
			<div class="dialog-body">
				<p class="dialog-description">
					{columns.find((c) => c.id === editingColumnId)?.label}列のWIP（Work In
					Progress）制限を設定します。
				</p>
				<div class="form-group">
					<label for="wip-limit">
						WIP制限（タスク数）
						<span class="hint-text">空欄で制限なし</span>
					</label>
					<input
						id="wip-limit"
						type="number"
						min="1"
						bind:value={wipInputValue}
						placeholder="制限なし"
					/>
				</div>
				<div class="info-box">
					<i class="bi bi-info-circle"></i>
					<span>WIP制限を設定すると、制限を超えた場合に列ヘッダーで警告が表示されます。</span>
				</div>
			</div>
			<div class="dialog-footer">
				<button type="button" class="btn-secondary" on:click={() => (showWipDialog = false)}>
					キャンセル
				</button>
				<button type="button" class="btn-primary" on:click={saveWipLimit}>
					<i class="bi bi-check-lg"></i>
					保存
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.board-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 12px;
	}

	.board-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	.board-title {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.board-title i {
		font-size: 20px;
		color: #3b82f6;
	}

	.column-manager-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		background: #f9fafb;
		color: #374151;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.column-manager-btn:hover {
		background: #e5e7eb;
		border-color: #9ca3af;
		color: #111827;
	}

	.column-manager-btn i {
		font-size: 14px;
	}

	.board-view {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 20px;
		flex: 1;
		padding: 8px;
		overflow-x: auto;
	}

	@media (min-width: 1800px) {
		.board-view {
			grid-template-columns: repeat(6, 1fr);
		}
	}

	.board-column {
		display: flex;
		flex-direction: column;
		background: #f9fafb;
		border-radius: 12px;
		min-width: 300px;
		max-height: 100%;
	}

	.column-header {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		border-bottom: 3px solid;
		background: #ffffff;
		border-radius: 12px 12px 0 0;
		transition: background 0.3s ease;
	}

	.column-header.wip-exceeded {
		background: #fef2f2;
	}

	.column-title-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.column-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.column-title i {
		font-size: 8px;
	}

	.wip-config-btn {
		padding: 6px 8px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: #f9fafb;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s ease;
		opacity: 0.6;
	}

	.wip-config-btn:hover {
		opacity: 1;
		background: #e5e7eb;
		color: #374151;
	}

	.column-stats {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}

	.wip-warning {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 6px;
		background: #fee2e2;
		color: #ef4444;
		font-size: 11px;
		font-weight: 600;
	}

	.wip-warning i {
		font-size: 12px;
	}

	.column-count {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		height: 28px;
		padding: 0 8px;
		background: #e5e7eb;
		border-radius: 14px;
		font-size: 13px;
		font-weight: 600;
		color: #374151;
		transition: all 0.3s ease;
	}

	.column-count.over-limit {
		background: #fee2e2;
		color: #ef4444;
		font-weight: 700;
	}

	.column-content {
		flex: 1;
		padding: 12px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.task-card {
		background: #ffffff;
		border: 2px solid #e5e7eb;
		border-radius: 10px;
		padding: 14px;
		cursor: grab;
		transition: all 0.2s ease;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.task-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
		transform: translateY(-2px);
	}

	.task-card.selected {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.task-card:active {
		cursor: grabbing;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 8px;
	}

	.task-name {
		flex: 1;
		font-size: 14px;
		font-weight: 600;
		color: #111827;
		line-height: 1.4;
	}

	.subtask-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: #dbeafe;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		color: #1e40af;
		white-space: nowrap;
	}

	.subtask-badge i {
		font-size: 10px;
	}

	.task-description {
		font-size: 12px;
		line-height: 1.5;
		color: #6b7280;
	}

	.card-footer {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid #f3f4f6;
	}

	.task-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.assignee {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: #6b7280;
	}

	.assignee i {
		font-size: 14px;
	}

	.deadline {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		background: #f3f4f6;
		border-radius: 6px;
		font-size: 11px;
		color: #6b7280;
	}

	.deadline i {
		font-size: 10px;
	}

	.deadline.near {
		background: #fef3c7;
		color: #92400e;
	}

	.deadline.overdue {
		background: #fee2e2;
		color: #991b1b;
	}

	.actual-date {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		background: #d1fae5;
		border-radius: 6px;
		font-size: 11px;
		color: #065f46;
	}

	.actual-date i {
		font-size: 10px;
	}

	.progress-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.progress-bar {
		flex: 1;
		height: 6px;
		background: #e5e7eb;
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #3b82f6, #8b5cf6);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: 11px;
		font-weight: 600;
		color: #6b7280;
		min-width: 36px;
		text-align: right;
	}

	.empty-column {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		color: #d1d5db;
	}

	.empty-column i {
		font-size: 48px;
		margin-bottom: 8px;
	}

	.empty-column p {
		margin: 0;
		font-size: 13px;
	}

	@media (max-width: 1200px) {
		.board-view {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 768px) {
		.board-view {
			grid-template-columns: 1fr;
		}
	}

	/* ダイアログ */
	.dialog-backdrop {
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

	.dialog {
		background: #ffffff;
		border-radius: 12px;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
		max-width: 500px;
		width: 90%;
		display: flex;
		flex-direction: column;
	}

	.dialog-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.dialog-header h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #6b7280;
		font-size: 20px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s ease;
	}

	.close-btn:hover {
		background: #f3f4f6;
	}

	.dialog-body {
		padding: 20px;
	}

	.dialog-description {
		margin: 0 0 16px 0;
		font-size: 14px;
		color: #6b7280;
		line-height: 1.5;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group label {
		display: block;
		margin-bottom: 6px;
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.hint-text {
		font-size: 12px;
		font-weight: 400;
		color: #9ca3af;
		margin-left: 6px;
	}

	.form-group input {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 14px;
		transition: border-color 0.2s ease;
	}

	.form-group input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.info-box {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		border-radius: 8px;
		font-size: 13px;
		background: #eff6ff;
		color: #1e40af;
		border: 1px solid #bfdbfe;
	}

	.dialog-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 20px;
		border-top: 1px solid #e5e7eb;
	}

	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border: 1px solid;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.btn-primary {
		background: #3b82f6;
		border-color: #3b82f6;
		color: #ffffff;
	}

	.btn-primary:hover {
		background: #2563eb;
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
