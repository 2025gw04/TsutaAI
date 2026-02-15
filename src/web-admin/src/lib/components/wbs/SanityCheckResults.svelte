<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	/** 健全性チェックの指摘一覧 */
	export let suggestions: Array<{
		taskId: string;
		severity: 'info' | 'warning' | 'critical';
		message: string;
	}> = [];

	const dispatch = createEventDispatcher();

	/** モーダルを閉じる */
	function close() {
		dispatch('close');
	}

	/** 指定タスクを選択する */
	function selectTask(taskId: string) {
		dispatch('selectTask', taskId);
	}

	/** 重大度に応じたラベルとアイコン */
	function getSeverity(severity: 'info' | 'warning' | 'critical') {
		switch (severity) {
			case 'critical':
				return { label: '重大', className: 'critical', icon: 'bi-exclamation-octagon' };
			case 'warning':
				return { label: '注意', className: 'warning', icon: 'bi-exclamation-triangle' };
			default:
				return { label: '情報', className: 'info', icon: 'bi-info-circle' };
		}
	}
</script>

<div class="panel">
	<header>
		<div>
			<h3>AI健全性チェック</h3>
			<p>AIがWBSを精査し、抜け漏れや負荷の偏りを指摘しました。</p>
		</div>
		<button type="button" class="close" on:click={close} aria-label="閉じる">
			<i class="bi bi-x-lg"></i>
		</button>
	</header>

	{#if suggestions.length === 0}
		<div class="empty">
			<i class="bi bi-patch-check-fill"></i>
			<p>問題は検出されませんでした。バランスの良いWBSです。</p>
		</div>
	{:else}
		<ul>
			{#each suggestions as suggestion (suggestion.taskId + suggestion.message)}
				{@const severity = getSeverity(suggestion.severity)}
				<li class={severity.className}>
					<button
						type="button"
						class="alert-button"
						on:click={() => selectTask(suggestion.taskId)}
						on:keydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								selectTask(suggestion.taskId);
							}
						}}
					>
						<div class="marker">
							<i class={`bi ${severity.icon}`}></i>
						</div>
						<div class="text">
							<span class="badge">{severity.label}</span>
							<p>{suggestion.message}</p>
						</div>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.panel {
		position: fixed;
		bottom: 36px;
		right: 36px;
		width: 360px;
		max-height: 60vh;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		z-index: 110;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 20px 22px 16px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	header h3 {
		margin: 0;
		font-size: 16px;
		color: #111827;
	}

	header p {
		margin: 6px 0 0;
		font-size: 12px;
		color: #6b7280;
	}

	.close {
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 14px 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow-y: auto;
	}

	li {
		display: flex;
	}

	.alert-button {
		display: flex;
		gap: 12px;
		align-items: center;
		width: 100%;
		border: none;
		background: none;
		padding: 12px 18px;
		cursor: pointer;
		border-radius: 16px;
		transition: background 0.2s ease;
		color: inherit;
		text-align: left;
	}

	.alert-button:focus {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	.alert-button:hover {
		background: #f3f4f6;
	}

	.marker {
		width: 34px;
		height: 34px;
		border-radius: 12px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 18px;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.badge {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
	}

	.text p {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
		color: #374151;
	}

	.info .marker {
		background: #dbeafe;
		color: #3b82f6;
	}

	.warning .marker {
		background: #fef3c7;
		color: #d97706;
	}

	.critical .marker {
		background: #fee2e2;
		color: #dc2626;
	}

	.empty {
		padding: 32px 24px;
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

	@media (max-width: 768px) {
		.panel {
			position: static;
			width: 100%;
			border-radius: 16px;
		}
	}
</style>
