<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from './types';

	export let tasks: WbsTask[] = [];
	export let searchQuery: string = '';
	export let show: boolean = false;
	export let position: { top: number; left: number; bottom: number } = {
		top: 0,
		left: 0,
		bottom: 0
	};

	const dispatch = createEventDispatcher();

	let selectedIndex = 0;

	// タスクをフラット化
	function flattenTasks(taskList: WbsTask[]): WbsTask[] {
		let result: WbsTask[] = [];
		for (const task of taskList) {
			result.push(task);
			if (task.children && task.children.length > 0) {
				result = result.concat(flattenTasks(task.children));
			}
		}
		return result;
	}

	// 検索クエリでフィルタリング
	$: flatTasks = flattenTasks(tasks);
	$: filteredTasks = searchQuery
		? flatTasks.filter((task) => {
				const query = searchQuery.toLowerCase();
				return (
					task.name.toLowerCase().includes(query) ||
					task.id.toLowerCase().includes(query) ||
					(task.assignee && task.assignee.toLowerCase().includes(query))
				);
			})
		: flatTasks;

	// 最大表示件数
	$: displayedTasks = filteredTasks.slice(0, 10);

	// 選択インデックスのリセット
	$: if (searchQuery) {
		selectedIndex = 0;
	}

	// タスクを選択
	function selectTask(task: WbsTask) {
		dispatch('select', { task });
	}

	// キーボードナビゲーション
	export function handleKeyDown(event: KeyboardEvent) {
		if (!show || displayedTasks.length === 0) return false;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, displayedTasks.length - 1);
				return true;

			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				return true;

			case 'Enter':
				event.preventDefault();
				if (displayedTasks[selectedIndex]) {
					selectTask(displayedTasks[selectedIndex]);
				}
				return true;

			case 'Escape':
				event.preventDefault();
				dispatch('close');
				return true;

			default:
				return false;
		}
	}

	// タスクの階層を表示用に整形
	function getTaskDisplayName(task: WbsTask): string {
		const parts = task.id.split('.');
		const indent = '　'.repeat(parts.length - 1);
		return `${indent}${task.id} ${task.name}`;
	}

	// ステータスに応じた色を返す
	function getStatusColor(status?: string): string {
		switch (status) {
			case 'completed':
				return '#10b981';
			case 'in-progress':
				return '#3b82f6';
			case 'pending':
				return '#6b7280';
			case 'blocked':
				return '#ef4444';
			default:
				return '#9ca3af';
		}
	}
</script>

{#if show && displayedTasks.length > 0}
	<div class="autocomplete-dropdown" style="bottom: {position.bottom}px; left: {position.left}px;">
		<div class="dropdown-header">
			<i class="bi bi-search"></i>
			<span>{displayedTasks.length}件のタスク</span>
		</div>
		<ul class="task-list">
			{#each displayedTasks as task, index (task.id)}
				<li
					class="task-item"
					class:selected={index === selectedIndex}
					on:click={() => selectTask(task)}
					on:mouseenter={() => (selectedIndex = index)}
				>
					<div class="task-info">
						<div class="task-header">
							<span class="task-id">{task.id}</span>
							<span class="task-name">{task.name}</span>
						</div>
						{#if task.assignee}
							<div class="task-meta">
								<i class="bi bi-person-circle"></i>
								<span>{task.assignee}</span>
							</div>
						{/if}
					</div>
					<div class="task-status" style="background: {getStatusColor(task.status)}"></div>
				</li>
			{/each}
		</ul>
		<div class="dropdown-footer">
			<span>↑↓で移動、Enterで選択、Escでキャンセル</span>
		</div>
	</div>
{/if}

<style>
	.autocomplete-dropdown {
		position: fixed;
		z-index: 10000;
		background: #ffffff;
		border: 1px solid #d1d5db;
		border-radius: 12px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
		min-width: 350px;
		max-width: 500px;
		width: 500px;
		max-height: 300px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.dropdown-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
	}

	.dropdown-header i {
		font-size: 14px;
	}

	.task-list {
		list-style: none;
		margin: 0;
		padding: 6px;
		overflow-y: auto;
		flex: 1;
	}

	.task-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		gap: 12px;
	}

	.task-item:hover,
	.task-item.selected {
		background: #eff6ff;
	}

	.task-info {
		flex: 1;
		min-width: 0;
	}

	.task-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.task-id {
		font-size: 11px;
		font-weight: 700;
		color: #667eea;
		background: rgba(102, 126, 234, 0.1);
		padding: 2px 6px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.task-name {
		font-size: 13px;
		font-weight: 600;
		color: #111827;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.task-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #6b7280;
	}

	.task-meta i {
		font-size: 12px;
	}

	.task-status {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dropdown-footer {
		padding: 8px 14px;
		background: #f9fafb;
		border-top: 1px solid #e5e7eb;
		font-size: 11px;
		color: #9ca3af;
		text-align: center;
	}

	/* スクロールバーのスタイル */
	.task-list::-webkit-scrollbar {
		width: 6px;
	}

	.task-list::-webkit-scrollbar-track {
		background: #f3f4f6;
		border-radius: 3px;
	}

	.task-list::-webkit-scrollbar-thumb {
		background: #d1d5db;
		border-radius: 3px;
	}

	.task-list::-webkit-scrollbar-thumb:hover {
		background: #9ca3af;
	}
</style>
