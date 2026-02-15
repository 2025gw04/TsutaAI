<script lang="ts">
	import { createEventDispatcher, afterUpdate } from 'svelte';
	import type { EstimateConversation } from '$lib/types/estimate';
	import EstimateChatMessage from './EstimateChatMessage.svelte';
	import EstimateChangePreview from './EstimateChangePreview.svelte';
	import { apiClient } from '$lib/api/client';

	export let conversations: EstimateConversation[] = [];
	export let estimateId: number;
	export let currentPhases: any[] = [];

	const dispatch = createEventDispatcher();

	let message = '';
	let chatContainer: HTMLDivElement;
	let isProcessing = false;
	let pendingChanges: any[] | null = null;

	const WELCOME_MESSAGE = `こんにちは！見積もりAIアシスタントです。

プロジェクトの見積もり作成をお手伝いします。以下のようなことができます：

• フェーズの作成・更新・削除
• AI効率化比率の提案
• リソース配分の最適化

詳しくは「/help」と入力してください。
お気軽にご相談ください！`;

	const HELP_MESSAGE = `# 見積もりAIアシスタント - 利用可能な機能

## 基本操作
• フェーズ作成: 「要件定義フェーズを10人日で追加」「設計から実装までのフェーズを作成」
• フェーズ更新: 「実装フェーズの工数を20人日に変更」「テストフェーズにAI活用を適用」
• フェーズ削除: 「運用準備フェーズを削除」

## AI効率化
• AI活用提案: 「コーディング作業のAI効率化比率を教えて」
• 効率化適用: 「全フェーズにAI効率化を適用」

## リソース最適化
• 人数最適化: 「50人日を期間10日で完了させるには何人必要?」
• 期間最適化: 「3人で作業する場合の期間は?」

## ヒント
• 自然な日本語で話しかけてください
• 複数の操作を一度に依頼できます
• 変更内容はプレビュー表示されるので、確認してから適用できます`;

	// 表示用のメッセージ配列（会話履歴が空の場合はウェルカムメッセージを表示）
	$: displayMessages =
		conversations.length === 0
			? [
					{
						id: 'welcome',
						estimate_id: estimateId,
						role: 'assistant' as const,
						content: WELCOME_MESSAGE,
						created_at: new Date().toISOString()
					}
				]
			: conversations;

	// チャット履歴を自動スクロール
	afterUpdate(() => {
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	});

	async function sendMessage() {
		if (!message.trim() || isProcessing) return;

		const userMessage = message.trim();
		message = '';

		// /helpコマンドの処理（ローカル）
		if (userMessage === '/help') {
			conversations = [
				...conversations,
				{
					id: Date.now(),
					estimate_id: estimateId,
					role: 'user',
					content: userMessage,
					created_at: new Date().toISOString()
				},
				{
					id: Date.now() + 1,
					estimate_id: estimateId,
					role: 'assistant',
					content: HELP_MESSAGE,
					created_at: new Date().toISOString()
				}
			];
			dispatch('conversationsUpdated', { conversations });
			return;
		}

		isProcessing = true;
		pendingChanges = null;

		// ユーザーメッセージを即座に表示
		conversations = [
			...conversations,
			{
				id: Date.now(),
				estimate_id: estimateId,
				role: 'user',
				content: userMessage,
				created_at: new Date().toISOString()
			}
		];

		try {
			const response = await apiClient.sendEstimateChat(estimateId, userMessage);

			if (response.success && response.data) {
				const { message: aiMessage, preview, needsConfirmation } = response.data;

				// AIレスポンスを追加
				conversations = [
					...conversations,
					{
						id: Date.now() + 1,
						estimate_id: estimateId,
						role: 'assistant',
						content: aiMessage,
						created_at: new Date().toISOString()
					}
				];

				// プレビューがある場合はpendingChangesに設定
				if (needsConfirmation && preview && preview.length > 0) {
					pendingChanges = preview;
				} else if (!needsConfirmation) {
					// 確認不要の場合はフェーズを再読み込み
					dispatch('phasesUpdated');
				}

				dispatch('conversationsUpdated', { conversations });
			}
		} catch (error: any) {
			console.error('AI chat error:', error);

			conversations = [
				...conversations,
				{
					id: Date.now() + 1,
					estimate_id: estimateId,
					role: 'assistant',
					content: `エラーが発生しました: ${error.message || '不明なエラー'}\n\nもう一度お試しください。`,
					created_at: new Date().toISOString()
				}
			];

			dispatch('conversationsUpdated', { conversations });
		} finally {
			isProcessing = false;
		}
	}

	async function handleApplyChanges(event: CustomEvent) {
		const { changes } = event.detail;

		try {
			isProcessing = true;
			const response = await apiClient.applyEstimateChanges(estimateId, changes);

			if (response.success) {
				pendingChanges = null;

				// 成功メッセージを追加
				conversations = [
					...conversations,
					{
						id: Date.now(),
						estimate_id: estimateId,
						role: 'assistant',
						content: `変更を適用しました。${changes.length}件のフェーズを更新しました。`,
						created_at: new Date().toISOString()
					}
				];

				dispatch('conversationsUpdated', { conversations });
				dispatch('phasesUpdated');
			}
		} catch (error: any) {
			console.error('Apply changes error:', error);

			conversations = [
				...conversations,
				{
					id: Date.now(),
					estimate_id: estimateId,
					role: 'assistant',
					content: `変更の適用に失敗しました: ${error.message}`,
					created_at: new Date().toISOString()
				}
			];

			dispatch('conversationsUpdated', { conversations });
		} finally {
			isProcessing = false;
		}
	}

	function handleCancelChanges() {
		pendingChanges = null;

		conversations = [
			...conversations,
			{
				id: Date.now(),
				estimate_id: estimateId,
				role: 'assistant',
				content: '変更をキャンセルしました。',
				created_at: new Date().toISOString()
			}
		];

		dispatch('conversationsUpdated', { conversations });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}
</script>

<div class="chat-panel">
	<div class="chat-header">
		<i class="bi bi-robot"></i>
		<h3>AI アシスタント</h3>
	</div>

		<div class="chat-messages" bind:this={chatContainer}>
			{#each displayMessages as conv}
				<EstimateChatMessage
					role={conv.role === 'system' ? 'assistant' : conv.role}
					content={conv.content}
					timestamp={conv.created_at}
				/>
			{/each}

		{#if isProcessing}
			<div class="typing-indicator">
				<div class="typing-dot"></div>
				<div class="typing-dot"></div>
				<div class="typing-dot"></div>
			</div>
		{/if}

		{#if pendingChanges && pendingChanges.length > 0}
			<EstimateChangePreview
				changes={pendingChanges}
				{currentPhases}
				on:apply={handleApplyChanges}
				on:cancel={handleCancelChanges}
			/>
		{/if}
	</div>

	<div class="chat-input-area">
		<textarea
			bind:value={message}
			on:keydown={handleKeydown}
			placeholder="メッセージを入力... (Shift+Enterで改行)"
			rows="3"
			disabled={isProcessing}
		></textarea>
		<button class="send-btn" on:click={sendMessage} disabled={!message.trim() || isProcessing}>
			<i class="bi bi-send-fill"></i>
		</button>
	</div>
</div>

<style>
	.chat-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.chat-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 20px;
		border-bottom: 1px solid #e5e7eb;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
	}

	.chat-header i {
		font-size: 24px;
		color: #667eea;
	}

	.chat-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: #111827;
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
		display: flex;
		flex-direction: column;
	}

	.typing-indicator {
		display: flex;
		gap: 6px;
		padding: 12px 16px;
		background: #f3f4f6;
		border-radius: 12px;
		width: fit-content;
		margin-bottom: 16px;
	}

	.typing-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #9ca3af;
		animation: typing 1.4s infinite;
	}

	.typing-dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-dot:nth-child(3) {
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
		display: flex;
		gap: 12px;
		padding: 16px 20px;
		border-top: 1px solid #e5e7eb;
		background: #ffffff;
	}

	.chat-input-area textarea {
		flex: 1;
		padding: 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-family: inherit;
		resize: none;
		transition: all 0.2s ease;
	}

	.chat-input-area textarea:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.chat-input-area textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.send-btn {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		border: none;
		border-radius: 8px;
		font-size: 18px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.send-btn:hover:not(:disabled) {
		transform: scale(1.05);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	/* スクロールバー */
	.chat-messages::-webkit-scrollbar {
		width: 6px;
	}

	.chat-messages::-webkit-scrollbar-track {
		background: #f3f4f6;
	}

	.chat-messages::-webkit-scrollbar-thumb {
		background: #d1d5db;
		border-radius: 3px;
	}

	.chat-messages::-webkit-scrollbar-thumb:hover {
		background: #9ca3af;
	}
</style>
