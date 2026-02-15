<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';

	type VersionHistory = {
		id: number;
		tableName: string;
		recordId: number;
		action: 'INSERT' | 'UPDATE' | 'DELETE';
		changedBy: number;
		changedByName: string;
		changedAt: string;
		oldValues: any;
		newValues: any;
	};

	let versions: VersionHistory[] = [];
	let loading = true;
	let error = '';
	let filterTable = '';
	let filterAction = '';

	onMount(async () => {
		await loadVersions();
	});

	async function loadVersions() {
		try {
			loading = true;
			error = '';

			// 実際のAPIエンドポイントに置き換える必要があります
			// ここでは、タスクの変更履歴をサンプルとして表示します
			const response = await apiClient.get<any[]>('/activity-logs/team/stats?hours=168');

			// サンプルデータ（実際にはバージョン管理テーブルから取得）
			versions = [
				{
					id: 1,
					tableName: 'projects',
					recordId: 1,
					action: 'UPDATE',
					changedBy: 1,
					changedByName: '管理者',
					changedAt: new Date().toISOString(),
					oldValues: { status: '進行中' },
					newValues: { status: '完了' }
				}
			];
		} catch (e: any) {
			error = e.message || 'バージョン履歴の読み込みに失敗しました。';
		} finally {
			loading = false;
		}
	}

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleString('ja-JP');
	}

	function getActionBadgeClass(action: string) {
		switch (action) {
			case 'INSERT':
				return 'badge bg-success';
			case 'UPDATE':
				return 'badge bg-warning';
			case 'DELETE':
				return 'badge bg-danger';
			default:
				return 'badge bg-secondary';
		}
	}

	$: filteredVersions = versions.filter((v) => {
		if (filterTable && v.tableName !== filterTable) return false;
		if (filterAction && v.action !== filterAction) return false;
		return true;
	});
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-clock-history"></i>
				バージョン履歴
			</h1>
			<p>変更履歴の追跡</p>
		</div>
	</header>
</div>

<div class="container-fluid py-4">
	<div class="d-flex justify-content-between align-items-center mb-4 desktop-header">
		<h2>🗂️ バージョン管理・変更履歴</h2>
	</div>

	{#if error}
		<div class="alert alert-danger" role="alert">
			{error}
		</div>
	{/if}

	<!-- フィルター -->
	<div class="card mb-4">
		<div class="card-body">
			<div class="row g-3">
				<div class="col-md-4">
					<label class="form-label">テーブル</label>
					<select class="form-select" bind:value={filterTable}>
						<option value="">すべて</option>
						<option value="projects">プロジェクト</option>
						<option value="tasks">タスク</option>
						<option value="users">ユーザー</option>
						<option value="worklogs">作業ログ</option>
					</select>
				</div>
				<div class="col-md-4">
					<label class="form-label">アクション</label>
					<select class="form-select" bind:value={filterAction}>
						<option value="">すべて</option>
						<option value="INSERT">作成</option>
						<option value="UPDATE">更新</option>
						<option value="DELETE">削除</option>
					</select>
				</div>
			</div>
		</div>
	</div>

	<!-- バージョン履歴テーブル -->
	<div class="card">
		<div class="card-body">
			{#if loading}
				<div class="text-center py-5">
					<div class="spinner-border text-primary" role="status">
						<span class="visually-hidden">読み込み中...</span>
					</div>
				</div>
			{:else if filteredVersions.length === 0}
				<div class="text-center text-muted py-5">
					<p>変更履歴がありません。</p>
				</div>
			{:else}
				<div class="table-responsive">
					<table class="table table-hover">
						<thead>
							<tr>
								<th>日時</th>
								<th>テーブル</th>
								<th>レコードID</th>
								<th>アクション</th>
								<th>変更者</th>
								<th>変更内容</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredVersions as version}
								<tr>
									<td data-label="日時">{formatDate(version.changedAt)}</td>
									<td data-label="テーブル"><code>{version.tableName}</code></td>
									<td data-label="レコードID">{version.recordId}</td>
									<td data-label="アクション">
										<span class={getActionBadgeClass(version.action)}>
											{version.action}
										</span>
									</td>
									<td data-label="変更者">{version.changedByName}</td>
									<td data-label="変更内容">
										{#if version.action === 'UPDATE'}
											<details>
												<summary class="cursor-pointer">変更詳細を表示</summary>
												<div class="mt-2">
													<div class="row">
														<div class="col-6">
															<strong>変更前:</strong>
															<pre class="bg-light p-2 rounded">{JSON.stringify(
																	version.oldValues,
																	null,
																	2
																)}</pre>
														</div>
														<div class="col-6">
															<strong>変更後:</strong>
															<pre class="bg-light p-2 rounded">{JSON.stringify(
																	version.newValues,
																	null,
																	2
																)}</pre>
														</div>
													</div>
												</div>
											</details>
										{:else if version.action === 'INSERT'}
											<span class="text-success">新規作成</span>
										{:else if version.action === 'DELETE'}
											<span class="text-danger">削除</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>

	<!-- 説明 -->
	<div class="alert alert-info mt-4" role="alert">
		<h5 class="alert-heading">📌 バージョン管理について</h5>
		<p class="mb-0">
			このページでは、プロジェクト、タスク、ユーザーなどの変更履歴を確認できます。
			各レコードの作成・更新・削除の履歴が記録され、いつ誰がどのような変更を行ったかを追跡できます。
		</p>
	</div>
</div>

<style>
	.cursor-pointer {
		cursor: pointer;
		user-select: none;
	}

	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
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

		.desktop-header {
			display: none !important;
		}

		.container-fluid {
			padding: 16px !important;
		}
	}

	/* タブレット・モバイル対応 */
	@media (max-width: 768px) {
		/* テーブルをカードレイアウトに変換 */
		.table thead {
			display: none;
		}

		.table,
		.table tbody,
		.table tr,
		.table td {
			display: block;
			width: 100%;
		}

		.table tr {
			margin-bottom: 1rem;
			border: 1px solid #dee2e6;
			border-radius: 8px;
			padding: 0.75rem;
			background: #f8f9fa;
		}

		.table td {
			text-align: left;
			padding: 0.5rem 0;
			border: none;
			position: relative;
			padding-left: 50%;
		}

		.table td::before {
			content: attr(data-label);
			position: absolute;
			left: 0;
			width: 45%;
			padding-right: 10px;
			font-weight: 600;
			text-align: left;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.container-fluid {
			padding: 12px !important;
		}

		h2 {
			font-size: 20px;
		}

		.card {
			margin-bottom: 16px;
			border-radius: 12px;
		}

		.card-body {
			padding: 14px;
		}

		.form-label {
			font-size: 13px;
			font-weight: 600;
			margin-bottom: 6px;
		}

		.form-select {
			padding: 10px 12px;
			font-size: 14px;
			min-height: 44px;
		}

		.table tr {
			padding: 12px;
			margin-bottom: 12px;
			border-radius: 10px;
		}

		.table td {
			padding: 8px 0;
			padding-left: 50%;
			font-size: 13px;
		}

		.table td::before {
			font-size: 12px;
		}

		.badge {
			padding: 6px 10px;
			font-size: 12px;
		}

		details summary {
			font-size: 13px;
			padding: 8px 0;
		}

		.row .col-6 {
			width: 100%;
			margin-bottom: 12px;
		}

		pre {
			font-size: 12px;
			max-height: 150px;
			padding: 10px !important;
		}

		.alert {
			padding: 12px;
			font-size: 13px;
		}

		.alert h5 {
			font-size: 16px;
		}

		.spinner-border {
			width: 3rem;
			height: 3rem;
		}
	}
</style>
