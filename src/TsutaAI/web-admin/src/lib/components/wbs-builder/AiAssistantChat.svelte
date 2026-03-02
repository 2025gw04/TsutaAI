<script lang="ts">
	import { onMount, afterUpdate } from 'svelte';
	import { chatHistory, isLoadingAi, addChatMessage } from '$lib/stores/wbsBuilderStore';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let userInput = '';
	let chatContainer: HTMLDivElement;

	// Scroll to bottom when new messages arrive
	afterUpdate(() => {
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	});

	// Handle send message
	function handleSendMessage() {
		const trimmedInput = userInput.trim();
		if (!trimmedInput || $isLoadingAi) return;

		// Add user message to chat
		addChatMessage('user', trimmedInput);

		// Dispatch event to parent to handle AI generation
		dispatch('sendMessage', { message: trimmedInput });

		// Clear input
		userInput = '';
	}

	// Handle Enter key
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	}

	// Format timestamp
	function formatTime(date: Date): string {
		return new Date(date).toLocaleTimeString('ja-JP', {
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="ai-assistant-chat">
	<div class="chat-header">
		<div class="header-content">
			<i class="bi bi-robot"></i>
			<h2>AIアシスタント</h2>
		</div>
		<p class="hint">AIに修正指示を送ることで、タスクリストを再生成できます</p>
	</div>

	<div class="chat-messages" bind:this={chatContainer}>
		{#if $chatHistory.length === 0}
			<div class="welcome-message">
				<i class="bi bi-chat-dots"></i>
				<h3>AIアシスタントへようこそ</h3>
				<p>タスクの修正指示をここに入力してください。</p>
				<div class="examples">
					<p><strong>例:</strong></p>
					<ul>
						<li>「テストフェーズをもっと詳細に分けて」</li>
						<li>「セキュリティ関連のタスクを追加して」</li>
						<li>「各タスクの工数を見直して」</li>
					</ul>
				</div>
			</div>
		{:else}
			{#each $chatHistory as message (message.id)}
				<div
					class="message"
					class:user={message.role === 'user'}
					class:assistant={message.role === 'assistant'}
				>
					<div class="message-header">
						<div class="message-icon">
							{#if message.role === 'user'}
								<i class="bi bi-person-circle"></i>
							{:else}
								<i class="bi bi-robot"></i>
							{/if}
						</div>
						<span class="message-time">{formatTime(message.timestamp)}</span>
					</div>
					<div class="message-content">
						{message.content}
					</div>
				</div>
			{/each}

			{#if $isLoadingAi}
				<div class="message assistant loading">
					<div class="message-header">
						<div class="message-icon">
							<i class="bi bi-robot"></i>
						</div>
					</div>
					<div class="message-content">
						<div class="typing-indicator">
							<span></span>
							<span></span>
							<span></span>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<div class="chat-input-area">
		<textarea
			bind:value={userInput}
			on:keypress={handleKeyPress}
			placeholder="AIへの指示を入力... (Enter で送信、Shift+Enter で改行)"
			rows="3"
			disabled={$isLoadingAi}
		></textarea>
		<button
			class="send-btn"
			on:click={handleSendMessage}
			disabled={!userInput.trim() || $isLoadingAi}
		>
			<i class="bi bi-send-fill"></i>
			送信
		</button>
	</div>
</div>

<style>
	.ai-assistant-chat {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #fefefe;
	}

	.chat-header {
		padding: 24px;
		border-bottom: 1px solid #e5e7eb;
		background: linear-gradient(135deg, #f5f3ff, #faf5ff);
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}

	.header-content i {
		font-size: 24px;
		color: #7c3aed;
	}

	.chat-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.hint {
		margin: 0;
		font-size: 12px;
		color: #6b7280;
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.welcome-message {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 40px 20px;
		gap: 16px;
	}

	.welcome-message i {
		font-size: 48px;
		color: #a78bfa;
	}

	.welcome-message h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.welcome-message p {
		margin: 0;
		font-size: 14px;
		color: #6b7280;
	}

	.examples {
		margin-top: 12px;
		padding: 16px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		text-align: left;
		width: 100%;
		max-width: 400px;
	}

	.examples p {
		margin: 0 0 8px;
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.examples ul {
		margin: 0;
		padding-left: 20px;
	}

	.examples li {
		font-size: 13px;
		color: #6b7280;
		line-height: 1.6;
	}

	.message {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 85%;
	}

	.message.user {
		align-self: flex-end;
	}

	.message.assistant {
		align-self: flex-start;
	}

	.message-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.message.user .message-header {
		justify-content: flex-end;
	}

	.message-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
	}

	.message-icon i {
		font-size: 24px;
	}

	.message.user .message-icon i {
		color: #3b82f6;
	}

	.message.assistant .message-icon i {
		color: #7c3aed;
	}

	.message-time {
		font-size: 11px;
		color: #9ca3af;
	}

	.message-content {
		padding: 12px 16px;
		border-radius: 12px;
		font-size: 14px;
		line-height: 1.6;
		word-wrap: break-word;
	}

	.message.user .message-content {
		background: linear-gradient(135deg, #3b82f6, #2563eb);
		color: #ffffff;
	}

	.message.assistant .message-content {
		background: #f3f4f6;
		color: #111827;
		border: 1px solid #e5e7eb;
	}

	.typing-indicator {
		display: flex;
		gap: 4px;
		align-items: center;
		padding: 4px 0;
	}

	.typing-indicator span {
		width: 8px;
		height: 8px;
		background: #9ca3af;
		border-radius: 50%;
		animation: typing 1.4s infinite;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%,
		60%,
		100% {
			transform: translateY(0);
			opacity: 0.7;
		}
		30% {
			transform: translateY(-10px);
			opacity: 1;
		}
	}

	.chat-input-area {
		padding: 20px 24px;
		border-top: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		gap: 12px;
		background: #ffffff;
	}

	.chat-input-area textarea {
		width: 100%;
		padding: 12px 16px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		background: #f9fafb;
		color: #111827;
		font-size: 14px;
		font-family: inherit;
		resize: vertical;
		transition:
			border-color 0.2s ease,
			background-color 0.2s ease;
	}

	.chat-input-area textarea:focus {
		outline: none;
		border-color: #7c3aed;
		background: #ffffff;
		box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
	}

	.chat-input-area textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.send-btn {
		align-self: flex-end;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 20px;
		background: linear-gradient(135deg, #667eea, #764ba2);
		border: none;
		border-radius: 8px;
		color: #ffffff;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
	}

	.send-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}
</style>
