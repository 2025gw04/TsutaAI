<script lang="ts">
	export let message: {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		timestamp: Date;
	};
	export let isUser: boolean = false;

	// タイムスタンプを日本語形式でフォーマット
	function formatTimestamp(date: Date): string {
		const hours = date.getHours().toString().padStart(2, '0');
		const minutes = date.getMinutes().toString().padStart(2, '0');
		return `${hours}:${minutes}`;
	}
</script>

<div class="message-wrapper" class:user={isUser} class:assistant={!isUser}>
	<div class="message-container">
		<div class="message-header">
			<div class="message-icon">
				{#if isUser}
					<i class="bi bi-person-circle"></i>
				{:else}
					<i class="bi bi-robot"></i>
				{/if}
			</div>
			<span class="message-time">{formatTimestamp(message.timestamp)}</span>
		</div>
		<div class="message-content">
			{message.content}
		</div>
	</div>
</div>

<style>
	.message-wrapper {
		display: flex;
		margin-bottom: 16px;
		animation: fadeIn 0.3s ease;
	}

	.message-wrapper.user {
		justify-content: flex-end;
	}

	.message-wrapper.assistant {
		justify-content: flex-start;
	}

	.message-container {
		max-width: 85%;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.message-header {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: #6b7280;
	}

	.user .message-header {
		justify-content: flex-end;
	}

	.assistant .message-header {
		justify-content: flex-start;
	}

	.message-icon {
		font-size: 14px;
	}

	.message-time {
		font-weight: 500;
	}

	.message-content {
		padding: 12px 16px;
		border-radius: 12px;
		font-size: 14px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.user .message-content {
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		border-bottom-right-radius: 4px;
	}

	.assistant .message-content {
		background: #f3f4f6;
		color: #111827;
		border-bottom-left-radius: 4px;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
