<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import TaskNode from '$lib/components/wbs/TaskNode.svelte';
	import type { WbsTask } from '$lib/components/wbs/types';
	import { moveTask } from '$lib/stores/undoableWbsStore';

	/** 表示するタスク配列 */
	export let tasks: WbsTask[] = [];

	/** 現在選択中のタスクID */
	export let selectedTaskId: string | null = null;

	const dispatch = createEventDispatcher();

	// ルートレベルのドロップゾーン状態
	let dropZoneTop = false;
	let dropZoneBottom = false;

	/** リスト最上部へのドラッグオーバー */
	function handleTopDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (!event.dataTransfer) return;
		event.dataTransfer.dropEffect = 'move';
		dropZoneTop = true;
	}

	/** リスト最上部へのドロップ */
	function handleTopDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		dropZoneTop = false;

		if (!event.dataTransfer) return;

		try {
			const data = JSON.parse(event.dataTransfer.getData('application/json'));
			if (data.taskId) {
				// ルートレベルの最初に移動
				moveTask(data.taskId, null, 0);
			}
		} catch (error) {
			console.error('リスト最上部へのドロップに失敗しました:', error);
		}
	}

	/** リスト最下部へのドラッグオーバー */
	function handleBottomDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (!event.dataTransfer) return;
		event.dataTransfer.dropEffect = 'move';
		dropZoneBottom = true;
	}

	/** リスト最下部へのドロップ */
	function handleBottomDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		dropZoneBottom = false;

		if (!event.dataTransfer) return;

		try {
			const data = JSON.parse(event.dataTransfer.getData('application/json'));
			if (data.taskId) {
				// ルートレベルの最後に移動
				moveTask(data.taskId, null, tasks.length);
			}
		} catch (error) {
			console.error('リスト最下部へのドロップに失敗しました:', error);
		}
	}

	/** ドラッグ離脱 */
	function handleDragLeave() {
		dropZoneTop = false;
		dropZoneBottom = false;
	}
</script>

<div class="wbs-tree">
	<div class="header">
		<div class="title">
			<span>タスク</span>
		</div>
		<div>担当</div>
		<div>期間</div>
		<div>工数</div>
		<div>進捗</div>
		<div>操作</div>
	</div>

	{#if tasks.length === 0}
		<div class="empty">
			<i class="bi bi-info-circle"></i>
			<p>タスクがまだありません。AI生成または手動追加でWBSを構築しましょう。</p>
		</div>
	{:else}
		<!-- リスト最上部のドロップゾーン -->
		<div
			class="root-drop-zone top"
			class:active={dropZoneTop}
			on:dragover={handleTopDragOver}
			on:dragleave={handleDragLeave}
			on:drop={handleTopDrop}
		>
			{#if dropZoneTop}
				<div class="drop-indicator-root">
					<i class="bi bi-arrow-down"></i>
					<span>リストの最上部に移動</span>
				</div>
			{/if}
		</div>

		<div class="body">
			{#each tasks as task (task.id)}
				<TaskNode
					{task}
					level={0}
					{selectedTaskId}
					on:select={(event) => dispatch('select', event.detail)}
					on:decompose={(event) => dispatch('decompose', event.detail)}
					on:refine={(event) => dispatch('refine', event.detail)}
					on:createChild={(event) => dispatch('createChild', event.detail)}
					on:delete={(event) => dispatch('delete', event.detail)}
					on:duplicate={(event) => dispatch('duplicate', event.detail)}
					on:archive={(event) => dispatch('archive', event.detail)}
				/>
			{/each}
		</div>

		<!-- リスト最下部のドロップゾーン -->
		<div
			class="root-drop-zone bottom"
			class:active={dropZoneBottom}
			on:dragover={handleBottomDragOver}
			on:dragleave={handleDragLeave}
			on:drop={handleBottomDrop}
		>
			{#if dropZoneBottom}
				<div class="drop-indicator-root">
					<i class="bi bi-arrow-up"></i>
					<span>リストの最下部に移動</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.wbs-tree {
		border-radius: 18px;
		overflow-y: auto; /* 垂直スクロールを有効にする */
		overflow-x: hidden; /* 横スクロールを無効化 */
		border: 1px solid #e5e7eb;
		background: #ffffff;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
		max-width: 100%;
		box-sizing: border-box;
	}

	.header {
		display: grid;
		grid-template-columns: minmax(260px, 3fr) minmax(150px, 1.5fr) minmax(
				200px,
				2fr
			) 100px 180px 160px;
		gap: 12px;
		padding: 14px 16px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
		position: sticky; /* ヘッダーを固定 */
		top: 0; /* 上部に固定 */
		z-index: 5; /* コンテンツの上に表示 */
	}

	.title {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.body {
		display: flex;
		flex-direction: column;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.empty {
		padding: 32px 24px;
		text-align: center;
		color: #6b7280;
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
	}

	.empty i {
		font-size: 24px;
		color: #9ca3af;
	}

	@media (max-width: 1024px) {
		.header {
			grid-template-columns: minmax(240px, 1fr) 1fr 1fr 80px 160px 120px;
			font-size: 11px;
		}
	}

	@media (max-width: 768px) {
		.header {
			grid-template-columns: minmax(200px, 1fr) 100px 140px 120px;
			padding: 12px 14px;
			font-size: 10px;
		}

		.header > div:nth-child(4),
		.header > div:nth-child(5) {
			display: none;
		}

		.wbs-tree {
			border-radius: 12px;
		}
	}

	@media (max-width: 900px) {
		.header {
			display: none;
		}
	}

	/* タブレット～モバイルでの横スクロール完全防止 */
	@media (max-width: 900px) {
		.wbs-tree {
			width: 100%;
			max-width: 100%;
			overflow-x: hidden;
			box-sizing: border-box;
		}

		.body {
			width: 100%;
			max-width: 100%;
			overflow-x: hidden;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.wbs-tree {
			border-radius: 10px;
			overflow-x: hidden;
			padding: 0;
			width: 100%;
			max-width: 100%;
		}

		.body {
			padding: 0;
			width: 100%;
			max-width: 100%;
		}

		.empty {
			padding: 24px 16px;
			font-size: 13px;
		}

		.empty i {
			font-size: 20px;
		}

		.root-drop-zone {
			min-height: 32px;
		}

		.root-drop-zone.active {
			min-height: 48px;
		}

		.drop-indicator-root {
			font-size: 12px;
		}

		.drop-indicator-root i {
			font-size: 14px;
		}
	}

	/* 超極小画面（390px以下）での完全な横スクロール防止 */
	@media (max-width: 390px) {
		.wbs-tree {
			width: 100vw;
			max-width: 100vw;
			margin: 0;
			padding: 0;
			border-radius: 8px;
		}

		.body {
			width: 100%;
			max-width: 100%;
			padding: 0;
		}

		.empty {
			padding: 20px 12px;
		}
	}

	/* ルートレベルのドロップゾーン */
	.root-drop-zone {
		min-height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		transition: all 0.2s ease;
		position: relative;
	}

	.root-drop-zone.active {
		min-height: 60px;
		background: #e0f2fe;
		border: 2px dashed #3b82f6;
	}

	.root-drop-zone.top.active {
		border-bottom: 3px solid #3b82f6;
		border-radius: 8px 8px 0 0;
	}

	.root-drop-zone.bottom.active {
		border-top: 3px solid #3b82f6;
		border-radius: 0 0 8px 8px;
	}

	.drop-indicator-root {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #3b82f6;
		font-size: 13px;
		font-weight: 600;
		animation: pulse 1s ease-in-out infinite;
	}

	.drop-indicator-root i {
		font-size: 16px;
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
</style>
