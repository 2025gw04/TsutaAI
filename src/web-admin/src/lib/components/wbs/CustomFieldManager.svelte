<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let projectId: number;

	const dispatch = createEventDispatcher();

	/** カスタムフィールド定義 */
	interface CustomField {
		id: string;
		name: string;
		type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox';
		options?: string[]; // dropdownの選択肢
		required: boolean;
		createdAt: string;
	}

	/** カスタムフィールド値 */
	interface CustomFieldValue {
		fieldId: string;
		value: string | number | boolean;
	}

	let fields: CustomField[] = [];
	let showDialog = false;
	let showCreateDialog = false;
	let editingField: CustomField | null = null;

	/** 新規フィールド */
	let newField = {
		name: '',
		type: 'text' as CustomField['type'],
		options: [] as string[],
		required: false
	};

	/** ドロップダウンオプション入力 */
	let optionInput = '';

	/** フィールドタイプのラベル */
	const fieldTypeLabels = {
		text: 'テキスト',
		number: '数値',
		dropdown: 'ドロップダウン',
		date: '日付',
		checkbox: 'チェックボックス'
	};

	/** カスタムフィールド一覧を読み込み */
	function loadFields() {
		const key = `custom_fields_project_${projectId}`;
		const stored = localStorage.getItem(key);
		if (stored) {
			try {
				fields = JSON.parse(stored);
			} catch (error) {
				console.error('カスタムフィールドの読み込みに失敗しました:', error);
				fields = [];
			}
		}
	}

	/** カスタムフィールドを保存 */
	function saveFields() {
		const key = `custom_fields_project_${projectId}`;
		localStorage.setItem(key, JSON.stringify(fields));
		dispatch('fieldsUpdated', fields);
	}

	/** フィールド作成 */
	function createField() {
		if (!newField.name.trim()) {
			alert('フィールド名を入力してください');
			return;
		}

		const field: CustomField = {
			id: `field-${Date.now()}`,
			name: newField.name,
			type: newField.type,
			options: newField.type === 'dropdown' ? [...newField.options] : undefined,
			required: newField.required,
			createdAt: new Date().toISOString()
		};

		fields = [...fields, field];
		saveFields();

		// リセット
		newField = {
			name: '',
			type: 'text',
			options: [],
			required: false
		};
		showCreateDialog = false;

		alert('カスタムフィールドを作成しました');
	}

	/** フィールド削除 */
	function deleteField(fieldId: string) {
		if (!confirm('このカスタムフィールドを削除しますか？\n関連するタスクデータも削除されます。')) {
			return;
		}

		fields = fields.filter((f) => f.id !== fieldId);
		saveFields();
	}

	/** フィールド編集開始 */
	function startEdit(field: CustomField) {
		editingField = { ...field };
	}

	/** フィールド編集保存 */
	function saveEdit() {
		if (!editingField) return;

		fields = fields.map((f) => (f.id === editingField!.id ? editingField! : f));
		saveFields();
		editingField = null;
	}

	/** フィールド編集キャンセル */
	function cancelEdit() {
		editingField = null;
	}

	/** オプション追加 */
	function addOption() {
		if (!optionInput.trim()) return;
		newField.options = [...newField.options, optionInput.trim()];
		optionInput = '';
	}

	/** オプション削除 */
	function removeOption(index: number) {
		newField.options = newField.options.filter((_, i) => i !== index);
	}

	/** ダイアログを開く */
	export function openDialog() {
		loadFields();
		showDialog = true;
	}

	/** 作成ダイアログを開く */
	function openCreateDialog() {
		showCreateDialog = true;
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

	// 初期化
	loadFields();

	export let showTriggerButton = true;
</script>

{#if showTriggerButton}
	<button type="button" class="btn-custom-field" on:click={openDialog}>
		<i class="bi bi-sliders"></i>
		カスタムフィールド ({fields.length})
	</button>
{/if}

<!-- フィールド管理ダイアログ -->
{#if showDialog}
	<div class="dialog-backdrop" on:click={() => (showDialog = false)}>
		<div class="dialog large" on:click|stopPropagation>
			<div class="dialog-header">
				<h3>カスタムフィールド管理</h3>
				<button type="button" class="close-btn" on:click={() => (showDialog = false)}>
					<i class="bi bi-x"></i>
				</button>
			</div>
			<div class="dialog-body">
				<div class="header-actions">
					<p class="description">
						プロジェクト固有のフィールドを定義して、タスクに追加情報を記録できます。
					</p>
					<button type="button" class="btn-primary" on:click={openCreateDialog}>
						<i class="bi bi-plus-circle"></i>
						新規フィールド作成
					</button>
				</div>

				{#if fields.length === 0}
					<div class="empty-state">
						<i class="bi bi-sliders"></i>
						<p>カスタムフィールドがありません</p>
						<p class="hint">フィールドを作成して、タスクにカスタムデータを記録しましょう</p>
					</div>
				{:else}
					<div class="field-list">
						{#each fields as field}
							<div class="field-item">
								{#if editingField && editingField.id === field.id}
									<div class="field-edit">
										<input type="text" bind:value={editingField.name} placeholder="フィールド名" />
										<div class="edit-actions">
											<button type="button" class="btn-save" on:click={saveEdit}>
												<i class="bi bi-check"></i>
												保存
											</button>
											<button type="button" class="btn-cancel" on:click={cancelEdit}>
												<i class="bi bi-x"></i>
												キャンセル
											</button>
										</div>
									</div>
								{:else}
									<div class="field-info">
										<div class="field-header">
											<div class="field-name">
												<i class="bi bi-grip-vertical"></i>
												{field.name}
												{#if field.required}
													<span class="badge required">必須</span>
												{/if}
											</div>
											<div class="field-actions">
												<button
													type="button"
													class="btn-icon"
													on:click={() => startEdit(field)}
													title="編集"
												>
													<i class="bi bi-pencil"></i>
												</button>
												<button
													type="button"
													class="btn-icon delete"
													on:click={() => deleteField(field.id)}
													title="削除"
												>
													<i class="bi bi-trash"></i>
												</button>
											</div>
										</div>
										<div class="field-meta">
											<span class="badge type-{field.type}">
												{fieldTypeLabels[field.type]}
											</span>
											{#if field.type === 'dropdown' && field.options}
												<span class="options-preview">
													選択肢: {field.options.join(', ')}
												</span>
											{/if}
											<span class="date">
												<i class="bi bi-calendar"></i>
												{formatDate(field.createdAt)}
											</span>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="dialog-footer">
				<button type="button" class="btn-secondary" on:click={() => (showDialog = false)}>
					閉じる
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- フィールド作成ダイアログ -->
{#if showCreateDialog}
	<div class="dialog-backdrop" on:click={() => (showCreateDialog = false)}>
		<div class="dialog" on:click|stopPropagation>
			<div class="dialog-header">
				<h3>新規カスタムフィールド作成</h3>
				<button type="button" class="close-btn" on:click={() => (showCreateDialog = false)}>
					<i class="bi bi-x"></i>
				</button>
			</div>
			<div class="dialog-body">
				<div class="form-group">
					<label for="field-name">フィールド名 <span class="required-mark">*</span></label>
					<input
						id="field-name"
						type="text"
						bind:value={newField.name}
						placeholder="例: 優先度、ステータス、担当部署"
					/>
				</div>

				<div class="form-group">
					<label for="field-type">フィールドタイプ <span class="required-mark">*</span></label>
					<select id="field-type" bind:value={newField.type}>
						<option value="text">テキスト</option>
						<option value="number">数値</option>
						<option value="dropdown">ドロップダウン</option>
						<option value="date">日付</option>
						<option value="checkbox">チェックボックス</option>
					</select>
				</div>

				{#if newField.type === 'dropdown'}
					<div class="form-group">
						<label>ドロップダウン選択肢</label>
						<div class="option-input-group">
							<input
								type="text"
								bind:value={optionInput}
								placeholder="選択肢を入力してEnterキーで追加"
								on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
							/>
							<button type="button" class="btn-add-option" on:click={addOption}>
								<i class="bi bi-plus"></i>
								追加
							</button>
						</div>
						{#if newField.options.length > 0}
							<div class="option-list">
								{#each newField.options as option, index}
									<div class="option-item">
										<span>{option}</span>
										<button
											type="button"
											class="btn-remove-option"
											on:click={() => removeOption(index)}
										>
											<i class="bi bi-x"></i>
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<div class="form-group checkbox-group">
					<label>
						<input type="checkbox" bind:checked={newField.required} />
						<span>必須フィールド</span>
					</label>
				</div>

				<div class="info-box">
					<i class="bi bi-info-circle"></i>
					<span>作成したフィールドは全タスクで利用可能になります</span>
				</div>
			</div>
			<div class="dialog-footer">
				<button type="button" class="btn-secondary" on:click={() => (showCreateDialog = false)}>
					キャンセル
				</button>
				<button type="button" class="btn-primary" on:click={createField}>
					<i class="bi bi-plus-circle"></i>
					作成
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.btn-custom-field {
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

	.btn-custom-field:hover {
		background: #f0f9ff;
		border-color: #3b82f6;
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

	.description {
		margin: 0 0 16px 0;
		font-size: 14px;
		color: #6b7280;
		line-height: 1.5;
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

	.required-mark {
		color: #ef4444;
	}

	.form-group input[type='text'],
	.form-group input[type='number'],
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

	.checkbox-group label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.checkbox-group input[type='checkbox'] {
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.option-input-group {
		display: flex;
		gap: 8px;
	}

	.option-input-group input {
		flex: 1;
	}

	.btn-add-option {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 10px 16px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #f9fafb;
		color: #374151;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.2s ease;
	}

	.btn-add-option:hover {
		background: #e5e7eb;
	}

	.option-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}

	.option-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	.btn-remove-option {
		padding: 4px 8px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: #ef4444;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.btn-remove-option:hover {
		background: #fee2e2;
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

	.field-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.field-item {
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		padding: 16px;
		background: #ffffff;
		transition: border-color 0.2s ease;
	}

	.field-item:hover {
		border-color: #d1d5db;
	}

	.field-info {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.field-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.field-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
		font-weight: 600;
		color: #111827;
	}

	.field-actions {
		display: flex;
		gap: 4px;
	}

	.btn-icon {
		padding: 6px 10px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: #ffffff;
		color: #6b7280;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.btn-icon:hover {
		background: #f0f9ff;
		color: #3b82f6;
	}

	.btn-icon.delete:hover {
		background: #fee2e2;
		color: #ef4444;
	}

	.field-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		font-size: 12px;
		color: #6b7280;
	}

	.badge {
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.badge.required {
		background: #fee2e2;
		color: #ef4444;
	}

	.badge.type-text {
		background: #e0e7ff;
		color: #4f46e5;
	}

	.badge.type-number {
		background: #dbeafe;
		color: #3b82f6;
	}

	.badge.type-dropdown {
		background: #fef3c7;
		color: #f59e0b;
	}

	.badge.type-date {
		background: #dcfce7;
		color: #10b981;
	}

	.badge.type-checkbox {
		background: #fce7f3;
		color: #ec4899;
	}

	.options-preview {
		color: #6b7280;
		font-style: italic;
	}

	.date {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.field-edit {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.field-edit input {
		padding: 10px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 14px;
	}

	.edit-actions {
		display: flex;
		gap: 8px;
	}

	.btn-save,
	.btn-cancel {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: 1px solid;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.btn-save {
		background: #10b981;
		border-color: #10b981;
		color: #ffffff;
	}

	.btn-save:hover {
		background: #059669;
	}

	.btn-cancel {
		background: #ffffff;
		border-color: #e5e7eb;
		color: #374151;
	}

	.btn-cancel:hover {
		background: #f9fafb;
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
		color: #3b82f6;
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
