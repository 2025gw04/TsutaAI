<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';

	/** 休暇一覧 */
	let vacations: any[] = $state([]);

	/** 影響分析結果 */
	let impactAnalysis: any[] = $state([]);

	/** ユーザー一覧 */
	let users: any[] = $state([]);

	/** ローディング状態 */
	let isLoading = $state(true);
	let isAnalyzing = $state(false);

	/** 新規休暇登録用フォーム */
	let showAddModal = $state(false);
	let newVacation = $state({
		userId: 1,
		startDate: '',
		endDate: '',
		vacationType: '有給休暇',
		notes: ''
	});

	/** 分析期間フィルター */
	let analysisStartDate = $state(new Date().toISOString().split('T')[0]);
	let analysisEndDate = $state(
		new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
	);

	onMount(async () => {
		await Promise.all([loadVacations(), loadUsers()]);
	});

	/** 休暇一覧を読み込む */
	async function loadVacations() {
		try {
			isLoading = true;
			const response = await apiClient.fetchVacations();
			vacations = response.data;
		} catch (error) {
			console.error('休暇データの取得に失敗しました', error);
		} finally {
			isLoading = false;
		}
	}

	/** ユーザー一覧を読み込む */
	async function loadUsers() {
		try {
			const response = await apiClient.fetchUsers();
			users = response.data;
			// 初期値としてユーザー一覧の最初のユーザーIDを設定
			if (users.length > 0) {
				newVacation.userId = users[0].id;
			}
		} catch (error) {
			console.error('ユーザーデータの取得に失敗しました', error);
		}
	}

	/** 新規休暇を登録する */
	async function handleAddVacation() {
		try {
			await apiClient.createVacation(newVacation);
			showAddModal = false;
			newVacation = {
				userId: 1,
				startDate: '',
				endDate: '',
				vacationType: '有給休暇',
				notes: ''
			};
			await loadVacations();
		} catch (error) {
			alert('休暇の登録に失敗しました');
		}
	}

	/** 休暇を削除する */
	async function handleDelete(id: number) {
		if (!confirm('この休暇を削除しますか？')) return;

		try {
			await apiClient.deleteVacation(id);
			await loadVacations();
		} catch (error) {
			alert('休暇の削除に失敗しました');
		}
	}

	/** 休暇影響分析を実行する */
	async function handleAnalyze() {
		try {
			isAnalyzing = true;
			const response = await apiClient.analyzeVacationImpact(analysisStartDate, analysisEndDate);
			impactAnalysis = response.data;
		} catch (error) {
			alert('影響分析に失敗しました');
		} finally {
			isAnalyzing = false;
		}
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-calendar-event"></i>
				休暇管理
			</h1>
			<p>予定管理と影響分析</p>
		</div>
	</header>
</div>

<div class="page">
	<div class="page-actions">
		<button type="button" class="btn primary" onclick={() => (showAddModal = true)}>
			<i class="bi bi-plus-circle"></i>
			休暇を追加
		</button>
	</div>

	<section class="analysis-section">
		<h2>休暇影響分析</h2>
		<div class="analysis-controls">
			<div class="date-range">
				<label>
					<span>分析開始日</span>
					<input type="date" bind:value={analysisStartDate} />
				</label>
				<label>
					<span>分析終了日</span>
					<input type="date" bind:value={analysisEndDate} />
				</label>
			</div>
			<button type="button" class="btn outline" onclick={handleAnalyze} disabled={isAnalyzing}>
				<i class="bi bi-graph-up"></i>
				{isAnalyzing ? '分析中…' : '影響を分析'}
			</button>
		</div>

		{#if impactAnalysis.length > 0}
			<div class="impact-grid">
				{#each impactAnalysis as impact}
					<article class="impact-card">
						<h3>{impact.userName}</h3>
						<p class="role">{impact.role}</p>
						<div class="stat">
							<span class="label">休暇日数</span>
							<span class="value">{impact.totalVacationDays}日</span>
						</div>
						<ul class="vacation-list">
							{#each impact.vacations as vacation}
								<li>
									{vacation.startDate} 〜 {vacation.endDate} ({vacation.days}日)
								</li>
							{/each}
						</ul>
					</article>
				{/each}
			</div>
		{:else if !isAnalyzing}
			<p class="empty">分析期間を設定して「影響を分析」をクリックしてください。</p>
		{/if}
	</section>

	<section class="vacation-list-section">
		<h2>登録済み休暇一覧</h2>

		{#if isLoading}
			<p>読み込み中…</p>
		{:else if vacations.length === 0}
			<p class="empty">休暇が登録されていません。</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>ユーザー名</th>
						<th>役割</th>
						<th>開始日</th>
						<th>終了日</th>
						<th>種類</th>
						<th>備考</th>
						<th>操作</th>
					</tr>
				</thead>
				<tbody>
					{#each vacations as vacation}
						<tr>
							<td data-label="ユーザー名">{vacation.user_name || `ユーザー${vacation.user_id}`}</td>
							<td data-label="役割">{vacation.role || '未設定'}</td>
							<td data-label="開始日">{vacation.start_date}</td>
							<td data-label="終了日">{vacation.end_date}</td>
							<td data-label="種類">{vacation.vacation_type}</td>
							<td data-label="備考">{vacation.notes || '-'}</td>
							<td data-label="操作">
								<button type="button" class="btn-delete" onclick={() => handleDelete(vacation.id)}>
									<i class="bi bi-trash"></i>
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</div>

{#if showAddModal}
	<div
		class="overlay"
		onclick={() => (showAddModal = false)}
		role="button"
		tabindex="-1"
		onkeydown={(e) => e.key === 'Escape' && (showAddModal = false)}
	>
		<div
			class="modal-window"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			onkeydown={() => {}}
		>
			<header class="modal-header">
				<h2>休暇を追加</h2>
				<button type="button" class="modal-close-btn" onclick={() => (showAddModal = false)}>
					<i class="bi bi-x"></i>
				</button>
			</header>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleAddVacation();
				}}
			>
				<label>
					<span>ユーザー</span>
					<select bind:value={newVacation.userId} required>
						{#each users as user}
							<option value={user.id}>
								{user.full_name || user.fullName} ({user.role || '未設定'})
							</option>
						{/each}
					</select>
				</label>
				<label>
					<span>開始日</span>
					<input type="date" bind:value={newVacation.startDate} required />
				</label>
				<label>
					<span>終了日</span>
					<input type="date" bind:value={newVacation.endDate} required />
				</label>
				<label>
					<span>休暇種類</span>
					<select bind:value={newVacation.vacationType}>
						<option value="有給休暇">有給休暇</option>
						<option value="夏季休暇">夏季休暇</option>
						<option value="特別休暇">特別休暇</option>
						<option value="その他">その他</option>
					</select>
				</label>
				<label>
					<span>備考</span>
					<textarea bind:value={newVacation.notes} rows="3"></textarea>
				</label>

				<div class="modal-form-actions">
					<button type="button" class="btn ghost" onclick={() => (showAddModal = false)}>
						キャンセル
					</button>
					<button type="submit" class="btn primary">登録</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.page-actions {
		display: flex;
		justify-content: flex-end;
	}

	/* Mobile/Tablet Styles (<960px) */
	@media (max-width: 960px) {
		.page-header-wrapper {
			display: block; /* Show header */
			margin: 0;
			background: #1c2638;
			color: #ffffff;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		}

		.page-header {
			width: 100%;
			height: 100%;
			display: flex;
			justify-content: flex-start;
			align-items: center;
			padding: 0 24px;
			box-sizing: border-box;
		}

		.header-content {
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 4px; /* Ensure 4px gap */
			height: 100%;
		}

		.header-content h1 {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 0;
			color: #ffffff;
			font-size: 20px;
			font-weight: 700;
			line-height: 1.2;
		}

		.header-content p {
			margin: 0;
			font-size: 13px;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.8);
			line-height: 1.4;
		}

		.page {
			padding: 16px;
			gap: 16px;
		}

		.page-actions .btn {
			width: 100%;
			justify-content: center;
		}
	}

	.page {
		display: flex;
		flex-direction: column;
		gap: 28px;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
		padding: 24px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		color: #111827;
	}

	header p {
		margin: 6px 0 0;
		font-size: 13px;
		color: #6b7280;
	}

	h2 {
		margin: 0 0 16px;
		font-size: 20px;
		color: #111827;
	}

	.analysis-section,
	.vacation-list-section {
		padding: 24px;
		border-radius: 18px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.analysis-controls {
		display: flex;
		gap: 16px;
		align-items: flex-end;
		margin-bottom: 24px;
	}

	.date-range {
		display: flex;
		gap: 16px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	label span {
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
	}

	input,
	select,
	textarea {
		padding: 10px 14px;
		border-radius: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		color: #111827;
		font-size: 14px;
	}

	.impact-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 18px;
	}

	.impact-card {
		padding: 20px;
		border-radius: 16px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
	}

	.impact-card h3 {
		margin: 0 0 4px;
		font-size: 16px;
		color: #111827;
	}

	.impact-card .role {
		margin: 0 0 12px;
		font-size: 12px;
		color: #6b7280;
	}

	.stat {
		display: flex;
		justify-content: space-between;
		padding: 12px;
		margin-bottom: 12px;
		border-radius: 12px;
		background: #dbeafe;
	}

	.stat .label {
		font-size: 12px;
		color: #6b7280;
	}

	.stat .value {
		font-size: 16px;
		font-weight: 700;
		color: #3b82f6;
	}

	.vacation-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vacation-list li {
		padding: 8px 0;
		font-size: 13px;
		color: #6b7280;
		border-bottom: 1px solid #e5e7eb;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		max-width: 100%;
		overflow-x: auto;
		box-sizing: border-box;
	}

	thead {
		background: #f9fafb;
	}

	th {
		padding: 14px;
		text-align: left;
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	td {
		padding: 14px;
		border-bottom: 1px solid #e5e7eb;
		color: #111827;
		font-size: 14px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-radius: 12px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
		transition: transform 0.2s ease;
	}

	.btn.primary {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		color: #ffffff;
	}

	.btn.outline {
		border-color: #e5e7eb;
		background: transparent;
		color: #111827;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-delete {
		padding: 6px 10px;
		border-radius: 8px;
		background: #fee2e2;
		border: 1px solid #dc2626;
		color: #dc2626;
		cursor: pointer;
		font-size: 14px;
	}

	.empty {
		padding: 32px;
		text-align: center;
		color: #6b7280;
		font-size: 13px;
	}

	.btn.ghost {
		background: transparent;
		border-color: #e5e7eb;
		color: #111827;
	}

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
	}

	.modal-window {
		background: #ffffff;
		border-radius: 20px;
		border: 1px solid #e5e7eb;
		padding: 28px;
		max-width: 500px;
		width: 90%;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.15);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
		flex-wrap: nowrap;
		gap: 12px;
	}

	.modal-header h2 {
		flex: 1;
		min-width: 0;
		margin: 0;
	}

	.modal-close-btn {
		background: transparent;
		border: none;
		color: #6b7280;
		font-size: 24px;
		cursor: pointer;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.modal-close-btn:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.modal-window form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.modal-form-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		margin-top: 8px;
	}

	/* タブレット・モバイル対応 */
	@media (max-width: 768px) {
		.page {
			gap: 20px;
			max-width: 100%;
			overflow-x: hidden;
		}

		.analysis-controls {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}

		.date-range {
			flex-direction: column;
			gap: 12px;
		}

		.analysis-section,
		.vacation-list-section {
			padding: 20px;
			max-width: 100%;
		}

		.impact-grid {
			grid-template-columns: 1fr;
			gap: 16px;
		}

		/* テーブルをカードレイアウトに変換 */
		table thead {
			display: none;
		}

		table,
		table tbody,
		table tr,
		table td {
			display: block;
			width: 100%;
		}

		table tr {
			margin-bottom: 12px;
			border: 1px solid #e5e7eb;
			border-radius: 10px;
			padding: 12px;
			background: #f9fafb;
			max-width: 100%;
			box-sizing: border-box;
		}

		table td {
			text-align: left;
			padding: 8px 0;
			border: none;
			position: relative;
			padding-left: 50%;
			max-width: 100%;
			box-sizing: border-box;
		}

		table td::before {
			content: attr(data-label);
			position: absolute;
			left: 0;
			width: 45%;
			padding-right: 10px;
			font-weight: 600;
			text-align: left;
			font-size: 12px;
			color: #6b7280;
		}

		.btn.outline {
			width: 100%;
			justify-content: center;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.page {
			gap: 16px;
			max-width: 100%;
			overflow-x: hidden;
		}

		h2 {
			font-size: 18px;
			margin-bottom: 14px;
		}

		.btn {
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
			width: 100%;
			justify-content: center;
		}

		.analysis-section,
		.vacation-list-section {
			padding: 16px;
			border-radius: 14px;
		}

		.analysis-controls {
			gap: 10px;
			margin-bottom: 20px;
		}

		.date-range {
			gap: 10px;
		}

		label {
			gap: 6px;
		}

		label span {
			font-size: 12px;
		}

		input,
		select,
		textarea {
			padding: 11px 12px;
			font-size: 14px;
			min-height: 44px;
			border-radius: 10px;
		}

		.impact-grid {
			gap: 12px;
		}

		.impact-card {
			padding: 16px;
			border-radius: 12px;
		}

		.impact-card h3 {
			font-size: 15px;
		}

		.impact-card .role {
			font-size: 11px;
		}

		.stat {
			padding: 10px;
			margin-bottom: 10px;
			border-radius: 10px;
		}

		.stat .label {
			font-size: 11px;
		}

		.stat .value {
			font-size: 14px;
		}

		.vacation-list li {
			font-size: 12px;
			padding: 6px 0;
		}

		.modal-window {
			max-width: 100%;
			width: 95%;
			padding: 20px;
			border-radius: 16px;
		}

		.modal-header {
			margin-bottom: 16px;
			gap: 10px;
		}

		.modal-header h2 {
			font-size: 18px;
		}

		.modal-close-btn {
			width: 30px;
			height: 30px;
			font-size: 22px;
		}

		.modal-window form {
			gap: 14px;
		}

		.modal-form-actions {
			flex-direction: column;
			gap: 10px;
			margin-top: 6px;
		}

		.modal-form-actions .btn {
			width: 100%;
		}

		table tr {
			padding: 12px;
			margin-bottom: 10px;
			border-radius: 10px;
		}

		table td {
			padding: 8px 0;
			padding-left: 50%;
			font-size: 13px;
		}

		table td::before {
			font-size: 11px;
		}

		.btn-delete {
			padding: 10px 14px;
			font-size: 13px;
			min-height: 44px;
			width: 100%;
			justify-content: center;
			border-radius: 8px;
		}

		.empty {
			padding: 24px 16px;
			font-size: 12px;
		}
	}

	/* 超極小画面（390px以下）での完全な横スクロール防止 */
	@media (max-width: 390px) {
		.page {
			gap: 14px;
			width: 100%;
			max-width: 100%;
		}

		header h1 {
			font-size: 18px;
		}

		header p {
			font-size: 11px;
		}

		h2 {
			font-size: 16px;
			margin-bottom: 12px;
		}

		.btn {
			padding: 11px 14px;
			font-size: 13px;
			min-height: 44px;
		}

		.analysis-section,
		.vacation-list-section {
			padding: 14px;
			border-radius: 12px;
		}

		.analysis-controls {
			gap: 8px;
			margin-bottom: 16px;
		}

		.date-range {
			gap: 8px;
		}

		input,
		select,
		textarea {
			padding: 10px 11px;
			font-size: 13px;
			min-height: 42px;
			border-radius: 8px;
		}

		.impact-card {
			padding: 14px;
			border-radius: 10px;
		}

		.impact-card h3 {
			font-size: 14px;
		}

		.stat {
			padding: 8px;
			border-radius: 8px;
		}

		.modal-window {
			width: 96%;
			padding: 18px;
			border-radius: 14px;
		}

		.modal-header {
			gap: 8px;
		}

		.modal-header h2 {
			font-size: 16px;
		}

		.modal-close-btn {
			width: 28px;
			height: 28px;
			font-size: 20px;
		}

		table tr {
			padding: 10px;
			margin-bottom: 8px;
			border-radius: 8px;
		}

		table td {
			padding: 6px 0;
			padding-left: 48%;
			font-size: 12px;
		}

		table td::before {
			width: 43%;
			font-size: 10px;
		}

		.btn-delete {
			padding: 9px 12px;
			font-size: 12px;
			min-height: 40px;
		}

		.empty {
			padding: 20px 12px;
			font-size: 11px;
		}
	}
</style>
