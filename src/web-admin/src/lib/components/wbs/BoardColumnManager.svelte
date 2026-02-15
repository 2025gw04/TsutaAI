<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		boardColumnStore,
		DEFAULT_COLUMNS,
		type BoardColumn
	} from '$lib/stores/boardColumnStore';

	export let projectId: number;
	export let show = false;

	const dispatch = createEventDispatcher();

	/** 現在の列定義 */
	let columns: BoardColumn[] = [];

	/** 新規列の入力値 */
	let newColumnId = '';
	let newColumnLabel = '';
	let newColumnColor = '#3b82f6';
	let newColumnWipLimit: number | null = null;

	/** 編集モード */
	let editingColumnId: string | null = null;
	let editingLabel = '';
	let editingColor = '';
	let editingWipLimit: number | null = null;

	/** ドラッグ＆ドロップ */
	let draggedColumnId: string | null = null;

	/** エラーメッセージ */
	let errorMessage = '';

	/** モーダルを開いたときに列を読み込む */
	$: if (show) {
		loadColumns();
	}

	/** 列を読み込む */
	function loadColumns() {
		columns = boardColumnStore.loadColumns(projectId);
		columns = columns.sort((a, b) => a.order - b.order);
	}

	/** 列を追加 */
	function handleAddColumn() {
		errorMessage = '';

		// バリデーション
		if (!newColumnId || !newColumnLabel) {
			errorMessage = '列IDと列名は必須です。';
			return;
		}

		// ID重複チェック
		if (columns.some((c) => c.id === newColumnId)) {
			errorMessage = 'この列IDは既に使用されています。';
			return;
		}

		// ID形式チェック（英数字とハイフンのみ）
		if (!/^[a-z0-9-]+$/.test(newColumnId)) {
			errorMessage = '列IDは小文字の英数字とハイフンのみ使用できます。';
			return;
		}

		boardColumnStore.addColumn(projectId, {
			id: newColumnId,
			label: newColumnLabel,
			color: newColumnColor,
			wipLimit: newColumnWipLimit
		});

		// 入力をリセット
		newColumnId = '';
		newColumnLabel = '';
		newColumnColor = '#3b82f6';
		newColumnWipLimit = null;

		// 列を再読み込み
		loadColumns();
	}

	/** 列を削除 */
	function handleDeleteColumn(columnId: string) {
		const column = columns.find((c) => c.id === columnId);

		if (column?.isDefault) {
			errorMessage = 'デフォルト列は削除できません。';
			return;
		}

		if (confirm(`列「${column?.label}」を削除しますか？`)) {
			boardColumnStore.deleteColumn(projectId, columnId);
			loadColumns();
		}
	}

	/** 編集モードに入る */
	function startEditing(column: BoardColumn) {
		editingColumnId = column.id;
		editingLabel = column.label;
		editingColor = column.color;
		editingWipLimit = column.wipLimit;
		errorMessage = '';
	}

	/** 編集をキャンセル */
	function cancelEditing() {
		editingColumnId = null;
		editingLabel = '';
		editingColor = '';
		editingWipLimit = null;
	}

	/** 編集を保存 */
	function saveEditing() {
		if (!editingColumnId) return;

		if (!editingLabel) {
			errorMessage = '列名は必須です。';
			return;
		}

		boardColumnStore.updateColumn(projectId, editingColumnId, {
			label: editingLabel,
			color: editingColor,
			wipLimit: editingWipLimit
		});

		cancelEditing();
		loadColumns();
	}

	/** ドラッグ開始 */
	function handleDragStart(event: DragEvent, columnId: string) {
		draggedColumnId = columnId;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	/** ドロップ */
	function handleDrop(event: DragEvent, targetColumnId: string) {
		event.preventDefault();

		if (!draggedColumnId || draggedColumnId === targetColumnId) {
			draggedColumnId = null;
			return;
		}

		const draggedIndex = columns.findIndex((c) => c.id === draggedColumnId);
		const targetIndex = columns.findIndex((c) => c.id === targetColumnId);

		if (draggedIndex === -1 || targetIndex === -1) {
			draggedColumnId = null;
			return;
		}

		// 並び替え
		const newColumns = [...columns];
		const [removed] = newColumns.splice(draggedIndex, 1);
		newColumns.splice(targetIndex, 0, removed);

		// 新しい順序でIDリストを作成
		const newOrder = newColumns.map((c) => c.id);
		boardColumnStore.reorderColumns(projectId, newOrder);

		draggedColumnId = null;
		loadColumns();
	}

	/** ドラッグオーバー */
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	/** デフォルトに戻す */
	function handleResetToDefault() {
		if (confirm('列設定をデフォルトに戻しますか？カスタム列は削除されます。')) {
			boardColumnStore.resetToDefault(projectId);
			loadColumns();
		}
	}

	/** モーダルを閉じる */
	function closeModal() {
		show = false;
		errorMessage = '';
		cancelEditing();
		dispatch('close');
	}
</script>

{#if show}
	<div class="modal-backdrop" on:click={closeModal}>
		<div class="modal" on:click|stopPropagation>
			<!-- ヘッダー -->
			<div class="modal-header">
				<div class="header-content">
					<i class="bi bi-columns-gap"></i>
					<h2>ボード列設定</h2>
				</div>
				<button type="button" class="close-btn" on:click={closeModal}>
					<i class="bi bi-x"></i>
				</button>
			</div>

			<!-- ボディ -->
			<div class="modal-body">
				{#if errorMessage}
					<div class="error-message">
						<i class="bi bi-exclamation-triangle"></i>
						{errorMessage}
					</div>
				{/if}

				<!-- 新規列追加 -->
				<div class="add-section">
					<h3>新しい列を追加</h3>
					<div class="add-form">
						<div class="form-row">
							<div class="form-group">
								<label>列ID <span class="required">*</span></label>
								<input
									type="text"
									bind:value={newColumnId}
									placeholder="custom-column"
									pattern="[a-z0-9-]+"
								/>
								<span class="hint">小文字の英数字とハイフンのみ</span>
							</div>
							<div class="form-group">
								<label>列名 <span class="required">*</span></label>
								<input type="text" bind:value={newColumnLabel} placeholder="カスタム列" />
							</div>
						</div>
						<div class="form-row">
							<div class="form-group">
								<label>色</label>
								<div class="color-input">
									<input type="color" bind:value={newColumnColor} />
									<span class="color-value">{newColumnColor}</span>
								</div>
							</div>
							<div class="form-group">
								<label>WIP制限</label>
								<input
									type="number"
									bind:value={newColumnWipLimit}
									placeholder="制限なし"
									min="1"
								/>
							</div>
						</div>
						<button type="button" class="btn-add" on:click={handleAddColumn}>
							<i class="bi bi-plus-circle"></i>
							列を追加
						</button>
					</div>
				</div>

				<!-- 既存列の一覧 -->
				<div class="columns-section">
					<h3>現在の列 <span class="column-count">({columns.length}列)</span></h3>
					<div class="columns-list">
						{#each columns as column (column.id)}
							<div
								class="column-item"
								class:is-default={column.isDefault}
								class:is-dragging={draggedColumnId === column.id}
								draggable="true"
								on:dragstart={(e) => handleDragStart(e, column.id)}
								on:drop={(e) => handleDrop(e, column.id)}
								on:dragover={handleDragOver}
							>
								<div class="drag-handle">
									<i class="bi bi-grip-vertical"></i>
								</div>

								{#if editingColumnId === column.id}
									<!-- 編集モード -->
									<div class="edit-mode">
										<div class="edit-form">
											<input type="text" bind:value={editingLabel} placeholder="列名" />
											<input type="color" bind:value={editingColor} />
											<input type="number" bind:value={editingWipLimit} placeholder="WIP" min="1" />
										</div>
										<div class="edit-actions">
											<button type="button" class="btn-save" on:click={saveEditing}>
												<i class="bi bi-check"></i>
											</button>
											<button type="button" class="btn-cancel" on:click={cancelEditing}>
												<i class="bi bi-x"></i>
											</button>
										</div>
									</div>
								{:else}
									<!-- 表示モード -->
									<div class="column-info">
										<div class="color-box" style="background: {column.color}"></div>
										<div class="column-details">
											<span class="column-label">{column.label}</span>
											<span class="column-id">({column.id})</span>
											{#if column.isDefault}
												<span class="default-badge">デフォルト</span>
											{/if}
										</div>
										{#if column.wipLimit !== null}
											<div class="wip-info">
												WIP: {column.wipLimit}
											</div>
										{/if}
									</div>

									<div class="column-actions">
										<button
											type="button"
											class="btn-icon"
											on:click={() => startEditing(column)}
											title="編集"
										>
											<i class="bi bi-pencil"></i>
										</button>
										{#if !column.isDefault}
											<button
												type="button"
												class="btn-icon danger"
												on:click={() => handleDeleteColumn(column.id)}
												title="削除"
											>
												<i class="bi bi-trash"></i>
											</button>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- フッター -->
			<div class="modal-footer">
				<button type="button" class="btn-reset" on:click={handleResetToDefault}>
					<i class="bi bi-arrow-counterclockwise"></i>
					デフォルトに戻す
				</button>
				<button type="button" class="btn-close" on:click={closeModal}> 閉じる </button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal {
		background: #ffffff;
		border-radius: 16px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		max-width: 800px;
		width: 95%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		animation: slideUp 0.3s ease;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.header-content > i {
		font-size: 24px;
		color: #3b82f6;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		color: #111827;
	}

	.close-btn {
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: #6b7280;
		font-size: 24px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s ease;
	}

	.close-btn:hover {
		background: #f3f4f6;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #991b1b;
		font-size: 13px;
		margin-bottom: 20px;
	}

	.add-section {
		margin-bottom: 32px;
	}

	.add-section h3 {
		margin: 0 0 16px 0;
		font-size: 16px;
		font-weight: 600;
		color: #374151;
	}

	.add-form {
		padding: 16px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-bottom: 16px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.required {
		color: #ef4444;
	}

	.form-group input[type='text'],
	.form-group input[type='number'] {
		padding: 8px 12px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 14px;
	}

	.form-group input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.hint {
		font-size: 11px;
		color: #6b7280;
	}

	.color-input {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.color-input input[type='color'] {
		width: 40px;
		height: 40px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		cursor: pointer;
	}

	.color-value {
		font-size: 13px;
		font-family: monospace;
		color: #6b7280;
	}

	.btn-add {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		background: #3b82f6;
		border: none;
		border-radius: 8px;
		color: #ffffff;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.btn-add:hover {
		background: #2563eb;
	}

	.columns-section h3 {
		margin: 0 0 16px 0;
		font-size: 16px;
		font-weight: 600;
		color: #374151;
	}

	.column-count {
		font-size: 13px;
		font-weight: 400;
		color: #6b7280;
	}

	.columns-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.column-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: #ffffff;
		border: 2px solid #e5e7eb;
		border-radius: 10px;
		transition: all 0.2s ease;
		cursor: grab;
	}

	.column-item:hover {
		border-color: #d1d5db;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	.column-item.is-dragging {
		opacity: 0.5;
		cursor: grabbing;
	}

	.column-item.is-default {
		background: #f9fafb;
	}

	.drag-handle {
		color: #9ca3af;
		cursor: grab;
		font-size: 16px;
	}

	.column-info {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.color-box {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		border: 2px solid #ffffff;
		box-shadow: 0 0 0 1px #e5e7eb;
	}

	.column-details {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.column-label {
		font-size: 14px;
		font-weight: 600;
		color: #111827;
	}

	.column-id {
		font-size: 12px;
		font-family: monospace;
		color: #6b7280;
	}

	.default-badge {
		padding: 2px 8px;
		background: #dbeafe;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 600;
		color: #1e40af;
	}

	.wip-info {
		padding: 4px 10px;
		background: #fef3c7;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 600;
		color: #92400e;
	}

	.column-actions {
		display: flex;
		gap: 6px;
	}

	.btn-icon {
		width: 32px;
		height: 32px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: #ffffff;
		color: #6b7280;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.btn-icon:hover {
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.btn-icon.danger:hover {
		border-color: #ef4444;
		color: #ef4444;
		background: #fef2f2;
	}

	.edit-mode {
		flex: 1;
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.edit-form {
		flex: 1;
		display: flex;
		gap: 8px;
	}

	.edit-form input {
		flex: 1;
		padding: 6px 10px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 13px;
	}

	.edit-form input[type='color'] {
		width: 50px;
		flex: none;
	}

	.edit-form input[type='number'] {
		width: 80px;
		flex: none;
	}

	.edit-actions {
		display: flex;
		gap: 4px;
	}

	.btn-save,
	.btn-cancel {
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
		transition: all 0.2s ease;
	}

	.btn-save {
		background: #10b981;
		color: #ffffff;
	}

	.btn-save:hover {
		background: #059669;
	}

	.btn-cancel {
		background: #ef4444;
		color: #ffffff;
	}

	.btn-cancel:hover {
		background: #dc2626;
	}

	.modal-footer {
		display: flex;
		justify-content: space-between;
		padding: 20px 24px;
		border-top: 1px solid #e5e7eb;
	}

	.btn-reset,
	.btn-close {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-reset {
		background: #fef3c7;
		border: 1px solid #fbbf24;
		color: #92400e;
	}

	.btn-reset:hover {
		background: #fde68a;
	}

	.btn-close {
		background: #3b82f6;
		border: 1px solid #3b82f6;
		color: #ffffff;
	}

	.btn-close:hover {
		background: #2563eb;
	}
</style>
