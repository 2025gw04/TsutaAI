<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from './types';

	type WbsUiChange =
		| {
				type: 'create' | 'update' | 'delete' | 'move';
				taskId?: string;
				taskName?: string;
				parentId?: string | null;
				changes?: Partial<WbsTask>;
				newPosition?: number;
		  }
		| {
				type: 'external_action';
				taskId?: string;
				taskName?: string;
				action?: 'reschedule' | 'auto_assign' | 'decompose';
				message?: string;
		  };

	export let changes: WbsUiChange[] = [];
	export let tasks: WbsTask[] = [];

	const dispatch = createEventDispatcher();

	// タスクIDから現在のタスクを検索
	function findTaskById(taskId: string): WbsTask | null {
		function search(taskList: WbsTask[]): WbsTask | null {
			for (const task of taskList) {
				if (task.id === taskId) return task;
				const found = search(task.children || []);
				if (found) return found;
			}
			return null;
		}
		return search(tasks);
	}

	// 変更タイプに応じたアイコンとラベルを取得
	function getChangeInfo(type: string) {
		switch (type) {
			case 'create':
				return { icon: 'bi-plus-circle', label: '作成', color: '#10b981' };
			case 'update':
				return { icon: 'bi-pencil-square', label: '更新', color: '#3b82f6' };
			case 'delete':
				return { icon: 'bi-trash', label: '削除', color: '#ef4444' };
			case 'move':
				return { icon: 'bi-arrows-move', label: '移動', color: '#f59e0b' };
			case 'external_action':
				return { icon: 'bi-lightning-charge', label: 'AI機能', color: '#8b5cf6' };
			default:
				return { icon: 'bi-question-circle', label: '不明', color: '#6b7280' };
		}
	}

	// 変更内容を人間が読める形式に変換
	function formatChange(key: string, oldValue: any, newValue: any): string {
		const labels: Record<string, string> = {
			name: 'タスク名',
			description: '説明',
			assignee: '担当者',
			startDate: '開始日',
			endDate: '終了日',
			effortDays: '工数',
			priority: '優先度',
			status: 'ステータス',
			progress: '進捗率',
			deliverable: '成果物'
		};

		const label = labels[key] || key;

		if (oldValue === undefined || oldValue === null) {
			return `${label}: ${newValue}`;
		}

		return `${label}: ${oldValue} → ${newValue}`;
	}

	function handleApply() {
		dispatch('apply', { changes });
	}

	function handleCancel() {
		dispatch('cancel');
	}

	function getTaskFieldValue(task: WbsTask, key: string): unknown {
		return (task as unknown as Record<string, unknown>)[key];
	}
</script>

<div class="preview-container">
	<div class="preview-header">
		<div class="header-icon">
			<i class="bi bi-eye"></i>
		</div>
		<h4>変更プレビュー</h4>
	</div>

	<div class="preview-content">
		<p class="preview-description">
			以下の変更を適用します。確認してから「適用」ボタンをクリックしてください。
		</p>

		<div class="changes-list">
			{#each changes as change, index}
				{@const changeInfo = getChangeInfo(change.type)}
				<div class="change-item" style="border-left-color: {changeInfo.color}">
					<div class="change-header">
						<div class="change-icon" style="color: {changeInfo.color}">
							<i class={changeInfo.icon}></i>
						</div>
						<span class="change-label" style="color: {changeInfo.color}">
							{changeInfo.label}
						</span>
						<span class="task-name">{change.taskName || change.taskId || '不明'}</span>
					</div>

					{#if change.type === 'update' && change.changes}
						{@const currentTask = change.taskId ? findTaskById(change.taskId) : null}
						<div class="change-details">
								{#each Object.entries(change.changes) as [key, newValue]}
									{#if currentTask}
										<div class="change-field">
											<i class="bi bi-arrow-right"></i>
											{formatChange(key, getTaskFieldValue(currentTask, key), newValue)}
										</div>
									{/if}
								{/each}
						</div>
					{:else if change.type === 'create' && change.changes}
						<div class="change-details">
							{#each Object.entries(change.changes) as [key, value]}
								{#if value !== undefined && value !== null}
									<div class="change-field">
										<i class="bi bi-check"></i>
										{formatChange(key, undefined, value)}
									</div>
								{/if}
							{/each}
						</div>
					{:else if change.type === 'delete'}
						<div class="change-details">
							<div class="change-field warning">
								<i class="bi bi-exclamation-triangle"></i>
								このタスクとすべての子タスクが削除されます
							</div>
						</div>
					{:else if change.type === 'move'}
						<div class="change-details">
							<div class="change-field">
								<i class="bi bi-arrow-right"></i>
								新しい位置: {change.newPosition ?? '最後'}
							</div>
						</div>
					{:else if change.type === 'external_action'}
						<div class="change-details">
							<div class="change-field external-action">
								<i class="bi bi-info-circle"></i>
								{change.message || '外部AI機能を実行します'}
							</div>
							{#if change.action === 'reschedule'}
								<div class="change-field">
									<i class="bi bi-calendar-event"></i>
									リスケジュール提案を生成します
								</div>
							{:else if change.action === 'auto_assign'}
								<div class="change-field">
									<i class="bi bi-person-plus"></i>
									タスクを自動割り当てします
								</div>
							{:else if change.action === 'decompose'}
								<div class="change-field">
									<i class="bi bi-diagram-3"></i>
									タスクを分解してサブタスクを生成します
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<div class="preview-actions">
		<button type="button" class="btn-cancel" on:click={handleCancel}>
			<i class="bi bi-x-circle"></i>
			キャンセル
		</button>
		<button type="button" class="btn-apply" on:click={handleApply}>
			<i class="bi bi-check-circle"></i>
			適用する ({changes.length}件)
		</button>
	</div>
</div>

<style>
	.preview-container {
		background: #eff6ff;
		border: 2px solid #3b82f6;
		border-radius: 12px;
		padding: 16px;
		margin: 16px 0;
		animation: slideIn 0.3s ease;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
	}

	.header-icon {
		font-size: 20px;
		color: #3b82f6;
	}

	.preview-header h4 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: #1e40af;
	}

	.preview-content {
		margin-bottom: 16px;
	}

	.preview-description {
		margin: 0 0 12px 0;
		font-size: 13px;
		color: #1e40af;
		line-height: 1.5;
	}

	.changes-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.change-item {
		background: #ffffff;
		border-radius: 8px;
		padding: 12px;
		border-left: 4px solid;
	}

	.change-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.change-icon {
		font-size: 16px;
	}

	.change-label {
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.task-name {
		font-size: 14px;
		font-weight: 600;
		color: #111827;
		flex: 1;
	}

	.change-details {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-left: 24px;
	}

	.change-field {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: #374151;
		line-height: 1.5;
	}

	.change-field i {
		font-size: 12px;
		color: #9ca3af;
	}

	.change-field.warning {
		color: #dc2626;
		font-weight: 600;
	}

	.change-field.warning i {
		color: #dc2626;
	}

	.change-field.external-action {
		color: #8b5cf6;
		font-weight: 600;
		background: rgba(139, 92, 246, 0.1);
		padding: 8px 12px;
		border-radius: 6px;
		margin-bottom: 6px;
	}

	.change-field.external-action i {
		color: #8b5cf6;
	}

	.preview-actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}

	.preview-actions button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border: none;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-cancel {
		background: #f3f4f6;
		color: #374151;
	}

	.btn-cancel:hover {
		background: #e5e7eb;
		transform: translateY(-1px);
	}

	.btn-apply {
		background: #10b981;
		color: #ffffff;
	}

	.btn-apply:hover {
		background: #059669;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
	}
</style>
