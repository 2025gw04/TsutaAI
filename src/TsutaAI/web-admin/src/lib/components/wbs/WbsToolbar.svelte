<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import ContextMenu from '$lib/components/common/ContextMenu.svelte';

	/** 現在選択されているビュー */
	export let currentView: 'tree' | 'gantt' | 'board' | 'calendar' = 'tree';

	/** 健全性チェック実行中かどうかのフラグ */
	export let isCheckingSanity = false;

	/** WBS保存中かどうかのフラグ */
	export let isSaving = false;

	/** 検索キーワード */
	export let searchQuery = '';

	/** ソート条件 */
	export let sortBy: 'none' | 'endDate' | 'priority' | 'assignee' | 'progress' = 'none';

	/** ソート順 */
	export let sortOrder: 'asc' | 'desc' = 'asc';

	/** フィルタパネル表示フラグ */
	export let showFilters = false;

	/** アーカイブ表示フラグ */
	export let showArchived = false;

	/** リスケジュール通知数 */
	export let rescheduleNotificationCount = 0;

	/** アクティブなフィルタ数 */
	export let activeFilterCount = 0;

	/** Undo可能かどうか */
	export let canUndo = false;

	/** Redo可能かどうか */
	export let canRedo = false;

	const dispatch = createEventDispatcher();

	/** ルートタスク追加イベントを発火する */
	function handleAddRoot() {
		dispatch('addRoot');
	}

	/** AI生成モーダルを表示する */
	function handleGenerate() {
		dispatch('generate');
	}

	/** データ操作モーダルを表示する */
	function handleDataOperations() {
		dispatch('openDataOperations');
	}

	/** 健全性チェックを実行する */
	function handleSanityCheck() {
		dispatch('sanityCheck');
	}

	/** ビュー切替イベントを発火する */
	function setView(view: 'tree' | 'gantt' | 'board' | 'calendar') {
		dispatch('viewChange', view);
	}

	/** WBS確定イベントを発火する */
	function handleSave() {
		dispatch('save');
	}

	/** 検索クエリ変更 */
	function handleSearchChange(event: Event) {
		searchQuery = (event.target as HTMLInputElement).value;
		dispatch('searchChange', searchQuery);
	}

	/** ソート条件変更 */
	function handleSortChange(event: Event) {
		sortBy = (event.target as HTMLSelectElement).value as typeof sortBy;
		dispatch('sortChange', { sortBy, sortOrder });
	}

	/** ソート順切り替え */
	function toggleSortOrder() {
		sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		dispatch('sortChange', { sortBy, sortOrder });
	}

	/** フィルタパネル切り替え */
	function toggleFilters() {
		showFilters = !showFilters;
		dispatch('toggleFilters', showFilters);
	}

	/** アーカイブ表示切り替え */
	function toggleArchived() {
		showArchived = !showArchived;
		dispatch('toggleArchived', showArchived);
	}

	/** リスケジュール提案を表示 */
	function handleReschedule() {
		dispatch('reschedule');
	}

	/** AI自動割り当てを実行 */
	function handleAutoAssign() {
		dispatch('autoAssign');
	}

	/** AI自動期間設定を実行 */
	function handleAutoDuration() {
		dispatch('autoDuration');
	}

	/** 元に戻す */
	function handleUndo() {
		dispatch('undo');
	}

	/** やり直し */
	function handleRedo() {
		dispatch('redo');
	}

	/** 履歴パネルを表示 */
	function handleShowHistory() {
		dispatch('showHistory');
	}

	/** 「その他」メニュー表示フラグ */
	let showOtherMenu = false;
	let menuX = 0;
	let menuY = 0;

	function toggleOtherMenu(event: MouseEvent) {
		event.stopPropagation();
		const button = event.currentTarget as HTMLElement;
		const rect = button.getBoundingClientRect();

		// ボタンの左下を基準にする
		menuX = rect.left;
		menuY = rect.bottom + 4;

		showOtherMenu = !showOtherMenu;
	}

	function closeOtherMenu() {
		showOtherMenu = false;
	}

	function handleSaveTemplate() {
		dispatch('saveTemplate');
		closeOtherMenu();
	}

	function handleLoadTemplate() {
		dispatch('loadTemplate');
		closeOtherMenu();
	}

	function handleRules() {
		dispatch('openRules');
		closeOtherMenu();
	}

	function handleCustomFields() {
		dispatch('openCustomFields');
		closeOtherMenu();
	}

	function handleRecalculateEffort() {
		dispatch('recalculateEffort');
		closeOtherMenu();
	}
</script>

<div class="toolbar">
	<div class="primary-actions">
		<button
			type="button"
			class="action primary"
			on:click={handleGenerate}
			title="AIを使用してプロジェクトのWBSを自動生成します"
		>
			<i class="bi bi-robot"></i>
			AIでWBS生成
		</button>
		<button
			type="button"
			class="action"
			on:click={handleAddRoot}
			title="新しいルートタスクを追加します"
		>
			<i class="bi bi-plus-circle"></i>
			ルートタスク追加
		</button>
		<button
			type="button"
			class="action"
			on:click={handleDataOperations}
			title="AI編集・タスクデータのインポート・エクスポート"
		>
			<i class="bi bi-arrow-down-up"></i>
			データ操作
		</button>

		<!-- Undo/Redoボタングループ -->
		<!-- <div class="button-separator"></div>
		<div class="undo-redo-group">
			<button
				type="button"
				class="action undo-btn"
				on:click={handleUndo}
				disabled={!canUndo}
				title="元に戻す"
				aria-label="元に戻す"
				aria-disabled={!canUndo}
			>
				<i class="bi bi-arrow-counterclockwise"></i>
				<span class="button-text">元に戻す</span>
			</button>
			<button
				type="button"
				class="action redo-btn"
				on:click={handleRedo}
				disabled={!canRedo}
				title="やり直し"
				aria-label="やり直し"
				aria-disabled={!canRedo}
			>
				<i class="bi bi-arrow-clockwise"></i>
				<span class="button-text">やり直し</span>
			</button>
			<button
				type="button"
				class="action history-btn"
				on:click={handleShowHistory}
				title="変更履歴を表示"
				aria-label="変更履歴を表示"
			>
				<i class="bi bi-clock-history"></i>
				<span class="button-text">履歴</span>
			</button>
		</div> -->

		<!-- AI機能グループ -->
		<div class="button-separator"></div>
		<div class="ai-button-group">
			<button
				type="button"
				class="action ai-assistant primary"
				on:click={() => dispatch('openAiAssistant')}
				title="AIとチャットしながらタスクを管理できます"
			>
				<i class="bi bi-robot"></i>
				AIアシスタント
			</button>
			<button
				type="button"
				class="action reschedule"
				class:has-notification={rescheduleNotificationCount > 0}
				on:click={handleReschedule}
				title="タスクの遅延やブロックを検知し、最適なリスケジュールを提案します"
			>
				<i class="bi bi-calendar-event"></i>
				リスケジュール提案
				{#if rescheduleNotificationCount > 0}
					<span class="notification-badge">{rescheduleNotificationCount}</span>
				{/if}
			</button>
			<button
				type="button"
				class="action ai-assign"
				on:click={handleAutoAssign}
				title="メンバーのスキルと負荷を考慮してタスクを自動割り当てします"
			>
				<i class="bi bi-person-badge"></i>
				AI自動割り当て
			</button>
			<button
				type="button"
				class="action ai-duration"
				on:click={handleAutoDuration}
				title="タスクの複雑度と依存関係から最適な期間を自動設定します"
			>
				<i class="bi bi-clock-history"></i>
				AI期間設定
			</button>
		</div>
		<div class="button-separator"></div>

		<button
			type="button"
			class="action success"
			on:click={handleSave}
			disabled={isSaving}
			title="現在のWBSをデータベースに保存して確定します"
		>
			<i class="bi bi-check-circle"></i>
			{isSaving ? 'データベースに保存中…' : 'WBS保存'}
		</button>
	</div>

	<div class="secondary-controls">
		<div class="search-box">
			<i class="bi bi-search"></i>
			<input
				type="text"
				placeholder="タスクを検索..."
				value={searchQuery}
				on:input={handleSearchChange}
			/>
		</div>

		<div class="sort-controls">
			<select value={sortBy} on:change={handleSortChange}>
				<option value="none">並び替えなし</option>
				<option value="endDate">期限順</option>
				<option value="priority">優先度順</option>
				<option value="assignee">担当者順</option>
				<option value="progress">進捗率順</option>
			</select>
			{#if sortBy !== 'none'}
				<button
					type="button"
					class="sort-order-btn"
					on:click={toggleSortOrder}
					title={sortOrder === 'asc' ? '昇順' : '降順'}
				>
					<i class={`bi bi-sort-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>
				</button>
			{/if}
		</div>

		<button
			type="button"
			class="filter-btn"
			class:active={showFilters}
			class:has-filters={activeFilterCount > 0}
			on:click={toggleFilters}
			title={showFilters ? 'フィルタパネルを非表示' : 'フィルタパネルを表示'}
		>
			<i class="bi bi-funnel"></i>
			フィルタ
			{#if activeFilterCount > 0}
				<span class="filter-badge">{activeFilterCount}</span>
			{/if}
		</button>

		<button type="button" class="filter-btn" on:click={toggleOtherMenu}>
			<i class="bi bi-three-dots"></i>
			その他
		</button>

		<button
			type="button"
			class="action undo-btn"
			on:click={handleUndo}
			disabled={!canUndo}
			title="元に戻す"
			aria-label="元に戻す"
			aria-disabled={!canUndo}
		>
			<i class="bi bi-arrow-counterclockwise"></i>
		</button>
		<button
			type="button"
			class="action redo-btn"
			on:click={handleRedo}
			disabled={!canRedo}
			title="やり直し"
			aria-label="やり直し"
			aria-disabled={!canRedo}
		>
			<i class="bi bi-arrow-clockwise"></i>
		</button>
		<button
			type="button"
			class="action history-btn"
			on:click={handleShowHistory}
			title="変更履歴を表示"
			aria-label="変更履歴を表示"
		>
			<i class="bi bi-clock-history"></i>
		</button>
	</div>

	<div class="view-toggle">
		<span class="label">表示切替</span>
		<div class="toggle-group">
			<button
				type="button"
				class:selected={currentView === 'tree'}
				on:click={() => setView('tree')}
				title="ツリービュー - タスクを階層構造で表示します"
			>
				<i class="bi bi-list-nested"></i>
				ツリー
			</button>
			<button
				type="button"
				class:selected={currentView === 'board'}
				on:click={() => setView('board')}
				title="ボードビュー - カンバン形式でタスクを表示します"
			>
				<i class="bi bi-kanban"></i>
				ボード
			</button>
			<button
				type="button"
				class:selected={currentView === 'gantt'}
				on:click={() => setView('gantt')}
				title="ガントチャート - タスクの時系列を表示します"
			>
				<i class="bi bi-calendar4-week"></i>
				ガント
			</button>
			<button
				type="button"
				class:selected={currentView === 'calendar'}
				on:click={() => setView('calendar')}
				title="カレンダービュー - タスクをカレンダー形式で表示します"
			>
				<i class="bi bi-calendar3"></i>
				カレンダー
			</button>
		</div>
	</div>
</div>

{#if showOtherMenu}
	<ContextMenu x={menuX} y={menuY} on:close={closeOtherMenu}>
		<div class="context-menu-list">
			<button
				on:click={() => {
					toggleArchived();
					closeOtherMenu();
				}}
			>
				<i class="bi bi-archive"></i>
				{showArchived ? 'アーカイブを非表示' : 'アーカイブを表示'}
			</button>
			<button
				on:click={() => {
					handleSanityCheck();
					closeOtherMenu();
				}}
				disabled={isCheckingSanity}
			>
				<i class="bi bi-activity"></i>
				{isCheckingSanity ? '健全性診断中…' : 'AI健全性チェック'}
			</button>
			<button on:click={handleRecalculateEffort}>
				<i class="bi bi-calculator"></i>
				工数を再計算
			</button>
			<button on:click={handleSaveTemplate}>
				<i class="bi bi-save"></i>
				テンプレートとして保存
			</button>
			<button on:click={handleLoadTemplate}>
				<i class="bi bi-folder-open"></i>
				テンプレートから読み込み
			</button>
			<!-- 自動化ルールとカスタムフィールドは非表示
			<button on:click={handleRules}>
				<i class="bi bi-lightning"></i>
				自動化ルール
			</button>
			<button on:click={handleCustomFields}>
				<i class="bi bi-sliders"></i>
				カスタムフィールド
			</button>
			-->
		</div>
	</ContextMenu>
{/if}

<style>
	.toolbar {
		position: relative;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 16px;
		padding: 18px 24px;
		border-radius: 18px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	}

	.primary-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		max-width: 100%;
		box-sizing: border-box;
	}

	.primary-actions button {
		border: 1px solid #e5e7eb;
	}

	.button-separator {
		width: 1px;
		height: 32px;
		background: linear-gradient(to bottom, transparent, #d1d5db 20%, #d1d5db 80%, transparent);
		margin: 0 4px;
	}

	.ai-button-group {
		display: flex;
		flex-wrap: nowrap;
		gap: 12px;
		padding: 8px 16px;
		background: linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%);
		border-radius: 14px;
		border: 1px solid #c7d2fe;
		box-shadow: 0 1px 3px rgba(139, 92, 246, 0.1);
		max-width: 100%;
		box-sizing: border-box;
	}

	.action {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-radius: 12px;
		border: 1px solid transparent;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			background 0.2s ease,
			opacity 0.2s ease;
		color: #111827;
		background: #f9fafb;
	}

	.action.primary {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		color: #ffffff;
		border: none;
	}

	.action.outline {
		border-color: #e5e7eb;
		background: transparent;
	}

	.action.success {
		background: linear-gradient(135deg, #10b981, #14b8a6);
		color: #ffffff;
		border: none;
	}

	.action.reschedule {
		position: relative;
		border-color: #e5e7eb;
		background: #ffffff;
		color: #374151;
	}

	.action.reschedule.has-notification {
		border-color: #f59e0b;
		background: #fef3c7;
		color: #92400e;
	}

	.action.ai-assign {
		border-color: #8b5cf6;
		background: #f5f3ff;
		color: #6d28d9;
	}

	.action.ai-assign:hover {
		background: #ede9fe;
	}

	.action.ai-duration {
		border-color: #06b6d4;
		background: #ecfeff;
		color: #0e7490;
	}

	.action.ai-duration:hover {
		background: #cffafe;
	}

	.action.ai-assistant {
		border-color: #667eea;
		/* background: linear-gradient(135deg, #667eea, #764ba2); */
		color: #ffffff;
	}

	.action.ai-assistant:hover {
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.notification-badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ef4444;
		color: #ffffff;
		font-size: 11px;
		font-weight: 700;
		border-radius: 10px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		animation: pulse-badge 2s infinite;
	}

	@keyframes pulse-badge {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
	}

	.action:hover:not(:disabled) {
		transform: translateY(-1px);
	}

	.action:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.label {
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
	}

	.toggle-group {
		display: inline-flex;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		overflow: hidden;
	}

	.toggle-group button {
		background: transparent;
		border: none;
		padding: 8px 14px;
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.toggle-group button.selected {
		background: #dbeafe;
		color: #3b82f6;
	}

	.secondary-controls {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.search-box {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-box i {
		position: absolute;
		left: 12px;
		color: #9ca3af;
		font-size: 14px;
	}

	.search-box input {
		padding: 8px 12px 8px 36px;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		font-size: 13px;
		width: 240px;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.search-box input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.sort-controls {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.sort-controls select {
		padding: 8px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		background: #f9fafb;
		color: #374151;
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.sort-controls select:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.sort-order-btn {
		width: 36px;
		height: 36px;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		background: #f9fafb;
		color: #6b7280;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.sort-order-btn:hover {
		background: #dbeafe;
		color: #3b82f6;
	}

	.filter-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		background: #f9fafb;
		color: #374151;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease;
	}

	.filter-btn:hover {
		background: #e0e7ff;
		border-color: #c7d2fe;
	}

	.filter-btn.active {
		background: #dbeafe;
		border-color: #93c5fd;
		color: #1e40af;
	}

	.filter-btn.has-filters {
		border-color: #3b82f6;
		background: #eff6ff;
		color: #1e40af;
	}

	.filter-badge {
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #3b82f6;
		color: #ffffff;
		font-size: 11px;
		font-weight: 700;
		border-radius: 10px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	@media (max-width: 1024px) {
		.ai-button-group {
			flex-wrap: wrap;
		}

		.ai-button-group .action {
			flex: 1 1 calc(50% - 6px);
			min-width: 180px;
		}
	}

	@media (max-width: 768px) {
		.toolbar {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}

		.primary-actions {
			flex-wrap: wrap;
			gap: 8px;
		}

		.action {
			flex: 1 1 calc(50% - 4px);
			min-width: 140px;
			justify-content: center;
		}

		.ai-button-group {
			flex-direction: column;
			width: 100%;
			padding: 12px;
		}

		.ai-button-group .action {
			flex: 1 1 auto;
			width: 100%;
			min-width: unset;
		}

		.view-toggle {
			justify-content: space-between;
		}

		.secondary-controls {
			flex-direction: column;
			align-items: stretch;
			gap: 10px;
		}

		.search-box input {
			width: 100%;
		}

		.sort-controls {
			flex-direction: column;
			width: 100%;
		}

		.sort-controls select {
			width: 100%;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.toolbar {
			gap: 10px;
			padding: 12px;
		}

		.primary-actions {
			flex-direction: column;
			gap: 8px;
		}

		.action {
			width: 100%;
			flex: 1 1 auto;
			min-width: unset;
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
			justify-content: center;
		}

		.action i {
			font-size: 16px;
		}

		.button-separator {
			display: none;
		}

		.ai-button-group {
			flex-direction: column;
			gap: 8px;
			width: 100%;
			padding: 10px;
		}

		.ai-button-group .action {
			width: 100%;
			min-height: 48px;
			padding: 12px 16px;
			font-size: 14px;
		}

		.view-toggle {
			gap: 6px;
		}

		.view-btn {
			flex: 1;
			padding: 10px 8px;
			font-size: 12px;
			min-height: 44px;
		}

		.view-btn span {
			display: none;
		}

		.view-btn i {
			font-size: 18px;
			margin-right: 0;
		}

		.search-box {
			width: 100%;
		}

		.search-box input {
			width: 100%;
			padding: 12px 14px;
			font-size: 14px;
			min-height: 48px;
		}

		.filter-btn {
			width: 100%;
			justify-content: center;
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px;
		}

		.sort-controls {
			width: 100%;
		}

		.sort-controls select {
			width: 100%;
			padding: 12px 14px;
			font-size: 14px;
			min-height: 48px;
		}

		.sort-order-btn {
			width: 48px;
			height: 48px;
		}

		.notification-badge {
			font-size: 10px;
			min-width: 18px;
			height: 18px;
			padding: 0 5px;
		}
	}

	.context-menu-list {
		display: flex;
		flex-direction: column;
	}

	.context-menu-list button {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 16px;
		border: none;
		background: transparent;
		text-align: left;
		font-size: 13px;
		color: #374151;
		cursor: pointer;
		transition: background 0.2s;
		white-space: nowrap;
	}

	.context-menu-list button:hover {
		background: #f3f4f6;
	}

	.context-menu-list button i {
		font-size: 14px;
		color: #6b7280;
	}

	.dropdown-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 999;
		background: transparent;
	}

	/* Undo/Redoボタングループ */
	.undo-redo-group {
		display: flex;
		gap: 8px;
		padding: 4px 12px;
		background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
		border-radius: 14px;
		border: 1px solid #bae6fd;
		box-shadow: 0 1px 3px rgba(14, 165, 233, 0.1);
	}

	.action.undo-btn,
	.action.redo-btn,
	.action.history-btn {
		border-color: #0ea5e9;
		background: #ffffff;
		color: #0369a1;
		min-width: 0px;
		transition: all 0.2s ease;
	}

	.action.undo-btn:hover:not(:disabled),
	.action.redo-btn:hover:not(:disabled),
	.action.history-btn:hover:not(:disabled) {
		background: #e0f2fe;
		border-color: #0284c7;
		transform: translateY(-1px);
	}

	.action.undo-btn:active:not(:disabled),
	.action.redo-btn:active:not(:disabled),
	.action.history-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.action.undo-btn:disabled,
	.action.redo-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: #f1f5f9;
		color: #94a3b8;
		border-color: #cbd5e1;
	}

	/* レスポンシブ対応: 画面幅が狭い場合はテキストを非表示 */
	@media (max-width: 1200px) {
		.undo-redo-group .button-text {
			display: none;
		}

		.action.undo-btn,
		.action.redo-btn,
		.action.history-btn {
			min-width: 40px;
			padding: 8px 12px;
		}
	}

	/* さらに狭い場合はボタン自体を小さく */
	@media (max-width: 768px) {
		.undo-redo-group {
			gap: 4px;
			padding: 2px 8px;
		}
	}

	/* 超極小画面（390px以下）での完全な横スクロール防止 */
	@media (max-width: 390px) {
		.toolbar {
			padding: 10px 8px;
			gap: 8px;
			width: 100%;
			max-width: 100vw;
			box-sizing: border-box;
		}

		.primary-actions {
			width: 100%;
			max-width: 100%;
		}

		.action {
			padding: 10px 12px;
			font-size: 13px;
			min-height: 44px;
			width: 100%;
			box-sizing: border-box;
		}

		.ai-button-group {
			width: 100%;
			max-width: 100%;
			padding: 6px 10px;
		}

		.undo-redo-group {
			gap: 2px;
			padding: 2px 6px;
		}
	}
</style>
