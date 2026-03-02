<script lang="ts">
	/** AIアラートの配列 */
	export let alerts: Array<{
		projectId: string | number | null;
		severity: 'high' | 'medium' | 'low';
		message: string;
	}> = [];

	/** 読み込み状態を示すフラグ */
	export let isLoading = false;

	/** エラー時のメッセージ */
	export let errorMessage = '';

	/** アラートを再取得するハンドラー */
	export let onRefresh: (() => void) | null = null;

	/** 重大度ごとの色設定 */
	const severityTone = {
		high: { label: '重大', className: 'tone-high', icon: 'bi-exclamation-octagon-fill' },
		medium: { label: '注意', className: 'tone-medium', icon: 'bi-exclamation-triangle-fill' },
		low: { label: '情報', className: 'tone-low', icon: 'bi-info-circle-fill' }
	} as const;
</script>

<section class="alerts-panel">
	<header>
		<div class="title-block">
			<h2>AIリスクアラート</h2>
			<p>AIモデルが最新の進捗を解析し、注意すべき兆候を抽出しました。</p>
		</div>
		{#if onRefresh}
			<button type="button" class="refresh-btn" on:click={onRefresh} disabled={isLoading}>
				<i class="bi bi-stars"></i>
				<span>AI再生成</span>
			</button>
		{/if}
	</header>

	{#if isLoading}
		<div class="empty-state">
			<div class="spinner"></div>
			<p>AIがリスクを解析中です…</p>
		</div>
	{:else if errorMessage}
		<div class="empty-state error">
			<i class="bi bi-wifi-off"></i>
			<p>{errorMessage}</p>
		</div>
	{:else if alerts.length === 0}
		<div class="empty-state">
			<i class="bi bi-shield-check"></i>
			<p>現在、緊急度の高いアラートは検知されていません。</p>
		</div>
	{:else}
		<ul class="alert-list">
			{#each alerts as alert, index (index)}
				<li class={`alert-card ${severityTone[alert.severity].className}`}>
					<div class="icon-badge">
						<i class={`bi ${severityTone[alert.severity].icon}`}></i>
					</div>
					<div class="content">
						<div class="meta">
							<span class="severity">{severityTone[alert.severity].label}</span>
							<span class="project">
								Project: {alert.projectId ?? '未識別'}
							</span>
						</div>
						<p>{alert.message}</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.alerts-panel {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 22px;
		border-radius: 20px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}

	.title-block h2 {
		margin: 0;
		font-size: 18px;
		color: #111827;
	}

	.title-block p {
		margin: 6px 0 0;
		font-size: 12px;
		color: #6b7280;
	}

	.refresh-btn {
		display: inline-flex;
		justify-content: center;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		border-radius: 12px;
		background: #dbeafe;
		border: 1px solid #93c5fd;
		color: #1e40af;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			background 0.2s ease,
			opacity 0.2s ease;
	}

	.refresh-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		background: #bfdbfe;
	}

	.refresh-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.refresh-btn i {
		font-size: 14px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 36px 18px;
		border-radius: 16px;
		background: #f9fafb;
		color: #6b7280;
		text-align: center;
		font-size: 13px;
	}

	.empty-state i {
		font-size: 28px;
		color: #9ca3af;
	}

	.empty-state.error {
		border: 1px solid #fca5a5;
		background: #fef2f2;
		color: #dc2626;
	}

	.spinner {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 3px solid rgba(59, 130, 246, 0.2);
		border-top-color: #3b82f6;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.alert-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.alert-card {
		display: flex;
		gap: 14px;
		padding: 16px;
		border-radius: 16px;
		border: 1px solid #e5e7eb;
		background: #ffffff;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
	}

	.icon-badge {
		width: 44px;
		height: 44px;
		border-radius: 14px;
		display: inline-flex;
		justify-content: center;
		align-items: center;
		font-size: 20px;
		background: #dbeafe;
		color: #3b82f6;
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.meta {
		display: flex;
		gap: 10px;
		align-items: baseline;
		font-size: 12px;
		color: #6b7280;
	}

	.severity {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 600;
	}

	.project {
		font-size: 11px;
		color: #9ca3af;
	}

	.content p {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
		color: #374151;
	}

	.tone-high .icon-badge {
		background: #fee2e2;
		color: #dc2626;
	}

	.tone-medium .icon-badge {
		background: #fef3c7;
		color: #d97706;
	}

	.tone-low .icon-badge {
		background: #d1fae5;
		color: #047857;
	}
</style>
