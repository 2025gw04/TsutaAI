import { writable, derived, get } from 'svelte/store';
import type { WbsTask } from '$lib/components/wbs/types';
import { findTask, createBlankTask, detectCircularDependency } from './wbsStore';

/**
 * Undo/Redo機能を持つWBSストアの状態
 */
interface UndoRedoState {
	/** 過去の状態のスタック */
	past: WbsTask[][];
	/** 現在の状態 */
	present: WbsTask[];
	/** やり直し用の状態のスタック */
	future: WbsTask[][];
	/** 履歴の最大サイズ */
	maxHistorySize: number;
}

/** 履歴の最大サイズ（デフォルト: 50件） */
const MAX_HISTORY_SIZE = 50;

/**
 * オブジェクトを深くコピーする
 * structuredCloneを優先的に使用し、フォールバックとしてJSONを使用
 * @param obj コピーするオブジェクト
 * @returns コピーされたオブジェクト
 * @throws {Error} コピーに失敗した場合
 */
function deepClone<T>(obj: T): T {
	try {
		// モダンブラウザではstructuredCloneを使用
		if (typeof structuredClone !== 'undefined') {
			return structuredClone(obj);
		}
		// フォールバック: JSON方式
		// 注意: Date, Function, undefined等は正しくコピーされない
		// WbsTaskの日付はstring型なので問題なし
		return JSON.parse(JSON.stringify(obj));
	} catch (error) {
		console.error('Failed to deep clone object:', error);
		throw new Error('Deep clone failed');
	}
}

/**
 * タスクツリーを平坦化してすべてのタスクを取得
 * @param tasks タスク配列
 * @returns 平坦化されたタスク配列
 */
function flattenTasks(tasks: WbsTask[]): WbsTask[] {
	const result: WbsTask[] = [];
	function traverse(tasks: WbsTask[]) {
		for (const task of tasks) {
			result.push(task);
			if (task.children && task.children.length > 0) {
				traverse(task.children);
			}
		}
	}
	traverse(tasks);
	return result;
}

/**
 * すべてのタスクIDを取得
 * @param tasks タスク配列
 * @returns タスクIDのSet
 */
function getAllTaskIds(tasks: WbsTask[]): Set<string> {
	return new Set(flattenTasks(tasks).map((task) => task.id));
}

/**
 * 依存関係の整合性を検証
 * @param tasks タスク配列
 * @returns 整合性がある場合はtrue、ない場合はfalse
 */
function validateDependencies(tasks: WbsTask[]): boolean {
	const taskIds = getAllTaskIds(tasks);
	const allTasks = flattenTasks(tasks);

	for (const task of allTasks) {
		if (task.dependencies && task.dependencies.length > 0) {
			for (const depId of task.dependencies) {
				if (!taskIds.has(depId)) {
					console.warn(
						`Invalid dependency detected: Task ${task.id} depends on non-existent task ${depId}`
					);
					// 依存関係が不正でも状態更新を継続するために、ここではfalseを返さない
					// return false;
				}
			}
		}
	}
	return true;
}

/**
 * 履歴のメモリ使用量を概算（バイト単位）
 * @param state Undo/Redo状態
 * @returns メモリ使用量（バイト）
 */
function estimateMemoryUsage(state: UndoRedoState): number {
	try {
		const jsonString = JSON.stringify(state);
		return new Blob([jsonString]).size;
	} catch (error) {
		console.error('Failed to estimate memory usage:', error);
		return 0;
	}
}

/**
 * タスク配列を走査し、該当IDのタスクに対してアップデートを行う
 * @param tasks タスク配列
 * @param targetId 更新対象のタスクID
 * @param updater 更新関数
 * @returns 更新されたタスク配列
 */
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

/**
 * 指定したIDのタスクを配列から削除する
 * @param tasks タスク配列
 * @param taskId 削除対象のタスクID
 * @returns タスクが削除された配列
 */
function removeTaskById(tasks: WbsTask[], taskId: string): WbsTask[] {
	return tasks
		.filter((task) => task.id !== taskId)
		.map((task) => ({
			...task,
			children: removeTaskById(task.children, taskId)
		}));
}

/**
 * タスクが別のタスクの子孫かどうかをチェック
 * @param parentTask 親タスク
 * @param targetId チェック対象のタスクID
 * @returns 子孫の場合はtrue
 */
function isDescendant(parentTask: WbsTask, targetId: string): boolean {
	if (parentTask.id === targetId) return true;

	for (const child of parentTask.children) {
		if (isDescendant(child, targetId)) return true;
	}

	return false;
}

/**
 * タスクとその親のIDを取得
 * @param tasks タスク配列
 * @param taskId 検索対象のタスクID
 * @param parentId 親タスクID（内部使用）
 * @returns タスクと親IDの情報
 */
function findTaskWithParent(
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

/**
 * 指定タスクの直後に新しいタスクを挿入
 * @param tasks タスク配列
 * @param targetId 基準となるタスクID
 * @param newTask 挿入するタスク
 * @returns 更新されたタスク配列
 */
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

/**
 * タスクを再帰的に複製する
 * @param task 複製元のタスク
 * @param shiftDays 日付をシフトする日数
 * @param prefix タスク名の接頭辞
 * @returns 複製されたタスク
 */
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

/**
 * Undo/Redo可能なWBSストアを作成
 * @param initialTasks 初期タスク配列
 * @returns Undo/Redo可能なストア
 */
function createUndoableWbsStore(initialTasks: WbsTask[] = []) {
	const { subscribe, set, update } = writable<UndoRedoState>({
		past: [],
		present: initialTasks,
		future: [],
		maxHistorySize: MAX_HISTORY_SIZE
	});

	/** デバウンス用タイマー */
	let updateTimer: number | null = null;
	/** デバウンス遅延時間（ミリ秒） */
	const DEBOUNCE_DELAY = 300;

	/**
	 * 履歴を追加して状態を更新
	 * @param newTasks 新しいタスク配列
	 * @param immediate true: 即座に履歴化、false: デバウンス対象（デフォルト: true）
	 */
	function setWithHistory(newTasks: WbsTask[], immediate: boolean = true) {
		try {
			// 依存関係の検証
			if (!validateDependencies(newTasks)) {
				console.error('Invalid dependencies detected. State update aborted.');
				return; // 状態を変更しない
			}

			update((state) => {
				const clonedPresent = deepClone(state.present);
				const clonedNew = deepClone(newTasks);

				const newPast = [...state.past, clonedPresent];

				// 履歴サイズの制限（FIFO方式）
				if (newPast.length > state.maxHistorySize) {
					newPast.shift(); // 最も古い履歴を削除
				}

				return {
					...state,
					past: newPast,
					present: clonedNew,
					future: [] // 新しい操作でfutureはクリア
				};
			});
		} catch (error) {
			console.error('Failed to update history:', error);
			// フォールバック: 履歴なしで状態だけ更新
			update((state) => ({
				...state,
				present: newTasks,
				future: []
			}));
		}
	}

	/**
	 * デバウンス付きで履歴を追加
	 * テキスト入力系のプロパティ更新で使用
	 * @param newTasks 新しいタスク配列
	 */
	function setWithHistoryDebounced(newTasks: WbsTask[]) {
		if (updateTimer !== null) {
			clearTimeout(updateTimer);
		}

		updateTimer = window.setTimeout(() => {
			setWithHistory(newTasks, true);
			updateTimer = null;
		}, DEBOUNCE_DELAY);
	}

	/**
	 * 元に戻す
	 * @returns 成功した場合はtrue
	 */
	function undo(): boolean {
		let success = false;

		update((state) => {
			if (state.past.length === 0) {
				return state; // Undo不可
			}

			const previous = state.past[state.past.length - 1];
			const newPast = state.past.slice(0, -1);

			success = true;

			return {
				...state,
				past: newPast,
				present: deepClone(previous),
				future: [deepClone(state.present), ...state.future]
			};
		});

		return success;
	}

	/**
	 * やり直し
	 * @returns 成功した場合はtrue
	 */
	function redo(): boolean {
		let success = false;

		update((state) => {
			if (state.future.length === 0) {
				return state; // Redo不可
			}

			const next = state.future[0];
			const newFuture = state.future.slice(1);

			success = true;

			return {
				...state,
				past: [...state.past, deepClone(state.present)],
				present: deepClone(next),
				future: newFuture
			};
		});

		return success;
	}

	/**
	 * 履歴をクリア（現在の状態は保持）
	 * プロジェクト切り替え時などに使用
	 */
	function clearHistory() {
		update((state) => ({
			past: [],
			present: state.present,
			future: [],
			maxHistorySize: state.maxHistorySize
		}));
	}

	/**
	 * 特定の履歴ポイントにジャンプ
	 * @param index 履歴のインデックス（0=現在、負の値=過去、正の値=未来）
	 * @returns 成功した場合はtrue
	 */
	function jumpToHistory(index: number): boolean {
		if (index === 0) {
			return false; // 現在の状態なので何もしない
		}

		let success = false;

		update((state) => {
			if (index < 0) {
				// 過去にジャンプ（複数回のUndoに相当）
				const stepsBack = Math.abs(index);
				if (stepsBack > state.past.length) {
					console.warn(`Cannot jump ${stepsBack} steps back, only ${state.past.length} available`);
					return state;
				}

				// stepsBack回分戻る
				const targetIndex = state.past.length - stepsBack;
				const targetState = state.past[targetIndex];
				const movedStates = state.past.slice(targetIndex + 1);

				success = true;

				return {
					...state,
					past: state.past.slice(0, targetIndex),
					present: deepClone(targetState),
					future: [...movedStates, state.present, ...state.future]
				};
			} else {
				// 未来にジャンプ（複数回のRedoに相当）
				const stepsForward = index;
				if (stepsForward > state.future.length) {
					console.warn(
						`Cannot jump ${stepsForward} steps forward, only ${state.future.length} available`
					);
					return state;
				}

				// stepsForward回分進む
				const targetIndex = stepsForward - 1;
				const targetState = state.future[targetIndex];
				const movedStates = state.future.slice(0, targetIndex);

				success = true;

				return {
					...state,
					past: [...state.past, state.present, ...movedStates],
					present: deepClone(targetState),
					future: state.future.slice(targetIndex + 1)
				};
			}
		});

		return success;
	}

	/**
	 * WBS全体を置き換える
	 * @param tasks 新しいタスク配列
	 */
	function setWbs(tasks: WbsTask[]) {
		setWithHistory(tasks);
	}

	/**
	 * 指定したタスクIDに対してアップデート処理を行う
	 * @param taskId 更新対象のタスクID
	 * @param updater 更新関数
	 * @param debounce デバウンスを使用するか（テキスト入力系の場合はtrue）
	 */
	function updateTask(
		taskId: string,
		updater: (task: WbsTask) => WbsTask,
		debounce: boolean = false
	) {
		const currentState = get({ subscribe });
		const updatedTasks = traverseAndUpdate(currentState.present, taskId, updater);

		if (debounce) {
			setWithHistoryDebounced(updatedTasks);
		} else {
			setWithHistory(updatedTasks);
		}
	}

	/**
	 * 指定した親タスク配下に子タスクを追加する
	 * @param parentId 親タスクID（nullの場合はルートに追加）
	 * @param child 追加する子タスク
	 */
	function addChildTask(parentId: string | null, child: WbsTask) {
		const currentState = get({ subscribe });
		const tasks = currentState.present;

		if (!parentId) {
			setWithHistory([...tasks, child]);
		} else {
			const updatedTasks = traverseAndUpdate(tasks, parentId, (task) => ({
				...task,
				children: [...task.children, child]
			}));
			setWithHistory(updatedTasks);
		}
	}

	/**
	 * 指定したタスクを削除する
	 * @param taskId 削除対象のタスクID
	 */
	function removeTask(taskId: string) {
		const currentState = get({ subscribe });
		const updatedTasks = removeTaskById(currentState.present, taskId);
		setWithHistory(updatedTasks);
	}

	/**
	 * 指定したタスクにサブタスクを一括追加する
	 * @param taskId 親タスクID
	 * @param subtasks 追加するサブタスク配列
	 */
	function appendSubtasks(taskId: string, subtasks: WbsTask[]) {
		const currentState = get({ subscribe });
		const updatedTasks = traverseAndUpdate(currentState.present, taskId, (task) => ({
			...task,
			children: [...task.children, ...subtasks]
		}));
		setWithHistory(updatedTasks);
	}

	/**
	 * 指定したタスクのサブタスクを置き換える（既存の子タスクを削除してから追加）
	 * @param taskId 親タスクID
	 * @param subtasks 新しいサブタスク配列
	 */
	function replaceSubtasks(taskId: string, subtasks: WbsTask[]) {
		const currentState = get({ subscribe });
		const updatedTasks = traverseAndUpdate(currentState.present, taskId, (task) => ({
			...task,
			children: subtasks
		}));
		setWithHistory(updatedTasks);
	}

	/**
	 * タスクを移動する（並び替え・階層変更）
	 * @param taskId 移動対象のタスクID
	 * @param targetParentId 移動先の親タスクID（nullの場合はルート）
	 * @param insertIndex 挿入位置
	 */
	function moveTask(taskId: string, targetParentId: string | null, insertIndex: number) {
		const currentState = get({ subscribe });
		const tasks = currentState.present;

		// 1. 移動対象のタスクを取得
		const task = findTask(tasks, taskId);
		if (!task) {
			console.error(`タスク ${taskId} が見つかりません`);
			return;
		}

		// 2. 自分自身の子孫には移動できないようにチェック
		if (targetParentId && isDescendant(task, targetParentId)) {
			console.warn('タスクを自分自身の子孫に移動することはできません');
			return;
		}

		// 3. 元の場所から削除
		const withoutTask = removeTaskById(tasks, taskId);

		// 4. 新しい場所に挿入
		try {
			let updatedTasks: WbsTask[];

			if (targetParentId === null) {
				// ルートレベルに挿入
				const newTasks = [...withoutTask];
				const safeIndex = Math.max(0, Math.min(insertIndex, newTasks.length));
				newTasks.splice(safeIndex, 0, task);
				updatedTasks = newTasks;
			} else {
				// 指定した親タスクの子として挿入
				updatedTasks = traverseAndUpdate(withoutTask, targetParentId, (parent) => {
					const newChildren = [...parent.children];
					const safeIndex = Math.max(0, Math.min(insertIndex, newChildren.length));
					newChildren.splice(safeIndex, 0, task);
					return { ...parent, children: newChildren };
				});
			}

			setWithHistory(updatedTasks);
		} catch (error) {
			console.error('タスクの移動中にエラーが発生しました:', error);
			// エラーが発生した場合は何もしない
		}
	}

	/**
	 * タスクの挿入位置を計算（before/into/after）
	 * @param draggedTaskId ドラッグされたタスクID
	 * @param targetTaskId ターゲットタスクID
	 * @param position 挿入位置
	 */
	function moveTaskAdvanced(
		draggedTaskId: string,
		targetTaskId: string,
		position: 'before' | 'into' | 'after'
	) {
		const currentState = get({ subscribe });
		const tasks = currentState.present;

		// 1. ドラッグされたタスクを取得
		const draggedInfo = findTaskWithParent(tasks, draggedTaskId);
		if (!draggedInfo) {
			console.error(`ドラッグされたタスク ${draggedTaskId} が見つかりません`);
			return;
		}

		// 2. ターゲットタスクを取得
		const targetInfo = findTaskWithParent(tasks, targetTaskId);
		if (!targetInfo) {
			console.error(`ターゲットタスク ${targetTaskId} が見つかりません`);
			return;
		}

		// 3. 自分自身には移動できない
		if (draggedTaskId === targetTaskId) {
			return;
		}

		// 4. 自分自身の子孫には移動できない
		if (isDescendant(draggedInfo.task, targetTaskId)) {
			console.warn('タスクを自分自身の子孫に移動することはできません');
			return;
		}

		// 5. 元の場所から削除
		const withoutTask = removeTaskById(tasks, draggedTaskId);

		// 6. 新しい場所に挿入
		try {
			let updatedTasks: WbsTask[];

			if (position === 'into') {
				// ターゲットタスクの子として追加
				updatedTasks = traverseAndUpdate(withoutTask, targetTaskId, (parent) => ({
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
					updatedTasks = newTasks;
				} else {
					// 親タスクの子配列内での挿入
					updatedTasks = traverseAndUpdate(withoutTask, targetParentId, (parent) => {
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

			setWithHistory(updatedTasks);
		} catch (error) {
			console.error('タスクの移動中にエラーが発生しました:', error);
		}
	}

	/**
	 * タスクの並び順を変更する（同じ親内での移動）
	 * @param taskId タスクID
	 * @param parentId 親タスクID（nullの場合はルート）
	 * @param fromIndex 移動元のインデックス
	 * @param toIndex 移動先のインデックス
	 */
	function reorderTask(
		taskId: string,
		parentId: string | null,
		fromIndex: number,
		toIndex: number
	) {
		const currentState = get({ subscribe });
		const tasks = currentState.present;

		let updatedTasks: WbsTask[];

		if (parentId === null) {
			// ルートレベルでの並び替え
			const newTasks = [...tasks];
			const [removed] = newTasks.splice(fromIndex, 1);
			newTasks.splice(toIndex, 0, removed);
			updatedTasks = newTasks;
		} else {
			// 親タスクの子配列内での並び替え
			updatedTasks = traverseAndUpdate(tasks, parentId, (parent) => {
				const newChildren = [...parent.children];
				const [removed] = newChildren.splice(fromIndex, 1);
				newChildren.splice(toIndex, 0, removed);
				return { ...parent, children: newChildren };
			});
		}

		setWithHistory(updatedTasks);
	}

	/**
	 * 依存関係を安全に更新する（循環依存チェック付き）
	 * @param taskId タスクID
	 * @param newDependencies 新しい依存関係
	 * @returns 更新結果
	 */
	function updateDependencies(
		taskId: string,
		newDependencies: string[]
	): { success: boolean; error?: string; path?: string[] } {
		const currentState = get({ subscribe });
		const tasks = currentState.present;

		const circularCheck = detectCircularDependency(tasks, taskId, newDependencies);

		if (circularCheck.hasCircular) {
			return {
				success: false,
				error: '循環依存が検出されました',
				path: circularCheck.path
			};
		}

		// 循環依存がない場合、依存関係を更新
		const updatedTasks = traverseAndUpdate(tasks, taskId, (task) => ({
			...task,
			dependencies: newDependencies
		}));

		setWithHistory(updatedTasks);

		return { success: true };
	}

	/**
	 * タスクを複製する（サブタスク含む）
	 * @param taskId 複製元のタスクID
	 * @param options オプション
	 * @returns 新しいタスクのID
	 */
	function duplicateTask(
		taskId: string,
		options?: {
			shiftDays?: number; // 日付を何日シフトするか
			prefix?: string; // タスク名の接頭辞（デフォルト: "コピー - "）
		}
	): string | null {
		const currentState = get({ subscribe });
		const tasks = currentState.present;

		const originalTask = findTask(tasks, taskId);
		if (!originalTask) return null;

		// タスクを複製（再帰的）
		const duplicated = cloneTaskRecursively(
			originalTask,
			options?.shiftDays || 0,
			options?.prefix || 'コピー - '
		);
		const newTaskId = duplicated.id;

		// 同じ階層に挿入（元のタスクの直後）
		const updatedTasks = insertTaskAfter(tasks, taskId, duplicated);

		setWithHistory(updatedTasks);

		return newTaskId;
	}

	/**
	 * タスクをアーカイブする
	 * @param taskId タスクID
	 */
	function archiveTask(taskId: string) {
		updateTask(taskId, (task) => ({
			...task,
			archived: true
		}));
	}

	/**
	 * タスクをアーカイブから復元する
	 * @param taskId タスクID
	 */
	function unarchiveTask(taskId: string) {
		updateTask(taskId, (task) => ({
			...task,
			archived: false
		}));
	}

	return {
		subscribe,
		setWithHistory,
		setWithHistoryDebounced,
		undo,
		redo,
		clearHistory,
		jumpToHistory,
		// WBSストアの既存関数（履歴管理付き）
		setWbs,
		updateTask,
		addChildTask,
		removeTask,
		appendSubtasks,
		replaceSubtasks,
		moveTask,
		moveTaskAdvanced,
		reorderTask,
		updateDependencies,
		duplicateTask,
		archiveTask,
		unarchiveTask
	};
}

/** Undo/Redo可能なWBSストアのインスタンス */
export const undoableWbsStore = createUndoableWbsStore();

/**
 * Undo可能かどうか
 */
export const canUndo = derived(undoableWbsStore, ($state) => $state.past.length > 0);

/**
 * Redo可能かどうか
 */
export const canRedo = derived(undoableWbsStore, ($state) => $state.future.length > 0);

/**
 * 未保存の変更があるかどうか（履歴が1件以上ある場合）
 */
export const isDirty = derived(undoableWbsStore, ($state) => $state.past.length > 0);

/**
 * 現在のタスク配列
 */
export const currentTasks = derived(undoableWbsStore, ($state) => $state.present);

/**
 * 履歴のメトリクス（デバッグ・モニタリング用）
 */
export const historyMetrics = derived(undoableWbsStore, ($state) => ({
	pastSize: $state.past.length,
	futureSize: $state.future.length,
	maxSize: $state.maxHistorySize,
	estimatedMemoryUsage: estimateMemoryUsage($state)
}));

/**
 * 履歴データ（HistoryPanel用）
 */
export const historyData = derived(undoableWbsStore, ($state) => ({
	past: $state.past,
	present: $state.present,
	future: $state.future
}));

// undoableWbsStoreの個別関数をエクスポート
export const {
	setWbs,
	updateTask,
	addChildTask,
	removeTask,
	appendSubtasks,
	replaceSubtasks,
	moveTask,
	moveTaskAdvanced,
	reorderTask,
	updateDependencies,
	duplicateTask,
	archiveTask,
	unarchiveTask,
	undo,
	redo,
	clearHistory,
	jumpToHistory
} = undoableWbsStore;

// 既存のwbsStoreから必要な関数を再エクスポート
export { createBlankTask, findTask } from './wbsStore';
