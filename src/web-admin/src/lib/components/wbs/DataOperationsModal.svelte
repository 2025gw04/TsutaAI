<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let show = false;
	export let isProcessing = false;

	const dispatch = createEventDispatcher<{
		close: void;
		selectImport: void;
		selectExport: void;
	}>();

	function close() {
		dispatch('close');
	}

	function handleImport() {
		dispatch('selectImport');
	}

	function handleExport() {
		dispatch('selectExport');
	}
</script>

{#if show}
	<div class="overlay" role="presentation" on:click={close}>
		<div class="modal-window" role="dialog" on:click|stopPropagation>
			<header>
				<h3>データ操作</h3>
				<button class="close-btn" on:click={close}>&times;</button>
			</header>
			<div class="content">
				<div class="section data-section">
					<h4 class="section-title">
						<i class="bi bi-arrow-down-up"></i>
						ファイル操作
					</h4>
					<div class="actions-grid">
						<button class="action-btn import" on:click={handleImport} disabled={isProcessing}>
							<div class="icon">
								<i class="bi bi-upload"></i>
							</div>
							<div class="text">
								<span class="title">インポート</span>
								<span class="subtitle">ファイルから読込</span>
							</div>
						</button>
						<button class="action-btn export" on:click={handleExport} disabled={isProcessing}>
							<div class="icon">
								<i class="bi bi-download"></i>
							</div>
							<div class="text">
								<span class="title">エクスポート</span>
								<span class="subtitle">ファイルへ保存</span>
							</div>
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		backdrop-filter: blur(4px);
	}

	.modal-window {
		background: white;
		border-radius: 16px;
		width: 90%;
		max-width: 900px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
		overflow: hidden;
		animation: slide-up 0.3s ease-out;
		display: flex;
		flex-direction: column;
		max-height: 90vh;
	}

	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px;
		border-bottom: 1px solid #f3f4f6;
		flex-shrink: 0;
	}

	header h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #111827;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 24px;
		color: #9ca3af;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #4b5563;
	}

	.content {
		padding: 24px;
		overflow-y: auto;
	}

	.section {
		margin-bottom: 16px;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		color: #374151;
		margin: 0 0 8px 0;
	}

	.actions-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.action-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 16px;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		background: #ffffff;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: center;
	}

	.action-btn:hover:not(:disabled) {
		border-color: #3b82f6;
		background: #eff6ff;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
	}

	.action-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.icon {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
	}

	.import .icon {
		background: #dbeafe;
		color: #3b82f6;
	}

	.export .icon {
		background: #d1fae5;
		color: #10b981;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.title {
		font-size: 14px;
		font-weight: 600;
		color: #1f2937;
	}

	.subtitle {
		font-size: 11px;
		color: #6b7280;
	}
</style>
