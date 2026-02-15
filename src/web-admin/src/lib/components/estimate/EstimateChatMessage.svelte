<script lang="ts">
	export let role: 'user' | 'assistant';
	export let content: string;
	export let timestamp: string;

	function formatTime(isoString: string): string {
		try {
			return new Date(isoString).toLocaleTimeString('ja-JP', {
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}
</script>

<div class="chat-message {role}">
	<div class="message-avatar">
		{#if role === 'user'}
			<i class="bi bi-person-circle"></i>
		{:else}
			<i class="bi bi-robot"></i>
		{/if}
	</div>

	<div class="message-bubble">
		<div class="message-content">{content}</div>
		{#if timestamp}
			<div class="message-timestamp">{formatTime(timestamp)}</div>
		{/if}
	</div>
</div>

<style>
	.chat-message {
		display: flex;
		gap: 12px;
		margin-bottom: 16px;
		animation: slideIn 0.3s ease;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.chat-message.user {
		flex-direction: row-reverse;
	}

	.message-avatar {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 24px;
	}

	.chat-message.user .message-avatar {
		color: #667eea;
		background: rgba(102, 126, 234, 0.1);
	}

	.chat-message.assistant .message-avatar {
		color: #10b981;
		background: rgba(16, 185, 129, 0.1);
	}

	.message-bubble {
		flex: 1;
		max-width: 80%;
	}

	.chat-message.user .message-bubble {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.message-content {
		padding: 12px 16px;
		border-radius: 12px;
		font-size: 14px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.chat-message.user .message-content {
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		border-bottom-right-radius: 4px;
	}

	.chat-message.assistant .message-content {
		background: #f3f4f6;
		color: #111827;
		border-bottom-left-radius: 4px;
	}

	.message-timestamp {
		margin-top: 4px;
		font-size: 11px;
		color: #9ca3af;
	}
</style>
