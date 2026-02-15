<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { apiClient } from '$lib/api/client';
	import ReportPreview from './ReportPreview.svelte';
	import {
		chatHistory,
		reportContext,
		isLoading,
		errorMessage,
		showAssistant,
		userInput,
		addMessage,
		clearChat,
		setInitialMessage,
		updateContext
	} from '$lib/stores/reportAssistant';

	// チャット履歴の自動スクロール用
	let chatContainer: HTMLDivElement;

	// ヘルプモーダルの表示状態
	let showHelp = false;

	// コンポーネントマウント時
	onMount(async () => {
		// チャット履歴が空の場合のみ初期メッセージを取得
		if ($chatHistory.length === 0) {
			try {
				const response = await apiClient.reportAssistantGetInitial();
				if (response.success && response.data) {
					setInitialMessage(response.data.message, response.data.suggestions);
				}
			} catch (error) {
				console.error('初期メッセージの取得に失敗:', error);
				setInitialMessage('こんにちは！どのようなレポートを作成しますか？', [
					'📊 プロジェクト進捗レポート',
					'👥 チームパフォーマンスレポート',
					'⚠️ リスク分析レポート',
					'💡 カスタムレポート'
				]);
			}
		}
	});

	// チャット履歴が更新されたら自動スクロール
	$: if ($chatHistory && chatContainer) {
		setTimeout(() => {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}, 100);
	}

	// メッセージ送信
	async function sendMessage() {
		const message = $userInput.trim();
		if (!message || $isLoading) return;

		// ユーザーメッセージを追加
		addMessage({
			role: 'user',
			content: message
		});

		// 入力欄をクリア
		userInput.set('');

		// ローディング開始
		isLoading.set(true);
		errorMessage.set('');

		try {
			// API呼び出し
			const response = await apiClient.reportAssistantChat({
				message,
				chatHistory: $chatHistory.map((msg) => ({
					role: msg.role,
					content: msg.content,
					timestamp: msg.timestamp
				})),
				context: $reportContext
			});

			if (response.success && response.data) {
				// AIメッセージを追加
				addMessage({
					role: 'assistant',
					content: response.data.message,
					metadata: {
						suggestions: response.data.suggestions,
						reportPreview: response.data.reportPreview,
						insights: response.data.insights,
						requiresConfirmation: response.data.requiresConfirmation
					}
				});

				// コンテキストを更新
				if (response.data.metadata) {
					updateContext(response.data.metadata);
				}
			}
		} catch (error) {
			console.error('メッセージ送信エラー:', error);
			errorMessage.set('エラーが発生しました。もう一度お試しください。');

			addMessage({
				role: 'assistant',
				content: 'エラーが発生しました。もう一度お試しください。'
			});
		} finally {
			isLoading.set(false);
		}
	}

	// 提案ボタンクリック
	function handleSuggestionClick(suggestion: string) {
		userInput.set(suggestion);
		sendMessage();
	}

	// Enterキーで送信
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	// パネルを閉じる
	function closePanel() {
		showAssistant.set(false);
	}

	// チャットをリセット
	async function resetChat() {
		if (confirm('チャット履歴をクリアしますか？')) {
			clearChat();

			// 初期メッセージを再取得
			try {
				const response = await apiClient.reportAssistantGetInitial();
				if (response.success && response.data) {
					setInitialMessage(response.data.message, response.data.suggestions);
				}
			} catch (error) {
				console.error('初期メッセージの取得に失敗:', error);
				setInitialMessage('こんにちは！どのようなレポートを作成しますか？', [
					'📊 プロジェクト進捗レポート',
					'👥 チームパフォーマンスレポート',
					'⚠️ リスク分析レポート',
					'💡 カスタムレポート'
				]);
			}
		}
	}
</script>

<div class="ai-assistant-panel" transition:slide={{ duration: 300, easing: quintOut, axis: 'x' }}>
	<!-- ヘッダー -->
	<div class="assistant-header">
		<div class="header-title">
			<i class="bi bi-robot"></i>
			<span>AIアシスタント</span>
		</div>
		<div class="header-actions">
			<button class="btn-help" on:click={() => (showHelp = true)} title="使い方">
				<i class="bi bi-question-circle"></i>
			</button>
			<button class="btn-reset" on:click={resetChat} title="チャットをリセット">
				<i class="bi bi-arrow-clockwise"></i>
			</button>
			<button class="btn-close" on:click={closePanel} title="閉じる">
				<i class="bi bi-x-lg"></i>
			</button>
		</div>
	</div>

	<!-- チャット履歴 -->
	<div class="chat-history" bind:this={chatContainer}>
		{#each $chatHistory as message (message.id)}
			<div
				class="message"
				class:user={message.role === 'user'}
				class:assistant={message.role === 'assistant'}
			>
				<div class="message-content">
					<p>{message.content}</p>

					<!-- 提案ボタン -->
					{#if message.metadata?.suggestions && message.metadata.suggestions.length > 0}
						<div class="suggestions">
							{#each message.metadata.suggestions as suggestion}
								<button class="suggestion-btn" on:click={() => handleSuggestionClick(suggestion)}>
									{suggestion}
								</button>
							{/each}
						</div>
					{/if}

					<!-- レポートプレビュー -->
					{#if message.metadata?.reportPreview}
						<div class="report-preview-container">
							<ReportPreview report={message.metadata.reportPreview} />
						</div>
					{/if}
				</div>
			</div>
		{/each}

		<!-- ローディング表示 -->
		{#if $isLoading}
			<div class="message assistant">
				<div class="message-content loading">
					<div class="typing-indicator">
						<span></span>
						<span></span>
						<span></span>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- 入力エリア -->
	<div class="input-area">
		{#if $errorMessage}
			<div class="error-message">
				<i class="bi bi-exclamation-triangle"></i>
				{$errorMessage}
			</div>
		{/if}
		<textarea
			bind:value={$userInput}
			on:keydown={handleKeyDown}
			placeholder="メッセージを入力..."
			rows="3"
			disabled={$isLoading}
		></textarea>
		<button class="btn-send" on:click={sendMessage} disabled={!$userInput.trim() || $isLoading}>
			<i class="bi bi-send-fill"></i>
			送信
		</button>
	</div>
</div>

<!-- ヘルプモーダル -->
{#if showHelp}
	<div class="help-modal-overlay" on:click={() => (showHelp = false)}>
		<div class="help-modal" on:click|stopPropagation>
			<div class="help-header">
				<h3>
					<i class="bi bi-question-circle"></i>
					AIアシスタントの使い方
				</h3>
				<button class="btn-close-modal" on:click={() => (showHelp = false)}>
					<i class="bi bi-x-lg"></i>
				</button>
			</div>

			<div class="help-content">
				<section>
					<h4>💡 できること</h4>
					<ul>
						<li>
							<strong>対話型レポート作成</strong> - チャット形式で要件を伝えるだけで最適なレポートを作成
						</li>
						<li><strong>自動構成決定</strong> - 目的に応じて必要な情報を自動選択</li>
						<li><strong>AI洞察</strong> - データから重要なポイントを自動抽出</li>
						<li><strong>カスタマイズ</strong> - 「もっと詳しく」「ポジティブに」など自由に指示</li>
						<li><strong>ダウンロード</strong> - Markdown/HTML形式で出力</li>
					</ul>
				</section>

				<section>
					<h4>🚀 使い方</h4>
					<ol>
						<li>
							<strong>レポートタイプを選択</strong><br />
							<small>提案ボタンから選ぶか、自由に入力してください</small>
						</li>
						<li>
							<strong>AIの質問に答える</strong><br />
							<small>対象プロジェクト、期間、重点項目などを選択</small>
						</li>
						<li>
							<strong>レポートを確認</strong><br />
							<small>AIが生成したレポートをプレビュー</small>
						</li>
						<li>
							<strong>修正・調整</strong><br />
							<small>「期限超過の詳細を追加」など自由に指示</small>
						</li>
						<li>
							<strong>ダウンロード</strong><br />
							<small>PDF、Markdown、HTMLで出力</small>
						</li>
					</ol>
				</section>

				<section>
					<h4>💬 入力例</h4>
					<div class="examples">
						<div class="example">
							<i class="bi bi-chat-dots"></i>
							「プロジェクトAの先月の進捗をクライアント向けにまとめたい」
						</div>
						<div class="example">
							<i class="bi bi-chat-dots"></i>
							「チーム全体のパフォーマンスレポートを作成」
						</div>
						<div class="example">
							<i class="bi bi-chat-dots"></i>
							「リスク分析レポートに対策も含めて」
						</div>
						<div class="example">
							<i class="bi bi-chat-dots"></i>
							「もっとポジティブな表現に変更して」
						</div>
					</div>
				</section>

				<section>
					<h4>⌨️ ショートカット</h4>
					<div class="shortcuts">
						<div class="shortcut">
							<kbd>Enter</kbd>
							<span>メッセージ送信</span>
						</div>
						<div class="shortcut">
							<kbd>Shift</kbd> + <kbd>Enter</kbd>
							<span>改行</span>
						</div>
						<div class="shortcut">
							<i class="bi bi-hand-index-thumb"></i>
							<span>提案ボタンクリック - 自動入力して送信</span>
						</div>
					</div>
				</section>

				<section>
					<h4>🔄 リセット</h4>
					<p>
						チャット履歴をクリアして最初からやり直したい場合は、 ヘッダーの <i
							class="bi bi-arrow-clockwise"
						></i> ボタンをクリックしてください。
					</p>
				</section>

				<section>
					<h4>📊 レポートタイプ</h4>
					<div class="report-types">
						<div class="report-type">
							<div class="type-icon">📊</div>
							<div class="type-info">
								<strong>プロジェクト進捗レポート</strong>
								<p>進捗率、タスク状況、予測完了日を含む</p>
							</div>
						</div>
						<div class="report-type">
							<div class="type-icon">👥</div>
							<div class="type-info">
								<strong>チームパフォーマンスレポート</strong>
								<p>メンバー別の生産性、稼働率、貢献度</p>
							</div>
						</div>
						<div class="report-type">
							<div class="type-icon">⚠️</div>
							<div class="type-info">
								<strong>リスク分析レポート</strong>
								<p>遅延リスク、リソース不足、ブロッカー</p>
							</div>
						</div>
						<div class="report-type">
							<div class="type-icon">💡</div>
							<div class="type-info">
								<strong>カスタムレポート</strong>
								<p>自由に内容を指定</p>
							</div>
						</div>
					</div>
				</section>
			</div>

			<div class="help-footer">
				<button class="btn-got-it" on:click={() => (showHelp = false)}> わかりました </button>
			</div>
		</div>
	</div>
{/if}

<style>
	.ai-assistant-panel {
		width: 500px;
		max-width: 90vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: #f8f9fa;
		box-shadow: -4px 0 12px rgba(0, 0, 0, 0.2);
	}

	/* ヘッダー */
	.assistant-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 18px;
		font-weight: 600;
	}

	.header-title i {
		font-size: 22px;
	}

	.header-actions {
		display: flex;
		gap: 8px;
	}

	.btn-help,
	.btn-reset,
	.btn-close {
		background: rgba(255, 255, 255, 0.2);
		border: none;
		color: white;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
	}

	.btn-help,
	.btn-reset {
		width: 40px;
		height: 40px;
	}

	.btn-close {
		width: 32px;
		height: 32px;
	}

	.btn-help:hover,
	.btn-reset:hover,
	.btn-close:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.btn-help i,
	.btn-reset i,
	.btn-close i {
		font-size: 16px;
	}

	/* チャット履歴 */
	.chat-history {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* メッセージ */
	.message {
		display: flex;
		gap: 12px;
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

	.message.user .message-content {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		margin-left: auto;
		border-radius: 18px 18px 4px 18px;
	}

	.message.assistant .message-content {
		background: white;
		color: #1f2937;
		border: 1px solid #e5e7eb;
		border-radius: 18px 18px 18px 4px;
	}

	.message-content {
		max-width: 80%;
		padding: 12px 16px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.message-content p {
		margin: 0;
		line-height: 1.6;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	/* 提案ボタン */
	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}

	.suggestion-btn {
		padding: 8px 14px;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 16px;
		color: inherit;
		font-size: 13px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.message.assistant .suggestion-btn {
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		color: #374151;
	}

	.suggestion-btn:hover {
		background: rgba(255, 255, 255, 0.3);
		transform: translateY(-1px);
	}

	.message.assistant .suggestion-btn:hover {
		background: #e5e7eb;
	}

	/* ローディング */
	.loading {
		padding: 16px;
	}

	.typing-indicator {
		display: flex;
		gap: 4px;
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
		}
		30% {
			transform: translateY(-10px);
		}
	}

	/* 入力エリア */
	.input-area {
		padding: 16px;
		background: white;
		border-top: 1px solid #e5e7eb;
		box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: #fee2e2;
		color: #991b1b;
		border-radius: 8px;
		margin-bottom: 12px;
		font-size: 13px;
	}

	.input-area textarea {
		width: 100%;
		padding: 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-family: inherit;
		resize: none;
		margin-bottom: 12px;
		transition: border-color 0.2s ease;
	}

	.input-area textarea:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.btn-send {
		width: 100%;
		padding: 12px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.btn-send:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.btn-send:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ヘルプモーダル */
	.help-modal-overlay {
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

	.help-modal {
		background: white;
		border-radius: 16px;
		width: 90%;
		max-width: 600px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		animation: slideUp 0.3s ease;
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.help-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px 24px;
		border-bottom: 1px solid #e5e7eb;
	}

	.help-header h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: #1f2937;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.btn-close-modal {
		background: none;
		border: none;
		color: #6b7280;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-close-modal:hover {
		background: #f3f4f6;
		color: #1f2937;
	}

	.help-content {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
	}

	.help-content section {
		margin-bottom: 24px;
	}

	.help-content section:last-child {
		margin-bottom: 0;
	}

	.help-content h4 {
		margin: 0 0 12px 0;
		font-size: 16px;
		font-weight: 600;
		color: #374151;
	}

	.help-content ul,
	.help-content ol {
		margin: 0;
		padding-left: 24px;
	}

	.help-content li {
		margin: 8px 0;
		line-height: 1.6;
		color: #4b5563;
	}

	.help-content li strong {
		color: #1f2937;
	}

	.help-content li small {
		color: #6b7280;
		display: block;
		margin-top: 4px;
	}

	.help-content p {
		margin: 0;
		line-height: 1.6;
		color: #4b5563;
	}

	.examples {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.example {
		padding: 12px;
		background: #f9fafb;
		border-left: 3px solid #667eea;
		border-radius: 6px;
		font-size: 14px;
		color: #374151;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.example i {
		color: #667eea;
		font-size: 16px;
	}

	.shortcuts {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.shortcut {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 14px;
	}

	.shortcut kbd {
		padding: 4px 8px;
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		font-family: monospace;
		font-size: 12px;
		color: #374151;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.shortcut span {
		color: #4b5563;
	}

	.report-types {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.report-type {
		display: flex;
		gap: 12px;
		padding: 12px;
		background: #f9fafb;
		border-radius: 8px;
	}

	.type-icon {
		font-size: 24px;
		flex-shrink: 0;
	}

	.type-info {
		flex: 1;
	}

	.type-info strong {
		display: block;
		color: #1f2937;
		font-size: 14px;
		margin-bottom: 4px;
	}

	.type-info p {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
	}

	.help-footer {
		padding: 16px 24px;
		border-top: 1px solid #e5e7eb;
		display: flex;
		justify-content: flex-end;
	}

	.btn-got-it {
		padding: 10px 24px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-got-it:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	/* スクロールバーのスタイル */
	.chat-history::-webkit-scrollbar,
	.help-content::-webkit-scrollbar {
		width: 8px;
	}

	.chat-history::-webkit-scrollbar-track,
	.help-content::-webkit-scrollbar-track {
		background: #f1f1f1;
	}

	.chat-history::-webkit-scrollbar-thumb,
	.help-content::-webkit-scrollbar-thumb {
		background: #888;
		border-radius: 4px;
	}

	.chat-history::-webkit-scrollbar-thumb:hover,
	.help-content::-webkit-scrollbar-thumb:hover {
		background: #555;
	}

	/* レポートプレビューコンテナ */
	.report-preview-container {
		margin-top: 16px;
	}
</style>
