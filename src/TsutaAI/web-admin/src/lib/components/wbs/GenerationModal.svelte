<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	/** AI生成に渡すプロジェクト情報 */
	export let payload: {
		project_name: string;
		project_goal: string;
		duration: string;
		start_date?: string;
		end_date?: string;
		team_structure: string;
		constraints: string;
		main_deliverable?: string;
		milestone?: string;
	};

	/** プロジェクトメンバー情報 */
	export let teamMembers: Array<{
		id: number;
		fullName: string;
		role: string;
		skills?: Array<{ skillName: string; skillLevel: number }>;
	}> = [];

	const dispatch = createEventDispatcher();

	/** モーダルを閉じる */
	function close() {
		dispatch('close');
	}

	/** フォーム送信を処理する */
	function handleSubmit() {
		dispatch('generate', { ...payload, team_members: teamMembers });
	}
</script>

<div
	class="overlay"
	role="presentation"
	tabindex="-1"
	on:click={close}
	on:keydown={(event) => {
		if (event.key === 'Escape') {
			close();
		}
	}}
>
	<div
		class="modal-window"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		on:click|stopPropagation
		on:keydown|stopPropagation
	>
		<header>
			<div>
				<h3>AIでWBSを生成</h3>
				<p>プロジェクト情報を確認し、WBS生成のための補足指示を追加できます。</p>
				<p class="note">
					基本情報を変更したい場合は、先に「プロジェクト情報を編集」から修正してください。
				</p>
			</div>
			<button type="button" class="close" on:click={close} aria-label="閉じる">
				<i class="bi bi-x-lg"></i>
			</button>
		</header>

		<form class="form" on:submit|preventDefault={handleSubmit}>
			<div class="section-title">プロジェクト基本情報（確認用）</div>

			<div class="readonly-field">
				<span class="label">プロジェクト名</span>
				<div class="value">{payload.project_name || '未設定'}</div>
			</div>

			<div class="readonly-field">
				<span class="label">プロジェクトの目標</span>
				<div class="value">{payload.project_goal || '未設定'}</div>
			</div>

			<div class="grid two">
				<div class="readonly-field">
					<span class="label">想定期間</span>
					<div class="value">{payload.duration || '未設定'}</div>
				</div>
				<div class="readonly-field">
					<span class="label">チーム構成</span>
					<div class="value">{payload.team_structure || '未設定'}</div>
				</div>
			</div>

			<div class="grid two">
				<div class="readonly-field">
					<span class="label">主要成果物</span>
					<div class="value">{payload.main_deliverable || '未設定'}</div>
				</div>
				<div class="readonly-field">
					<span class="label">主要マイルストーン</span>
					<div class="value">{payload.milestone || '未設定'}</div>
				</div>
			</div>

			<div class="divider"></div>

			<div class="section-title">WBS生成のための補足指示</div>

			<label>
				<span>制約・リスク・補足</span>
				<textarea
					rows="4"
					bind:value={payload.constraints}
					placeholder="例: セキュリティレビューを各フェーズに含める。既存CRMとの連携が必須。UIデザインはブランドガイドラインに準拠。"
				></textarea>
			</label>

			<div class="actions">
				<button type="button" class="btn ghost" on:click={close}>キャンセル</button>
				<button type="submit" class="btn primary">
					<i class="bi bi-robot"></i>
					WBSを生成
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		padding: 20px;
	}

	.modal-window {
		width: 90%;
		max-width: 900px;
		border-radius: 24px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		padding: 28px 32px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	header {
		display: flex;
		justify-content: space-between;
		gap: 16px;
	}

	header h3 {
		margin: 0;
		font-size: 20px;
		color: #111827;
	}

	header p {
		margin: 8px 0 0;
		font-size: 13px;
		color: #6b7280;
		line-height: 1.6;
	}

	header p.note {
		margin: 4px 0 0;
		font-size: 12px;
		color: #f59e0b;
		background: #fef3c7;
		padding: 6px 10px;
		border-radius: 6px;
		display: inline-block;
	}

	.close {
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 12px;
		color: #9ca3af;
	}

	input,
	textarea {
		border-radius: 14px;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		color: #111827;
		padding: 12px 14px;
		font-size: 13px;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px #dbeafe;
	}

	.grid.two {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}

	.section-title {
		font-size: 14px;
		font-weight: 700;
		color: #111827;
		margin-top: 8px;
		padding-bottom: 8px;
		border-bottom: 2px solid #e5e7eb;
	}

	.readonly-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px;
		background: #f9fafb;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
	}

	.readonly-field .label {
		font-size: 11px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.readonly-field .value {
		font-size: 13px;
		color: #111827;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.divider {
		height: 1px;
		background: #e5e7eb;
		margin: 8px 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		margin-top: 8px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.btn.ghost {
		background: transparent;
		color: #6b7280;
		border-color: #e5e7eb;
	}

	.btn.primary {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		color: #ffffff;
	}

	@media (max-width: 768px) {
		.grid.two {
			grid-template-columns: 1fr;
		}
	}
</style>
