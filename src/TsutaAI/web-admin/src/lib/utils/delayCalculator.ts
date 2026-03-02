/**
 * タスクの遅延情報を計算するユーティリティ
 */

import type { WbsTask, TaskDelayInfo } from '$lib/components/wbs/types';

/**
 * 2つの日付間の日数を計算
 * @param date1 開始日
 * @param date2 終了日
 * @returns 日数（date2 - date1）
 */
function calculateDaysDiff(date1: string | Date, date2: string | Date): number {
	const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
	const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
	const diffTime = d2.getTime() - d1.getTime();
	return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * タスクの遅延情報を計算
 * @param task WBSタスク
 * @returns 遅延情報
 */
export function calculateDelayInfo(task: WbsTask): TaskDelayInfo {
	const today = new Date();
	today.setHours(0, 0, 0, 0); // 時刻をリセット

	// 予定終了日がない場合
	if (!task.endDate) {
		return {
			isDelayed: false,
			delayDays: 0,
			severity: 'none',
			message: '予定終了日が未設定です'
		};
	}

	const plannedEnd = new Date(task.endDate);
	plannedEnd.setHours(0, 0, 0, 0);

	// タスクが完了している場合
	if (task.status === 'completed') {
		if (task.actualEndDate) {
			const actualEnd = new Date(task.actualEndDate);
			actualEnd.setHours(0, 0, 0, 0);
			const delayDays = calculateDaysDiff(plannedEnd, actualEnd);

			if (delayDays > 0) {
				// 遅延して完了
				return {
					isDelayed: true,
					delayDays,
					severity: delayDays >= 5 ? 'critical' : delayDays >= 3 ? 'moderate' : 'minor',
					message: `予定より${delayDays}日遅れて完了しました`
				};
			} else if (delayDays < 0) {
				// 前倒しで完了
				return {
					isDelayed: false,
					delayDays,
					severity: 'ahead',
					message: `予定より${Math.abs(delayDays)}日早く完了しました`
				};
			} else {
				// 予定通りに完了
				return {
					isDelayed: false,
					delayDays: 0,
					severity: 'on-track',
					message: '予定通りに完了しました'
				};
			}
		} else {
			// 完了しているが実績終了日がない
			return {
				isDelayed: false,
				delayDays: 0,
				severity: 'on-track',
				message: '完了済み'
			};
		}
	}

	// タスクが未完了の場合
	const delayDays = calculateDaysDiff(plannedEnd, today);

	if (delayDays > 0) {
		// 予定を過ぎている（遅延中）
		return {
			isDelayed: true,
			delayDays,
			severity: delayDays >= 5 ? 'critical' : delayDays >= 3 ? 'moderate' : 'minor',
			message: `予定終了日を${delayDays}日超過しています`
		};
	} else if (delayDays === 0) {
		// 今日が期限
		return {
			isDelayed: false,
			delayDays: 0,
			severity: 'on-track',
			message: '本日が期限です'
		};
	} else {
		// まだ余裕がある
		const remainingDays = Math.abs(delayDays);
		return {
			isDelayed: false,
			delayDays,
			severity: 'on-track',
			message: `期限まであと${remainingDays}日`
		};
	}
}

/**
 * 開始日の遅延を計算
 * @param task WBSタスク
 * @returns 遅延情報
 */
export function calculateStartDelayInfo(task: WbsTask): TaskDelayInfo | null {
	if (!task.startDate) {
		return null;
	}

	if (!task.actualStartDate) {
		// まだ開始していない
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const plannedStart = new Date(task.startDate);
		plannedStart.setHours(0, 0, 0, 0);

		const delayDays = calculateDaysDiff(plannedStart, today);

		if (delayDays > 0) {
			return {
				isDelayed: true,
				delayDays,
				severity: delayDays >= 5 ? 'critical' : delayDays >= 3 ? 'moderate' : 'minor',
				message: `開始予定日を${delayDays}日超過しています`
			};
		}

		return null;
	}

	// 実績開始日がある場合
	const plannedStart = new Date(task.startDate);
	plannedStart.setHours(0, 0, 0, 0);
	const actualStart = new Date(task.actualStartDate);
	actualStart.setHours(0, 0, 0, 0);

	const delayDays = calculateDaysDiff(plannedStart, actualStart);

	if (delayDays > 0) {
		return {
			isDelayed: true,
			delayDays,
			severity: delayDays >= 3 ? 'moderate' : 'minor',
			message: `予定より${delayDays}日遅れて開始しました`
		};
	} else if (delayDays < 0) {
		return {
			isDelayed: false,
			delayDays,
			severity: 'ahead',
			message: `予定より${Math.abs(delayDays)}日早く開始しました`
		};
	}

	return null;
}

/**
 * 遅延の重要度に応じた色を返す
 * @param severity 重要度
 * @returns CSSカラーコード
 */
export function getDelayColor(severity: TaskDelayInfo['severity']): string {
	switch (severity) {
		case 'critical':
			return '#dc2626'; // 赤
		case 'moderate':
			return '#f59e0b'; // オレンジ
		case 'minor':
			return '#fbbf24'; // 黄色
		case 'ahead':
			return '#10b981'; // 緑
		case 'on-track':
			return '#3b82f6'; // 青
		default:
			return '#9ca3af'; // グレー
	}
}

/**
 * 遅延の重要度に応じたアイコンを返す
 * @param severity 重要度
 * @returns Bootstrap Iconのクラス名
 */
export function getDelayIcon(severity: TaskDelayInfo['severity']): string {
	switch (severity) {
		case 'critical':
			return 'bi-exclamation-triangle-fill';
		case 'moderate':
			return 'bi-exclamation-circle-fill';
		case 'minor':
			return 'bi-info-circle-fill';
		case 'ahead':
			return 'bi-check-circle-fill';
		case 'on-track':
			return 'bi-clock-fill';
		default:
			return 'bi-circle';
	}
}

/**
 * タスクのリストから統計情報を計算
 * @param tasks タスクのリスト
 * @returns 統計情報
 */
export function calculateDelayStatistics(tasks: WbsTask[]) {
	let totalTasks = 0;
	let completedOnTime = 0;
	let completedEarly = 0;
	let completedLate = 0;
	let inProgressOnTrack = 0;
	let inProgressDelayed = 0;
	let notStartedDelayed = 0;

	const delayDaysList: number[] = [];

	const processTask = (task: WbsTask) => {
		totalTasks++;

		const delayInfo = calculateDelayInfo(task);

		if (task.status === 'completed') {
			if (delayInfo.severity === 'ahead') {
				completedEarly++;
			} else if (delayInfo.severity === 'on-track') {
				completedOnTime++;
			} else if (delayInfo.isDelayed) {
				completedLate++;
				delayDaysList.push(delayInfo.delayDays);
			}
		} else if (task.status === 'in-progress') {
			if (delayInfo.isDelayed) {
				inProgressDelayed++;
				delayDaysList.push(delayInfo.delayDays);
			} else {
				inProgressOnTrack++;
			}
		} else {
			if (delayInfo.isDelayed) {
				notStartedDelayed++;
				delayDaysList.push(delayInfo.delayDays);
			}
		}

		// 子タスクも処理
		if (task.children && task.children.length > 0) {
			task.children.forEach(processTask);
		}
	};

	tasks.forEach(processTask);

	const averageDelay =
		delayDaysList.length > 0
			? delayDaysList.reduce((sum, days) => sum + days, 0) / delayDaysList.length
			: 0;

	return {
		totalTasks,
		completedOnTime,
		completedEarly,
		completedLate,
		inProgressOnTrack,
		inProgressDelayed,
		notStartedDelayed,
		averageDelay: Math.round(averageDelay * 10) / 10,
		onTimePercentage: totalTasks > 0 ? Math.round((completedOnTime / totalTasks) * 100) : 0,
		earlyPercentage: totalTasks > 0 ? Math.round((completedEarly / totalTasks) * 100) : 0,
		latePercentage: totalTasks > 0 ? Math.round((completedLate / totalTasks) * 100) : 0
	};
}
