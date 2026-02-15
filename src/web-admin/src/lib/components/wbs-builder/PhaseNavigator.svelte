<script lang="ts">
	import { currentPhase, currentWbs, selectedParentTask } from '$lib/stores/wbsBuilderStore';
	import type { WbsBuilderTask } from '$lib/stores/wbsBuilderStore';

	// Phase labels
	const phaseLabels = {
		input: 'プロジェクト情報入力',
		major: '大分類の生成',
		medium: '中分類の生成',
		minor: '小分類の生成',
		confirm: '最終確認'
	};

	// Track expanded state for each task (use object for reactivity)
	let expandedTasks: { [key: string]: boolean } = {};

	// Handle task selection
	function handleTaskSelect(taskId: string) {
		selectedParentTask.set(taskId);
	}

	// Toggle expand/collapse
	function toggleExpand(taskId: string) {
		const newState = !expandedTasks[taskId];
		expandedTasks = { ...expandedTasks, [taskId]: newState };
		console.log('Toggle expand:', taskId, 'new state:', newState, 'all states:', expandedTasks);
	}

	// Initialize expanded state when WBS changes
	// Track previous WBS length to avoid re-initializing on expand toggle
	let previousWbsLength = 0;

	$: if ($currentWbs.length !== previousWbsLength) {
		previousWbsLength = $currentWbs.length;
		const newExpanded: { [key: string]: boolean } = { ...expandedTasks };
		let changed = false;

		$currentWbs.forEach((majorTask) => {
			if (newExpanded[majorTask.id] === undefined) {
				newExpanded[majorTask.id] = true;
				changed = true;
			}
		});

		if (changed) {
			expandedTasks = newExpanded;
		}
	}
</script>

<div class="phase-navigator">
	<div class="phase-header">
		<h2>進捗状況</h2>
		<div class="current-phase">
			<span class="phase-badge">{phaseLabels[$currentPhase]}</span>
		</div>
	</div>

	<div class="phase-steps">
		<div
			class="step"
			class:active={$currentPhase === 'input'}
			class:completed={$currentPhase !== 'input'}
		>
			<div class="step-indicator">
				{#if $currentPhase === 'input'}
					<i class="bi bi-circle-fill"></i>
				{:else}
					<i class="bi bi-check-circle-fill"></i>
				{/if}
			</div>
			<span>プロジェクト情報</span>
		</div>

		<div
			class="step"
			class:active={$currentPhase === 'major'}
			class:completed={['medium', 'minor', 'confirm'].includes($currentPhase)}
		>
			<div class="step-indicator">
				{#if $currentPhase === 'major'}
					<i class="bi bi-circle-fill"></i>
				{:else if ['medium', 'minor', 'confirm'].includes($currentPhase)}
					<i class="bi bi-check-circle-fill"></i>
				{:else}
					<i class="bi bi-circle"></i>
				{/if}
			</div>
			<span>大分類</span>
		</div>

		<div
			class="step"
			class:active={$currentPhase === 'medium'}
			class:completed={['minor', 'confirm'].includes($currentPhase)}
		>
			<div class="step-indicator">
				{#if $currentPhase === 'medium'}
					<i class="bi bi-circle-fill"></i>
				{:else if ['minor', 'confirm'].includes($currentPhase)}
					<i class="bi bi-check-circle-fill"></i>
				{:else}
					<i class="bi bi-circle"></i>
				{/if}
			</div>
			<span>中分類</span>
		</div>

		<div
			class="step"
			class:active={$currentPhase === 'minor'}
			class:completed={$currentPhase === 'confirm'}
		>
			<div class="step-indicator">
				{#if $currentPhase === 'minor'}
					<i class="bi bi-circle-fill"></i>
				{:else if $currentPhase === 'confirm'}
					<i class="bi bi-check-circle-fill"></i>
				{:else}
					<i class="bi bi-circle"></i>
				{/if}
			</div>
			<span>小分類</span>
		</div>

		<div class="step" class:active={$currentPhase === 'confirm'}>
			<div class="step-indicator">
				{#if $currentPhase === 'confirm'}
					<i class="bi bi-circle-fill"></i>
				{:else}
					<i class="bi bi-circle"></i>
				{/if}
			</div>
			<span>最終確認</span>
		</div>
	</div>

	{#if $currentWbs.length > 0}
		<div class="task-tree">
			<h3>WBS階層</h3>
			<div class="tree-content">
				{#each $currentWbs as majorTask (majorTask.id)}
					<!-- Major task -->
					<div
						class="tree-item level-0"
						class:selected={$selectedParentTask === majorTask.id}
						class:selectable={$currentPhase === 'medium'}
					>
						<div class="tree-item-content">
							{#if majorTask.children && majorTask.children.length > 0}
								<button
									class="expand-btn"
									on:click|stopPropagation={() => toggleExpand(majorTask.id)}
									type="button"
								>
									<i class="bi bi-{expandedTasks[majorTask.id] ? 'chevron-down' : 'chevron-right'}"
									></i>
								</button>
							{:else}
								<span class="expand-placeholder"></span>
							{/if}

							<div
								class="task-content-clickable"
								on:click|stopPropagation={() =>
									$currentPhase === 'medium' && handleTaskSelect(majorTask.id)}
								role="button"
								tabindex={$currentPhase === 'medium' ? 0 : -1}
								on:keydown={(e) =>
									e.key === 'Enter' && $currentPhase === 'medium' && handleTaskSelect(majorTask.id)}
							>
								<i class="bi bi-folder"></i>
								<span class="task-name">{majorTask.name}</span>
								{#if majorTask.effortDays}
									<span class="effort-badge">{majorTask.effortDays}日</span>
								{/if}
							</div>
						</div>
					</div>

					<!-- Medium tasks (children of major) -->
					{#if expandedTasks[majorTask.id] && majorTask.children}
						{#each majorTask.children as mediumTask (mediumTask.id)}
							<div
								class="tree-item level-1"
								class:selected={$selectedParentTask === mediumTask.id}
								class:selectable={$currentPhase === 'minor'}
							>
								<div class="tree-item-content">
									{#if mediumTask.children && mediumTask.children.length > 0}
										<button
											class="expand-btn"
											on:click|stopPropagation={() => toggleExpand(mediumTask.id)}
											type="button"
										>
											<i
												class="bi bi-{expandedTasks[mediumTask.id]
													? 'chevron-down'
													: 'chevron-right'}"
											></i>
										</button>
									{:else}
										<span class="expand-placeholder"></span>
									{/if}

									<div
										class="task-content-clickable"
										on:click|stopPropagation={() =>
											$currentPhase === 'minor' && handleTaskSelect(mediumTask.id)}
										role="button"
										tabindex={$currentPhase === 'minor' ? 0 : -1}
										on:keydown={(e) =>
											e.key === 'Enter' &&
											$currentPhase === 'minor' &&
											handleTaskSelect(mediumTask.id)}
									>
										<i class="bi bi-folder-fill"></i>
										<span class="task-name">{mediumTask.name}</span>
										{#if mediumTask.effortDays}
											<span class="effort-badge">{mediumTask.effortDays}日</span>
										{/if}
									</div>
								</div>
							</div>

							<!-- Minor tasks (children of medium) -->
							{#if expandedTasks[mediumTask.id] && mediumTask.children}
								{#each mediumTask.children as minorTask (minorTask.id)}
									<div class="tree-item level-2" role="button" tabindex="-1">
										<div class="tree-item-content">
											<span class="expand-placeholder"></span>
											<i class="bi bi-file-text"></i>
											<span class="task-name">{minorTask.name}</span>
											{#if minorTask.effortDays}
												<span class="effort-badge">{minorTask.effortDays}日</span>
											{/if}
										</div>
									</div>
								{/each}
							{/if}
						{/each}
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.phase-navigator {
		display: flex;
		flex-direction: column;
		gap: 16px;
		height: 100%;
		background: #ffffff;
		border-right: 1px solid #e5e7eb;
		padding: 16px;
		overflow-y: auto;
	}

	.phase-header {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.phase-header h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		color: #111827;
	}

	.current-phase {
		display: flex;
		align-items: center;
	}

	.phase-badge {
		display: inline-block;
		padding: 4px 10px;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		font-size: 12px;
		font-weight: 600;
		border-radius: 4px;
	}

	.phase-steps {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.step.active {
		background: #f0f9ff;
		border: 1px solid #0ea5e9;
	}

	.step.completed {
		background: #f0fdf4;
	}

	.step-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
	}

	.step-indicator i {
		font-size: 16px;
	}

	.step.active .step-indicator i {
		color: #0ea5e9;
	}

	.step.completed .step-indicator i {
		color: #10b981;
	}

	.step:not(.active):not(.completed) .step-indicator i {
		color: #9ca3af;
	}

	.step span {
		font-size: 12px;
		font-weight: 600;
		color: #374151;
	}

	.step.active span {
		color: #0284c7;
	}

	.task-tree {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 4px;
	}

	.task-tree h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: #111827;
	}

	.tree-content {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.tree-item {
		padding: 3px 6px;
		border-radius: 3px;
		cursor: default;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		min-height: 24px;
	}

	.tree-item.level-0 {
		background: #f3f4f6;
		padding-left: 4px;
	}

	.tree-item.level-1 {
		background: #fafafa;
		padding-left: 24px;
	}

	.tree-item.level-2 {
		background: #fafafa;
		padding-left: 44px;
	}

	.expand-btn {
		padding: 0;
		margin: 0;
		margin-right: 2px;
		background: none;
		border: none;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		color: #6b7280;
		transition: color 0.15s ease;
		flex-shrink: 0;
		position: relative;
		z-index: 10;
	}

	.expand-btn:hover {
		color: #111827;
		background: #e5e7eb;
		border-radius: 4px;
	}

	.expand-btn i {
		font-size: 12px;
	}

	.expand-placeholder {
		width: 24px;
		height: 24px;
		display: inline-block;
		flex-shrink: 0;
		margin-right: 2px;
	}

	.tree-item.selectable {
		cursor: pointer;
	}

	.tree-item.selectable:hover {
		background: #e0f2fe;
	}

	.tree-item.level-0.selectable:hover {
		background: #e0f2fe;
	}

	.tree-item.level-1.selectable:hover {
		background: #e0f2fe;
	}

	.tree-item.selected {
		background: #bfdbfe !important;
	}

	.tree-item.selected .task-name {
		color: #1e40af;
		font-weight: 600;
	}

	.task-content-clickable {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 1;
		min-width: 0;
		height: 100%;
		cursor: pointer;
	}

	.tree-item-content {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		min-width: 0;
	}

	.tree-item-content i {
		font-size: 12px;
		color: #6b7280;
		flex-shrink: 0;
	}

	.task-name {
		flex: 1;
		font-size: 12px;
		color: #374151;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.effort-badge {
		display: inline-block;
		padding: 1px 4px;
		background: #e0e7ff;
		color: #4338ca;
		font-size: 9px;
		font-weight: 600;
		border-radius: 2px;
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>
