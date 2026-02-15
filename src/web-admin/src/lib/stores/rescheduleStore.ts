import { writable, derived } from 'svelte/store';
import type { WbsTask } from '$lib/components/wbs/types';

/**
 * リスケジュールトリガーの種類
 */
export type RescheduleTriggerType =
	| 'delay' // タスクの進捗遅延
	| 'vacation' // メンバーの休暇
	| 'blocked' // タスクのブロック
	| 'reassign' // 担当者変更
	| 'effort_change' // 想定工数変更
	| 'manual'; // 手動実行

/**
 * リスケジュールトリガーイベント
 */
export interface RescheduleTrigger {
	id: string;
	type: RescheduleTriggerType;
	projectId: number;
	affectedTaskIds: string[];
	details: {
		taskName?: string;
		oldValue?: any;
		newValue?: any;
		delayDays?: number;
		userName?: string;
		vacationStart?: string;
		vacationEnd?: string;
	};
	detectedAt: string;
	dismissed: boolean;
}

/**
 * リスケジュール提案
 */
export interface RescheduleProposal {
	taskId: string;
	taskName: string;
	currentStart: string | undefined;
	currentEnd: string | undefined;
	proposedStart: string;
	proposedEnd: string;
	reason: string;
	impact: 'low' | 'medium' | 'high';
}

/**
 * リスケジュール提案サマリー
 */
export interface RescheduleSummary {
	affectedTasks: number;
	delayDays: number;
	criticalPathChanged: boolean;
	newProjectEndDate: string | null;
}

/**
 * リスケジュールストアの状態
 */
export interface RescheduleState {
	triggers: RescheduleTrigger[];
	currentProposal: {
		triggerId: string;
		changes: RescheduleProposal[];
		summary: RescheduleSummary;
	} | null;
	showProposalModal: boolean;
}

/**
 * リスケジュールストア
 */
const createRescheduleStore = () => {
	const { subscribe, set, update } = writable<RescheduleState>({
		triggers: [],
		currentProposal: null,
		showProposalModal: false
	});

	return {
		subscribe,

		/**
		 * トリガーを追加
		 */
		addTrigger: (trigger: Omit<RescheduleTrigger, 'id' | 'detectedAt' | 'dismissed'>) => {
			const newTrigger: RescheduleTrigger = {
				...trigger,
				id: `trigger-${Date.now()}`,
				detectedAt: new Date().toISOString(),
				dismissed: false
			};

			update((state) => ({
				...state,
				triggers: [...state.triggers, newTrigger]
			}));

			return newTrigger.id;
		},

		/**
		 * トリガーを却下
		 */
		dismissTrigger: (triggerId: string) => {
			update((state) => ({
				...state,
				triggers: state.triggers.map((t) => (t.id === triggerId ? { ...t, dismissed: true } : t))
			}));
		},

		/**
		 * リスケジュール提案を設定
		 */
		setProposal: (triggerId: string, changes: RescheduleProposal[], summary: RescheduleSummary) => {
			update((state) => ({
				...state,
				currentProposal: { triggerId, changes, summary },
				showProposalModal: true
			}));
		},

		/**
		 * リスケジュール提案を適用
		 */
		applyProposal: () => {
			update((state) => {
				if (state.currentProposal) {
					// トリガーを却下
					const triggerId = state.currentProposal.triggerId;
					return {
						...state,
						triggers: state.triggers.map((t) =>
							t.id === triggerId ? { ...t, dismissed: true } : t
						),
						currentProposal: null,
						showProposalModal: false
					};
				}
				return state;
			});
		},

		/**
		 * リスケジュール提案をキャンセル
		 */
		cancelProposal: () => {
			update((state) => ({
				...state,
				currentProposal: null,
				showProposalModal: false
			}));
		},

		/**
		 * トリガーをクリア
		 */
		clearTriggers: (projectId?: number) => {
			update((state) => ({
				...state,
				triggers: projectId ? state.triggers.filter((t) => t.projectId !== projectId) : []
			}));
		},

		/**
		 * 状態をリセット
		 */
		reset: () => {
			set({
				triggers: [],
				currentProposal: null,
				showProposalModal: false
			});
		}
	};
};

export const rescheduleStore = createRescheduleStore();

/**
 * 未処理のトリガー数（派生ストア）
 */
export const pendingTriggersCount = derived(
	rescheduleStore,
	($rescheduleStore) => $rescheduleStore.triggers.filter((t) => !t.dismissed).length
);

/**
 * タスク遅延検出ヘルパー
 */
export function detectTaskDelay(task: WbsTask, today: Date): boolean {
	// 進行中または計画中のタスクのみチェック
	if (task.status !== 'in-progress' && task.status !== 'planning') {
		return false;
	}

	// 期限が設定されていない場合はスキップ
	if (!task.endDate) {
		return false;
	}

	const endDate = new Date(task.endDate);
	const progress = task.progress || 0;

	// 期限超過かつ進捗100%未満
	if (endDate < today && progress < 100) {
		return true;
	}

	// 期限まで残り時間が少ないのに進捗が遅い（20%以上の遅延）
	if (task.startDate) {
		const startDate = new Date(task.startDate);
		const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
		const elapsedDays = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

		if (totalDays > 0 && elapsedDays > 0) {
			const expectedProgress = (elapsedDays / totalDays) * 100;
			const actualProgress = progress;

			// 予定より20%以上遅延している場合
			if (expectedProgress - actualProgress > 20) {
				return true;
			}
		}
	}

	return false;
}

/**
 * タスクのブロック期間をチェック
 */
export function detectBlockedTask(task: WbsTask, blockThresholdDays: number = 3): boolean {
	if (task.status !== 'blocked') {
		return false;
	}

	// ブロック開始日の推定（実際にはタスク履歴から取得すべき）
	// 現在は簡易的に実装
	// 実際の実装では task_history テーブルから status が 'blocked' に変わった日時を取得
	return true; // 仮実装: ブロック中は常にトリガー
}

/**
 * タスクリストから遅延タスクを抽出
 */
export function findDelayedTasks(tasks: WbsTask[], today: Date = new Date()): WbsTask[] {
	const delayed: WbsTask[] = [];

	function traverse(taskList: WbsTask[]) {
		for (const task of taskList) {
			if (detectTaskDelay(task, today)) {
				delayed.push(task);
			}
			if (task.children && task.children.length > 0) {
				traverse(task.children);
			}
		}
	}

	traverse(tasks);
	return delayed;
}

/**
 * タスクリストからブロック中のタスクを抽出
 */
export function findBlockedTasks(tasks: WbsTask[]): WbsTask[] {
	const blocked: WbsTask[] = [];

	function traverse(taskList: WbsTask[]) {
		for (const task of taskList) {
			if (detectBlockedTask(task)) {
				blocked.push(task);
			}
			if (task.children && task.children.length > 0) {
				traverse(task.children);
			}
		}
	}

	traverse(tasks);
	return blocked;
}
