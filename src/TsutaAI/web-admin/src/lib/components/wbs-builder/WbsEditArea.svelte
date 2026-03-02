<script lang="ts">
	import {
		currentPhase,
		selectedParentTask,
		currentWbs,
		updateTask,
		deleteTask,
		findTaskById,
		reorderTasks,
		saveToLocalStorage
	} from '$lib/stores/wbsBuilderStore';
	import type { WbsBuilderTask } from '$lib/stores/wbsBuilderStore';
	import { get } from 'svelte/store';

	export let isLoading = false;

	// Drag and drop state
	let draggedIndex: number | null = null;
	let dragOverIndex: number | null = null;

	// Get tasks to display based on current phase and selection
	// Using a reactive statement that depends on all relevant stores
	$: displayTasks = getDisplayTasks($currentPhase, $currentWbs, $selectedParentTask);

	function getDisplayTasks(
		phase: string,
		wbs: WbsBuilderTask[],
		selectedParent: string | null
	): WbsBuilderTask[] {
		if (phase === 'input') return [];

		if (phase === 'major') {
			return wbs || [];
		}

		if (phase === 'medium' && selectedParent) {
			const parent = findTaskById(wbs, selectedParent);
			return parent?.children || [];
		}

		if (phase === 'minor' && selectedParent) {
			// Find the selected medium task
			for (const majorTask of wbs) {
				if (majorTask.children) {
					const mediumTask = majorTask.children.find((t) => t.id === selectedParent);
					if (mediumTask) {
						return mediumTask.children || [];
					}
				}
			}
			return [];
		}

		if (phase === 'confirm') {
			// Show all tasks in tree format
			return wbs || [];
		}

		return [];
	}

	// Handle task field update
	function handleTaskUpdate(taskId: string, field: string, value: any) {
		updateTask(taskId, { [field]: value });
	}

	// Handle task deletion
	function handleDeleteTask(taskId: string) {
		if (confirm('このタスクを削除してもよろしいですか?')) {
			deleteTask(taskId);
		}
	}

	// Add a new empty task
	function handleAddTask() {
		const newTask: WbsBuilderTask = {
			id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			name: '新しいタスク',
			description: '',
			effortDays: 1,
			startDate: '',
			endDate: '',
			level: $currentPhase === 'major' ? 'major' : $currentPhase === 'medium' ? 'medium' : 'minor',
			parentId: $selectedParentTask || undefined
		};

		// Add to the appropriate parent
		if ($currentPhase === 'major') {
			currentWbs.update((wbs) => [...wbs, newTask]);
		} else if ($selectedParentTask) {
			const parent = findTaskById(get(currentWbs), $selectedParentTask);
			if (parent) {
				const updatedChildren = [...(parent.children || []), newTask];
				updateTask($selectedParentTask, { children: updatedChildren });
			}
		}
	}

	// Drag and drop handlers
	function handleDragStart(index: number) {
		draggedIndex = index;
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		dragOverIndex = index;
	}

	function handleDragEnd() {
		if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
			const parentId = $currentPhase === 'major' ? null : $selectedParentTask;
			reorderTasks(parentId, draggedIndex, dragOverIndex);
			saveToLocalStorage();
		}
		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDragLeave() {
		// dragOverIndex = null; // Keep it for visual feedback
	}
</script>

<div class="wbs-edit-area">
	<div class="area-header">
		<div class="header-title">
			<h2>
				{#if $currentPhase === 'input'}
					プロジェクト情報を入力してください
				{:else if $currentPhase === 'major'}
					大分類タスク
				{:else if $currentPhase === 'medium'}
					中分類タスク
				{:else if $currentPhase === 'minor'}
					小分類タスク
				{:else if $currentPhase === 'confirm'}
					最終確認
				{/if}
			</h2>
			{#if ($currentPhase === 'medium' || $currentPhase === 'minor') && $selectedParentTask}
				{@const parentTask = findTaskById($currentWbs, $selectedParentTask)}
				{#if parentTask}
					<p class="parent-task-info">
						<i class="bi bi-arrow-right-short"></i>
						{parentTask.name}
					</p>
				{/if}
			{/if}
		</div>

		{#if $currentPhase !== 'input' && $currentPhase !== 'confirm'}
			<button class="add-task-btn" on:click={handleAddTask}>
				<i class="bi bi-plus-circle"></i>
				タスクを追加
			</button>
		{/if}
	</div>

	<div class="edit-content">
		{#if isLoading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>AIがタスクを生成中...</p>
			</div>
		{:else if $currentPhase === 'input'}
			<div class="placeholder-message">
				<i class="bi bi-info-circle"></i>
				<p>プロジェクトの基本情報を入力して、WBS生成を開始してください。</p>
			</div>
		{:else if $currentPhase === 'medium' && !$selectedParentTask}
			<div class="placeholder-message">
				<i class="bi bi-arrow-left-circle"></i>
				<p>左側のナビゲーターから大分類タスクを選択してください。</p>
			</div>
		{:else if $currentPhase === 'minor' && !$selectedParentTask}
			<div class="placeholder-message">
				<i class="bi bi-arrow-left-circle"></i>
				<p>左側のナビゲーターから中分類タスクを選択してください。</p>
			</div>
		{:else if displayTasks.length === 0}
			<div class="placeholder-message">
				<i class="bi bi-inbox"></i>
				<p>
					タスクがまだありません。「タスクを追加」ボタンで追加するか、AIに生成を依頼してください。
				</p>
			</div>
		{:else if $currentPhase === 'confirm'}
			<!-- Confirm view: read-only tree -->
			<div class="confirm-view">
				{#each displayTasks as majorTask}
					<div class="confirm-major-task">
						<div class="task-header">
							<i class="bi bi-folder"></i>
							<strong>{majorTask.name}</strong>
							<span class="effort-badge">{majorTask.effortDays || 0}日</span>
						</div>
						{#if majorTask.description}
							<p class="task-description">{majorTask.description}</p>
						{/if}

						{#if majorTask.children && majorTask.children.length > 0}
							<div class="children-list">
								{#each majorTask.children as mediumTask}
									<div class="confirm-medium-task">
										<div class="task-header">
											<i class="bi bi-folder-fill"></i>
											<strong>{mediumTask.name}</strong>
											<span class="effort-badge">{mediumTask.effortDays || 0}日</span>
										</div>
										{#if mediumTask.description}
											<p class="task-description">{mediumTask.description}</p>
										{/if}

										{#if mediumTask.children && mediumTask.children.length > 0}
											<div class="children-list">
												{#each mediumTask.children as minorTask}
													<div class="confirm-minor-task">
														<div class="task-header">
															<i class="bi bi-file-text"></i>
															<strong>{minorTask.name}</strong>
															<span class="effort-badge">{minorTask.effortDays || 0}日</span>
														</div>
														{#if minorTask.description}
															<p class="task-description">{minorTask.description}</p>
														{/if}
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<!-- Edit view: editable task list -->
			<div class="task-list">
				{#each displayTasks as task, index (task.id)}
					<div
						class="task-item"
						class:dragging={draggedIndex === index}
						class:drag-over={dragOverIndex === index}
						draggable="true"
						on:dragstart={() => handleDragStart(index)}
						on:dragover={(e) => handleDragOver(e, index)}
						on:dragend={handleDragEnd}
						on:dragleave={handleDragLeave}
					>
						<div class="task-row">
							<div class="task-field task-name-field">
								<label>タスク名</label>
								<input
									type="text"
									value={task.name}
									on:input={(e) => handleTaskUpdate(task.id, 'name', e.currentTarget.value)}
									placeholder="タスク名を入力"
								/>
							</div>

							<div class="task-field task-effort-field">
								<label>工数(日)</label>
								<input
									type="number"
									value={task.effortDays}
									on:input={(e) =>
										handleTaskUpdate(task.id, 'effortDays', parseInt(e.currentTarget.value) || 0)}
									min="0"
								/>
							</div>

							<div class="task-actions">
								<button class="delete-btn" on:click={() => handleDeleteTask(task.id)} title="削除">
									<i class="bi bi-trash"></i>
								</button>
							</div>
						</div>

						<!-- Date fields hidden - dates will be auto-calculated based on effort -->
						<!-- <div class="task-row task-date-row">
              <div class="task-field task-date-field">
                <label>開始日</label>
                <input
                  type="date"
                  value={task.startDate || ''}
                  on:input={(e) => handleTaskUpdate(task.id, 'startDate', e.currentTarget.value)}
                />
              </div>

              <div class="task-field task-date-field">
                <label>終了日</label>
                <input
                  type="date"
                  value={task.endDate || ''}
                  on:input={(e) => handleTaskUpdate(task.id, 'endDate', e.currentTarget.value)}
                />
              </div>
            </div> -->

						<div class="task-field task-description-field">
							<label>説明</label>
							<textarea
								value={task.description || ''}
								on:input={(e) => handleTaskUpdate(task.id, 'description', e.currentTarget.value)}
								placeholder="タスクの詳細を入力"
								rows="2"
							></textarea>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.wbs-edit-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #ffffff;
		border-right: 1px solid #e5e7eb;
	}

	.area-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 16px 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-title {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.area-header h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.parent-task-info {
		margin: 0;
		font-size: 12px;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.parent-task-info i {
		font-size: 16px;
		color: #0ea5e9;
	}

	.add-task-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		background: #f0f9ff;
		border: 1px solid #0ea5e9;
		border-radius: 6px;
		color: #0284c7;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.add-task-btn:hover {
		background: #e0f2fe;
		transform: translateY(-1px);
	}

	.add-task-btn i {
		font-size: 14px;
	}

	.edit-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px 20px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		gap: 20px;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid #e5e7eb;
		border-top: 4px solid #667eea;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-state p {
		margin: 0;
		font-size: 14px;
		color: #6b7280;
	}

	.placeholder-message {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		gap: 16px;
		text-align: center;
	}

	.placeholder-message i {
		font-size: 48px;
		color: #9ca3af;
	}

	.placeholder-message p {
		margin: 0;
		font-size: 14px;
		color: #6b7280;
		max-width: 400px;
	}

	.task-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.task-item {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		transition: all 0.2s ease;
		cursor: move;
	}

	.task-item:hover {
		border-color: #0ea5e9;
		box-shadow: 0 2px 8px rgba(14, 165, 233, 0.1);
	}

	.task-item.dragging {
		opacity: 0.5;
		cursor: grabbing;
	}

	.task-item.drag-over {
		border-color: #3b82f6;
		background: #dbeafe;
		border-width: 2px;
		margin-top: 4px;
	}

	.task-row {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	.task-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.task-name-field {
		flex: 1;
	}

	.task-effort-field {
		width: 80px;
	}

	.task-date-row {
		margin-top: 0;
	}

	.task-date-field {
		flex: 1;
	}

	.task-description-field {
		width: 100%;
	}

	.task-field label {
		font-size: 11px;
		font-weight: 600;
		color: #6b7280;
	}

	.task-field input,
	.task-field textarea {
		padding: 6px 8px;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		background: #ffffff;
		color: #111827;
		font-size: 13px;
		font-family: inherit;
		transition: border-color 0.2s ease;
	}

	.task-field input:focus,
	.task-field textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
	}

	.task-field textarea {
		resize: vertical;
		min-height: 40px;
	}

	.task-actions {
		display: flex;
		gap: 4px;
		align-items: flex-end;
	}

	.delete-btn {
		padding: 6px 8px;
		background: #fee2e2;
		border: 1px solid #fca5a5;
		border-radius: 4px;
		color: #dc2626;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 12px;
	}

	.delete-btn:hover {
		background: #fecaca;
		transform: scale(1.05);
	}

	.delete-btn i {
		font-size: 12px;
	}

	/* Confirm view styles */
	.confirm-view {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.confirm-major-task,
	.confirm-medium-task,
	.confirm-minor-task {
		padding: 16px;
		background: #f9fafb;
		border-radius: 8px;
		border-left: 4px solid #3b82f6;
	}

	.confirm-medium-task {
		border-left-color: #8b5cf6;
		margin-left: 20px;
	}

	.confirm-minor-task {
		border-left-color: #ec4899;
		margin-left: 20px;
	}

	.task-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.task-header i {
		font-size: 18px;
		color: #6b7280;
	}

	.task-header strong {
		flex: 1;
		font-size: 14px;
		color: #111827;
	}

	.effort-badge {
		display: inline-block;
		padding: 4px 8px;
		background: #dbeafe;
		color: #1e40af;
		font-size: 12px;
		font-weight: 600;
		border-radius: 4px;
	}

	.task-description {
		margin: 0 0 0 26px;
		font-size: 13px;
		color: #6b7280;
		line-height: 1.5;
	}

	.children-list {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
