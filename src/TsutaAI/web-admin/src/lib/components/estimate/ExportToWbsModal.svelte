<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { apiClient } from '$lib/api/client';

	type ProjectOption = {
		id: number;
		project_name?: string;
		name?: string;
	};

	export let estimateId: number;
	export let isOpen = false;

	const dispatch = createEventDispatcher();

	let projects: ProjectOption[] = [];
	let selectedProjectId: number | null = null;
	let loading = false;
	let exporting = false;
	let error = '';

	$: if (isOpen) {
		loadProjects();
	}

	async function loadProjects() {
		try {
			loading = true;
			error = '';
			const response = await apiClient.fetchProjects();
			projects = Array.isArray(response.data) ? response.data : [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'プロジェクトの取得に失敗しました';
			projects = [];
		} finally {
			loading = false;
		}
	}

	async function handleExport() {
		if (exporting) return;
		if (!estimateId || !Number.isFinite(estimateId)) {
			error = '見積もりIDが不正です';
			return;
		}
		if (!selectedProjectId) {
			error = 'プロジェクトを選択してください';
			return;
		}

		try {
			exporting = true;
			error = '';

			await apiClient.post(`/estimates/${estimateId}/export-to-wbs`, {
				projectId: selectedProjectId
			});

			alert('WBSへのエクスポートが完了しました！');
			dispatch('exported', { projectId: selectedProjectId });
			close();
		} catch (e) {
			error = e instanceof Error ? e.message : 'エクスポートに失敗しました';
		} finally {
			exporting = false;
		}
	}

	function close() {
		isOpen = false;
		selectedProjectId = null;
		error = '';
	}
</script>

{#if isOpen}
	<div class="modal-overlay" on:click={close}>
		<div class="modal-content" on:click|stopPropagation>
			<div class="modal-header">
				<h3>WBSにエクスポート</h3>
				<button class="close-btn" on:click={close}>
					<i class="bi bi-x"></i>
				</button>
			</div>

			<div class="modal-body">
				{#if error}
					<div class="error-message">
						<i class="bi bi-exclamation-triangle"></i>
						{error}
					</div>
				{/if}

				<p class="description">
					見積もり結果をプロジェクトのWBSタスクとして追加します。
					各フェーズがタスクとして作成され、AI効率化を考慮した工数・期間が設定されます。
				</p>

				<div class="form-group">
					<label for="project-select">エクスポート先プロジェクト</label>
					{#if loading}
						<div class="loading-spinner">読み込み中...</div>
					{:else}
						<select id="project-select" bind:value={selectedProjectId} class="project-select">
							<option value={null}>プロジェクトを選択...</option>
							{#each projects as project}
								<option value={project.id}>
									{project.project_name || project.name}
								</option>
							{/each}
						</select>
					{/if}
				</div>

				<div class="info-box">
					<i class="bi bi-info-circle"></i>
					<div>
						<strong>注意:</strong>
						<ul>
							<li>フェーズごとにタスクが作成されます</li>
							<li>AI効率化を有効にしたフェーズは削減後の工数で作成されます</li>
							<li>開始日・終了日は営業日ベースで自動計算されます</li>
						</ul>
					</div>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn-secondary" on:click={close}> キャンセル </button>
				<button
					class="btn-primary"
					on:click={handleExport}
					disabled={!selectedProjectId || exporting}
				>
					{#if exporting}
						<div class="btn-spinner"></div>
						エクスポート中...
					{:else}
						<i class="bi bi-download"></i>
						エクスポート
					{/if}
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
	}

	.modal-content {
		width: 90%;
		max-width: 500px;
		background: #ffffff;
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		color: #111827;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: #6b7280;
		font-size: 24px;
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.modal-body {
		padding: 24px;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: #fee2e2;
		border-left: 4px solid #dc2626;
		border-radius: 6px;
		color: #dc2626;
		font-size: 14px;
		margin-bottom: 20px;
	}

	.description {
		margin: 0 0 20px;
		font-size: 14px;
		color: #6b7280;
		line-height: 1.6;
	}

	.form-group {
		margin-bottom: 20px;
	}

	.form-group label {
		display: block;
		margin-bottom: 8px;
		font-size: 14px;
		font-weight: 600;
		color: #374151;
	}

	.project-select {
		width: 100%;
		padding: 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		color: #111827;
		background: #ffffff;
		cursor: pointer;
	}

	.project-select:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.loading-spinner {
		padding: 12px;
		text-align: center;
		color: #9ca3af;
		font-size: 14px;
	}

	.info-box {
		display: flex;
		gap: 12px;
		padding: 16px;
		background: #eff6ff;
		border-left: 4px solid #3b82f6;
		border-radius: 6px;
		font-size: 13px;
		color: #1e40af;
	}

	.info-box i {
		flex-shrink: 0;
		font-size: 20px;
	}

	.info-box ul {
		margin: 8px 0 0;
		padding-left: 20px;
	}

	.info-box li {
		margin-bottom: 4px;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 20px 24px;
		border-top: 1px solid #e5e7eb;
	}

	.btn-primary,
	.btn-secondary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
	}

	.btn-primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.btn-secondary {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		color: #374151;
	}

	.btn-secondary:hover {
		background: #f9fafb;
	}

	.btn-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
