<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	/** プロジェクト編集用のデータ */
	export let project: {
		id: number;
		project_name: string;
		description: string;
		start_date: string;
		end_date: string;
		team_structure: string;
		main_deliverable?: string;
		milestone?: string;
		member_ids?: number[];
	};

	/** メンバー一覧 */
	export let users: Array<{ id: number; username: string; fullName: string }> = [];

	const dispatch = createEventDispatcher();

	/** 編集中のプロジェクト情報 */
	let editingProject = { ...project };

	/** 選択されたメンバーIDの配列 */
	let selectedMemberIds: number[] = project.member_ids || [];

	$: if (project) {
		console.log('[ProjectEditModal] Project updated:', project);
		console.log('[ProjectEditModal] Member IDs:', project.member_ids);
		editingProject = { ...project };
		// 初期化時だけでなく、projectプロパティが更新された場合も反映する
		// ただしユーザーの編集操作を妨げないよう、member_idsが変更された場合のみ同期するのが理想だが、
		// 今回はモーダルが開くたびにデータが渡される想定のため、project.member_idsで上書きする。
		if (project.member_ids) {
			selectedMemberIds = project.member_ids;
		}
	}

	/** モーダルを閉じる */
	function handleClose() {
		dispatch('close');
	}

	/** プロジェクト情報を保存する */
	function handleSave() {
		dispatch('save', {
			...editingProject,
			selectedMemberIds
		});
	}

	/** メンバー追加用の選択中ユーザーID */
	let userIdToAdd: number | null = null;

	/** 選択されていない（追加可能な）ユーザー一覧 */
	$: availableUsers = users.filter((u) => !selectedMemberIds.includes(u.id));

	/** 選択されている（表示中の）ユーザー一覧 */
	$: selectedUsers = users.filter((u) => selectedMemberIds.includes(u.id));

	/** メンバーを追加 */
	function addMember() {
		if (userIdToAdd && !selectedMemberIds.includes(userIdToAdd)) {
			selectedMemberIds = [...selectedMemberIds, userIdToAdd];
			userIdToAdd = null; // Reset selection
		}
	}

	/** メンバーを削除 */
	function removeMember(memberId: number) {
		selectedMemberIds = selectedMemberIds.filter((id) => id !== memberId);
	}
</script>

<div class="modal-backdrop" on:click={handleClose} role="presentation">
	<div class="modal-window" on:click|stopPropagation role="dialog" aria-modal="true">
		<header>
			<h2>プロジェクト情報を編集</h2>
			<button type="button" class="close-btn" on:click={handleClose} aria-label="閉じる">
				<i class="bi bi-x-lg"></i>
			</button>
		</header>

		<div class="content">
			<label>
				<span>プロジェクト名</span>
				<input type="text" bind:value={editingProject.project_name} />
			</label>

			<label>
				<span>プロジェクト目標</span>
				<textarea rows="3" bind:value={editingProject.description}></textarea>
			</label>

			<div class="grid two">
				<label>
					<span>開始日</span>
					<input type="date" bind:value={editingProject.start_date} />
				</label>
				<label>
					<span>終了日</span>
					<input type="date" bind:value={editingProject.end_date} />
				</label>
			</div>

			<label>
				<span>チーム体制</span>
				<input type="text" bind:value={editingProject.team_structure} />
			</label>

			<div class="grid two">
				<label>
					<span>主要成果物</span>
					<input
						type="text"
						bind:value={editingProject.main_deliverable}
						placeholder="例: Webアプリケーション、API仕様書"
					/>
				</label>
				<label>
					<span>主要マイルストーン</span>
					<input
						type="text"
						bind:value={editingProject.milestone}
						placeholder="例: β版リリース、本番リリース"
					/>
				</label>
			</div>

			<div class="members-section">
				<h3>プロジェクトメンバー</h3>

				<!-- メンバー追加エリア -->
				<div class="add-member-row">
					<select bind:value={userIdToAdd} class="member-select">
						<option value={null}>ユーザーを選択して追加...</option>
						{#each availableUsers as user}
							<option value={user.id}>{user.fullName} (@{user.username})</option>
						{/each}
					</select>
					<button type="button" class="btn-add" disabled={!userIdToAdd} on:click={addMember}>
						<i class="bi bi-plus-lg"></i>
						追加
					</button>
				</div>

				<!-- メンバーリスト -->
				<div class="members-list">
					{#if selectedUsers.length === 0}
						<div class="empty-members">メンバーが選択されていません</div>
					{:else}
						{#each selectedUsers as user (user.id)}
							<div class="member-item">
								<div class="member-info">
									<span class="member-name">{user.fullName}</span>
									<span class="member-username">@{user.username}</span>
								</div>
								<button
									type="button"
									class="btn-remove"
									on:click={() => removeMember(user.id)}
									title="削除"
								>
									<i class="bi bi-trash"></i>
								</button>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>

		<footer>
			<button type="button" class="btn cancel" on:click={handleClose}>キャンセル</button>
			<button type="button" class="btn primary" on:click={handleSave}>保存</button>
		</footer>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 2000;
		backdrop-filter: blur(4px);
	}

	.modal-window {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
		width: 90%;
		max-width: 900px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 22px 26px;
		border-bottom: 1px solid #e5e7eb;
	}

	header h2 {
		margin: 0;
		font-size: 20px;
		color: #111827;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: #9ca3af;
		font-size: 18px;
		cursor: pointer;
		padding: 6px;
		border-radius: 8px;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.content {
		padding: 24px 26px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 13px;
		color: #6b7280;
	}

	input,
	textarea,
	select {
		border-radius: 12px;
		border: 1px solid #d1d5db;
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
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.grid.two {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}

	.members-section {
		margin-top: 10px;
	}

	.members-section h3 {
		margin: 0 0 12px;
		font-size: 15px;
		color: #111827;
	}

	.add-member-row {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
	}

	.member-select {
		flex: 1;
	}

	.btn-add {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 16px;
		background: #eff6ff;
		color: #3b82f6;
		border: 1px solid #dbeafe;
		border-radius: 12px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-add:hover:not(:disabled) {
		background: #dbeafe;
		border-color: #bfdbfe;
	}

	.btn-add:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		background: #f3f4f6;
		color: #9ca3af;
		border-color: #e5e7eb;
	}

	.members-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		max-height: 200px;
		overflow-y: auto;
	}

	.empty-members {
		text-align: center;
		color: #9ca3af;
		font-size: 13px;
		padding: 12px;
	}

	.member-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	.member-info {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.member-name {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.member-username {
		font-size: 12px;
		color: #9ca3af;
	}

	.btn-remove {
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition:
			color 0.2s ease,
			background 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-remove:hover {
		color: #ef4444;
		background: #fee2e2;
	}

	footer {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		padding: 18px 26px;
		border-top: 1px solid #e5e7eb;
	}

	.btn {
		padding: 10px 20px;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
		transition:
			transform 0.2s ease,
			opacity 0.2s ease;
	}

	.btn.cancel {
		background: transparent;
		border-color: #d1d5db;
		color: #374151;
	}

	.btn.cancel:hover {
		border-color: #9ca3af;
	}

	.btn.primary {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		color: #ffffff;
	}

	.btn.primary:hover {
		transform: translateY(-1px);
	}

	@media (max-width: 768px) {
		.grid.two {
			grid-template-columns: 1fr;
		}
	}
</style>
