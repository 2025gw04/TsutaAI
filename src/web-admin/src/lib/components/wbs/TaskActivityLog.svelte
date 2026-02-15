<script lang="ts">
	import type { WbsTask } from '$lib/components/wbs/types';

	export let task: WbsTask;
	export let activities: Array<{
		id: number;
		action_type: string;
		field_name?: string;
		old_value?: string;
		new_value?: string;
		user_id: number;
		created_at: string;
		userName?: string;
	}> = [];

	/** アクティビティタイプのアイコンを取得 */
	function getActivityIcon(actionType: string): string {
		switch (actionType) {
			case 'created':
				return 'bi-plus-circle';
			case 'updated':
				return 'bi-pencil-square';
			case 'status_changed':
				return 'bi-arrow-left-right';
			case 'assigned':
				return 'bi-person-check';
			case 'commented':
				return 'bi-chat-left-text';
			case 'attachment_added':
				return 'bi-paperclip';
			case 'completed':
				return 'bi-check-circle';
			default:
				return 'bi-clock-history';
		}
	}

	/** アクティビティタイプの色を取得 */
	function getActivityColor(actionType: string): string {
		switch (actionType) {
			case 'created':
				return '#10b981';
			case 'updated':
				return '#3b82f6';
			case 'status_changed':
				return '#8b5cf6';
			case 'assigned':
				return '#f59e0b';
			case 'commented':
				return '#06b6d4';
			case 'attachment_added':
				return '#ec4899';
			case 'completed':
				return '#22c55e';
			default:
				return '#6b7280';
		}
	}

	/** アクティビティメッセージを生成 */
	function getActivityMessage(activity: any): string {
		const userName = activity.userName || 'ユーザー';

		switch (activity.action_type) {
			case 'created':
				return `${userName}がタスクを作成しました`;
			case 'updated':
				if (activity.field_name) {
					return `${userName}が${getFieldLabel(activity.field_name)}を更新しました`;
				}
				return `${userName}がタスクを更新しました`;
			case 'status_changed':
				return `${userName}がステータスを「${activity.old_value || '不明'}」から「${activity.new_value || '不明'}」に変更しました`;
			case 'assigned':
				return `${userName}が${activity.new_value}に割り当てました`;
			case 'commented':
				return `${userName}がコメントしました`;
			case 'attachment_added':
				return `${userName}がファイルを添付しました: ${activity.new_value}`;
			case 'completed':
				return `${userName}がタスクを完了しました`;
			default:
				return `${userName}がタスクを変更しました`;
		}
	}

	/** フィールド名の日本語ラベルを取得 */
	function getFieldLabel(fieldName: string): string {
		const labels: Record<string, string> = {
			name: 'タスク名',
			description: '説明',
			assignee: '担当者',
			startDate: '開始日',
			endDate: '終了日',
			effortDays: '工数',
			progress: '進捗率',
			status: 'ステータス',
			deliverable: '成果物',
			notes: '備考'
		};
		return labels[fieldName] || fieldName;
	}

	/** 日時をフォーマット */
	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'たった今';
		if (diffMins < 60) return `${diffMins}分前`;
		if (diffHours < 24) return `${diffHours}時間前`;
		if (diffDays < 7) return `${diffDays}日前`;

		return date.toLocaleDateString('ja-JP', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="activity-log">
	<div class="section-header">
		<h4><i class="bi bi-clock-history"></i> アクティビティ ({activities.length})</h4>
	</div>

	<div class="activity-list">
		{#if activities.length === 0}
			<div class="empty-state">
				<i class="bi bi-clock"></i>
				<p>アクティビティ履歴がありません</p>
				<p class="hint">タスクの変更履歴がここに表示されます</p>
			</div>
		{:else}
			{#each activities as activity (activity.id)}
				<div class="activity-item">
					<div
						class="activity-icon"
						style="background: {getActivityColor(activity.action_type)}20; color: {getActivityColor(
							activity.action_type
						)}"
					>
						<i class="bi {getActivityIcon(activity.action_type)}"></i>
					</div>
					<div class="activity-content">
						<div class="activity-message">{getActivityMessage(activity)}</div>
						<div class="activity-time">{formatDate(activity.created_at)}</div>
						{#if activity.field_name && activity.old_value && activity.new_value}
							<div class="activity-detail">
								<span class="old-value">{activity.old_value}</span>
								<i class="bi bi-arrow-right"></i>
								<span class="new-value">{activity.new_value}</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.activity-log {
		display: flex;
		flex-direction: column;
		gap: 16px;
		height: 100%;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.section-header h4 {
		margin: 0;
		font-size: 14px;
		color: #374151;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.section-header h4 i {
		color: #3b82f6;
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-height: 500px;
		overflow-y: auto;
	}

	.empty-state {
		text-align: center;
		padding: 40px 20px;
		color: #9ca3af;
	}

	.empty-state i {
		font-size: 48px;
		color: #d1d5db;
		margin-bottom: 12px;
	}

	.empty-state p {
		margin: 4px 0;
		font-size: 13px;
	}

	.empty-state .hint {
		font-size: 12px;
		color: #9ca3af;
	}

	.activity-item {
		display: flex;
		gap: 12px;
		padding: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
	}

	.activity-icon {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 16px;
	}

	.activity-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.activity-message {
		font-size: 13px;
		color: #374151;
		line-height: 1.5;
	}

	.activity-time {
		font-size: 11px;
		color: #9ca3af;
	}

	.activity-detail {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
		padding: 6px 10px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 12px;
	}

	.activity-detail i {
		color: #9ca3af;
		font-size: 10px;
	}

	.old-value {
		color: #ef4444;
		text-decoration: line-through;
	}

	.new-value {
		color: #10b981;
		font-weight: 600;
	}
</style>
