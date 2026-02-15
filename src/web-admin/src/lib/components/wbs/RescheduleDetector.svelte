<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { WbsTask } from './types';
	import {
		rescheduleStore,
		detectTaskDelay,
		detectBlockedTask,
		findDelayedTasks,
		findBlockedTasks,
		type RescheduleTriggerType
	} from '$lib/stores/rescheduleStore';

	export let tasks: WbsTask[] = [];
	export let projectId: number;
	export let enabled: boolean = true;

	/** 前回のタスク状態（変更検知用） */
	let previousTasks: WbsTask[] = [];

	/** 検知間隔（ミリ秒） */
	const checkInterval = 5000; // 5秒ごと

	/** インターバルID */
	let intervalId: number | null = null;

	/** タスクの変更を検知 */
	function detectChanges() {
		if (!enabled || tasks.length === 0) {
			return;
		}

		const today = new Date();

		// 1. 遅延タスクの検出
		const delayedTasks = findDelayedTasks(tasks, today);
		if (delayedTasks.length > 0) {
			// 前回検知していない遅延タスクのみトリガー追加
			const newDelayed = delayedTasks.filter((task) => {
				const prevTask = findTaskById(previousTasks, task.id);
				return !prevTask || !detectTaskDelay(prevTask, today);
			});

			if (newDelayed.length > 0) {
				rescheduleStore.addTrigger({
					type: 'delay',
					projectId,
					affectedTaskIds: newDelayed.map((t) => t.id),
					details: {
						taskName:
							newDelayed.length === 1 ? newDelayed[0].name : `${newDelayed.length}個のタスク`,
						delayDays: calculateDelayDays(newDelayed[0])
					}
				});
			}
		}

		// 2. ブロック中タスクの検出
		const blockedTasks = findBlockedTasks(tasks);
		if (blockedTasks.length > 0) {
			const newBlocked = blockedTasks.filter((task) => {
				const prevTask = findTaskById(previousTasks, task.id);
				return !prevTask || prevTask.status !== 'blocked';
			});

			if (newBlocked.length > 0) {
				rescheduleStore.addTrigger({
					type: 'blocked',
					projectId,
					affectedTaskIds: newBlocked.map((t) => t.id),
					details: {
						taskName:
							newBlocked.length === 1 ? newBlocked[0].name : `${newBlocked.length}個のタスク`
					}
				});
			}
		}

		// 3. 担当者変更の検出
		detectAssigneeChanges();

		// 4. 工数変更の検出
		detectEffortChanges();

		// 前回のタスク状態を更新
		previousTasks = JSON.parse(JSON.stringify(tasks));
	}

	/** 担当者変更を検出 */
	function detectAssigneeChanges() {
		if (previousTasks.length === 0) return;

		const changes: WbsTask[] = [];

		function traverse(currentTasks: WbsTask[], prevTasks: WbsTask[]) {
			for (const task of currentTasks) {
				const prevTask = prevTasks.find((t) => t.id === task.id);
				if (prevTask && prevTask.assignee !== task.assignee && task.assignee) {
					changes.push(task);
				}
				if (task.children && task.children.length > 0) {
					const prevChildren = prevTask?.children || [];
					traverse(task.children, prevChildren);
				}
			}
		}

		traverse(tasks, previousTasks);

		if (changes.length > 0) {
			rescheduleStore.addTrigger({
				type: 'reassign',
				projectId,
				affectedTaskIds: changes.map((t) => t.id),
				details: {
					taskName: changes.length === 1 ? changes[0].name : `${changes.length}個のタスク`
				}
			});
		}
	}

	/** 工数変更を検出 */
	function detectEffortChanges() {
		if (previousTasks.length === 0) return;

		const changes: WbsTask[] = [];

		function traverse(currentTasks: WbsTask[], prevTasks: WbsTask[]) {
			for (const task of currentTasks) {
				const prevTask = prevTasks.find((t) => t.id === task.id);
				if (prevTask && prevTask.effortDays !== task.effortDays && task.effortDays) {
					// 工数が大幅に増加した場合のみ（20%以上）
					const prevEffort = prevTask.effortDays || 0;
					const currentEffort = task.effortDays || 0;
					if (currentEffort > prevEffort * 1.2) {
						changes.push(task);
					}
				}
				if (task.children && task.children.length > 0) {
					const prevChildren = prevTask?.children || [];
					traverse(task.children, prevChildren);
				}
			}
		}

		traverse(tasks, previousTasks);

		if (changes.length > 0) {
			rescheduleStore.addTrigger({
				type: 'effort_change',
				projectId,
				affectedTaskIds: changes.map((t) => t.id),
				details: {
					taskName: changes.length === 1 ? changes[0].name : `${changes.length}個のタスク`
				}
			});
		}
	}

	/** タスクをIDで検索（再帰） */
	function findTaskById(taskList: WbsTask[], taskId: string): WbsTask | null {
		for (const task of taskList) {
			if (task.id === taskId) {
				return task;
			}
			if (task.children && task.children.length > 0) {
				const found = findTaskById(task.children, taskId);
				if (found) return found;
			}
		}
		return null;
	}

	/** 遅延日数を計算 */
	function calculateDelayDays(task: WbsTask): number {
		if (!task.endDate) return 0;
		const today = new Date();
		const endDate = new Date(task.endDate);
		const delayMs = today.getTime() - endDate.getTime();
		return Math.max(0, Math.ceil(delayMs / (1000 * 60 * 60 * 24)));
	}

	onMount(() => {
		// 初回チェック
		previousTasks = JSON.parse(JSON.stringify(tasks));

		// 定期チェック開始
		if (enabled) {
			intervalId = window.setInterval(() => {
				detectChanges();
			}, checkInterval);
		}
	});

	onDestroy(() => {
		// インターバルをクリア
		if (intervalId !== null) {
			clearInterval(intervalId);
		}
	});

	// タスクが更新されたときに即座にチェック
	$: if (tasks && enabled) {
		detectChanges();
	}
</script>

<!-- このコンポーネントはUIを持たず、バックグラウンドで動作 -->
<div style="display: none;">
	<!-- RescheduleDetector: {enabled ? 'Active' : 'Inactive'} -->
</div>

<style>
	/* スタイルなし（UIなし） */
</style>
