<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from './types';

	const dispatch = createEventDispatcher();

	/** 自動化ルール */
	interface AutomationRule {
		id: string;
		name: string;
		enabled: boolean;
		trigger: {
			type:
				| 'status_changed'
				| 'priority_changed'
				| 'assignee_changed'
				| 'due_date_approaching'
				| 'progress_updated';
			conditions: Record<string, any>;
		};
		action: {
			type:
				| 'set_status'
				| 'set_priority'
				| 'assign_to'
				| 'add_tag'
				| 'send_notification'
				| 'create_subtask';
			params: Record<string, any>;
		};
		createdAt: string;
	}

	let rules: AutomationRule[] = [];
	let showCreateDialog = false;
	let showRulesDialog = false;

	/** 新規ルール */
	let newRule = {
		name: '',
		enabled: true,
		trigger: {
			type: 'status_changed' as AutomationRule['trigger']['type'],
			conditions: {} as Record<string, any>
		},
		action: {
			type: 'set_status' as AutomationRule['action']['type'],
			params: {} as Record<string, any>
		}
	};

	/** トリガータイプのオプション */
	const triggerTypes = [
		{ value: 'status_changed', label: 'ステータスが変更されたとき' },
		{ value: 'priority_changed', label: '優先度が変更されたとき' },
		{ value: 'assignee_changed', label: '担当者が変更されたとき' },
		{ value: 'due_date_approaching', label: '期限が近づいたとき' },
		{ value: 'progress_updated', label: '進捗が更新されたとき' }
	];

	/** アクションタイプのオプション */
	const actionTypes = [
		{ value: 'set_status', label: 'ステータスを変更' },
		{ value: 'set_priority', label: '優先度を変更' },
		{ value: 'assign_to', label: '担当者を割り当て' },
		{ value: 'add_tag', label: 'タグを追加' },
		{ value: 'send_notification', label: '通知を送信' },
		{ value: 'create_subtask', label: 'サブタスクを作成' }
	];

	/** ルール一覧を読み込み */
	function loadRules() {
		const stored = localStorage.getItem('wbs_automation_rules');
		if (stored) {
			try {
				rules = JSON.parse(stored);
			} catch (error) {
				console.error('ルールの読み込みに失敗しました:', error);
				rules = [];
			}
		}
	}

	/** ルールを保存 */
	function saveRules() {
		localStorage.setItem('wbs_automation_rules', JSON.stringify(rules));
	}

	/** 新規ルールを作成 */
	function createRule() {
		if (!newRule.name?.trim()) {
			alert('ルール名を入力してください');
			return;
		}

		const rule: AutomationRule = {
			id: `rule-${Date.now()}`,
			name: newRule.name,
			enabled: newRule.enabled ?? true,
			trigger: {
				type: newRule.trigger?.type || 'status_changed',
				conditions: newRule.trigger?.conditions || {}
			},
			action: {
				type: newRule.action?.type || 'set_status',
				params: newRule.action?.params || {}
			},
			createdAt: new Date().toISOString()
		};

		rules = [...rules, rule];
		saveRules();

		// リセット
		newRule = {
			name: '',
			enabled: true,
			trigger: {
				type: 'status_changed',
				conditions: {}
			},
			action: {
				type: 'set_status',
				params: {}
			}
		};
		showCreateDialog = false;

		alert('ルールを作成しました');
	}

	/** ルールを削除 */
	function deleteRule(ruleId: string) {
		if (!confirm('このルールを削除しますか？')) {
			return;
		}

		rules = rules.filter((r) => r.id !== ruleId);
		saveRules();
	}

	/** ルールの有効/無効を切り替え */
	function toggleRule(ruleId: string) {
		rules = rules.map((r) => {
			if (r.id === ruleId) {
				return { ...r, enabled: !r.enabled };
			}
			return r;
		});
		saveRules();
	}

	/** ルール管理ダイアログを開く */
	export function openRulesDialog() {
		loadRules();
		showRulesDialog = true;
	}

	/** ルール作成ダイアログを開く */
	function openCreateDialog() {
		showCreateDialog = true;
	}

	/** トリガータイプのラベルを取得 */
	function getTriggerLabel(type: string): string {
		return triggerTypes.find((t) => t.value === type)?.label || type;
	}

	/** アクションタイプのラベルを取得 */
	function getActionLabel(type: string): string {
		return actionTypes.find((a) => a.value === type)?.label || type;
	}

	/** 日付フォーマット */
	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('ja-JP', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	/** トリガー条件の入力欄 */
	function getTriggerConditionInput(
		triggerType: string
	): { label: string; type: string; options?: string[]; placeholder?: string } | null {
		switch (triggerType) {
			case 'status_changed':
				return {
					label: 'ステータスが次の値に変更されたとき',
					type: 'select',
					options: ['not-started', 'planning', 'in-progress', 'in-review', 'blocked', 'completed']
				};
			case 'priority_changed':
				return {
					label: '優先度が次の値に変更されたとき',
					type: 'select',
					options: ['high', 'medium', 'low', 'none']
				};
			case 'due_date_approaching':
				return {
					label: '期限の何日前に通知',
					type: 'number',
					placeholder: '例: 3'
				};
			case 'progress_updated':
				return {
					label: '進捗が次の値以上になったとき（%）',
					type: 'number',
					placeholder: '例: 100'
				};
			default:
				return null;
		}
	}

	/** アクションパラメータの入力欄 */
	function getActionParamInput(
		actionType: string
	): { label: string; type: string; options?: string[]; placeholder?: string } | null {
		switch (actionType) {
			case 'set_status':
				return {
					label: '変更後のステータス',
					type: 'select',
					options: ['not-started', 'planning', 'in-progress', 'in-review', 'blocked', 'completed']
				};
			case 'set_priority':
				return {
					label: '変更後の優先度',
					type: 'select',
					options: ['high', 'medium', 'low', 'none']
				};
			case 'assign_to':
				return {
					label: '担当者名',
					type: 'text',
					placeholder: '例: 山田太郎'
				};
			case 'add_tag':
				return {
					label: '追加するタグ',
					type: 'text',
					placeholder: '例: 重要'
				};
			case 'send_notification':
				return {
					label: '通知メッセージ',
					type: 'text',
					placeholder: '例: タスクの確認が必要です'
				};
			case 'create_subtask':
				return {
					label: 'サブタスク名',
					type: 'text',
					placeholder: '例: レビューを実施'
				};
			default:
				return null;
		}
	}

	$: triggerConditionInput = getTriggerConditionInput(newRule.trigger.type);
	$: actionParamInput = getActionParamInput(newRule.action.type);

	// 初期化
	loadRules();

	export let showTriggerButton = true;
</script>

{#if showTriggerButton}
	<div class="rule-manager">
		<button type="button" class="btn-rule" on:click={openRulesDialog}>
			<i class="bi bi-lightning"></i>
			自動化ルール ({rules.filter((r) => r.enabled).length}/{rules.length})
		</button>
	</div>
{/if}

<!-- ルール一覧ダイアログ -->
{#if showRulesDialog}
	<div class="dialog-backdrop" on:click={() => (showRulesDialog = false)}>
		<div class="dialog large" on:click|stopPropagation>
			<div class="dialog-header">
				<h3>自動化ルール</h3>
				<button type="button" class="close-btn" on:click={() => (showRulesDialog = false)}>
					<i class="bi bi-x"></i>
				</button>
			</div>
			<div class="dialog-body">
				<div class="header-actions">
					<button type="button" class="btn-primary" on:click={openCreateDialog}>
						<i class="bi bi-plus-circle"></i>
						新規ルール作成
					</button>
				</div>

				{#if rules.length === 0}
					<div class="empty-state">
						<i class="bi bi-lightning"></i>
						<p>自動化ルールがありません</p>
						<p class="hint">ルールを作成して、繰り返しタスクを自動化しましょう</p>
					</div>
				{:else}
					<div class="rule-list">
						{#each rules as rule}
							<div class="rule-item" class:disabled={!rule.enabled}>
								<div class="rule-header">
									<div class="rule-name">
										<i class="bi bi-lightning-fill"></i>
										{rule.name}
									</div>
									<div class="rule-actions">
										<button
											type="button"
											class="toggle-btn"
											class:active={rule.enabled}
											on:click={() => toggleRule(rule.id)}
										>
											{rule.enabled ? '有効' : '無効'}
										</button>
										<button type="button" class="btn-delete" on:click={() => deleteRule(rule.id)}>
											<i class="bi bi-trash"></i>
										</button>
									</div>
								</div>
								<div class="rule-body">
									<div class="rule-flow">
										<div class="flow-item trigger">
											<div class="flow-label">トリガー</div>
											<div class="flow-content">
												<i class="bi bi-play-circle"></i>
												{getTriggerLabel(rule.trigger.type)}
											</div>
										</div>
										<div class="flow-arrow">→</div>
										<div class="flow-item action">
											<div class="flow-label">アクション</div>
											<div class="flow-content">
												<i class="bi bi-gear"></i>
												{getActionLabel(rule.action.type)}
											</div>
										</div>
									</div>
									<div class="rule-meta">
										<i class="bi bi-calendar"></i>
										作成日: {formatDate(rule.createdAt)}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="dialog-footer">
				<button type="button" class="btn-secondary" on:click={() => (showRulesDialog = false)}>
					閉じる
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ルール作成ダイアログ -->
{#if showCreateDialog}
	<div class="dialog-backdrop" on:click={() => (showCreateDialog = false)}>
		<div class="dialog" on:click|stopPropagation>
			<div class="dialog-header">
				<h3>新規ルール作成</h3>
				<button type="button" class="close-btn" on:click={() => (showCreateDialog = false)}>
					<i class="bi bi-x"></i>
				</button>
			</div>
			<div class="dialog-body">
				<div class="form-group">
					<label for="rule-name">ルール名</label>
					<input
						id="rule-name"
						type="text"
						bind:value={newRule.name}
						placeholder="例: タスク完了時に次のタスクを開始"
					/>
				</div>

				<div class="section">
					<h4>トリガー（いつ実行するか）</h4>
					<div class="form-group">
						<label for="trigger-type">トリガータイプ</label>
						<select id="trigger-type" bind:value={newRule.trigger.type}>
							{#each triggerTypes as trigger}
								<option value={trigger.value}>{trigger.label}</option>
							{/each}
						</select>
					</div>
					{#if triggerConditionInput}
						<div class="form-group">
							<label>{triggerConditionInput.label}</label>
							{#if triggerConditionInput.type === 'select' && triggerConditionInput.options}
								<select bind:value={newRule.trigger.conditions.value}>
									{#each triggerConditionInput.options as option}
										<option value={option}>{option}</option>
									{/each}
								</select>
							{:else if triggerConditionInput.type === 'number'}
								<input
									type="number"
									bind:value={newRule.trigger.conditions.value}
									placeholder={triggerConditionInput.placeholder}
								/>
							{/if}
						</div>
					{/if}
				</div>

				<div class="section">
					<h4>アクション（何をするか）</h4>
					<div class="form-group">
						<label for="action-type">アクションタイプ</label>
						<select id="action-type" bind:value={newRule.action.type}>
							{#each actionTypes as action}
								<option value={action.value}>{action.label}</option>
							{/each}
						</select>
					</div>
					{#if actionParamInput}
						<div class="form-group">
							<label>{actionParamInput.label}</label>
							{#if actionParamInput.type === 'select' && actionParamInput.options}
								<select bind:value={newRule.action.params.value}>
									{#each actionParamInput.options as option}
										<option value={option}>{option}</option>
									{/each}
								</select>
							{:else if actionParamInput.type === 'text'}
								<input
									type="text"
									bind:value={newRule.action.params.value}
									placeholder={actionParamInput.placeholder}
								/>
							{:else if actionParamInput.type === 'number'}
								<input
									type="number"
									bind:value={newRule.action.params.value}
									placeholder={actionParamInput.placeholder}
								/>
							{/if}
						</div>
					{/if}
				</div>

				<div class="info-box">
					<i class="bi bi-info-circle"></i>
					<span>このルールは作成後すぐに有効になります</span>
				</div>
			</div>
			<div class="dialog-footer">
				<button type="button" class="btn-secondary" on:click={() => (showCreateDialog = false)}>
					キャンセル
				</button>
				<button type="button" class="btn-primary" on:click={createRule}>
					<i class="bi bi-plus-circle"></i>
					作成
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.rule-manager {
		display: inline-block;
	}

	.btn-rule {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #ffffff;
		color: #374151;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease;
	}

	.btn-rule:hover {
		background: #fef3c7;
		border-color: #f59e0b;
	}

	/* ダイアログ */
	.dialog-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.dialog {
		background: #ffffff;
		border-radius: 12px;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
		max-width: 600px;
		width: 90%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.dialog.large {
		max-width: 800px;
	}

	.dialog-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.dialog-header h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #6b7280;
		font-size: 20px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s ease;
	}

	.close-btn:hover {
		background: #f3f4f6;
	}

	.dialog-body {
		padding: 20px;
		overflow-y: auto;
		flex: 1;
	}

	.header-actions {
		margin-bottom: 20px;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group label {
		display: block;
		margin-bottom: 6px;
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.form-group input,
	.form-group select {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 14px;
		transition: border-color 0.2s ease;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.section {
		background: #f9fafb;
		padding: 16px;
		border-radius: 8px;
		margin-bottom: 16px;
	}

	.section h4 {
		margin: 0 0 12px 0;
		font-size: 14px;
		font-weight: 600;
		color: #111827;
	}

	.info-box {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		border-radius: 8px;
		font-size: 13px;
		background: #eff6ff;
		color: #1e40af;
		border: 1px solid #bfdbfe;
		margin-top: 16px;
	}

	.rule-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.rule-item {
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		padding: 16px;
		background: #ffffff;
		transition: border-color 0.2s ease;
	}

	.rule-item.disabled {
		opacity: 0.6;
		background: #f9fafb;
	}

	.rule-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.rule-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
		font-weight: 600;
		color: #111827;
	}

	.rule-actions {
		display: flex;
		gap: 8px;
	}

	.toggle-btn {
		padding: 6px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: #f3f4f6;
		color: #6b7280;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.toggle-btn.active {
		background: #10b981;
		border-color: #10b981;
		color: #ffffff;
	}

	.btn-delete {
		padding: 6px 10px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: #ffffff;
		color: #ef4444;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.btn-delete:hover {
		background: #fee2e2;
	}

	.rule-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.rule-flow {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.flow-item {
		flex: 1;
		padding: 12px;
		border-radius: 8px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
	}

	.flow-item.trigger {
		background: #eff6ff;
		border-color: #bfdbfe;
	}

	.flow-item.action {
		background: #fef3c7;
		border-color: #fde68a;
	}

	.flow-label {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		color: #9ca3af;
		margin-bottom: 4px;
	}

	.flow-content {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: #374151;
	}

	.flow-arrow {
		font-size: 20px;
		color: #9ca3af;
		font-weight: 700;
	}

	.rule-meta {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: #9ca3af;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		color: #9ca3af;
	}

	.empty-state i {
		font-size: 64px;
		margin-bottom: 16px;
		color: #f59e0b;
	}

	.empty-state p {
		margin: 4px 0;
		font-size: 14px;
	}

	.empty-state .hint {
		font-size: 13px;
		color: #6b7280;
	}

	.dialog-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 20px;
		border-top: 1px solid #e5e7eb;
	}

	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border: 1px solid;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.btn-primary {
		background: #3b82f6;
		border-color: #3b82f6;
		color: #ffffff;
	}

	.btn-primary:hover {
		background: #2563eb;
	}

	.btn-secondary {
		background: #ffffff;
		border-color: #e5e7eb;
		color: #374151;
	}

	.btn-secondary:hover {
		background: #f9fafb;
	}
</style>
