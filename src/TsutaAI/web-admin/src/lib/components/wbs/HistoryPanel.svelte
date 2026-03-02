<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from './types';

	/** 履歴エントリーの型定義 */
	interface HistoryEntry {
		index: number;
		label: string;
		timestamp: Date;
		taskCount: number;
		isCurrent: boolean;
	}

	/** 過去の履歴配列 */
	export let past: WbsTask[][] = [];

	/** 現在の状態 */
	export let present: WbsTask[] = [];

	/** 未来の履歴配列 */
	export let future: WbsTask[][] = [];

	/** パネルの表示状態 */
	export let isOpen = false;

	const dispatch = createEventDispatcher();

	/**
	 * タスク数を再帰的に数える
	 */
	function countTasks(tasks: WbsTask[]): number {
		let count = 0;
		for (const task of tasks) {
			count++;
			if (task.children && task.children.length > 0) {
				count += countTasks(task.children);
			}
		}
		return count;
	}

	/**
	 * 履歴の変更内容を推測
	 */
	function detectChangeType(prevTasks: WbsTask[], nextTasks: WbsTask[]): string {
		const prevCount = countTasks(prevTasks);
		const nextCount = countTasks(nextTasks);

		if (nextCount > prevCount) {
			return `タスクを追加 (+${nextCount - prevCount})`;
		} else if (nextCount < prevCount) {
			return `タスクを削除 (-${prevCount - nextCount})`;
		} else {
			return 'タスクを編集';
		}
	}

	/**
	 * 履歴エントリーのリストを生成
	 */
	$: historyEntries = (() => {
		const entries: HistoryEntry[] = [];
		const now = new Date();

		// 過去の履歴（古い順）
		past.forEach((state, index) => {
			const nextState = index < past.length - 1 ? past[index + 1] : present;
			const label = detectChangeType(state, nextState);
			const timestamp = new Date(now.getTime() - (past.length - index) * 1000); // 仮のタイムスタンプ

			entries.push({
				index: -(past.length - index),
				label,
				timestamp,
				taskCount: countTasks(state),
				isCurrent: false
			});
		});

		// 現在の状態
		entries.push({
			index: 0,
			label: '現在の状態',
			timestamp: now,
			taskCount: countTasks(present),
			isCurrent: true
		});

		// 未来の履歴
		future.forEach((state, index) => {
			const prevState = index === 0 ? present : future[index - 1];
			const label = detectChangeType(prevState, state);
			const timestamp = new Date(now.getTime() + (index + 1) * 1000); // 仮のタイムスタンプ

			entries.push({
				index: index + 1,
				label,
				timestamp,
				taskCount: countTasks(state),
				isCurrent: false
			});
		});

		return entries.reverse(); // 最新が上に来るように反転
	})();

	/**
	 * 履歴ポイントへジャンプ
	 */
	function jumpToHistory(index: number) {
		if (index === 0) {
			return; // 現在の状態なので何もしない
		}

		dispatch('jump', { index });
	}

	/**
	 * パネルを閉じる
	 */
	function handleClose() {
		dispatch('close');
	}

	/**
	 * 相対時間の表示
	 */
	function formatRelativeTime(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffSec = Math.floor(Math.abs(diffMs) / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHour = Math.floor(diffMin / 60);

		if (diffMs === 0) {
			return '今';
		} else if (diffMs > 0) {
			if (diffSec < 60) {
				return `${diffSec}秒前`;
			} else if (diffMin < 60) {
				return `${diffMin}分前`;
			} else if (diffHour < 24) {
				return `${diffHour}時間前`;
			} else {
				return `${Math.floor(diffHour / 24)}日前`;
			}
		} else {
			if (diffSec < 60) {
				return `${diffSec}秒後`;
			} else if (diffMin < 60) {
				return `${diffMin}分後`;
			} else if (diffHour < 24) {
				return `${diffHour}時間後`;
			} else {
				return `${Math.floor(diffHour / 24)}日後`;
			}
		}
	}
</script>

{#if isOpen}
	<!-- 背景オーバーレイ -->
	<div class="overlay" on:click={handleClose} role="presentation"></div>

	<!-- 履歴パネル -->
	<div class="history-panel" role="dialog" aria-labelledby="history-panel-title">
		<!-- ヘッダー -->
		<div class="panel-header">
			<h3 id="history-panel-title">
				<i class="bi bi-clock-history"></i>
				変更履歴
			</h3>
			<button
				type="button"
				class="close-btn"
				on:click={handleClose}
				aria-label="履歴パネルを閉じる"
			>
				<i class="bi bi-x-lg"></i>
			</button>
		</div>

		<!-- 履歴リスト -->
		<div class="history-list">
			{#if historyEntries.length === 0}
				<div class="empty-state">
					<i class="bi bi-inbox"></i>
					<p>履歴がありません</p>
				</div>
			{:else}
				{#each historyEntries as entry (entry.index)}
					<button
						type="button"
						class="history-item"
						class:current={entry.isCurrent}
						class:past={entry.index < 0}
						class:future={entry.index > 0}
						on:click={() => jumpToHistory(entry.index)}
						disabled={entry.isCurrent}
						title={entry.isCurrent
							? '現在の状態です'
							: `この履歴にジャンプ (${entry.index > 0 ? 'Redo' : 'Undo'})`}
					>
						<!-- アイコン -->
						<div class="item-icon">
							{#if entry.isCurrent}
								<i class="bi bi-dot"></i>
							{:else if entry.index < 0}
								<i class="bi bi-arrow-counterclockwise"></i>
							{:else}
								<i class="bi bi-arrow-clockwise"></i>
							{/if}
						</div>

						<!-- コンテンツ -->
						<div class="item-content">
							<div class="item-label">{entry.label}</div>
							<div class="item-meta">
								<span class="task-count">
									<i class="bi bi-list-task"></i>
									{entry.taskCount}タスク
								</span>
								<span class="timestamp">{formatRelativeTime(entry.timestamp)}</span>
							</div>
						</div>

						<!-- インデックス表示 -->
						{#if !entry.isCurrent}
							<div class="item-index">
								{entry.index > 0 ? `+${entry.index}` : entry.index}
							</div>
						{/if}
					</button>
				{/each}
			{/if}
		</div>

		<!-- フッター -->
		<div class="panel-footer">
			<div class="footer-info">
				<i class="bi bi-info-circle"></i>
				最大50件の履歴を保持
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.4);
		z-index: 999;
		backdrop-filter: blur(2px);
	}

	.history-panel {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 90%;
		max-width: 600px;
		max-height: 80vh;
		background: white;
		border-radius: 16px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px 24px;
		border-bottom: 1px solid #e2e8f0;
		background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
	}

	.panel-header h3 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #1e293b;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.panel-header h3 i {
		color: #0ea5e9;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.25rem;
		color: #64748b;
		cursor: pointer;
		padding: 8px;
		border-radius: 8px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		background: #e2e8f0;
		color: #334155;
	}

	.history-list {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		color: #94a3b8;
	}

	.empty-state i {
		font-size: 3rem;
		margin-bottom: 16px;
	}

	.empty-state p {
		margin: 0;
		font-size: 1rem;
	}

	.history-item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 16px;
		margin-bottom: 8px;
		background: white;
		border: 2px solid #e2e8f0;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}

	.history-item:hover:not(:disabled) {
		background: #f8fafc;
		border-color: #0ea5e9;
		transform: translateX(4px);
	}

	.history-item:disabled {
		cursor: default;
		background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
		border-color: #0ea5e9;
		border-width: 2px;
	}

	.history-item.past {
		border-left-width: 4px;
		border-left-color: #f59e0b;
	}

	.history-item.future {
		border-left-width: 4px;
		border-left-color: #8b5cf6;
	}

	.history-item.current {
		border-left-width: 4px;
		border-left-color: #0ea5e9;
	}

	.item-icon {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: #f1f5f9;
		color: #64748b;
		font-size: 1.125rem;
	}

	.history-item.current .item-icon {
		background: #e0f2fe;
		color: #0369a1;
		font-size: 2rem;
	}

	.history-item.past .item-icon {
		background: #fef3c7;
		color: #d97706;
	}

	.history-item.future .item-icon {
		background: #ede9fe;
		color: #7c3aed;
	}

	.item-content {
		flex: 1;
		min-width: 0;
	}

	.item-label {
		font-size: 0.9375rem;
		font-weight: 500;
		color: #1e293b;
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.history-item.current .item-label {
		font-weight: 600;
		color: #0369a1;
	}

	.item-meta {
		display: flex;
		gap: 12px;
		font-size: 0.8125rem;
		color: #64748b;
	}

	.task-count {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.timestamp {
		font-style: italic;
	}

	.item-index {
		flex-shrink: 0;
		padding: 4px 10px;
		background: #f1f5f9;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		color: #64748b;
		font-family: 'Courier New', monospace;
	}

	.history-item.past .item-index {
		background: #fef3c7;
		color: #d97706;
	}

	.history-item.future .item-index {
		background: #ede9fe;
		color: #7c3aed;
	}

	.panel-footer {
		padding: 16px 24px;
		border-top: 1px solid #e2e8f0;
		background: #f8fafc;
	}

	.footer-info {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.8125rem;
		color: #64748b;
	}

	.footer-info i {
		color: #0ea5e9;
	}

	/* スクロールバーのスタイル */
	.history-list::-webkit-scrollbar {
		width: 8px;
	}

	.history-list::-webkit-scrollbar-track {
		background: #f1f5f9;
		border-radius: 4px;
	}

	.history-list::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 4px;
	}

	.history-list::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
	}

	/* レスポンシブ対応 */
	@media (max-width: 768px) {
		.history-panel {
			width: 95%;
			max-height: 85vh;
		}

		.panel-header {
			padding: 16px 20px;
		}

		.panel-header h3 {
			font-size: 1.125rem;
		}

		.history-item {
			padding: 10px 12px;
		}

		.item-label {
			font-size: 0.875rem;
		}

		.item-meta {
			font-size: 0.75rem;
		}
	}
</style>
