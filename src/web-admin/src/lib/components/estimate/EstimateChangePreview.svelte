<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let changes: any[] = [];
	export let currentPhases: any[] = [];

	const dispatch = createEventDispatcher();

	// 変更タイプに応じたアイコンとラベルを取得
	function getChangeInfo(type: string) {
		switch (type) {
			case 'create':
				return { icon: 'bi-plus-circle', label: 'フェーズ作成', color: '#10b981' };
			case 'update':
				return { icon: 'bi-pencil-square', label: 'フェーズ更新', color: '#3b82f6' };
			case 'delete':
				return { icon: 'bi-trash', label: 'フェーズ削除', color: '#ef4444' };
			case 'error':
				return { icon: 'bi-exclamation-triangle', label: 'エラー', color: '#f59e0b' };
			default:
				return { icon: 'bi-info-circle', label: '情報', color: '#6366f1' };
		}
	}

	function formatFieldValue(field: string, value: any): string {
		switch (field) {
			case 'useAi':
				return value ? 'はい' : 'いいえ';
			case 'aiEfficiencyRatio':
				return `${(value * 100).toFixed(0)}%`;
			case 'effort':
				return `${value}人日`;
			case 'durationDays':
				return `${value}日`;
			case 'teamSize':
				return `${value}人`;
			default:
				return String(value);
		}
	}

	function formatFieldName(field: string): string {
		const fieldNames: Record<string, string> = {
			effort: '工数',
			durationDays: '期間',
			teamSize: '人数',
			useAi: 'AI活用',
			aiEfficiencyRatio: 'AI効率化比率',
			description: '説明',
			phaseOrder: '順序'
		};
		return fieldNames[field] || field;
	}

	function handleApply() {
		dispatch('apply', { changes });
	}

	function handleCancel() {
		dispatch('cancel');
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
			以下の{changes.length}件の変更を適用します。確認してから「適用」ボタンをクリックしてください。
		</p>

		<div class="changes-list">
			{#each changes as change, i}
				{@const changeInfo = getChangeInfo(change.type)}
				<div class="change-item" style="border-left-color: {changeInfo.color}">
					<div class="change-header">
						<div class="change-icon" style="color: {changeInfo.color}">
							<i class={changeInfo.icon}></i>
						</div>
						<span class="change-label" style="color: {changeInfo.color}">
							{changeInfo.label}
						</span>
						<span class="target-name">
							{#if change.type === 'delete'}
								{change.phaseName} を削除
							{:else if change.type === 'error'}
								{change.message}
							{:else if change.type === 'info'}
								{change.message}
							{:else}
								{change.phaseName}
							{/if}
						</span>
					</div>

					{#if (change.type === 'create' || change.type === 'update') && change.changes}
						<div class="change-details">
							{#each Object.entries(change.changes) as [field, value]}
								<div class="change-field">
									{#if change.type === 'create'}
										<i class="bi bi-check"></i>
										<span class="field-name">{formatFieldName(field)}:</span>
										<span class="field-value">{formatFieldValue(field, value)}</span>
									{:else}
										<i class="bi bi-arrow-right"></i>
										<span class="field-name">{formatFieldName(field)}:</span>
										<span class="field-value">{formatFieldValue(field, value)}</span>
									{/if}
								</div>
							{/each}
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
		border-left-color: #6b7280; /* default fallback */
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

	.target-name {
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

	.field-name {
		color: #6b7280;
	}

	.field-value {
		color: #111827;
		font-weight: 500;
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
