<script lang="ts">
	import { onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from '$lib/components/wbs/types';
	import { updateTask } from '$lib/stores/undoableWbsStore';
	import {
		isWeekendOrHoliday,
		formatYearMonth,
		calculateBusinessDays,
		loadHolidays
	} from '$lib/utils/dateUtils';

	/** 表示対象のタスク配列 */
	export let tasks: WbsTask[] = [];

	const DAY_MS = 86_400_000;
	const dispatch = createEventDispatcher();

	/** 日付セル情報（ヘッダー用） */
	interface DateCell {
		date: Date;
		dayOfMonth: number;
		yearMonth: string;
		isWeekendOrHoliday: boolean;
	}

	/** 平坦化したタスク情報 */
	let flattened: Array<
		WbsTask & {
			level: number;
			start: number;
			duration: number;
			startColumn: number;
			actualStart?: number;
			actualDuration?: number;
			actualStartColumn?: number;
		}
	> = [];

	/** タイムラインの総日数 */
	let totalDays = 30;

	/** 日付セルの配列 */
	let dateCells: DateCell[] = [];

	/** 基準日（タイムラインの開始日） */
	let referenceDate: Date | null = null;

	/** ドラッグ中の情報 */
	let dragState: {
		taskId: string;
		mode: 'move' | 'resize-start' | 'resize-end';
		initialX: number;
		initialStartColumn: number;
		initialDuration: number;
		reference: number;
	} | null = null;

	// 祝日データを読み込む
	onMount(async () => {
		// 現在の年と前後1年分の祝日データを読み込む
		const currentYear = new Date().getFullYear();
		await loadHolidays(currentYear - 1);
		await loadHolidays(currentYear);
		await loadHolidays(currentYear + 1);

		// 祝日データ読み込み後に再計算
		recompute();
	});

	$: recompute();

	/** タスクを平坦化して描画用データを整形する */
	function recompute() {
		if (tasks.length === 0) {
			flattened = [];
			totalDays = 30;
			return;
		}

		const list: Array<
			WbsTask & {
				level: number;
				start: number;
				duration: number;
				startColumn: number;
				actualStart?: number;
				actualDuration?: number;
				actualStartColumn?: number;
			}
		> = [];
		let minDate: number | null = null;

		const traverse = (items: WbsTask[], level: number) => {
			for (const task of items) {
				if (task.startDate) {
					const start = new Date(task.startDate).getTime();
					if (!minDate || start < minDate) {
						minDate = start;
					}
				}
				if (task.actualStartDate) {
					const start = new Date(task.actualStartDate).getTime();
					if (!minDate || start < minDate) {
						minDate = start;
					}
				}
				traverse(task.children, level + 1);
			}
		};

		traverse(tasks, 0);
		const reference = minDate ?? Date.now();

		const flatten = (items: WbsTask[], level: number) => {
			for (const task of items) {
				const start = task.startDate ? new Date(task.startDate).getTime() : reference;
				const end = task.endDate ? new Date(task.endDate).getTime() : start;
				const duration = Math.max(1, Math.round((end - start) / DAY_MS) + 1); // 終了日を含むため +1
				const startColumn = Math.max(0, Math.round((start - reference) / DAY_MS));

				// 実績の計算
				let actualStart: number | undefined;
				let actualDuration: number | undefined;
				let actualStartColumn: number | undefined;

				if (task.actualStartDate) {
					actualStart = new Date(task.actualStartDate).getTime();
					const actualEnd = task.actualEndDate
						? new Date(task.actualEndDate).getTime()
						: actualStart; // 終了日未定なら開始日と同じ（点）にするか、今日にするか。ここでは最低1日とする
					actualDuration = Math.max(1, Math.round((actualEnd - actualStart) / DAY_MS) + 1); // 終了日を含むため +1
					actualStartColumn = Math.max(0, Math.round((actualStart - reference) / DAY_MS));
				}

				list.push({
					...task,
					level,
					start,
					duration,
					startColumn,
					actualStart,
					actualDuration,
					actualStartColumn
				});
				if (task.children.length > 0) {
					flatten(task.children, level + 1);
				}
			}
		};

		flatten(tasks, 0);
		flattened = list;

		// 終了列の最大値を計算（予定と実績の両方を考慮）
		const lastPlanned = Math.max(...list.map((item) => item.startColumn + item.duration));
		const lastActual = Math.max(
			...list.map((item) => (item.actualStartColumn ?? 0) + (item.actualDuration ?? 0))
		);
		const last = Math.max(lastPlanned, lastActual);

		totalDays = Math.max(last + 5, 30);

		// 日付セル配列を生成
		referenceDate = new Date(reference);
		dateCells = [];
		for (let i = 0; i < totalDays; i++) {
			const cellDate = new Date(reference + i * DAY_MS);
			dateCells.push({
				date: cellDate,
				dayOfMonth: cellDate.getDate(),
				yearMonth: formatYearMonth(cellDate),
				isWeekendOrHoliday: isWeekendOrHoliday(cellDate)
			});
		}
	}

	/** ガントバーのドラッグ開始（移動） */
	function handleBarDragStart(
		event: MouseEvent,
		task: WbsTask & { startColumn: number; duration: number; start: number }
	) {
		const target = event.target as HTMLElement;

		// リサイズハンドルがクリックされた場合の判定
		const targetElement = event.target as HTMLElement;
		const isStartHandle = targetElement.classList.contains('start');
		const isEndHandle = targetElement.classList.contains('end');

		let mode: 'move' | 'resize-start' | 'resize-end' = 'move';
		if (isStartHandle) {
			mode = 'resize-start';
		} else if (isEndHandle) {
			mode = 'resize-end';
		}

		// 基準日（タイムラインの開始日）を計算
		const minDate = Math.min(...flattened.map((t) => t.start).filter((s) => s > 0));

		dragState = {
			taskId: task.id,
			mode,
			initialX: event.clientX,
			initialStartColumn: task.startColumn,
			initialDuration: task.duration,
			reference: minDate || Date.now()
		};

		document.addEventListener('mousemove', handleBarDragMove);
		document.addEventListener('mouseup', handleBarDragEnd);
		event.preventDefault();
	}

	/** ドラッグ中の処理 */
	function handleBarDragMove(event: MouseEvent) {
		if (!dragState) return;

		const currentDragState = dragState;
		const deltaX = event.clientX - currentDragState.initialX;
		const cellWidth = 36; // 1日あたりのピクセル幅（スタイルと一致させる）
		const deltaDays = Math.round(deltaX / cellWidth);

		const taskIndex = flattened.findIndex((t) => t.id === currentDragState.taskId);
		if (taskIndex === -1) return;

		const task = flattened[taskIndex];

		if (currentDragState.mode === 'move') {
			// タスク全体を移動
			const newStartColumn = Math.max(0, currentDragState.initialStartColumn + deltaDays);
			const newStartDate = new Date(currentDragState.reference + newStartColumn * DAY_MS);
			const newEndDate = new Date(newStartDate.getTime() + (task.duration - 1) * DAY_MS);

			flattened[taskIndex] = {
				...task,
				startColumn: newStartColumn,
				start: newStartDate.getTime(),
				startDate: formatDate(newStartDate),
				endDate: formatDate(newEndDate)
			};
		} else if (currentDragState.mode === 'resize-start') {
			// 開始日を変更（終了日は固定）
			const newStartColumn = Math.max(0, currentDragState.initialStartColumn + deltaDays);
			const newDuration = Math.max(1, currentDragState.initialDuration - deltaDays);
			const newStartDate = new Date(currentDragState.reference + newStartColumn * DAY_MS);

			flattened[taskIndex] = {
				...task,
				startColumn: newStartColumn,
				duration: newDuration,
				start: newStartDate.getTime(),
				startDate: formatDate(newStartDate)
			};
		} else if (currentDragState.mode === 'resize-end') {
			// 終了日を変更（開始日は固定）
			const newDuration = Math.max(1, currentDragState.initialDuration + deltaDays);
			const newEndDate = new Date(task.start + (newDuration - 1) * DAY_MS);

			flattened[taskIndex] = {
				...task,
				duration: newDuration,
				endDate: formatDate(newEndDate)
			};
		}

		// 強制的に再描画
		flattened = [...flattened];
	}

	/** ドラッグ終了（工数も自動計算して更新） */
	function handleBarDragEnd() {
		if (!dragState) return;

		const currentDragState = dragState;
		const taskIndex = flattened.findIndex((t) => t.id === currentDragState.taskId);
		if (taskIndex !== -1) {
			const task = flattened[taskIndex];

			// 工数を自動計算（営業日数）
			let effortDays: number | undefined = undefined;
			if (task.startDate && task.endDate) {
				const startDate = new Date(task.startDate);
				const endDate = new Date(task.endDate);
				effortDays = calculateBusinessDays(startDate, endDate);
			}

			// ストアを更新（日付と工数を同時に）
			updateTask(task.id, (current) => ({
				...current,
				startDate: task.startDate,
				endDate: task.endDate,
				effortDays
			}));

			dispatch('taskUpdated', {
				taskId: task.id,
				startDate: task.startDate,
				endDate: task.endDate,
				effortDays
			});
		}

		document.removeEventListener('mousemove', handleBarDragMove);
		document.removeEventListener('mouseup', handleBarDragEnd);
		dragState = null;
	}

	/** 日付を YYYY-MM-DD 形式にフォーマット */
	function formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
</script>

<div class="gantt">
	<div class="gantt-header">
		<div class="task-header-wrapper">
			<div class="task-header">タスク</div>
		</div>
		<div class="timeline-header-wrapper">
			<!-- 年月行 -->
			<div
				class="year-month-row"
				style={`grid-template-columns: repeat(${totalDays}, minmax(36px, 1fr));`}
			>
				{#each dateCells as cell, index}
					{#if index === 0 || cell.dayOfMonth === 1}
						<div
							class="year-month-cell"
							style={`grid-column: ${index + 1} / span ${dateCells.slice(index).findIndex((c, i) => i > 0 && c.dayOfMonth === 1) === -1 ? dateCells.length - index : dateCells.slice(index).findIndex((c, i) => i > 0 && c.dayOfMonth === 1)};`}
						>
							{cell.yearMonth}
						</div>
					{/if}
				{/each}
			</div>
			<!-- 日付行 -->
			<div
				class="day-row"
				style={`grid-template-columns: repeat(${totalDays}, minmax(36px, 1fr));`}
			>
				{#each dateCells as cell}
					<div class="day-cell" class:weekend-holiday={cell.isWeekendOrHoliday}>
						{cell.dayOfMonth}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<div class="gantt-body">
		<div class="gantt-tasks">
			{#each flattened as task (task.id)}
				<div class="task-info" style={`padding-left: ${task.level * 18 + 5}px;`}>
					<button
						class="name"
						on:click={() => dispatch('select', { taskId: task.id })}
						title="クリックして詳細を表示"
					>
						{task.name}
						{#if task.dependencies && task.dependencies.length > 0}
							<i class="bi bi-link-45deg dependency-icon" title="依存関係あり"></i>
						{/if}
					</button>
					<small>{task.startDate ?? '未設定'} ~ {task.endDate ?? '未設定'}</small>
				</div>
			{/each}
		</div>
		<div class="gantt-timelines">
			{#each flattened as task (task.id)}
				<div
					class="timeline"
					style={`grid-template-columns: repeat(${totalDays}, minmax(36px, 1fr));`}
				>
					{#each dateCells as cell}
						<div class="timeline-cell" class:weekend-holiday={cell.isWeekendOrHoliday}></div>
					{/each}
					<div
						class="bar planned"
						class:dragging={dragState?.taskId === task.id}
						style={`grid-column: ${task.startColumn + 1} / span ${Math.max(task.duration, 1)}; grid-row: 1;`}
						title={`予定: ${task.name} (${task.startDate ?? '未設定'} ~ ${task.endDate ?? '未設定'})`}
						on:mousedown={(event) => handleBarDragStart(event, task)}
						role="button"
						tabindex="0"
					>
						<div
							class="resize-handle start"
							on:mousedown={(event) => handleBarDragStart(event, task)}
							role="button"
							tabindex="0"
						></div>
						<div
							class="resize-handle end"
							on:mousedown={(event) => handleBarDragStart(event, task)}
							role="button"
							tabindex="0"
						></div>
					</div>

					{#if task.actualStartColumn !== undefined && task.actualDuration !== undefined}
						<div
							class="bar actual"
							style={`grid-column: ${task.actualStartColumn + 1} / span ${Math.max(task.actualDuration, 1)}; grid-row: 1;`}
							title={`実績: ${task.actualStartDate ?? ''} ~ ${task.actualEndDate ?? ''}`}
						></div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.gantt {
		border-radius: 18px;
		border: 1px solid #e5e7eb;
		overflow: auto;
		background: #ffffff;
		max-height: 80vh;
		position: relative;
		width: 100%;
		max-width: 100%;
	}

	.gantt-header {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 0;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		position: sticky;
		top: 0;
		z-index: 15;
		width: fit-content;
		min-width: 100%;
	}

	.task-header-wrapper {
		border-right: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		position: sticky;
		left: 0;
		z-index: 20;
		background: #f9fafb;
	}

	.task-header {
		padding: 14px 16px;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
		flex: 1;
		display: flex;
		align-items: center;
	}

	.timeline-header-wrapper {
		display: flex;
		flex-direction: column;
		min-width: max-content; /* タイムラインヘッダーが画面外に伸びることを許可 */
	}

	.year-month-row {
		display: grid;
		align-items: stretch;
		font-size: 11px;
		font-weight: 600;
		color: #6b7280;
		border-bottom: 1px solid #e5e7eb;
	}

	.year-month-cell {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 8px 4px;
		background: #f9fafb;
		border-right: 1px solid #e5e7eb;
	}

	.day-row {
		display: grid;
		align-items: stretch;
		font-size: 11px;
		color: #9ca3af;
	}

	.day-cell {
		display: flex;
		justify-content: center;
		align-items: center;
		border-right: 1px solid #f3f4f6;
		padding: 10px 0;
		background: #ffffff;
	}

	.day-cell.weekend-holiday {
		background: #fef2f2;
		color: #dc2626;
	}

	.gantt-body {
		display: grid;
		grid-template-columns: 280px 1fr;
		position: relative;
		width: fit-content;
		min-width: 100%;
	}

	.gantt-tasks {
		position: sticky;
		left: 0;
		z-index: 10;
		background: #ffffff;
		border-right: 1px solid #e5e7eb;
	}

	.gantt-timelines {
		/* overflow-x: autoを削除 - 親要素.ganttでスクロールを管理 */
		min-width: max-content; /* タイムラインが画面外に伸びることを許可 */
	}

	.task-info {
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: #ffffff;
		border-bottom: 1px solid #f3f4f6;
		height: 60px; /* 固定高さ */
		overflow: hidden; /* はみ出しを隠す */
		justify-content: center; /* 垂直方向中央揃え */
	}

	.task-info .name {
		font-size: 13px;
		font-weight: 600;
		color: #111827;
		white-space: nowrap; /* テキストの折り返しを防ぐ */
		overflow: hidden; /* はみ出しを隠す */
		text-overflow: ellipsis; /* はみ出しを三点リーダーで示す */
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 4px;
		transition: color 0.2s ease;
	}

	.task-info .name:hover {
		color: #3b82f6;
	}

	.task-info .name .dependency-icon {
		color: #d97706;
		font-size: 14px;
		flex-shrink: 0;
	}

	.task-info small {
		font-size: 11px;
		color: #6b7280;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.timeline {
		display: grid;
		align-items: center;
		padding: 6px 0;
		position: relative;
		border-bottom: 1px solid #f3f4f6;
		background: #ffffff;
		height: 60px; /* 固定高さ */
	}

	.timeline-cell {
		grid-row: 1;
		background: #ffffff;
		border-right: 1px solid #f9fafb;
	}

	.timeline-cell.weekend-holiday {
		background: #fef2f2;
	}

	.bar {
		height: 16px;
		border-radius: 4px;
		position: relative;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease;
	}

	.bar.planned {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
		cursor: grab;
		margin-top: -12px; /* Shift up */
		z-index: 2;
	}

	.bar.actual {
		background: #10b981; /* Green */
		height: 10px;
		margin-top: 16px; /* Shift down */
		opacity: 0.9;
		z-index: 1;
		box-shadow: 0 1px 3px rgba(16, 185, 129, 0.3);
	}

	.bar.planned:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4);
	}

	.bar.dragging {
		cursor: grabbing;
		box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
		transform: translateY(-2px) scale(1.02);
		z-index: 10;
	}

	.resize-handle {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: ew-resize;
		z-index: 2;
		opacity: 0;
		transition: opacity 0.2s ease;
		background: rgba(255, 255, 255, 0.3);
	}

	.resize-handle.start {
		left: 0;
		border-radius: 4px 0 0 4px;
	}

	.resize-handle.end {
		right: 0;
		border-radius: 0 4px 4px 0;
	}

	.bar.planned:hover .resize-handle {
		opacity: 1;
	}

	@media (max-width: 768px) {
		.gantt-header {
			grid-template-columns: 200px 1fr;
		}

		.gantt-body {
			grid-template-columns: 200px 1fr;
		}
	}
</style>
