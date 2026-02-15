/**
 * WBSで扱うタスク構造の型定義
 */
export interface WbsTask {
	/** タスクの一意なID（階層番号やUUIDなど） */
	id: string;
	/** タスク名 */
	name: string;
	/** タスクの詳細説明 */
	description?: string;
	/** 実務担当者名 */
	assignee?: string;
	/** 想定工数（日） */
	effortDays?: number;
	/** ストーリーポイント */
	storyPoints?: number;
	/** 想定成果物 */
	deliverable?: string;
	/** 開始予定日 (YYYY-MM-DD) */
	startDate?: string;
	/** 終了予定日 (YYYY-MM-DD) */
	endDate?: string;
	/** 実際の開始日 (YYYY-MM-DD) */
	actualStartDate?: string;
	/** 実際の終了日 (YYYY-MM-DD) */
	actualEndDate?: string;
	/** 進捗率（0〜100） */
	progress: number;
	/** 依存先タスクIDの配列 */
	dependencies: string[];
	/** 子タスク一覧 */
	children: WbsTask[];
	/** 備考やメモ */
	notes?: string;
	/** ステータス (未着手 / 計画中 / 進行中 / レビュー待ち / ブロック中 / 完了) */
	status?: 'not-started' | 'planning' | 'in-progress' | 'in-review' | 'blocked' | 'completed';
	/** 優先度 (高 / 中 / 低 / なし) */
	priority?: 'high' | 'medium' | 'low' | 'none';
	/** タグ一覧 */
	tags?: string[];
	/** アーカイブフラグ */
	archived?: boolean;
	/** 親タスクID（フラット化時などに使用） */
	parentTaskId?: string;
}

/**
 * タスクの遅延情報を計算するユーティリティ型
 */
export interface TaskDelayInfo {
	/** 遅延しているか */
	isDelayed: boolean;
	/** 遅延日数（負の場合は前倒し） */
	delayDays: number;
	/** 遅延の重要度 */
	severity: 'none' | 'ahead' | 'on-track' | 'minor' | 'moderate' | 'critical';
	/** 遅延状況のメッセージ */
	message: string;
}
