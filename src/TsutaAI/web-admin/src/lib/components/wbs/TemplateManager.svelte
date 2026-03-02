<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { WbsTask } from './types';

	export let tasks: WbsTask[] = [];
	export let projectName: string = '';
	export let showTriggerButton = true;

	const dispatch = createEventDispatcher();

	/** ローカルストレージに保存されたテンプレート */
	interface Template {
		id: string;
		name: string;
		description: string;
		tasks: WbsTask[];
		createdAt: string;
	}

	let templates: Template[] = [];
	let showSaveDialog = false;
	let showLoadDialog = false;
	let newTemplateName = '';
	let newTemplateDescription = '';
	let selectedTemplateId: string | null = null;

	/** テンプレート一覧を読み込み */
	function loadTemplates() {
		const stored = localStorage.getItem('wbs_templates');
		if (stored) {
			try {
				templates = JSON.parse(stored);
			} catch (error) {
				console.error('テンプレートの読み込みに失敗しました:', error);
				templates = [];
			}
		}
	}

	/** テンプレートを保存 */
	function saveTemplate() {
		if (!newTemplateName.trim()) {
			alert('テンプレート名を入力してください');
			return;
		}

		const template: Template = {
			id: `template-${Date.now()}`,
			name: newTemplateName,
			description: newTemplateDescription,
			tasks: JSON.parse(JSON.stringify(tasks)), // ディープコピー
			createdAt: new Date().toISOString()
		};

		templates = [...templates, template];
		localStorage.setItem('wbs_templates', JSON.stringify(templates));

		// リセット
		newTemplateName = '';
		newTemplateDescription = '';
		showSaveDialog = false;

		alert('テンプレートを保存しました');
	}

	/** テンプレートを読み込み */
	function loadTemplate() {
		if (!selectedTemplateId) {
			alert('テンプレートを選択してください');
			return;
		}

		const template = templates.find((t) => t.id === selectedTemplateId);
		if (!template) {
			alert('テンプレートが見つかりません');
			return;
		}

		// タスクIDを再生成（既存タスクとの衝突を避ける）
		const regeneratedTasks = regenerateTaskIds(template.tasks);

		dispatch('loadTemplate', { tasks: regeneratedTasks });
		showLoadDialog = false;
		selectedTemplateId = null;

		alert(`テンプレート「${template.name}」を読み込みました`);
	}

	/** タスクIDを再生成（再帰的） */
	function regenerateTaskIds(taskList: WbsTask[]): WbsTask[] {
		return taskList.map((task, index) => ({
			...task,
			id: `${Date.now()}-${index}`,
			dependencies: [], // 依存関係はクリア
			children: task.children.length > 0 ? regenerateTaskIds(task.children) : []
		}));
	}

	/** テンプレートを削除 */
	function deleteTemplate(templateId: string) {
		if (!confirm('このテンプレートを削除しますか？')) {
			return;
		}

		templates = templates.filter((t) => t.id !== templateId);
		localStorage.setItem('wbs_templates', JSON.stringify(templates));
	}

	/** 保存ダイアログを開く */
	export function openSaveDialog() {
		if (tasks.length === 0) {
			alert('保存するタスクがありません');
			return;
		}
		newTemplateName = projectName ? `${projectName} テンプレート` : '';
		showSaveDialog = true;
	}

	/** 読み込みダイアログを開く */
	export function openLoadDialog() {
		loadTemplates();
		if (templates.length === 0) {
			alert('保存されたテンプレートがありません');
			return;
		}
		showLoadDialog = true;
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
</script>

{#if showTriggerButton}
	<div class="template-manager">
		<button type="button" class="btn-template" on:click={openSaveDialog}>
			<i class="bi bi-save"></i>
			テンプレートとして保存
		</button>
		<button type="button" class="btn-template" on:click={openLoadDialog}>
			<i class="bi bi-folder-open"></i>
			テンプレートから読み込み
		</button>
	</div>
{/if}

<!-- 保存ダイアログ -->
{#if showSaveDialog}
	<div class="dialog-backdrop" on:click={() => (showSaveDialog = false)}>
		<div class="dialog" on:click|stopPropagation>
			<div class="dialog-header">
				<h3>テンプレートとして保存</h3>
				<button type="button" class="close-btn" on:click={() => (showSaveDialog = false)}>
					<i class="bi bi-x"></i>
				</button>
			</div>
			<div class="dialog-body">
				<div class="form-group">
					<label for="template-name">テンプレート名</label>
					<input
						id="template-name"
						type="text"
						bind:value={newTemplateName}
						placeholder="例: Webアプリ開発テンプレート"
					/>
				</div>
				<div class="form-group">
					<label for="template-description">説明（任意）</label>
					<textarea
						id="template-description"
						bind:value={newTemplateDescription}
						placeholder="このテンプレートの用途や特徴を記述"
						rows="3"
					></textarea>
				</div>
				<div class="info-box">
					<i class="bi bi-info-circle"></i>
					<span>現在のWBS構造（{tasks.length}個のタスク）がテンプレートとして保存されます</span>
				</div>
			</div>
			<div class="dialog-footer">
				<button type="button" class="btn-secondary" on:click={() => (showSaveDialog = false)}>
					キャンセル
				</button>
				<button type="button" class="btn-primary" on:click={saveTemplate}>
					<i class="bi bi-save"></i>
					保存
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- 読み込みダイアログ -->
{#if showLoadDialog}
	<div class="dialog-backdrop" on:click={() => (showLoadDialog = false)}>
		<div class="dialog large" on:click|stopPropagation>
			<div class="dialog-header">
				<h3>テンプレートから読み込み</h3>
				<button type="button" class="close-btn" on:click={() => (showLoadDialog = false)}>
					<i class="bi bi-x"></i>
				</button>
			</div>
			<div class="dialog-body">
				{#if templates.length === 0}
					<div class="empty-state">
						<i class="bi bi-inbox"></i>
						<p>保存されたテンプレートがありません</p>
					</div>
				{:else}
					<div class="template-list">
						{#each templates as template}
							<div
								class="template-item"
								class:selected={selectedTemplateId === template.id}
								on:click={() => (selectedTemplateId = template.id)}
							>
								<div class="template-info">
									<div class="template-name">
										<i class="bi bi-file-earmark-text"></i>
										{template.name}
									</div>
									{#if template.description}
										<div class="template-description">{template.description}</div>
									{/if}
									<div class="template-meta">
										<span>
											<i class="bi bi-list-task"></i>
											{template.tasks.length}個のタスク
										</span>
										<span>
											<i class="bi bi-calendar"></i>
											{formatDate(template.createdAt)}
										</span>
									</div>
								</div>
								<button
									type="button"
									class="btn-delete"
									on:click|stopPropagation={() => deleteTemplate(template.id)}
								>
									<i class="bi bi-trash"></i>
								</button>
							</div>
						{/each}
					</div>
					<div class="warning-box">
						<i class="bi bi-exclamation-triangle"></i>
						<span>テンプレートを読み込むと、現在のWBS構造が置き換えられます</span>
					</div>
				{/if}
			</div>
			<div class="dialog-footer">
				<button type="button" class="btn-secondary" on:click={() => (showLoadDialog = false)}>
					キャンセル
				</button>
				<button
					type="button"
					class="btn-primary"
					disabled={!selectedTemplateId}
					on:click={loadTemplate}
				>
					<i class="bi bi-folder-open"></i>
					読み込み
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.template-manager {
		display: flex;
		gap: 8px;
	}

	.btn-template {
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

	.btn-template:hover {
		background: #f9fafb;
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
		max-width: 500px;
		width: 90%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.dialog.large {
		max-width: 700px;
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
	.form-group textarea {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 14px;
		transition: border-color 0.2s ease;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.info-box,
	.warning-box {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		border-radius: 8px;
		font-size: 13px;
		margin-top: 16px;
	}

	.info-box {
		background: #eff6ff;
		color: #1e40af;
		border: 1px solid #bfdbfe;
	}

	.warning-box {
		background: #fef3c7;
		color: #92400e;
		border: 1px solid #fde68a;
	}

	.template-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.template-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		cursor: pointer;
		transition:
			border-color 0.2s ease,
			background 0.2s ease;
	}

	.template-item:hover {
		background: #f9fafb;
	}

	.template-item.selected {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.template-info {
		flex: 1;
	}

	.template-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
		font-weight: 600;
		color: #111827;
		margin-bottom: 4px;
	}

	.template-description {
		font-size: 13px;
		color: #6b7280;
		margin-bottom: 8px;
	}

	.template-meta {
		display: flex;
		gap: 16px;
		font-size: 12px;
		color: #9ca3af;
	}

	.template-meta span {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.btn-delete {
		padding: 8px;
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

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		color: #9ca3af;
	}

	.empty-state i {
		font-size: 48px;
		margin-bottom: 12px;
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

	.btn-primary:hover:not(:disabled) {
		background: #2563eb;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
