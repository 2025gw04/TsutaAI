<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from '$lib/components/wbs/types';

	export let users: Array<{ id: number; username: string; fullName: string }> = [];
	export let currentUserFullName: string | null = null;

	/** 親コンポーネントから受け取る現在のフィルタ状態 */
	export let initialFilters: {
		assignees: string[];
		statuses: WbsTask['status'][];
		priorities: WbsTask['priority'][];
		tags: string[];
		dateFrom: string;
		dateTo: string;
	} = {
		assignees: [],
		statuses: [],
		priorities: [],
		tags: [],
		dateFrom: '',
		dateTo: ''
	};

	const dispatch = createEventDispatcher();

	/** フィルタ条件（親からの初期値で初期化） */
	let filters = {
		assignees: [...initialFilters.assignees],
		statuses: [...initialFilters.statuses],
		priorities: [...initialFilters.priorities],
		tags: [...initialFilters.tags],
		dateFrom: initialFilters.dateFrom,
		dateTo: initialFilters.dateTo
	};

	/** 親のフィルタ状態が変更されたら、ローカル状態を同期 */
	$: {
		filters = {
			assignees: [...initialFilters.assignees],
			statuses: [...initialFilters.statuses],
			priorities: [...initialFilters.priorities],
			tags: [...initialFilters.tags],
			dateFrom: initialFilters.dateFrom,
			dateTo: initialFilters.dateTo
		};
	}

	/** 利用可能なステータス */
	const availableStatuses: { value: WbsTask['status']; label: string }[] = [
		{ value: 'not-started', label: '未着手' },
		{ value: 'planning', label: '計画中' },
		{ value: 'in-progress', label: '進行中' },
		{ value: 'in-review', label: 'レビュー待ち' },
		{ value: 'blocked', label: 'ブロック中' },
		{ value: 'completed', label: '完了' }
	];

	/** 利用可能な優先度 */
	const availablePriorities: { value: WbsTask['priority']; label: string }[] = [
		{ value: 'high', label: '高' },
		{ value: 'medium', label: '中' },
		{ value: 'low', label: '低' },
		{ value: 'none', label: 'なし' }
	];

	/** チェックボックスのトグル */
	function toggleArrayItem<T>(array: T[], item: T): T[] {
		const index = array.indexOf(item);
		if (index > -1) {
			return array.filter((_, i) => i !== index);
		} else {
			return [...array, item];
		}
	}

	/** 担当者フィルタ切り替え */
	function toggleAssignee(assignee: string) {
		filters.assignees = toggleArrayItem(filters.assignees, assignee);
		applyFilters();
	}

	/** ステータスフィルタ切り替え */
	function toggleStatus(status: WbsTask['status']) {
		filters.statuses = toggleArrayItem(filters.statuses, status);
		applyFilters();
	}

	/** 優先度フィルタ切り替え */
	function togglePriority(priority: WbsTask['priority']) {
		filters.priorities = toggleArrayItem(filters.priorities, priority);
		applyFilters();
	}

	/** タグ入力変更 */
	function handleTagsChange(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		filters.tags = value
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0);
		applyFilters();
	}

	/** 期限フィルタ変更 */
	function handleDateChange() {
		applyFilters();
	}

	/** フィルタを適用 */
	function applyFilters() {
		dispatch('filterChange', filters);
	}

	/** フィルタをクリア */
	function clearFilters() {
		filters = {
			assignees: [],
			statuses: [],
			priorities: [],
			tags: [],
			dateFrom: '',
			dateTo: ''
		};
		applyFilters();
	}

	/** アクティブなフィルタ数を計算 */
	$: activeFilterCount =
		filters.assignees.length +
		filters.statuses.length +
		filters.priorities.length +
		filters.tags.length +
		(filters.dateFrom ? 1 : 0) +
		(filters.dateTo ? 1 : 0);

	/** 「自分のタスク」フィルタを適用 */
	function filterMyTasks() {
		if (currentUserFullName) {
			filters.assignees = [currentUserFullName];
			applyFilters();
		}
	}

	/** 「自分のタスク」フィルタが有効かどうか */
	$: isMyTasksActive =
		currentUserFullName &&
		filters.assignees.length === 1 &&
		filters.assignees[0] === currentUserFullName;
</script>

<div class="filter-panel">
	<div class="filter-header">
		<h3>
			<i class="bi bi-funnel"></i>
			フィルタ
			{#if activeFilterCount > 0}
				<span class="filter-count">{activeFilterCount}</span>
			{/if}
		</h3>
		<div class="header-actions">
			{#if currentUserFullName}
				<button
					type="button"
					class="btn-my-tasks"
					class:active={isMyTasksActive}
					on:click={filterMyTasks}
				>
					<i class="bi bi-person-check"></i>
					自分のタスク
				</button>
			{/if}
			<button type="button" class="btn-clear" on:click={clearFilters}>
				<i class="bi bi-x-circle"></i>
				クリア
			</button>
		</div>
	</div>

	<div class="filter-content">
		<!-- 担当者フィルタ -->
		<div class="filter-group">
			<div class="filter-group-title">担当者</div>
			<div class="filter-options">
				{#each users as user (user.id)}
					<label class="filter-option">
						<input
							type="checkbox"
							checked={filters.assignees.includes(user.fullName)}
							on:change={() => toggleAssignee(user.fullName)}
						/>
						<span>{user.fullName}</span>
					</label>
				{/each}
				{#if users.length === 0}
					<p class="empty-text">担当者がありません</p>
				{/if}
			</div>
		</div>

		<!-- ステータスフィルタ -->
		<div class="filter-group">
			<div class="filter-group-title">ステータス</div>
			<div class="filter-options">
				{#each availableStatuses as status (status.value)}
					<label class="filter-option">
						<input
							type="checkbox"
							checked={filters.statuses.includes(status.value)}
							on:change={() => toggleStatus(status.value)}
						/>
						<span>{status.label}</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- 優先度フィルタ -->
		<div class="filter-group">
			<div class="filter-group-title">優先度</div>
			<div class="filter-options">
				{#each availablePriorities as priority (priority.value)}
					<label class="filter-option">
						<input
							type="checkbox"
							checked={filters.priorities.includes(priority.value)}
							on:change={() => togglePriority(priority.value)}
						/>
						<span>{priority.label}</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- タグフィルタ -->
		<div class="filter-group">
			<div class="filter-group-title">タグ（カンマ区切り）</div>
			<input
				type="text"
				class="filter-input"
				placeholder="例: フロントエンド, デザイン"
				value={filters.tags.join(', ')}
				on:input={handleTagsChange}
			/>
		</div>

		<!-- 期限フィルタ -->
		<div class="filter-group">
			<div class="filter-group-title">期限範囲</div>
			<div class="date-range">
				<input
					type="date"
					class="filter-input"
					bind:value={filters.dateFrom}
					on:change={handleDateChange}
				/>
				<span>〜</span>
				<input
					type="date"
					class="filter-input"
					bind:value={filters.dateTo}
					on:change={handleDateChange}
				/>
			</div>
		</div>
	</div>
</div>

<style>
	.filter-panel {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 16px;
	}

	.filter-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
		padding-bottom: 12px;
		border-bottom: 1px solid #e5e7eb;
	}

	.filter-header h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: #111827;
	}

	.filter-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background: #3b82f6;
		color: #ffffff;
		font-size: 11px;
		font-weight: 700;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.btn-my-tasks {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #f9fafb;
		color: #6b7280;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.2s ease;
	}

	.btn-my-tasks:hover {
		background: #dbeafe;
		color: #2563eb;
		border-color: #93c5fd;
	}

	.btn-my-tasks.active {
		background: #3b82f6;
		color: #ffffff;
		border-color: #3b82f6;
	}

	.btn-clear {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #f9fafb;
		color: #6b7280;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.btn-clear:hover {
		background: #fee2e2;
		color: #dc2626;
		border-color: #fecaca;
	}

	.filter-content {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.filter-group-title {
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.filter-options {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.filter-option {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.filter-option:hover {
		background: #f3f4f6;
	}

	.filter-option input[type='checkbox'] {
		cursor: pointer;
	}

	.filter-option span {
		font-size: 13px;
		color: #374151;
	}

	.filter-input {
		padding: 8px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 13px;
		transition: border-color 0.2s ease;
	}

	.filter-input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.date-range {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.date-range span {
		color: #6b7280;
		font-size: 13px;
	}

	.empty-text {
		font-size: 12px;
		color: #9ca3af;
		font-style: italic;
		margin: 0;
	}
</style>
