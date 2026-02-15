/**
 * レポートアシスタントの状態管理
 */
import { writable, derived } from 'svelte/store';

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: Date;
	metadata?: {
		reportPreview?: any;
		insights?: any[];
		suggestions?: string[];
		requiresConfirmation?: boolean;
	};
}

export interface ReportContext {
	reportType?: string;
	projectId?: number;
	userId?: number;
	dateRange?: {
		start: string;
		end: string;
	};
}

// チャット履歴
export const chatHistory = writable<ChatMessage[]>([]);

// 現在のコンテキスト
export const reportContext = writable<ReportContext>({});

// ローディング状態
export const isLoading = writable(false);

// エラーメッセージ
export const errorMessage = writable('');

// AIアシスタントの表示状態
export const showAssistant = writable(false);

// ユーザー入力
export const userInput = writable('');

// チャット履歴に新しいメッセージを追加
export function addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>) {
	const newMessage: ChatMessage = {
		...message,
		id: `msg-${Date.now()}-${Math.random()}`,
		timestamp: new Date()
	};

	chatHistory.update((history) => [...history, newMessage]);
	return newMessage;
}

// チャット履歴をクリア
export function clearChat() {
	chatHistory.set([]);
	reportContext.set({});
	errorMessage.set('');
}

// コンテキストを更新
export function updateContext(updates: Partial<ReportContext>) {
	reportContext.update((ctx) => ({ ...ctx, ...updates }));
}

// 初期メッセージを設定
export function setInitialMessage(message: string, suggestions?: string[]) {
	addMessage({
		role: 'assistant',
		content: message,
		metadata: {
			suggestions
		}
	});
}

// 最後のアシスタントメッセージを取得
export const lastAssistantMessage = derived(chatHistory, ($chatHistory) => {
	const assistantMessages = $chatHistory.filter((msg) => msg.role === 'assistant');
	return assistantMessages[assistantMessages.length - 1] || null;
});

// チャット履歴が空かどうか
export const isChatEmpty = derived(chatHistory, ($chatHistory) => $chatHistory.length === 0);
