import { writable } from 'svelte/store';
import type { WbsTask } from '$lib/components/wbs/types';

/** 初期表示用のサンプルWBSデータ */
const initialWbs: WbsTask[] = [
	{
		id: '1',
		name: '企画・要件定義',
		description: '目的整理と要件明確化を行う',
		effortDays: 8,
		deliverable: '要件定義書、ステークホルダー一覧',
		startDate: '2025-10-07',
		endDate: '2025-10-15',
		progress: 60,
		dependencies: [],
		status: 'in-progress',
		children: [
			{
				id: '1.1',
				name: '現状ヒアリング',
				description: '主要部署へのヒアリングと課題整理',
				assignee: '山田 太郎',
				effortDays: 3,
				deliverable: 'ヒアリング議事録',
				startDate: '2025-10-07',
				endDate: '2025-10-09',
				progress: 100,
				status: 'completed',
				dependencies: [],
				children: []
			},
			{
				id: '1.2',
				name: '要求整理ワークショップ',
				description: '業務フローと機能要求の整理',
				assignee: '佐藤 花子',
				effortDays: 3,
				deliverable: '要求一覧・優先度表',
				startDate: '2025-10-10',
				endDate: '2025-10-12',
				progress: 40,
				status: 'in-progress',
				dependencies: ['1.1'],
				children: []
			},
			{
				id: '1.3',
				name: '要件定義書ドラフト作成',
				description: '要求整理結果を要件定義書へ反映',
				assignee: '田中 次郎',
				effortDays: 2,
				deliverable: '要件定義書ドラフト',
				startDate: '2025-10-13',
				endDate: '2025-10-14',
				progress: 20,
				status: 'in-progress',
				dependencies: ['1.2'],
				children: []
			}
		]
	},
	{
		id: '2',
		name: '基本設計',
		description: '画面 / API / データモデルの設計',
		effortDays: 10,
		deliverable: '基本設計書一式',
		startDate: '2025-10-16',
		endDate: '2025-10-27',
		progress: 25,
		status: 'in-progress',
		dependencies: ['1'],
		children: [
			{
				id: '2.1',
				name: '画面設計',
				description: '画面遷移とUI構造の定義',
				assignee: '鈴木 彩',
				effortDays: 4,
				deliverable: '画面遷移図、モックアップ',
				startDate: '2025-10-16',
				endDate: '2025-10-20',
				progress: 30,
				status: 'in-progress',
				dependencies: ['1'],
				children: []
			},
			{
				id: '2.2',
				name: 'API設計',
				description: '主要APIのI/F定義',
				assignee: '高橋 瞬',
				effortDays: 3,
				deliverable: 'API仕様書',
				startDate: '2025-10-19',
				endDate: '2025-10-23',
				progress: 15,
				status: 'in-progress',
				dependencies: ['1.3'],
				children: []
			},
			{
				id: '2.3',
				name: 'DB設計',
				description: 'ER図およびテーブル定義作成',
				assignee: '伊藤 武',
				effortDays: 3,
				deliverable: 'ER図、テーブル定義書',
				startDate: '2025-10-21',
				endDate: '2025-10-24',
				progress: 0,
				status: 'not-started',
				dependencies: ['2.2'],
				children: []
			}
		]
	}
];

/** WBS全体を保持するストア */
export const wbsStore = writable<WbsTask[]>(initialWbs);

/** WBS全体を置き換える */
export function setWbs(tasks: WbsTask[]) {
	wbsStore.set(tasks);
}

/** タスクID生成用カウンター */
let taskIdCounter = 0;

/** 新しいタスクの雛形を生成する */
export function createBlankTask(baseName: string, parentId?: string): WbsTask {
	// カウンターをインクリメントしてユニークなIDを生成
	taskIdCounter++;
	const uniqueId = `${Date.now()}-${taskIdCounter}`;

	return {
		id: parentId ? `${parentId}.${uniqueId}` : `task-${uniqueId}`,
		name: baseName,
		progress: 0,
		dependencies: [],
		children: []
	};
}

/** 指定したタスクIDに対してアップデート処理を行う */
export function updateTask(taskId: string, updater: (task: WbsTask) => WbsTask) {
	wbsStore.update((tasks) => traverseAndUpdate(tasks, taskId, updater));
}

/** 指定した親タスク配下に子タスクを追加する */
export function addChildTask(parentId: string | null, child: WbsTask) {
	wbsStore.update((tasks) => {
		if (!parentId) {
			return [...tasks, child];
		}
		return traverseAndUpdate(tasks, parentId, (task) => ({
			...task,
			children: [...task.children, child]
		}));
	});
}

/** 指定したタスクを削除する */
export function removeTask(taskId: string) {
	wbsStore.update((tasks) => removeTaskById(tasks, taskId));
}

/** 指定したタスクにサブタスクを一括追加する */
export function appendSubtasks(taskId: string, subtasks: WbsTask[]) {
	wbsStore.update((tasks) =>
		traverseAndUpdate(tasks, taskId, (task) => ({
			...task,
			children: [...task.children, ...subtasks]
		}))
	);
}

/** 指定したタスクのサブタスクを置き換える（既存の子タスクを削除してから追加） */
export function replaceSubtasks(taskId: string, subtasks: WbsTask[]) {
	wbsStore.update((tasks) =>
		traverseAndUpdate(tasks, taskId, (task) => ({
			...task,
			children: subtasks
		}))
	);
}

/** WBS内から特定のタスクを検索する */
export function findTask(tasks: WbsTask[], taskId: string): WbsTask | null {
	for (const task of tasks) {
		if (task.id === taskId) {
			return task;
		}
		const found = findTask(task.children, taskId);
		if (found) {
			return found;
		}
	}
	return null;
}

/** タスク配列を走査し、該当IDのタスクに対してアップデートを行う */
function traverseAndUpdate(
	tasks: WbsTask[],
	targetId: string,
	updater: (task: WbsTask) => WbsTask
): WbsTask[] {
	return tasks.map((task) => {
		if (task.id === targetId) {
			return updater({ ...task });
		}
		if (task.children.length > 0) {
			return {
				...task,
				children: traverseAndUpdate(task.children, targetId, updater)
			};
		}
		return task;
	});
}

/** 指定したIDのタスクを配列から削除する */
function removeTaskById(tasks: WbsTask[], taskId: string): WbsTask[] {
	return tasks
		.filter((task) => task.id !== taskId)
		.map((task) => ({
			...task,
			children: removeTaskById(task.children, taskId)
		}));
}

/** タスクを移動する（並び替え・階層変更）- 改善版 */
export function moveTask(taskId: string, targetParentId: string | null, insertIndex: number) {
	wbsStore.update((tasks) => {
		// 1. 移動対象のタスクを取得
		const task = findTask(tasks, taskId);
		if (!task) {
			console.error(`タスク ${taskId} が見つかりません`);
			return tasks;
		}

		// 2. 自分自身の子孫には移動できないようにチェック
		if (targetParentId && isDescendant(task, targetParentId)) {
			console.warn('タスクを自分自身の子孫に移動することはできません');
			return tasks;
		}

		// 3. 元の場所から削除
		const withoutTask = removeTaskById(tasks, taskId);

		// 4. 新しい場所に挿入
		try {
			if (targetParentId === null) {
				// ルートレベルに挿入
				const newTasks = [...withoutTask];
				const safeIndex = Math.max(0, Math.min(insertIndex, newTasks.length));
				newTasks.splice(safeIndex, 0, task);
				return newTasks;
			} else {
				// 指定した親タスクの子として挿入
				return traverseAndUpdate(withoutTask, targetParentId, (parent) => {
					const newChildren = [...parent.children];
					const safeIndex = Math.max(0, Math.min(insertIndex, newChildren.length));
					newChildren.splice(safeIndex, 0, task);
					return { ...parent, children: newChildren };
				});
			}
		} catch (error) {
			console.error('タスクの移動中にエラーが発生しました:', error);
			// エラーが発生した場合は元のタスクをそのまま返す（タスクを失わないため）
			return tasks;
		}
	});
}

/** タスクが別のタスクの子孫かどうかをチェック */
function isDescendant(parentTask: WbsTask, targetId: string): boolean {
	if (parentTask.id === targetId) return true;

	for (const child of parentTask.children) {
		if (isDescendant(child, targetId)) return true;
	}

	return false;
}

/** タスクとその親のIDを取得 */
export function findTaskWithParent(
	tasks: WbsTask[],
	taskId: string,
	parentId: string | null = null
): { task: WbsTask; parentId: string | null } | null {
	for (const task of tasks) {
		if (task.id === taskId) {
			return { task, parentId };
		}
		const found = findTaskWithParent(task.children, taskId, task.id);
		if (found) return found;
	}
	return null;
}

/** タスクの挿入位置を計算（before/into/after） */
export function moveTaskAdvanced(
	draggedTaskId: string,
	targetTaskId: string,
	position: 'before' | 'into' | 'after'
) {
	wbsStore.update((tasks) => {
		// 1. ドラッグされたタスクを取得
		const draggedInfo = findTaskWithParent(tasks, draggedTaskId);
		if (!draggedInfo) {
			console.error(`ドラッグされたタスク ${draggedTaskId} が見つかりません`);
			return tasks;
		}

		// 2. ターゲットタスクを取得
		const targetInfo = findTaskWithParent(tasks, targetTaskId);
		if (!targetInfo) {
			console.error(`ターゲットタスク ${targetTaskId} が見つかりません`);
			return tasks;
		}

		// 3. 自分自身には移動できない
		if (draggedTaskId === targetTaskId) {
			return tasks;
		}

		// 4. 自分自身の子孫には移動できない
		if (isDescendant(draggedInfo.task, targetTaskId)) {
			console.warn('タスクを自分自身の子孫に移動することはできません');
			return tasks;
		}

		// 5. 元の場所から削除
		const withoutTask = removeTaskById(tasks, draggedTaskId);

		// 6. 新しい場所に挿入
		try {
			if (position === 'into') {
				// ターゲットタスクの子として追加
				return traverseAndUpdate(withoutTask, targetTaskId, (parent) => ({
					...parent,
					children: [...parent.children, draggedInfo.task]
				}));
			} else {
				// ターゲットタスクの前または後に挿入
				const targetParentId = targetInfo.parentId;

				if (targetParentId === null) {
					// ルートレベルでの挿入
					const newTasks = [...withoutTask];
					const targetIndex = newTasks.findIndex((t) => t.id === targetTaskId);

					if (targetIndex === -1) {
						// ターゲットが見つからない場合は最後に追加
						newTasks.push(draggedInfo.task);
					} else {
						const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
						newTasks.splice(insertIndex, 0, draggedInfo.task);
					}
					return newTasks;
				} else {
					// 親タスクの子配列内での挿入
					return traverseAndUpdate(withoutTask, targetParentId, (parent) => {
						const newChildren = [...parent.children];
						const targetIndex = newChildren.findIndex((t) => t.id === targetTaskId);

						if (targetIndex === -1) {
							// ターゲットが見つからない場合は最後に追加
							newChildren.push(draggedInfo.task);
						} else {
							const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
							newChildren.splice(insertIndex, 0, draggedInfo.task);
						}
						return { ...parent, children: newChildren };
					});
				}
			}
		} catch (error) {
			console.error('タスクの移動中にエラーが発生しました:', error);
			// エラーが発生した場合は元のタスクをそのまま返す
			return tasks;
		}
	});
}

/** タスクの並び順を変更する（同じ親内での移動） */
export function reorderTask(
	taskId: string,
	parentId: string | null,
	fromIndex: number,
	toIndex: number
) {
	wbsStore.update((tasks) => {
		if (parentId === null) {
			// ルートレベルでの並び替え
			const newTasks = [...tasks];
			const [removed] = newTasks.splice(fromIndex, 1);
			newTasks.splice(toIndex, 0, removed);
			return newTasks;
		} else {
			// 親タスクの子配列内での並び替え
			return traverseAndUpdate(tasks, parentId, (parent) => {
				const newChildren = [...parent.children];
				const [removed] = newChildren.splice(fromIndex, 1);
				newChildren.splice(toIndex, 0, removed);
				return { ...parent, children: newChildren };
			});
		}
	});
}

/** タスクツリーをフラット化する */
export function flattenTasks(tasks: WbsTask[]): WbsTask[] {
	let result: WbsTask[] = [];
	for (const task of tasks) {
		result.push(task);
		if (task.children.length > 0) {
			result = result.concat(flattenTasks(task.children));
		}
	}
	return result;
}

/** 循環依存を検出する */
export function detectCircularDependency(
	tasks: WbsTask[],
	taskId: string,
	newDependencies: string[]
): { hasCircular: boolean; path: string[] } {
	const flatTasks = flattenTasks(tasks);
	const taskMap = new Map<string, WbsTask>();

	for (const task of flatTasks) {
		taskMap.set(task.id, task);
	}

	// DFS (Depth-First Search) で循環を検出
	const visited = new Set<string>();
	const recursionStack = new Set<string>();

	function dfs(currentId: string, path: string[]): { hasCircular: boolean; path: string[] } {
		if (recursionStack.has(currentId)) {
			// 循環を検出
			return { hasCircular: true, path: [...path, currentId] };
		}

		if (visited.has(currentId)) {
			return { hasCircular: false, path: [] };
		}

		visited.add(currentId);
		recursionStack.add(currentId);

		const currentTask = taskMap.get(currentId);
		if (currentTask) {
			const deps = currentId === taskId ? newDependencies : currentTask.dependencies;
			for (const depId of deps) {
				const result = dfs(depId, [...path, currentId]);
				if (result.hasCircular) {
					return result;
				}
			}
		}

		recursionStack.delete(currentId);
		return { hasCircular: false, path: [] };
	}

	return dfs(taskId, []);
}

/** 依存関係を安全に更新する（循環依存チェック付き） */
export function updateDependencies(
	taskId: string,
	newDependencies: string[]
): { success: boolean; error?: string; path?: string[] } {
	let result: { success: boolean; error?: string; path?: string[] } = { success: true };

	wbsStore.update((tasks) => {
		const circularCheck = detectCircularDependency(tasks, taskId, newDependencies);

		if (circularCheck.hasCircular) {
			result = {
				success: false,
				error: '循環依存が検出されました',
				path: circularCheck.path
			};
			return tasks; // 更新せずに元のタスクを返す
		}

		// 循環依存がない場合、依存関係を更新
		return traverseAndUpdate(tasks, taskId, (task) => ({
			...task,
			dependencies: newDependencies
		}));
	});

	return result;
}

/** タスクを複製する（サブタスク含む） */
export function duplicateTask(
	taskId: string,
	options?: {
		shiftDays?: number; // 日付を何日シフトするか
		prefix?: string; // タスク名の接頭辞（デフォルト: "コピー - "）
	}
): string | null {
	let newTaskId: string | null = null;

	wbsStore.update((tasks) => {
		const originalTask = findTask(tasks, taskId);
		if (!originalTask) return tasks;

		// タスクを複製（再帰的）
		const duplicated = cloneTaskRecursively(
			originalTask,
			options?.shiftDays || 0,
			options?.prefix || 'コピー - '
		);
		newTaskId = duplicated.id;

		// 同じ階層に挿入（元のタスクの直後）
		return insertTaskAfter(tasks, taskId, duplicated);
	});

	return newTaskId;
}

/** タスクを再帰的に複製する */
function cloneTaskRecursively(task: WbsTask, shiftDays: number, prefix: string): WbsTask {
	const newId = `${task.id}-copy-${Date.now()}`;

	// 日付をシフト
	const shiftDate = (dateStr?: string): string | undefined => {
		if (!dateStr) return undefined;
		const date = new Date(dateStr);
		date.setDate(date.getDate() + shiftDays);
		return date.toISOString().split('T')[0];
	};

	return {
		...task,
		id: newId,
		name: `${prefix}${task.name}`,
		startDate: shiftDate(task.startDate),
		endDate: shiftDate(task.endDate),
		progress: 0, // 進捗率はリセット
		dependencies: [], // 依存関係はクリア（元のIDが存在しないため）
		children: task.children.map((child) => cloneTaskRecursively(child, shiftDays, ''))
	};
}

/** 指定タスクの直後に新しいタスクを挿入 */
function insertTaskAfter(tasks: WbsTask[], targetId: string, newTask: WbsTask): WbsTask[] {
	for (let i = 0; i < tasks.length; i++) {
		if (tasks[i].id === targetId) {
			// 同じ階層に挿入
			const newTasks = [...tasks];
			newTasks.splice(i + 1, 0, newTask);
			return newTasks;
		}

		if (tasks[i].children.length > 0) {
			// 子階層で検索
			const updatedChildren = insertTaskAfter(tasks[i].children, targetId, newTask);
			if (updatedChildren !== tasks[i].children) {
				return tasks.map((t, idx) => (idx === i ? { ...t, children: updatedChildren } : t));
			}
		}
	}

	return tasks;
}

/** タスクをアーカイブする */
export function archiveTask(taskId: string) {
	updateTask(taskId, (task) => ({
		...task,
		archived: true
	}));
}

/** タスクをアーカイブから復元する */
export function unarchiveTask(taskId: string) {
	updateTask(taskId, (task) => ({
		...task,
		archived: false
	}));
}
