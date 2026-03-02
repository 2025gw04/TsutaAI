<script lang="ts">
	export let show = false;
	export let message = '処理中...';
</script>

{#if show}
	<div class="loading-overlay" role="alert" aria-live="polite" aria-busy="true">
		<div class="loading-content">
			<div class="spinner">
				<i class="bi bi-arrow-repeat"></i>
			</div>
			<p class="loading-message">{message}</p>
		</div>
	</div>
{/if}

<style>
	.loading-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		backdrop-filter: blur(4px);
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.loading-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		background: #ffffff;
		padding: 40px 60px;
		border-radius: 16px;
		box-shadow:
			0 20px 25px -5px rgba(0, 0, 0, 0.1),
			0 10px 10px -5px rgba(0, 0, 0, 0.04);
	}

	.spinner {
		width: 60px;
		height: 60px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: linear-gradient(135deg, #3b82f6, #6366f1);
		animation: pulse 1.5s ease-in-out infinite;
	}

	.spinner i {
		font-size: 32px;
		color: #ffffff;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.05);
			opacity: 0.9;
		}
	}

	.loading-message {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #111827;
		text-align: center;
	}

	/* モバイル対応 */
	@media (max-width: 768px) {
		.loading-content {
			padding: 32px 40px;
		}

		.spinner {
			width: 50px;
			height: 50px;
		}

		.spinner i {
			font-size: 28px;
		}

		.loading-message {
			font-size: 15px;
		}
	}

	@media (max-width: 480px) {
		.loading-content {
			padding: 24px 32px;
			max-width: 280px;
		}

		.spinner {
			width: 44px;
			height: 44px;
		}

		.spinner i {
			font-size: 24px;
		}

		.loading-message {
			font-size: 14px;
		}
	}
</style>
