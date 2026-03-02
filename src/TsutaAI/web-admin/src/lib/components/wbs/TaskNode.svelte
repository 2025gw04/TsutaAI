<script lang="ts">
	import { createEventDispatcher, tick } from 'svelte';
	import { get } from 'svelte/store';
	import type { WbsTask } from '$lib/components/wbs/types';
	import {
		addChildTask,
		createBlankTask,
		removeTask,
		updateTask,
		moveTaskAdvanced,
		undoableWbsStore
	} from '$lib/stores/undoableWbsStore';
	import { apiClient } from '$lib/api/client';
	import { taskIdMappingStore } from '$lib/stores/taskIdMappingStore';
	import { calculateEffortDays, getHolidays } from '$lib/utils/dateCalculator';

	/** 表示対象のタスク */
	export let task: WbsTask;

	/** 階層レベル（インデント用） */
	export let level = 0;

	/** 現在選択中のタスクID */
	export let selectedTaskId: string | null = null;

	/** 親タスクのID（ルートの場合はnull） */
	export let parentId: string | null = null;

	const dispatch = createEventDispatcher();

	let isCollapsed = false;
	let isEditingName = false;
	let isEditingDates = false;
	let taskNameInput: HTMLInputElement | null = null;

	// ドラッグアンドドロップの状態
	let dropZone: 'none' | 'before' | 'into' | 'after' = 'none';
	let isDragging = false;
	let isDropAllowed = true;

	/** モジュールレベルでのドラッグ状態管理（全TaskNodeで共有） */
	/** 現在ドラッグ中のタスクID */
	let draggingTaskId: string | null = null;
	/** ドラッグ中のタスクの全子孫ID（自分自身含む） */
	let draggingTaskDescendants = new Set<string>();

	let startDateInput = task.startDate || '';
	let endDateInput = task.endDate || '';

	// taskプロパティの変更を検知してローカル変数を更新（編集中でない場合のみ）
	$: if (!isEditingDates) {
		startDateInput = task.startDate || '';
		endDateInput = task.endDate || '';
	}

	/** タスクの展開・折り畳みを切り替える */
	function toggleCollapse() {
		isCollapsed = !isCollapsed;
	}

	/** タスク名の編集を開始する */
	async function startEditingName() {
		isEditingName = true;
		await tick();
		taskNameInput?.focus();
		taskNameInput?.select();
	}

	/** タスク名の編集を確定する */
	function commitNameChange() {
		if (!isEditingName || !taskNameInput) {
			return;
		}
		const value = taskNameInput.value.trim();
		if (value && value !== task.name) {
			updateTask(task.id, (current) => ({ ...current, name: value }));
		}
		isEditingName = false;
	}

	/** 進捗率を更新する */
	function handleProgressChange(event: Event) {
		const value = Number((event.target as HTMLInputElement).value);
		updateTask(task.id, (current) => ({
			...current,
			progress: value,
			status: value === 100 ? 'completed' : value === 0 ? 'not-started' : 'in-progress'
		}));
	}

	/** 子タスクを追加する */
	function handleAddChild() {
		const child = createBlankTask('新しいサブタスク', task.id);
		addChildTask(task.id, child);
		isCollapsed = false;
		dispatch('createChild', { parentId: task.id, child });
	}

	/** タスクを削除する */
	function handleDelete() {
		if (confirm(`タスク「${task.name}」を削除しますか？`)) {
			removeTask(task.id);
			dispatch('delete', task.id);
		}
	}

	/** タスク選択イベントを発火する */
	function handleSelect() {
		dispatch('select', task);
	}

	/** AIによるサブタスク分解を要求する */
	function handleDecompose() {
		dispatch('decompose', task);
	}

	/** AIによるタスクブラッシュアップを要求する */
	function handleRefine() {
		dispatch('refine', task);
	}

	/** タスクを複製する */
	function handleDuplicate() {
		dispatch('duplicate', task.id);
	}

	/** タスクをアーカイブする */
	function handleArchive() {
		dispatch('archive', task.id);
	}

	/** 日付編集を開始する */
	function startEditingDates() {
		isEditingDates = true;
		startDateInput = task.startDate || '';
		endDateInput = task.endDate || '';
	}

	/** 日付の変更を即座に反映する（編集モードは維持、工数も自動計算） */
	async function handleDateChange() {
		if (!isEditingDates) return;

		// 変更があった場合のみ処理
		if (startDateInput !== task.startDate || endDateInput !== task.endDate) {
			const newStartDate = startDateInput || undefined;
			const newEndDate = endDateInput || undefined;

			// 工数を自動計算
			let effortDays: number | undefined = task.effortDays;
			if (newStartDate && newEndDate) {
				try {
					const holidays = await getHolidays(apiClient);
					effortDays = calculateEffortDays(newStartDate, newEndDate, holidays);
				} catch (error) {
					console.error('工数の自動計算に失敗:', error);
				}
			}

			// 1. フロントエンドのストアを即座に更新（UIに即座に反映）
			updateTask(task.id, (current) => ({
				...current,
				startDate: newStartDate,
				endDate: newEndDate,
				effortDays
			}));

			// 2. Svelteの更新サイクルを待つ（DOMに反映されるまで待機）
			await tick();

			// 3. バックエンドAPIに保存（日付と工数をまとめて）
			await saveTaskToBackend(newStartDate, newEndDate, effortDays);

			// 4. 入力フィールドの値を更新後の値で上書き（編集モード終了後に正しい値を表示）
			startDateInput = newStartDate || '';
			endDateInput = newEndDate || '';

			// 5. 編集モードを終了
			isEditingDates = false;
		}
	}

	/** タスクをバックエンドAPIに保存（日付と工数） */
	async function saveTaskToBackend(startDate?: string, endDate?: string, effortDays?: number) {
		// タスクのデータベースIDを取得
		const mapping = get(taskIdMappingStore);
		const taskDatabaseId = mapping.get(task.id);

		if (!taskDatabaseId) {
			console.warn(
				`タスク ${task.name} (ID: ${task.id}) のデータベースIDが見つかりません。保存をスキップします。`
			);
			return;
		}

		try {
			const payload: any = {
				startDate: startDate || undefined,
				endDate: endDate || undefined
			};

			// 工数が計算されている場合は追加
			if (effortDays !== undefined) {
				payload.estimatedMinutes = effortDays * 8 * 60; // 工数（日）を分に変換
			}

			// PATCHメソッドで部分更新
			await apiClient.patch(`/tasks/${taskDatabaseId}`, payload);
			console.log(
				`タスク ${task.name} の日付と工数を保存しました: ${startDate} - ${endDate}, ${effortDays}日`
			);
		} catch (error) {
			console.error('タスクの保存に失敗:', error);
			alert(
				`タスクの保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/** 日付編集を確定する（編集モードを終了） */
	function commitDateChanges() {
		if (!isEditingDates) return;
		isEditingDates = false;
	}

	/** 全子孫IDを収集するヘルパー関数 */
	function collectDescendantIds(t: WbsTask, ids: Set<string>) {
		ids.add(t.id);
		for (const child of t.children) {
			collectDescendantIds(child, ids);
		}
	}

	/** ドラッグ開始 */
	function handleDragStart(event: DragEvent) {
		if (!event.dataTransfer) return;
		event.stopPropagation();

		isDragging = true;
		draggingTaskId = task.id;

		// 子孫IDセットを初期化・構築
		draggingTaskDescendants.clear();
		collectDescendantIds(task, draggingTaskDescendants);

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', task.id);
		event.dataTransfer.setData(
			'application/json',
			JSON.stringify({
				taskId: task.id,
				parentId,
				taskName: task.name
			})
		);

		// ドラッグ中の要素のスタイルを設定
		if (event.target instanceof HTMLElement) {
			event.target.style.opacity = '0.5';
		}
	}

	/** ドラッグ終了 */
	function handleDragEnd(event: DragEvent) {
		event.stopPropagation();
		isDragging = false;
		dropZone = 'none';
		isDropAllowed = true;

		// グローバル状態のクリア
		draggingTaskId = null;
		draggingTaskDescendants.clear();

		if (event.target instanceof HTMLElement) {
			event.target.style.opacity = '1';
		}
	}

	/** ドラッグオーバー - ドロップゾーンを判定 */
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation(); // 重要: 親要素への伝播を防ぐ

		if (!event.dataTransfer) return;

		// 1. 自分自身または自分の子孫からのドラッグであれば、ドロップ不可
		if (draggingTaskId) {
			if (draggingTaskId === task.id || draggingTaskDescendants.has(task.id)) {
				event.dataTransfer.dropEffect = 'none';
				dropZone = 'none';
				isDropAllowed = false;
				return;
			}
		}

		isDropAllowed = true;
		event.dataTransfer.dropEffect = 'move';

		// マウスの位置でドロップゾーンを判定（調整版）
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const y = event.clientY - rect.top;
		const height = rect.height;
		const relativeY = y / height;

		// ドロップゾーンの判定しきい値を調整 (25% / 50% / 25%)
		if (relativeY < 0.25) {
			dropZone = 'before';
		} else if (relativeY > 0.75) {
			dropZone = 'after';
		} else {
			dropZone = 'into';
		}
	}

	/** ドラッグ離脱 */
	function handleDragLeave(event: DragEvent) {
		event.stopPropagation();

		// 子要素からの離脱の場合は無視
		if (
			event.currentTarget !== event.target &&
			(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)
		) {
			return;
		}

		dropZone = 'none';
	}

	/** ドロップ */
	function handleDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation(); // 重要: イベントの伝播を止める

		if (!event.dataTransfer) return;

		const currentDropZone = dropZone;
		dropZone = 'none';

		if (!isDropAllowed) return;

		try {
			const dataStr = event.dataTransfer.getData('application/json');
			if (!dataStr) return;

			const data = JSON.parse(dataStr);

			// タスクのドロップ
			if (data.taskId) {
				const draggedId = data.taskId;

				// 自分自身や子孫へのドロップはここで最終チェック
				if (targetIsDescendant(draggedId, task.id)) {
					console.warn('自分自身の子孫には移動できません');
					return;
				}

				console.log(`タスク ${draggedId} を ${task.name} の ${currentDropZone} に移動`);

				if (currentDropZone === 'before') {
					moveTaskAdvanced(draggedId, task.id, 'before');
				} else if (currentDropZone === 'after') {
					moveTaskAdvanced(draggedId, task.id, 'after');
				} else if (currentDropZone === 'into') {
					moveTaskAdvanced(draggedId, task.id, 'into');
					isCollapsed = false; // 子タスクを表示
				}

				dispatch('taskMoved', { taskId: draggedId, targetId: task.id, position: currentDropZone });
			}

			// ユーザー（担当者）のドロップ処理
			if (data.userId) {
				updateTask(task.id, (current) => ({
					...current,
					assignee: data.userName
				}));
				dispatch('assigneeChanged', {
					taskId: task.id,
					userId: data.userId,
					userName: data.userName
				});
			}
		} catch (error) {
			console.error('ドロップ処理に失敗しました:', error);
		}
	}

	/** ターゲットがソースの子孫かどうかをチェック（安全策） */
	function targetIsDescendant(sourceId: string, targetId: string): boolean {
		if (draggingTaskId === sourceId) {
			return draggingTaskDescendants.has(targetId);
		}
		return false;
	}

	/** 担当者エリアへのドロップオーバー */
	function handleAssigneeDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (!event.dataTransfer) return;
		event.dataTransfer.dropEffect = 'copy';
	}

	/** 担当者エリアへのドロップ */
	function handleAssigneeDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		if (!event.dataTransfer) return;

		try {
			const data = JSON.parse(event.dataTransfer.getData('application/json'));

			if (data.userId) {
				updateTask(task.id, (current) => ({
					...current,
					assignee: data.userName
				}));

				dispatch('assigneeChanged', {
					taskId: task.id,
					userId: data.userId,
					userName: data.userName
				});
			}
		} catch (error) {
			console.error('担当者ドロップ処理に失敗しました:', error);
		}
	}
</script>

<div class="task-node">
	<div
		class="row"
		class:selected={selectedTaskId === task.id}
		class:dragging={isDragging}
		class:drop-before={dropZone === 'before'}
		class:drop-into={dropZone === 'into'}
		class:drop-after={dropZone === 'after'}
		draggable="true"
		on:dragstart={handleDragStart}
		on:dragend={handleDragEnd}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:drop={handleDrop}
	>
		<!-- ドロップインジケーター - 上 -->
		{#if dropZone === 'before'}
			<div class="drop-indicator top"></div>
		{/if}

		<!-- ドロップインジケーター - 中（子として追加） -->
		{#if dropZone === 'into'}
			<div class="drop-indicator center"></div>
		{/if}

		<div class="cell name" style={`--indent: ${level}`}>
			{#if task.children.length > 0}
				<button
					type="button"
					class="collapse"
					on:click={toggleCollapse}
					aria-label="子タスクの表示を切り替える"
				>
					<i class={`bi bi-chevron-${isCollapsed ? 'right' : 'down'}`}></i>
				</button>
			{:else}
				<span class="collapse placeholder"></span>
			{/if}
			{#if isEditingName}
				<input
					bind:this={taskNameInput}
					value={task.name}
					on:blur={commitNameChange}
					on:keydown={(event) => event.key === 'Enter' && commitNameChange()}
				/>
			{:else}
				<div class="task-name-container">
					<button
						type="button"
						class="title-button"
						on:dblclick={startEditingName}
						on:click={handleSelect}
					>
						<span class="task-name-text">{task.name}</span>
						{#if task.priority && task.priority !== 'none'}
							<span
								class="priority-badge"
								class:high={task.priority === 'high'}
								class:medium={task.priority === 'medium'}
								class:low={task.priority === 'low'}
							>
								{#if task.priority === 'high'}高{:else if task.priority === 'medium'}中{:else}低{/if}
							</span>
						{/if}
						{#if task.tags && task.tags.length > 0}
							{#each task.tags.slice(0, 3) as tag}
								<span class="tag-badge">{tag}</span>
							{/each}
							{#if task.tags.length > 3}
								<span class="tag-badge more">+{task.tags.length - 3}</span>
							{/if}
						{/if}
					</button>
					{#if task.description}
						<div class="description-preview" on:click={handleSelect} role="button" tabindex="0">
							<i class="bi bi-file-text"></i>
							<span
								>{task.description.slice(0, 80)}{#if task.description.length > 80}...{/if}</span
							>
						</div>
					{/if}
				</div>
			{/if}
		</div>
		<div
			class="cell role"
			on:dragover={handleAssigneeDragOver}
			on:drop={handleAssigneeDrop}
			title="ユーザーをドラッグ&ドロップして担当者を変更できます"
		>
			{#if task.assignee}
				<span>{task.assignee}</span>
			{:else}
				<small class="unassigned">未割り当て</small>
			{/if}
		</div>
		<div class="cell duration">
			{#if isEditingDates}
				<div class="edit-dates-row">
					<span class="label">予定</span>
					<input
						type="date"
						bind:value={startDateInput}
						on:change={handleDateChange}
						on:blur={commitDateChanges}
						on:keydown={(e) => e.key === 'Enter' && commitDateChanges()}
					/>
					<i class="bi bi-arrow-right"></i>
					<input
						type="date"
						bind:value={endDateInput}
						on:change={handleDateChange}
						on:blur={commitDateChanges}
						on:keydown={(e) => e.key === 'Enter' && commitDateChanges()}
					/>
				</div>
			{:else}
				<button type="button" class="inline-edit-btn multiline" on:dblclick={startEditingDates}>
					<div class="date-row planned">
						<span class="label">予定:</span>
						<span>{task.startDate ?? '未設定'}</span>
						<i class="bi bi-arrow-right"></i>
						<span>{task.endDate ?? '未設定'}</span>
					</div>
					{#if task.actualStartDate || task.actualEndDate}
						<div class="date-row actual">
							<span class="label">実績:</span>
							<span>{task.actualStartDate ?? '---'}</span>
							<i class="bi bi-arrow-right"></i>
							<span>{task.actualEndDate ?? '---'}</span>
						</div>
					{/if}
				</button>
			{/if}
		</div>
		<div class="cell effort" title="工数は期間から自動計算されます">
			<span class="effort-value">{task.effortDays ?? '-'}日</span>
			<span class="auto-calc-icon">
				<i class="bi bi-calculator"></i>
			</span>
		</div>
		<div class="cell progress">
			<input
				type="range"
				min="0"
				max="100"
				step="5"
				value={task.progress}
				on:input={handleProgressChange}
			/>
			<span>{task.progress}%</span>
		</div>
		<div class="cell actions">
			<button type="button" class="icon-btn" title="サブタスクを追加" on:click={handleAddChild}>
				<i class="bi bi-node-plus"></i>
			</button>
			<button type="button" class="icon-btn" title="AIでサブタスク分解" on:click={handleDecompose}>
				<i class="bi bi-magic"></i>
			</button>
			<button type="button" class="icon-btn" title="AIでタスクを磨き直す" on:click={handleRefine}>
				<i class="bi bi-stars"></i>
			</button>
			<button type="button" class="icon-btn" title="タスクを複製" on:click={handleDuplicate}>
				<i class="bi bi-files"></i>
			</button>
			<button
				type="button"
				class="icon-btn"
				title={task.archived ? 'アーカイブから復元' : 'アーカイブ'}
				on:click={handleArchive}
			>
				<i class={`bi bi-${task.archived ? 'arrow-counterclockwise' : 'archive'}`}></i>
			</button>
			<button type="button" class="icon-btn danger" title="タスクを削除" on:click={handleDelete}>
				<i class="bi bi-trash"></i>
			</button>
		</div>

		<!-- ドロップインジケーター - 下 -->
		{#if dropZone === 'after'}
			<div class="drop-indicator bottom"></div>
		{/if}
	</div>

	{#if !isCollapsed && task.children.length > 0}
		<div class="children" style={`margin-left: ${(level + 1) * 18}px;`}>
			{#each task.children as child (child.id)}
				<svelte:self
					task={child}
					level={level + 1}
					{selectedTaskId}
					parentId={task.id}
					on:select={(event) => dispatch('select', event.detail)}
					on:decompose={(event) => dispatch('decompose', event.detail)}
					on:refine={(event) => dispatch('refine', event.detail)}
					on:createChild={(event) => dispatch('createChild', event.detail)}
					on:delete={(event) => dispatch('delete', event.detail)}
					on:duplicate={(event) => dispatch('duplicate', event.detail)}
					on:archive={(event) => dispatch('archive', event.detail)}
					on:taskMoved={(event) => dispatch('taskMoved', event.detail)}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.task-node {
		width: 100%;
		max-width: 100%;
		position: relative;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.row {
		display: grid;
		grid-template-columns:
			minmax(200px, 3fr) minmax(100px, 1.5fr) minmax(240px, 2fr)
			80px 120px 230px;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-bottom: 1px solid #e5e7eb;
		background: #ffffff;
		transition:
			background 0.2s ease,
			transform 0.2s ease,
			box-shadow 0.2s ease;
		cursor: grab;
		position: relative;
		writing-mode: horizontal-tb;
		text-orientation: mixed;
		direction: ltr;
		box-sizing: border-box;
		max-width: 100%;
		overflow: hidden;
	}

	.row:active {
		cursor: grabbing;
	}

	.row:hover {
		background: #f0f9ff;
	}

	.row.selected {
		border-left: 3px solid #3b82f6;
		background: #dbeafe;
	}

	.row.dragging {
		opacity: 0.5;
		cursor: grabbing;
	}

	/* ドロップゾーンのスタイル */
	.row.drop-before {
		box-shadow: 0 -3px 0 0 #3b82f6;
	}

	.row.drop-into {
		background: #e0f2fe !important;
		border: 2px solid #3b82f6;
		box-shadow: inset 0 0 10px rgba(59, 130, 246, 0.2);
	}

	.row.drop-after {
		box-shadow: 0 3px 0 0 #3b82f6;
	}

	/* ドロップインジケーター */
	.drop-indicator {
		position: absolute;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, #3b82f6, #60a5fa);
		z-index: 100;
		pointer-events: none;
		animation: pulse 1s ease-in-out infinite;
	}

	.drop-indicator.top {
		top: -2px;
	}

	.drop-indicator.center {
		top: 50%;
		transform: translateY(-50%);
		height: 100%;
		background: rgba(59, 130, 246, 0.1);
		border: 2px dashed #3b82f6;
		border-radius: 8px;
	}

	.drop-indicator.bottom {
		bottom: -2px;
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

	.cell {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		writing-mode: horizontal-tb;
		text-orientation: mixed;
		box-sizing: border-box;
		max-width: 100%;
		overflow: hidden;
	}

	.cell.name {
		gap: 10px;
		padding-left: calc(var(--indent) * 18px);
		writing-mode: horizontal-tb;
		text-orientation: mixed;
		direction: ltr;
	}

	.collapse {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		border: none;
		background: #f3f4f6;
		color: #6b7280;
		cursor: pointer;
		display: inline-flex;
		justify-content: center;
		align-items: center;
		transition: background 0.2s ease;
	}

	.collapse:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.collapse.placeholder {
		width: 28px;
		height: 28px;
		background: transparent;
	}

	.title-button {
		padding: 2px 4px;
		border: none;
		background: transparent;
		color: #111827;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
		max-width: 100%;
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0; /* flex子要素の省略表示に必須 */
		writing-mode: horizontal-tb;
		text-orientation: mixed;
	}

	.task-name-text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0; /* flex子要素の省略表示に必須 */
		flex-shrink: 1; /* テキストを優先的に縮小 */
		writing-mode: horizontal-tb;
		text-orientation: mixed;
		direction: ltr;
	}

	.title-button:focus {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	.title-button:hover {
		color: #3b82f6;
	}

	.cell.name input {
		background: #ffffff;
		border: 1px solid #3b82f6;
		border-radius: 8px;
		padding: 6px 10px;
		color: #111827;
		width: 100%;
	}

	.cell.role {
		flex-direction: column;
		align-items: flex-start;
		font-size: 13px;
		font-weight: 600;
		color: #111827;
		position: relative;
		padding: 8px 12px;
		border-radius: 8px;
		transition:
			background 0.2s ease,
			border 0.2s ease;
	}

	.cell.role:hover {
		background: #dbeafe;
	}

	.cell.role[data-drag-over='true'] {
		background: #dcfce7;
		border: 2px dashed #10b981;
	}

	.cell.role small {
		font-size: 11px;
		color: #9ca3af;
	}

	.cell.role small.unassigned {
		color: #d97706;
		font-style: italic;
	}

	.inline-edit-btn {
		padding: 4px 8px;
		border: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		border-radius: 6px;
		transition: background 0.2s ease;
	}

	.inline-edit-btn:hover {
		background: #dbeafe;
	}

	.cell.duration {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		font-size: 13px;
		font-weight: 600;
	}

	.edit-dates-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.cell.duration i {
		color: #9ca3af;
		font-size: 10px;
	}

	.cell.duration input[type='date'] {
		background: #ffffff;
		border: 1px solid #3b82f6;
		border-radius: 6px;
		padding: 2px 6px;
		color: #111827;
		font-size: 11px;
		width: 100px;
	}

	.inline-edit-btn.multiline {
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
	}

	.date-row {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
	}

	.date-row.planned {
		color: #374151;
		font-size: 13px;
		font-weight: 600;
	}

	.date-row.actual {
		color: #059669; /* Green for actual */
		font-size: 13px;
		font-weight: 600;
	}

	.date-row .label {
		color: #9ca3af;
		font-size: 10px;
		width: 28px;
		display: inline-block;
	}

	.cell.effort {
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.cell.effort .effort-value {
		color: #374151;
	}

	.cell.effort .auto-calc-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 4px;
		background: #eff6ff;
		color: #3b82f6;
		font-size: 10px;
	}

	.cell.progress {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		align-items: center;
	}

	.cell.progress input[type='range'] {
		width: 100%;
		accent-color: #3b82f6;
	}

	.cell.progress span {
		font-size: 12px;
		color: #6b7280;
		font-variant-numeric: tabular-nums;
	}

	.cell.actions {
		justify-content: flex-end;
		gap: 6px;
		position: relative;
	}

	/* デフォルトでは全てのボタンを表示 */
	.cell.actions .icon-btn {
		opacity: 1;
		pointer-events: auto;
		transition:
			opacity 0.2s ease,
			transform 0.2s ease,
			background 0.2s ease;
	}

	.icon-btn {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		color: #6b7280;
		cursor: pointer;
		display: inline-flex;
		justify-content: center;
		align-items: center;
		transition:
			transform 0.2s ease,
			background 0.2s ease;
	}

	.icon-btn:hover {
		transform: translateY(-1px);
		background: #dbeafe;
		color: #3b82f6;
	}

	.icon-btn.danger:hover {
		background: #fee2e2;
		color: #dc2626;
	}

	.children {
		border-left: 1px dashed #93c5fd;
	}

	/* レスポンシブ対応 */
	@media (max-width: 1600px) {
		.row {
			grid-template-columns:
				minmax(240px, 2.5fr) minmax(120px, 1.2fr) minmax(200px, 1.8fr)
				90px 140px 200px;
		}
	}

	@media (max-width: 1366px) {
		.row {
			grid-template-columns:
				minmax(220px, 2fr) minmax(100px, 1fr) minmax(200px, 1.5fr)
				80px 120px 180px;
		}

		.cell.actions {
			display: flex;
			flex-wrap: wrap;
			gap: 4px;
			max-width: 180px;
		}

		.cell.actions .icon-btn {
			width: 28px;
			height: 28px;
			opacity: 0;
			pointer-events: none;
			flex-shrink: 0;
		}

		/* 常に表示するボタン（最初と最後） */
		.cell.actions .icon-btn:first-child,
		.cell.actions .icon-btn:last-child {
			opacity: 1;
			pointer-events: auto;
		}

		/* 行にホバーした時は全てのボタンを表示 */
		.row:hover .cell.actions .icon-btn {
			opacity: 1;
			pointer-events: auto;
		}
	}

	@media (max-width: 1024px) {
		.row {
			grid-template-columns:
				minmax(160px, 2fr) minmax(60px, 0.8fr) minmax(120px, 1.2fr)
				50px 80px 120px;
			gap: 8px;
			padding: 10px 12px;
		}

		/* アクションボタンを絶対配置にして見切れを防ぐ */
		.cell.actions {
			position: absolute;
			right: 8px;
			top: 50%;
			transform: translateY(-50%);
			background: rgba(255, 255, 255, 0.98);
			padding: 6px;
			border-radius: 10px;
			box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
			z-index: 10;
			border: 1px solid #e5e7eb;
			display: flex;
			flex-wrap: wrap;
			gap: 4px;
			max-width: 220px;
		}

		.row:hover .cell.actions {
			background: rgba(240, 249, 255, 0.98);
			border-color: #93c5fd;
		}

		/* 小さい画面では最初と最後のボタンのみ常時表示 */
		.cell.actions .icon-btn {
			opacity: 0;
			pointer-events: none;
			width: 32px;
			height: 32px;
			flex-shrink: 0;
		}

		.cell.actions .icon-btn:first-child,
		.cell.actions .icon-btn:last-child {
			opacity: 1;
			pointer-events: auto;
			width: 36px;
			height: 36px;
			min-height: 36px;
		}

		/* ホバー時は全て表示 */
		.row:hover .cell.actions .icon-btn {
			opacity: 1;
			pointer-events: auto;
		}
	}

	/* タブレット～小さめのデスクトップでの調整 */
	@media (max-width: 900px) {
		.row {
			display: flex;
			flex-direction: column;
			gap: 12px;
			padding: 12px 10px;
			border-radius: 12px;
			margin-bottom: 8px;
			box-sizing: border-box;
			max-width: 100%;
			width: 100%;
			overflow: hidden;
		}

		.row:hover {
			background: #f0f9ff;
			box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
		}

		.row.selected {
			border: 2px solid #3b82f6;
			border-left: 2px solid #3b82f6;
			background: #dbeafe;
		}

		.cell.name {
			padding-left: calc(var(--indent) * 8px);
			padding-right: 80px;
			order: 1;
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
			overflow: hidden;
		}

		.cell.role,
		.cell.duration,
		.cell.effort,
		.cell.progress {
			flex-direction: column;
			align-items: flex-start;
			width: 100%;
			max-width: 100%;
			padding: 10px 12px;
			background: #f9fafb;
			border-radius: 8px;
			border: 1px solid #e5e7eb;
			position: relative;
			box-sizing: border-box;
			overflow: hidden;
		}

		.cell.role {
			order: 2;
		}

		.cell.role::before {
			content: '担当者';
			display: block;
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: #9ca3af;
			margin-bottom: 6px;
			font-weight: 600;
		}

		.cell.duration {
			order: 3;
		}

		.cell.duration::before {
			content: '期間';
			display: block;
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: #9ca3af;
			margin-bottom: 6px;
			font-weight: 600;
		}

		.cell.duration .inline-edit-btn {
			width: 100%;
			padding: 0;
		}

		.cell.effort {
			order: 4;
		}

		.cell.effort::before {
			content: '工数';
			display: block;
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: #9ca3af;
			margin-bottom: 6px;
			font-weight: 600;
		}

		.cell.progress {
			order: 5;
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		.cell.progress::before {
			content: '進捗';
			display: block;
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: #9ca3af;
			margin-bottom: 6px;
			font-weight: 600;
		}

		.cell.progress input[type='range'] {
			width: 100%;
			height: 8px;
			min-height: 48px;
			padding: 20px 0;
		}

		.cell.progress span {
			font-size: 14px;
			font-weight: 600;
			color: #374151;
		}

		.cell.actions {
			position: absolute;
			right: 8px;
			top: 8px;
			transform: none;
			background: rgba(255, 255, 255, 0.98);
			padding: 4px;
			border-radius: 10px;
			box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
			z-index: 10;
			border: 1px solid #e5e7eb;
		}

		.row:hover .cell.actions {
			background: rgba(240, 249, 255, 0.98);
			border-color: #93c5fd;
		}

		.cell.actions {
			display: flex;
			flex-wrap: wrap;
			gap: 4px;
			max-width: 140px;
		}

		.cell.actions .icon-btn {
			opacity: 1;
			pointer-events: auto;
			width: 36px;
			height: 36px;
			min-height: 36px;
			flex-shrink: 0;
		}

		.cell.actions .icon-btn:first-child,
		.cell.actions .icon-btn:last-child {
			width: 40px;
			height: 40px;
			min-height: 40px;
		}

		.children {
			margin-left: 6px !important;
			padding-left: 4px;
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
		}

		.task-name-text {
			white-space: normal;
			word-break: break-word;
			overflow-wrap: break-word;
		}

		.description-preview,
		.task-name-container,
		.title-button {
			max-width: 100%;
			overflow: hidden;
			box-sizing: border-box;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.row {
			padding: 12px 8px;
			gap: 10px;
			border-radius: 10px;
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
		}

		.cell.name {
			padding-right: 70px;
			padding-left: calc(var(--indent) * 6px);
			font-size: 14px;
			max-width: 100%;
			box-sizing: border-box;
		}

		.cell.role,
		.cell.duration,
		.cell.effort,
		.cell.progress {
			font-size: 13px;
			padding: 10px 12px;
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
		}

		.cell.role::before,
		.cell.duration::before,
		.cell.effort::before,
		.cell.progress::before {
			font-size: 9px;
			margin-bottom: 6px;
		}

		.cell.actions {
			right: 4px;
			top: 4px;
			padding: 4px;
			border-radius: 10px;
			display: flex;
			flex-wrap: wrap;
			gap: 4px;
			max-width: 100px;
			box-sizing: border-box;
		}

		.cell.actions .icon-btn {
			width: 36px;
			height: 36px;
			min-height: 36px;
			font-size: 15px;
			flex-shrink: 0;
			opacity: 1;
			pointer-events: auto;
		}

		.cell.actions .icon-btn:first-child,
		.cell.actions .icon-btn:last-child {
			width: 40px;
			height: 40px;
			min-height: 40px;
		}

		.task-name-container {
			gap: 4px;
			max-width: 100%;
			box-sizing: border-box;
		}

		.task-name-text {
			font-size: 14px;
			line-height: 1.4;
			white-space: normal;
			word-break: break-word;
			overflow-wrap: break-word;
			max-width: 100%;
		}

		.description-preview {
			padding: 6px 8px;
			font-size: 11px;
			border-radius: 6px;
			max-width: 100%;
			box-sizing: border-box;
		}

		.description-preview span {
			max-width: 100%;
			white-space: normal;
			word-break: break-word;
			overflow-wrap: break-word;
		}

		.priority-badge {
			padding: 3px 6px;
			font-size: 9px;
			margin-left: 4px;
			border-radius: 10px;
		}

		.tag-badge {
			padding: 3px 6px;
			font-size: 9px;
			margin-left: 4px;
			border-radius: 10px;
		}

		.children {
			border-left-width: 1px;
			margin-left: 4px !important;
			padding-left: 2px;
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
		}

		.collapse {
			width: 28px;
			height: 28px;
			min-height: 28px;
			border-radius: 6px;
			flex-shrink: 0;
		}

		.collapse.placeholder {
			width: 28px;
			height: 28px;
		}

		.date-row {
			font-size: 11px;
			gap: 4px;
			flex-wrap: wrap;
			max-width: 100%;
		}

		.date-row .label {
			width: 100%;
			margin-bottom: 2px;
		}

		.cell.duration input[type='date'] {
			font-size: 12px;
			padding: 6px 8px;
			width: 100%;
			max-width: 140px;
			min-height: 40px;
			box-sizing: border-box;
		}

		.edit-dates-row {
			flex-wrap: wrap;
			gap: 4px;
			max-width: 100%;
		}

		.title-button {
			max-width: 100%;
			overflow: hidden;
		}
	}

	/* 超極小画面（390px以下）での完全な横スクロール防止 */
	@media (max-width: 390px) {
		.row {
			padding: 10px 6px;
			width: 100%;
			max-width: 100vw;
		}

		.cell.name {
			padding-left: calc(var(--indent) * 4px);
			padding-right: 60px;
			max-width: calc(100vw - 12px);
		}

		.cell.actions {
			max-width: 90px;
			right: 2px;
			top: 2px;
		}

		.children {
			margin-left: 2px !important;
			padding-left: 2px;
			max-width: calc(100vw - 4px);
		}

		.collapse {
			width: 24px;
			height: 24px;
			min-height: 24px;
		}

		.collapse.placeholder {
			width: 24px;
			height: 24px;
		}

		.cell.role,
		.cell.duration,
		.cell.effort,
		.cell.progress {
			padding: 8px 10px;
			max-width: calc(100vw - 12px);
		}

		.cell.progress {
			min-height: 120px;
		}
	}

	/* タスク名と説明プレビュー */
	.task-name-container {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-width: 0; /* flex子要素の省略表示に必須 */
		writing-mode: horizontal-tb;
		text-orientation: mixed;
		direction: ltr;
	}

	.description-preview {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 6px;
		font-size: 11px;
		color: #1e40af;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease;
		max-width: fit-content;
		min-width: 0;
		width: auto;
	}

	.description-preview:hover {
		background: #dbeafe;
		border-color: #93c5fd;
	}

	.description-preview i {
		font-size: 10px;
		flex-shrink: 0;
	}

	.description-preview span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 300px;
	}

	/* 優先度バッジ */
	.priority-badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 12px;
		font-size: 10px;
		font-weight: 600;
		margin-left: 8px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex-shrink: 0; /* バッジは縮小しない */
	}

	.priority-badge.high {
		background: #fee2e2;
		color: #dc2626;
	}

	.priority-badge.medium {
		background: #fef3c7;
		color: #d97706;
	}

	.priority-badge.low {
		background: #dbeafe;
		color: #2563eb;
	}

	/* タグバッジ */
	.tag-badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 12px;
		font-size: 10px;
		font-weight: 500;
		margin-left: 6px;
		background: #f3f4f6;
		color: #4b5563;
		flex-shrink: 0; /* バッジは縮小しない */
		border: 1px solid #e5e7eb;
	}

	.tag-badge.more {
		background: #e0e7ff;
		color: #4f46e5;
		border-color: #c7d2fe;
	}
</style>
