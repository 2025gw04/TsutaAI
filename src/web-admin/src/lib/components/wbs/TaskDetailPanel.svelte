<script lang="ts">
	import { updateTask } from '$lib/stores/undoableWbsStore';
	import type { WbsTask } from '$lib/components/wbs/types';
	import { marked } from 'marked';
	import { createEventDispatcher } from 'svelte';
	import { get } from 'svelte/store';
	import TaskCommentSection from './TaskCommentSection.svelte';
	import TaskAttachmentSection from './TaskAttachmentSection.svelte';
	import TaskActivityLog from './TaskActivityLog.svelte';

	import { apiClient } from '$lib/api/client';
	import { taskIdMappingStore } from '$lib/stores/taskIdMappingStore';
	import { calculateEffortDays, getHolidays } from '$lib/utils/dateCalculator';

	/** 詳細表示中のタスク */
	export let task: WbsTask | null = null;

	/** メンバー一覧 */
	export let users: Array<{ id: number; username: string; fullName: string }> = [];

	/** コメント一覧 */
	export let comments: Array<any> = [];

	/** 添付ファイル一覧 */
	export let attachments: Array<any> = [];

	/** アクティビティ一覧 */
	export let activities: Array<any> = [];

	/** 現在のユーザーID */
	export let currentUserId: number | null = null;

	/** プロジェクトID */
	export let projectId: number;

	const dispatch = createEventDispatcher();

	/** 現在のタブ */
	let currentTab: 'details' | 'comments' | 'attachments' | 'activity' = 'details';

	/** 説明の編集モードフラグ */
	let isEditingDescription = false;

	/** 編集中の説明テキスト */
	let editedDescription = '';

	/** タスクのデータベースID（フロントエンドIDからマッピング） */
	let taskDatabaseId: number | null = null;

	/** マークダウンをHTMLに変換 */
	$: descriptionHtml = task?.description ? marked.parse(task.description) : '';

	/** タスクが変更されたらタブを詳細に戻す */
	$: if (task) {
		currentTab = 'details';

		// データベースIDを取得
		loadTaskDatabaseId();
	}

	/** タスクのデータベースIDを取得 */
	function loadTaskDatabaseId() {
		if (!task) return;

		// ストアからIDマッピングを取得
		const mapping = get(taskIdMappingStore);
		taskDatabaseId = mapping.get(task.id) ?? null;

		if (taskDatabaseId) {
			console.log(`タスク ${task.name} のデータベースID: ${taskDatabaseId}`);
		} else {
			console.warn(`タスク ${task.name} (ID: ${task.id}) のデータベースIDが見つかりません`);
		}
	}

	/** ファイルアップロード処理 */
	async function handleFileUpload(taskId: number, file: File): Promise<void> {
		// APIクライアントを使ってファイルをアップロード
		await apiClient.uploadTaskAttachment(taskId, file);

		// 親コンポーネントに添付ファイル一覧の再読み込みを通知
		dispatch('uploadComplete', { taskId });
	}

	/** ファイルダウンロード処理 */
	function handleFileDownload(event: CustomEvent<{ attachmentId: number; fileName: string }>) {
		// 親コンポーネントにダウンロードイベントを転送
		dispatch('downloadFile', event.detail);
	}

	/** 指定フィールドを更新する */
	async function updateField<K extends keyof WbsTask>(field: K, value: WbsTask[K]) {
		if (!task) return;

		// ローカルストアを更新
		updateTask(task.id, (current) => ({ ...current, [field]: value }));

		// バックエンドAPIに保存
		await saveTaskToBackend(field, value);
	}

	/** タスクをバックエンドAPIに保存 */
	async function saveTaskToBackend<K extends keyof WbsTask>(field: K, value: WbsTask[K]) {
		if (!task || !taskDatabaseId) {
			console.warn('タスクのデータベースIDが見つかりません。保存をスキップします。');
			return;
		}

		try {
			// フィールドに応じてペイロードを構築
			const payload: any = {};

			switch (field) {
				case 'name':
					payload.title = value;
					break;
				case 'assignee':
					// 担当者名からユーザーIDを取得
					const user = users.find((u) => u.fullName === value || u.username === value);
					if (user) {
						payload.assigneeUserId = user.id;
					}
					break;
				case 'description':
					payload.description = value;
					break;
				case 'startDate':
					payload.startDate = value;
					break;
				case 'endDate':
					payload.endDate = value;
					break;
				case 'actualStartDate':
					payload.actualStartDate = value;
					break;
				case 'actualEndDate':
					payload.actualEndDate = value;
					break;
				case 'status':
					// DBの制約に合わせてステータスを変換
					const statusMap: Record<string, string> = {
						'not-started': 'todo',
						planning: 'todo',
						'in-progress': 'in_progress',
						'in-review': 'in_progress',
						blocked: 'in_progress',
						completed: 'completed'
					};
					payload.status = statusMap[value as string] || value;
					break;
				case 'priority':
					payload.priority = value;
					break;
				case 'progress':
					payload.progress = value;
					break;
				case 'effortDays':
					payload.estimatedMinutes = (value as number) * 8 * 60;
					break;
				case 'deliverable':
					payload.deliverable = value;
					break;
				case 'notes':
					payload.notes = value;
					break;
				default:
					// その他のフィールドは保存しない
					return;
			}

			// PATCHメソッドで部分更新
			await apiClient.patch(`/tasks/${taskDatabaseId}`, payload);
			console.log(`タスク ${task.name} のフィールド ${String(field)} を保存しました`);
		} catch (error) {
			console.error('タスクの保存に失敗:', error);
			alert(
				`タスクの保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/** 日付入力のハンドラー（予定日変更時は工数を自動計算） */
	async function handleDateChange(
		field: 'startDate' | 'endDate' | 'actualStartDate' | 'actualEndDate',
		event: Event
	) {
		if (!task) return;

		const newValue = (event.target as HTMLInputElement).value || undefined;

		// ローカルストアを更新
		updateTask(task.id, (current) => ({ ...current, [field]: newValue }));

		// 予定日（startDate または endDate）の変更時は工数を自動計算
		if (field === 'startDate' || field === 'endDate') {
			const currentStartDate = field === 'startDate' ? newValue : task.startDate;
			const currentEndDate = field === 'endDate' ? newValue : task.endDate;

			if (currentStartDate && currentEndDate) {
				try {
					// 祝日データを取得して営業日数を計算
					const holidays = await getHolidays(apiClient);
					const effortDays = calculateEffortDays(currentStartDate, currentEndDate, holidays);

					// 工数をローカルストアに更新
					updateTask(task.id, (current) => ({ ...current, effortDays }));

					// バックエンドAPIに日付と工数を保存
					await saveTaskDatesWithEffort(currentStartDate, currentEndDate, effortDays);
				} catch (error) {
					console.error('工数の自動計算に失敗:', error);
					// エラー時は日付のみ保存
					await saveTaskToBackend(field, newValue);
				}
			} else {
				// 開始日または終了日が未設定の場合は日付のみ保存
				await saveTaskToBackend(field, newValue);
			}
		} else {
			// 実績日の場合はそのまま保存
			await saveTaskToBackend(field, newValue);
		}
	}

	/** 日付と工数をまとめてバックエンドAPIに保存 */
	async function saveTaskDatesWithEffort(startDate: string, endDate: string, effortDays: number) {
		if (!task || !taskDatabaseId) {
			console.warn('タスクのデータベースIDが見つかりません。保存をスキップします。');
			return;
		}

		try {
			const payload = {
				startDate,
				endDate,
				estimatedMinutes: effortDays * 8 * 60 // 工数（日）を分に変換
			};

			await apiClient.patch(`/tasks/${taskDatabaseId}`, payload);
			console.log(
				`タスク ${task.name} の日付と工数を保存しました: ${startDate} - ${endDate}, ${effortDays}日`
			);
		} catch (error) {
			console.error('タスクの保存に失敗:', error);
			alert(
				`タスクの保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/** タグ編集のハンドラー */
	function handleTags(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		const tagList = value
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0);
		updateField('tags', tagList.length > 0 ? tagList : undefined);
	}

	/** 説明編集モードを開始 */
	function startEditingDescription() {
		editedDescription = task?.description || '';
		isEditingDescription = true;
	}

	/** 説明編集を保存 */
	function saveDescription() {
		updateField('description', editedDescription || undefined);
		isEditingDescription = false;
	}

	/** 説明編集をキャンセル */
	function cancelEditDescription() {
		isEditingDescription = false;
	}

	/** AI説明生成を要求 */
	function requestGenerateDescription() {
		if (!task) return;
		dispatch('generateDescription', task.id);
	}

	/** モーダルを閉じる */
	function closeModal() {
		dispatch('close');
	}

	/** バックドロップクリックでモーダルを閉じる */
	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeModal();
		}
	}
</script>

{#if task}
	<!-- Modal Backdrop -->
	<div class="modal-backdrop" on:click={handleBackdropClick} role="presentation">
		<!-- Modal Container -->
		<aside
			class="detail-panel modal-panel"
			on:click|stopPropagation
			role="dialog"
			aria-modal="true"
		>
			<header>
				<div class="header-content">
					<div class="header-text">
						<h2>タスク詳細</h2>
						<p>フィールドを編集すると即座にWBSへ反映されます。</p>
					</div>
					<button type="button" class="close-button" on:click={closeModal} aria-label="閉じる">
						<i class="bi bi-x-lg"></i>
					</button>
				</div>
			</header>
			<div class="tabs">
				<button
					type="button"
					class="tab"
					class:active={currentTab === 'details'}
					on:click={() => (currentTab = 'details')}
				>
					<i class="bi bi-info-circle"></i>
					詳細
				</button>
				<button
					type="button"
					class="tab"
					class:active={currentTab === 'comments'}
					on:click={() => (currentTab = 'comments')}
				>
					<i class="bi bi-chat-left-text"></i>
					コメント
					{#if comments.length > 0}
						<span class="badge">{comments.length}</span>
					{/if}
				</button>
				<button
					type="button"
					class="tab"
					class:active={currentTab === 'attachments'}
					on:click={() => (currentTab = 'attachments')}
				>
					<i class="bi bi-paperclip"></i>
					添付
					{#if attachments.length > 0}
						<span class="badge">{attachments.length}</span>
					{/if}
				</button>
				<button
					type="button"
					class="tab"
					class:active={currentTab === 'activity'}
					on:click={() => (currentTab = 'activity')}
				>
					<i class="bi bi-clock-history"></i>
					履歴
				</button>
			</div>

			<div class="tab-content">
				{#if currentTab === 'details'}
					<div class="form">
						<label>
							<span>タスク名</span>
							<input
								type="text"
								value={task.name}
								on:change={(event) => updateField('name', (event.target as HTMLInputElement).value)}
							/>
						</label>

						<div class="description-section">
							<div class="section-header">
								<span>詳細説明</span>
								<button
									type="button"
									class="btn-generate-ai"
									on:click={requestGenerateDescription}
									title="AIで説明を生成"
								>
									<i class="bi bi-stars"></i>
									AI生成
								</button>
							</div>

							{#if isEditingDescription}
								<textarea
									rows="12"
									bind:value={editedDescription}
									placeholder="タスクの詳細説明を入力してください..."
									class="description-textarea"
								></textarea>
								<div class="edit-actions">
									<button type="button" class="btn-save" on:click={saveDescription}>
										<i class="bi bi-check-lg"></i>
										保存
									</button>
									<button type="button" class="btn-cancel" on:click={cancelEditDescription}>
										<i class="bi bi-x-lg"></i>
										キャンセル
									</button>
								</div>
							{:else if task.description}
								<div
									class="markdown-content"
									on:click={startEditingDescription}
									role="button"
									tabindex="0"
								>
									{@html descriptionHtml}
								</div>
								<button type="button" class="btn-edit" on:click={startEditingDescription}>
									<i class="bi bi-pencil"></i>
									編集
								</button>
							{:else}
								<div
									class="empty-description"
									on:click={startEditingDescription}
									role="button"
									tabindex="0"
								>
									<i class="bi bi-file-text"></i>
									<p>説明がありません</p>
									<p class="hint">クリックして入力するか、AI生成ボタンで自動生成できます</p>
								</div>
							{/if}
						</div>

						<label>
							<span>担当者</span>
							<select
								value={task.assignee ?? ''}
								on:change={(event) =>
									updateField('assignee', (event.target as HTMLSelectElement).value || undefined)}
							>
								<option value="">未割り当て</option>
								{#each users as user (user.id)}
									<option value={user.fullName}>{user.fullName} (@{user.username})</option>
								{/each}
							</select>
						</label>

						<div class="grid two">
							<label>
								<span>開始日</span>
								<input
									type="date"
									value={task.startDate ?? ''}
									on:change={(event) => handleDateChange('startDate', event)}
								/>
							</label>
							<label>
								<span>終了日</span>
								<input
									type="date"
									value={task.endDate ?? ''}
									on:change={(event) => handleDateChange('endDate', event)}
								/>
							</label>
						</div>

						<div class="grid two">
							<label>
								<span>実績開始日</span>
								<input
									type="date"
									value={task.actualStartDate ?? ''}
									on:change={(event) => handleDateChange('actualStartDate', event)}
								/>
							</label>
							<label>
								<span>実績終了日</span>
								<input
									type="date"
									value={task.actualEndDate ?? ''}
									on:change={(event) => handleDateChange('actualEndDate', event)}
								/>
							</label>
						</div>

						<div class="grid two">
							<label>
								<span>ステータス</span>
								<select
									value={task.status ?? 'not-started'}
									on:change={(event) =>
										updateField(
											'status',
											(event.target as HTMLSelectElement).value as WbsTask['status']
										)}
								>
									<option value="not-started">未着手</option>
									<option value="planning">計画中</option>
									<option value="in-progress">進行中</option>
									<option value="in-review">レビュー待ち</option>
									<option value="blocked">ブロック中</option>
									<option value="completed">完了</option>
								</select>
							</label>
							<label>
								<span>優先度</span>
								<select
									value={task.priority ?? 'medium'}
									on:change={(event) =>
										updateField(
											'priority',
											(event.target as HTMLSelectElement).value as WbsTask['priority']
										)}
								>
									<option value="high">高</option>
									<option value="medium">中</option>
									<option value="low">低</option>
									<option value="none">なし</option>
								</select>
							</label>
						</div>

						<label>
							<span>想定工数（日）</span>
							<div class="readonly-field-wrapper">
								<input
									type="number"
									min="0"
									value={task.effortDays ?? ''}
									readonly
									class="readonly-input"
									title="工数は開始日と終了日から自動計算されます"
								/>
								<span class="auto-calc-label">
									<i class="bi bi-calculator"></i>
									自動計算
								</span>
							</div>
						</label>

						<div class="grid two">
							<label>
								<span>進捗率（%）</span>
								<input
									type="number"
									min="0"
									max="100"
									value={task.progress ?? 0}
									on:change={(event) =>
										updateField(
											'progress',
											(event.target as HTMLInputElement).value
												? Number((event.target as HTMLInputElement).value)
												: 0
										)}
								/>
							</label>
						</div>

						<label>
							<span>成果物</span>
							<textarea
								rows="2"
								value={task.deliverable ?? ''}
								on:change={(event) =>
									updateField(
										'deliverable',
										(event.target as HTMLTextAreaElement).value || undefined
									)}
							></textarea>
						</label>

						<label>
							<span>タグ（カンマ区切り）</span>
							<input
								type="text"
								value={task.tags?.join(', ') ?? ''}
								on:change={handleTags}
								placeholder="例: フロントエンド, バックエンド, デザイン"
							/>
						</label>

						<label>
							<span>備考</span>
							<textarea
								rows="3"
								value={task.notes ?? ''}
								on:change={(event) =>
									updateField('notes', (event.target as HTMLTextAreaElement).value || undefined)}
							></textarea>
						</label>
					</div>
				{:else if currentTab === 'comments'}
					<TaskCommentSection {task} {comments} {currentUserId} on:addComment on:deleteComment />
				{:else if currentTab === 'attachments'}
					<TaskAttachmentSection
						{task}
						{attachments}
						uploadFunction={handleFileUpload}
						on:uploadComplete
						on:downloadFile={handleFileDownload}
					/>
				{:else if currentTab === 'activity'}
					<TaskActivityLog {task} {activities} />
				{/if}
			</div>
		</aside>
	</div>
{/if}

<style>
	/* Modal Backdrop */
	.modal-backdrop {
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
		padding: 20px;
		backdrop-filter: blur(4px);
	}

	/* Modal Panel */
	.detail-panel.modal-panel {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 18px;
		padding: 0;
		display: flex;
		flex-direction: column;
		max-width: 900px;
		max-height: 90vh;
		width: 100%;
		box-shadow:
			0 20px 25px -5px rgba(0, 0, 0, 0.1),
			0 10px 10px -5px rgba(0, 0, 0, 0.04);
		overflow: hidden;
	}

	.detail-panel {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 18px;
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 320px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	}

	/* Modal Header */
	.modal-panel header {
		padding: 24px;
		border-bottom: 1px solid #e5e7eb;
		flex-shrink: 0;
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
	}

	.header-text {
		flex: 1;
	}

	header h2 {
		margin: 0;
		font-size: 18px;
		color: #111827;
	}

	header p {
		margin: 6px 0 0;
		font-size: 12px;
		color: #6b7280;
	}

	/* Close Button */
	.close-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		border-radius: 8px;
		background: #f3f4f6;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.close-button:hover {
		background: #e5e7eb;
		color: #111827;
	}

	.close-button i {
		font-size: 16px;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		color: #9ca3af;
	}

	input,
	textarea,
	select {
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		color: #111827;
		padding: 10px 12px;
		font-size: 13px;
		transition:
			border 0.2s ease,
			box-shadow 0.2s ease;
	}

	input:focus,
	textarea:focus,
	select:focus {
		border-color: #3b82f6;
		outline: none;
		box-shadow: 0 0 0 3px #dbeafe;
	}

	.grid.two {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.empty {
		padding: 36px 16px;
		text-align: center;
		color: #6b7280;
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
	}

	.empty i {
		font-size: 28px;
		color: #9ca3af;
	}

	.error-message {
		margin-top: 8px;
		padding: 10px 12px;
		background: #fee2e2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #dc2626;
		font-size: 12px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.error-message i {
		font-size: 14px;
	}

	.hint-text {
		margin-top: 6px;
		padding: 8px 10px;
		background: #dbeafe;
		border: 1px solid #bfdbfe;
		border-radius: 8px;
		color: #1e40af;
		font-size: 11px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.hint-text i {
		font-size: 12px;
	}

	@media (max-width: 768px) {
		.grid.two {
			grid-template-columns: 1fr;
		}
	}

	/* 説明セクション */
	.description-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		color: #9ca3af;
	}

	.btn-generate-ai {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 8px;
		background: linear-gradient(135deg, #8b5cf6, #6366f1);
		border: none;
		color: #ffffff;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.btn-generate-ai:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
	}

	.btn-generate-ai i {
		font-size: 14px;
	}

	.description-textarea {
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		color: #111827;
		padding: 12px;
		font-size: 13px;
		font-family: inherit;
		resize: vertical;
		min-height: 200px;
	}

	.description-textarea:focus {
		border-color: #3b82f6;
		outline: none;
		box-shadow: 0 0 0 3px #dbeafe;
	}

	.markdown-content {
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		background: #ffffff;
		padding: 16px;
		font-size: 13px;
		line-height: 1.6;
		color: #374151;
		cursor: pointer;
		transition: border-color 0.2s ease;
		min-height: 100px;
		max-height: 400px;
		overflow-y: auto;
	}

	.markdown-content:hover {
		border-color: #3b82f6;
	}

	.markdown-content :global(h1),
	.markdown-content :global(h2),
	.markdown-content :global(h3) {
		margin-top: 16px;
		margin-bottom: 8px;
		color: #111827;
	}

	.markdown-content :global(h1) {
		font-size: 18px;
	}

	.markdown-content :global(h2) {
		font-size: 16px;
	}

	.markdown-content :global(h3) {
		font-size: 14px;
	}

	.markdown-content :global(p) {
		margin: 8px 0;
	}

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		margin: 8px 0;
		padding-left: 24px;
	}

	.markdown-content :global(code) {
		background: #f3f4f6;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
	}

	.markdown-content :global(pre) {
		background: #1f2937;
		color: #f9fafb;
		padding: 12px;
		border-radius: 8px;
		overflow-x: auto;
		margin: 8px 0;
	}

	.markdown-content :global(blockquote) {
		border-left: 3px solid #3b82f6;
		padding-left: 12px;
		margin: 8px 0;
		color: #6b7280;
	}

	.empty-description {
		border-radius: 12px;
		border: 2px dashed #d1d5db;
		background: #f9fafb;
		padding: 32px 16px;
		text-align: center;
		color: #9ca3af;
		cursor: pointer;
		transition:
			border-color 0.2s ease,
			background 0.2s ease;
	}

	.empty-description:hover {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.empty-description i {
		font-size: 32px;
		margin-bottom: 12px;
		color: #d1d5db;
	}

	.empty-description p {
		margin: 4px 0;
		font-size: 13px;
	}

	.empty-description .hint {
		font-size: 11px;
		color: #9ca3af;
	}

	.edit-actions {
		display: flex;
		gap: 8px;
	}

	.btn-save,
	.btn-cancel,
	.btn-edit {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: 8px;
		border: none;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.btn-save {
		background: #10b981;
		color: #ffffff;
	}

	.btn-save:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
	}

	.btn-cancel {
		background: #ef4444;
		color: #ffffff;
	}

	.btn-cancel:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
	}

	.btn-edit {
		background: #3b82f6;
		color: #ffffff;
		margin-top: 8px;
	}

	.btn-edit:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	/* タブナビゲーション */
	.tabs {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid #e5e7eb;
		padding-bottom: 2px;
		margin-bottom: 16px;
	}

	/* Modal Tabs */
	.modal-panel .tabs {
		padding: 0 24px;
		margin-bottom: 0;
		flex-shrink: 0;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border: none;
		background: transparent;
		color: #6b7280;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		border-radius: 8px 8px 0 0;
		transition: all 0.2s ease;
		position: relative;
	}

	.tab:hover {
		background: #f9fafb;
		color: #374151;
	}

	.tab.active {
		color: #3b82f6;
		background: #eff6ff;
	}

	.tab.active::after {
		content: '';
		position: absolute;
		bottom: -2px;
		left: 0;
		right: 0;
		height: 2px;
		background: #3b82f6;
	}

	.tab i {
		font-size: 14px;
	}

	.tab .badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: #3b82f6;
		color: #ffffff;
		font-size: 10px;
		font-weight: 600;
	}

	.tab.active .badge {
		background: #1d4ed8;
	}

	.tab-content {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	/* Modal Tab Content */
	.modal-panel .tab-content {
		padding: 24px;
		overflow-y: auto;
		flex: 1;
	}

	/* カスタムフィールド */
	.custom-fields-section {
		margin-top: 24px;
		padding-top: 24px;
		border-top: 2px solid #e5e7eb;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 16px 0;
		font-size: 15px;
		font-weight: 600;
		color: #374151;
	}

	.section-title i {
		color: #3b82f6;
	}

	.custom-fields-grid {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.custom-field-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.custom-field-item > span {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.required-mark {
		color: #ef4444;
		margin-left: 4px;
	}

	.checkbox-wrapper {
		display: flex;
		align-items: center;
		padding: 10px 0;
	}

	.checkbox-wrapper input[type='checkbox'] {
		width: 20px;
		height: 20px;
		cursor: pointer;
	}

	/* 読み取り専用フィールド */
	.readonly-field-wrapper {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.readonly-input {
		background: #f3f4f6 !important;
		color: #6b7280 !important;
		cursor: not-allowed;
		border-color: #e5e7eb !important;
	}

	.readonly-input:focus {
		border-color: #e5e7eb !important;
		box-shadow: none !important;
	}

	.auto-calc-label {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		color: #9ca3af;
		padding: 2px 0;
	}

	.auto-calc-label i {
		font-size: 11px;
		color: #3b82f6;
	}
</style>
