<script lang="ts">
	import { projectDetails, currentPhase } from '$lib/stores/wbsBuilderStore';
	import { createEventDispatcher } from 'svelte';
	import { get } from 'svelte/store';

	const dispatch = createEventDispatcher();

	export let isOpen = false;
	export let members: Array<{ id: number; username: string; fullName: string }> = [];

	// Local form state
	let formData = {
		projectName: '',
		description: '',
		goal: '',
		startDate: '',
		endDate: '',
		constraints: '',
		teamMembers: [] as number[]
	};

	// Load from store when modal opens
	$: if (isOpen) {
		const current = get(projectDetails);
		formData = { ...current };
	}

	// Validation
	$: isValid =
		formData.projectName.trim() !== '' &&
		formData.goal.trim() !== '' &&
		formData.startDate !== '' &&
		formData.endDate !== '';

	function handleSubmit() {
		if (!isValid) return;

		// Save to store
		projectDetails.set(formData);

		// Move to next phase
		currentPhase.set('major');

		// Notify parent
		dispatch('submit', formData);
	}

	function handleCancel() {
		dispatch('cancel');
	}
</script>

{#if isOpen}
	<div class="modal-overlay" on:click={handleCancel}>
		<div class="modal-content" on:click|stopPropagation>
			<div class="modal-header">
				<h2>プロジェクト基本情報</h2>
				<button class="close-btn" on:click={handleCancel}>
					<i class="bi bi-x-lg"></i>
				</button>
			</div>

			<div class="modal-body">
				<div class="form-group">
					<label for="project-name">
						プロジェクト名 <span class="required">*</span>
					</label>
					<input
						id="project-name"
						type="text"
						bind:value={formData.projectName}
						placeholder="例: ECサイト新規構築プロジェクト"
					/>
				</div>

				<div class="form-group">
					<label for="project-goal">
						プロジェクトの目的・ゴール <span class="required">*</span>
					</label>
					<textarea
						id="project-goal"
						bind:value={formData.goal}
						placeholder="例: ECサイトの新規構築。商品管理、在庫管理、決済機能を実装する"
						rows="3"
					></textarea>
				</div>

				<div class="form-group">
					<label for="description">説明</label>
					<textarea
						id="description"
						bind:value={formData.description}
						placeholder="プロジェクトの概要や背景を記入"
						rows="2"
					></textarea>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="start-date">
							開始日 <span class="required">*</span>
						</label>
						<input id="start-date" type="date" bind:value={formData.startDate} />
					</div>

					<div class="form-group">
						<label for="end-date">
							終了日 <span class="required">*</span>
						</label>
						<input id="end-date" type="date" bind:value={formData.endDate} />
					</div>
				</div>

				<div class="form-group">
					<label for="constraints">制約・特記事項</label>
					<textarea
						id="constraints"
						bind:value={formData.constraints}
						placeholder="例: 3ヶ月以内に完了、既存システムとの連携が必要"
						rows="2"
					></textarea>
				</div>

				<div class="form-group">
					<label>チームメンバー</label>
					<div class="members-list">
						{#each members as member (member.id)}
							<label class="checkbox-item">
								<input type="checkbox" value={member.id} bind:group={formData.teamMembers} />
								<span>{member.fullName || member.username}</span>
							</label>
						{/each}
					</div>
				</div>
			</div>

			<div class="modal-footer">
				<button class="secondary-button" on:click={handleCancel}> キャンセル </button>
				<button class="primary-button" on:click={handleSubmit} disabled={!isValid}>
					WBS生成を開始
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
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
	}

	.modal-content {
		background: #ffffff;
		border-radius: 16px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		max-width: 700px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px 28px;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		color: #111827;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: transparent;
		color: #6b7280;
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 28px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	label {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.required {
		color: #dc2626;
	}

	input[type='text'],
	input[type='date'],
	textarea {
		padding: 12px 16px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		background: #f9fafb;
		color: #111827;
		font-size: 14px;
		font-family: inherit;
		transition: all 0.2s ease;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		background: #ffffff;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	textarea {
		resize: vertical;
		min-height: 60px;
	}

	.members-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 12px;
		padding: 16px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		max-height: 200px;
		overflow-y: auto;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font-size: 14px;
		color: #374151;
	}

	.checkbox-item input[type='checkbox'] {
		cursor: pointer;
		width: 18px;
		height: 18px;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 20px 28px;
		border-top: 1px solid #e5e7eb;
	}

	.primary-button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		border-radius: 8px;
		border: none;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.primary-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.primary-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.secondary-button {
		padding: 12px 24px;
		border-radius: 8px;
		border: 1px solid #d1d5db;
		background: transparent;
		color: #374151;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.secondary-button:hover {
		background: #f9fafb;
	}
</style>
