<script lang="ts">
	import { createEventDispatcher, afterUpdate } from 'svelte';
	import { onMount } from 'svelte';
	import WbsAiChatMessage from './WbsAiChatMessage.svelte';
	import WbsAiChangePreview from './WbsAiChangePreview.svelte';
	import WbsAiMentionAutocomplete from './WbsAiMentionAutocomplete.svelte';
	import type { WbsTask } from './types';
	import { apiClient } from '$lib/api/client';

	export let tasks: WbsTask[] = [];
	export let projectId: number;
	export let projectName: string = '';
	export let projectGoal: string = '';
	export let users: Array<{ id: number; username: string; fullName: string }> = [];
	export let show: boolean = false;

	const dispatch = createEventDispatcher();

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		timestamp: Date;
		preview?: any[] | null;
	}

	let messages: ChatMessage[] = [];
	let inputMessage: string = '';
	let isProcessing: boolean = false;
	let chatContainer: HTMLElement;
	let pendingChanges: any[] | null = null;
	let textarea: HTMLTextAreaElement;

	// @メンション機能
	let showMentionDropdown = false;
	let mentionSearchQuery = '';
	let mentionPosition = { top: 0, left: 0, bottom: 0 };
	let mentionStartIndex = -1;
	let autocompleteComponent: WbsAiMentionAutocomplete;

	const CHAT_HISTORY_KEY = `tsutaai.wbs.chat.${projectId}`;
	const MAX_MESSAGES = 50;

	// ウェルカムメッセージ
	const WELCOME_MESSAGE: ChatMessage = {
		id: 'welcome',
		role: 'assistant',
		content: `こんにちは！WBS AIアシスタントです。

タスクの管理をお手伝いします。以下のようなことができます：

• タスクの照会・更新・追加・削除
• 複数タスクの一括操作
• 依存関係の設定
• リスケジュール提案

詳しくは「/help」と入力してください。
「@タスク名」でタスクを指定できます。`,
		timestamp: new Date()
	};

	// /helpコマンドのレスポンス
	const HELP_MESSAGE = `# WBS AIアシスタント - 利用可能な機能

## 基本操作
• タスク照会: 「タスク1.2の情報を教えて」「担当が田中のタスク一覧」
• タスク更新: 「タスク1.2の期限を2025-11-15に変更」「タスク2.3の担当者を佐藤に変更」
• タスク追加: 「設計フェーズ配下にレビュータスクを追加」
• タスク削除: 「タスク3.1を削除」

## 一括操作
• 一括更新: 「開発フェーズの全タスクの期限を1週間延期」
• 条件指定: 「未着手のタスクを全て佐藤に割り当てて」

## 高度な操作
• 依存関係: 「タスク2.3はタスク2.1に依存するように設定」
• リスケジュール: 「タスク1.2が遅延したのでリスケジュール提案して」
• 自動割り当て: 「未割り当てのタスクを自動で担当者に振り分けて」
• タスク分解: 「実装タスクをより細かいサブタスクに分解して」

## @メンション
タスク名の前に @ を付けると、そのタスクを参照できます。
例: 「@設計レビューの期限を確認」

## ヒント
• 自然な日本語で話しかけてください
• 複数の操作を一度に依頼できます
• 変更内容はプレビュー表示されるので、確認してから適用できます`;

	onMount(() => {
		loadChatHistory();

		// ウェルカムメッセージがまだない場合は追加
		if (messages.length === 0) {
			messages = [WELCOME_MESSAGE];
			saveChatHistory();
		}
	});

	// チャット履歴を自動スクロール
	afterUpdate(() => {
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	});

	// ローカルストレージから履歴を読み込み
	function loadChatHistory() {
		try {
			const saved = localStorage.getItem(CHAT_HISTORY_KEY);
			if (saved) {
				const parsed = JSON.parse(saved);
				messages = parsed.map((msg: any) => ({
					...msg,
					timestamp: new Date(msg.timestamp)
				}));
			}
		} catch (error) {
			console.error('チャット履歴の読み込みに失敗しました:', error);
			messages = [];
		}
	}

	// ローカルストレージに履歴を保存
	function saveChatHistory() {
		try {
			// 最大件数を超えたら古いメッセージを削除
			if (messages.length > MAX_MESSAGES) {
				messages = messages.slice(-MAX_MESSAGES);
			}
			localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
		} catch (error) {
			console.error('チャット履歴の保存に失敗しました:', error);
		}
	}

	// メッセージ送信処理
	async function handleSendMessage() {
		const trimmed = inputMessage.trim();
		if (!trimmed || isProcessing) return;

		// ユーザーメッセージを追加
		const userMessage: ChatMessage = {
			id: `user-${Date.now()}`,
			role: 'user',
			content: trimmed,
			timestamp: new Date()
		};
		messages = [...messages, userMessage];
		inputMessage = '';
		saveChatHistory();

		// /helpコマンドの処理（ローカル）
		if (trimmed === '/help') {
			const helpResponse: ChatMessage = {
				id: `assistant-${Date.now()}`,
				role: 'assistant',
				content: HELP_MESSAGE,
				timestamp: new Date()
			};
			messages = [...messages, helpResponse];
			saveChatHistory();
			return;
		}

		// API呼び出し
		isProcessing = true;
		pendingChanges = null;

		try {
			// 会話履歴を構築（最新の20件のみ送信）
			const history = messages.slice(-20).map((msg) => ({
				role: msg.role,
				content: msg.content
			}));

			// 「すべて」「全て」「全タスク」が含まれている場合、明示的な指示を追加
			let processedMessage = trimmed;
			const allTasksPatterns = [
				/すべて.*タスク/,
				/全て.*タスク/,
				/全タスク/,
				/タスク.*すべて/,
				/タスク.*全て/,
				/全部.*タスク/,
				/タスク.*全部/
			];

			const containsAllTasks = allTasksPatterns.some((pattern) => pattern.test(trimmed));
			if (
				containsAllTasks &&
				(trimmed.includes('変更') ||
					trimmed.includes('修正') ||
					trimmed.includes('更新') ||
					trimmed.includes('設定'))
			) {
				processedMessage = `${trimmed}\n\n【重要】この指示は全タスクを対象とするため、必ずbulk_update_tasksツールを使用し、filterパラメータに空のオブジェクト{}を指定してください。`;
			}

			const response = await apiClient.wbsChat({
				message: processedMessage,
				history,
				currentTasks: tasks,
				projectContext: {
					id: projectId,
					name: projectName,
					goal: projectGoal
				},
				users
			});

			if (response.success && response.data) {
				const { message: aiMessage, preview, needsConfirmation } = response.data;

				const assistantMessage: ChatMessage = {
					id: `assistant-${Date.now()}`,
					role: 'assistant',
					content: aiMessage,
					timestamp: new Date(),
					preview: preview || null
				};

				messages = [...messages, assistantMessage];
				saveChatHistory();

				// プレビューがある場合はpendingChangesに設定
				if (needsConfirmation && preview && preview.length > 0) {
					pendingChanges = preview;
				}
			}
		} catch (error: any) {
			console.error('AI chat error:', error);

			const errorMessage: ChatMessage = {
				id: `assistant-${Date.now()}`,
				role: 'assistant',
				content: `エラーが発生しました: ${error.message || '不明なエラー'}\n\nもう一度お試しください。`,
				timestamp: new Date()
			};
			messages = [...messages, errorMessage];
			saveChatHistory();
		} finally {
			isProcessing = false;
		}
	}

	// プレビューを適用
	function handleApplyPreview(event: CustomEvent) {
		const { changes } = event.detail;
		dispatch('applyChanges', { changes });
		pendingChanges = null;
	}

	// プレビューをキャンセル
	function handleCancelPreview() {
		pendingChanges = null;
	}

	// 入力変更時の処理（@メンション検出）
	function handleInputChange() {
		const cursorPosition = textarea.selectionStart;
		const text = inputMessage.substring(0, cursorPosition);
		const lastAtIndex = text.lastIndexOf('@');

		if (lastAtIndex !== -1) {
			const textAfterAt = text.substring(lastAtIndex + 1);
			// @の後にスペースや改行がなければメンション候補を表示
			if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
				mentionSearchQuery = textAfterAt;
				mentionStartIndex = lastAtIndex;
				updateMentionPosition();
				showMentionDropdown = true;
				return;
			}
		}

		// @メンション候補を閉じる
		showMentionDropdown = false;
	}

	// メンション候補の位置を更新
	function updateMentionPosition() {
		if (!textarea) return;

		const rect = textarea.getBoundingClientRect();
		const dropdownWidth = 500; // オートコンプリートの最大幅
		const dropdownMaxHeight = 400; // オートコンプリートの最大高さ
		const windowWidth = window.innerWidth;
		const windowHeight = window.innerHeight;

		// 入力欄の真上に配置（オートコンプリートの高さ分上に配置）
		// bottomで計算して、入力欄の上端からドロップダウンが表示されるようにする
		let bottom = windowHeight - rect.top + 10; // 10pxの余白

		// 左側の位置を計算（右側がはみ出さないように）
		let left = rect.left;

		// 右側がウィンドウをはみ出す場合は左に寄せる
		if (left + dropdownWidth > windowWidth) {
			left = Math.max(10, windowWidth - dropdownWidth - 10);
		}

		// 左端がはみ出さないようにする
		if (left < 10) {
			left = 10;
		}

		mentionPosition = {
			left,
			top: rect.top,
			bottom
		};
	}

	// メンション選択時の処理
	function handleMentionSelect(event: CustomEvent<{ task: WbsTask }>) {
		const { task } = event.detail;

		// @から始まる検索文字列を選択したタスク名に置換
		const before = inputMessage.substring(0, mentionStartIndex);
		const after = inputMessage.substring(textarea.selectionStart);
		inputMessage = `${before}@${task.name} ${after}`;

		// カーソル位置を調整
		const newCursorPos = mentionStartIndex + task.name.length + 2;
		setTimeout(() => {
			textarea.focus();
			textarea.setSelectionRange(newCursorPos, newCursorPos);
		}, 0);

		// ドロップダウンを閉じる
		showMentionDropdown = false;
	}

	// メンション候補を閉じる
	function handleMentionClose() {
		showMentionDropdown = false;
	}

	// Enterキーで送信、Shift+Enterで改行
	function handleKeyDown(event: KeyboardEvent) {
		// メンション候補が表示されている場合はオートコンプリートに処理を委譲
		if (showMentionDropdown && autocompleteComponent) {
			const handled = autocompleteComponent.handleKeyDown(event);
			if (handled) return;
		}

		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	}

	// チャット履歴をクリア
	function clearHistory() {
		if (confirm('チャット履歴を削除してもよろしいですか？')) {
			messages = [WELCOME_MESSAGE];
			saveChatHistory();
		}
	}

	// パネルを閉じる
	function handleClose() {
		dispatch('close');
	}
</script>

<div class="ai-assistant-panel" class:show>
	<div class="panel-header">
		<div class="header-content">
			<div class="header-icon">
				<i class="bi bi-robot"></i>
			</div>
			<h3>AIアシスタント</h3>
		</div>
		<div class="header-actions">
			<button type="button" class="header-btn" on:click={clearHistory} title="履歴をクリア">
				<i class="bi bi-trash"></i>
			</button>
			<button type="button" class="header-btn close-btn" on:click={handleClose} title="閉じる">
				<i class="bi bi-x-lg"></i>
			</button>
		</div>
	</div>

	<div class="chat-container" bind:this={chatContainer}>
		{#each messages as message (message.id)}
			<WbsAiChatMessage {message} isUser={message.role === 'user'} />
		{/each}

		{#if isProcessing}
			<div class="typing-indicator">
				<div class="typing-dot"></div>
				<div class="typing-dot"></div>
				<div class="typing-dot"></div>
			</div>
		{/if}

		{#if pendingChanges && pendingChanges.length > 0}
			<WbsAiChangePreview
				changes={pendingChanges}
				{tasks}
				on:apply={handleApplyPreview}
				on:cancel={handleCancelPreview}
			/>
		{/if}
	</div>

	<div class="input-container">
		<textarea
			bind:this={textarea}
			bind:value={inputMessage}
			on:input={handleInputChange}
			on:keydown={handleKeyDown}
			placeholder="メッセージを入力... (@でタスク指定, Enter: 送信, Shift+Enter: 改行)"
			rows="3"
			disabled={isProcessing}
		></textarea>
		<button
			type="button"
			class="send-btn"
			on:click={handleSendMessage}
			disabled={!inputMessage.trim() || isProcessing}
		>
			<i class="bi bi-send-fill"></i>
		</button>
	</div>
</div>

<!-- @メンションオートコンプリート -->
<WbsAiMentionAutocomplete
	bind:this={autocompleteComponent}
	{tasks}
	searchQuery={mentionSearchQuery}
	show={showMentionDropdown}
	position={mentionPosition}
	on:select={handleMentionSelect}
	on:close={handleMentionClose}
/>

<style>
	.ai-assistant-panel {
		position: fixed;
		top: 0;
		right: 0;
		width: 400px;
		height: 100vh;
		background: #ffffff;
		border-left: 1px solid #e5e7eb;
		box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		z-index: 100;
		transform: translateX(100%);
		transition: transform 0.3s ease;
	}

	.ai-assistant-panel.show {
		transform: translateX(0);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
		border-bottom: 1px solid #e5e7eb;
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.header-icon {
		font-size: 24px;
		color: #667eea;
	}

	.panel-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #111827;
	}

	.header-actions {
		display: flex;
		gap: 8px;
	}

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: transparent;
		border-radius: 8px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.header-btn:hover {
		background: rgba(107, 114, 128, 0.1);
		color: #374151;
	}

	.header-btn.close-btn:hover {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}

	.chat-container {
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

	.input-container {
		padding: 16px 20px;
		border-top: 1px solid #e5e7eb;
		background: #ffffff;
		display: flex;
		gap: 12px;
		align-items: flex-end;
	}

	textarea {
		flex: 1;
		padding: 12px 14px;
		border: 1px solid #d1d5db;
		border-radius: 12px;
		font-size: 14px;
		font-family: inherit;
		resize: none;
		transition: all 0.2s ease;
		background: #f9fafb;
	}

	textarea:focus {
		outline: none;
		border-color: #8b5cf6;
		background: #ffffff;
	}

	textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.send-btn {
		width: 48px;
		height: 48px;
		border: none;
		border-radius: 12px;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		font-size: 18px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.send-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* スクロールバーのスタイル */
	.chat-container::-webkit-scrollbar {
		width: 6px;
	}

	.chat-container::-webkit-scrollbar-track {
		background: #f3f4f6;
	}

	.chat-container::-webkit-scrollbar-thumb {
		background: #d1d5db;
		border-radius: 3px;
	}

	.chat-container::-webkit-scrollbar-thumb:hover {
		background: #9ca3af;
	}

	@media (max-width: 768px) {
		.ai-assistant-panel {
			width: 100%;
		}
	}
</style>
