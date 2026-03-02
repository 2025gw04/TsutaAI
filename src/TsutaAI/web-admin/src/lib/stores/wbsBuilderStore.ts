import { writable, derived } from 'svelte/store';

// Phase type definition
export type Phase = 'input' | 'major' | 'medium' | 'minor' | 'confirm';

// Project details interface
export interface ProjectDetails {
	projectName: string;
	description: string;
	goal: string;
	startDate: string;
	endDate: string;
	constraints: string;
	teamMembers: number[];
}

// Task interface for WBS builder
export interface WbsBuilderTask {
	id: string;
	name: string;
	description: string;
	effortDays: number;
	assignedTo?: number;
	startDate: string;
	endDate: string;
	parentId?: string;
	children?: WbsBuilderTask[];
	level: 'major' | 'medium' | 'minor';
	// 詳細情報フィールド（AIで自動生成）
	priority?: 'low' | 'medium' | 'high';
	status?: string;
	deliverable?: string;
}

// Chat message interface
export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: Date;
}

// Store for project basic details
export const projectDetails = writable<ProjectDetails>({
	projectName: '',
	description: '',
	goal: '',
	startDate: '',
	endDate: '',
	constraints: '',
	teamMembers: []
});

// Store for current WBS structure
export const currentWbs = writable<WbsBuilderTask[]>([]);

// Store for current phase
export const currentPhase = writable<Phase>('input');

// Store for selected parent task (for medium/minor generation)
export const selectedParentTask = writable<string | null>(null);

// Store for AI loading state
export const isLoadingAi = writable<boolean>(false);

// Store for chat history
export const chatHistory = writable<ChatMessage[]>([]);

// Store for error messages
export const errorMessage = writable<string>('');

// Derived store to check if we can proceed to next phase
export const canProceedToNextPhase = derived(
	[currentWbs, currentPhase],
	([$currentWbs, $currentPhase]) => {
		if ($currentPhase === 'input') return true;
		if ($currentPhase === 'major') return $currentWbs.length > 0;
		if ($currentPhase === 'medium') {
			// 中分類フェーズ: 子タスクがなくても次へ進める(後から追加可能)
			return true;
		}
		if ($currentPhase === 'minor') {
			// 小分類フェーズ: 子タスクがなくても次へ進める(後から追加可能)
			return true;
		}
		return true;
	}
);

// Helper function to add a task
export function addTask(task: WbsBuilderTask, parentId?: string) {
	currentWbs.update((wbs) => {
		if (!parentId) {
			// Add as root level (major task)
			return [...wbs, task];
		}

		// Add as child task
		const addToParent = (tasks: WbsBuilderTask[]): WbsBuilderTask[] => {
			return tasks.map((t) => {
				if (t.id === parentId) {
					return {
						...t,
						children: [...(t.children || []), task]
					};
				}
				if (t.children) {
					return {
						...t,
						children: addToParent(t.children)
					};
				}
				return t;
			});
		};

		return addToParent(wbs);
	});
}

// Helper function to update a task
export function updateTask(taskId: string, updates: Partial<WbsBuilderTask>) {
	currentWbs.update((wbs) => {
		const updateInTree = (tasks: WbsBuilderTask[]): WbsBuilderTask[] => {
			return tasks.map((t) => {
				if (t.id === taskId) {
					return { ...t, ...updates };
				}
				if (t.children) {
					return {
						...t,
						children: updateInTree(t.children)
					};
				}
				return t;
			});
		};

		return updateInTree(wbs);
	});
}

// Helper function to delete a task
export function deleteTask(taskId: string) {
	currentWbs.update((wbs) => {
		const deleteFromTree = (tasks: WbsBuilderTask[]): WbsBuilderTask[] => {
			return tasks
				.filter((t) => t.id !== taskId)
				.map((t) => {
					if (t.children) {
						return {
							...t,
							children: deleteFromTree(t.children)
						};
					}
					return t;
				});
		};

		return deleteFromTree(wbs);
	});
}

// Helper function to replace children of a parent task
export function replaceTaskChildren(parentId: string | null, newChildren: WbsBuilderTask[]) {
	if (parentId === null) {
		// Replace root level tasks
		currentWbs.set(newChildren);
		return;
	}

	currentWbs.update((wbs) => {
		const replaceInTree = (tasks: WbsBuilderTask[]): WbsBuilderTask[] => {
			return tasks.map((t) => {
				if (t.id === parentId) {
					return {
						...t,
						children: newChildren
					};
				}
				if (t.children) {
					return {
						...t,
						children: replaceInTree(t.children)
					};
				}
				return t;
			});
		};

		return replaceInTree(wbs);
	});
}

// Helper function to find a task by ID
export function findTaskById(tasks: WbsBuilderTask[], taskId: string): WbsBuilderTask | null {
	for (const task of tasks) {
		if (task.id === taskId) return task;
		if (task.children) {
			const found = findTaskById(task.children, taskId);
			if (found) return found;
		}
	}
	return null;
}

// Helper function to reorder tasks (for drag and drop)
export function reorderTasks(parentId: string | null, fromIndex: number, toIndex: number) {
	if (parentId === null) {
		// Reorder root level tasks
		currentWbs.update((wbs) => {
			const newWbs = [...wbs];
			const [removed] = newWbs.splice(fromIndex, 1);
			newWbs.splice(toIndex, 0, removed);
			return newWbs;
		});
		return;
	}

	currentWbs.update((wbs) => {
		const reorderInTree = (tasks: WbsBuilderTask[]): WbsBuilderTask[] => {
			return tasks.map((t) => {
				if (t.id === parentId) {
					const newChildren = [...(t.children || [])];
					const [removed] = newChildren.splice(fromIndex, 1);
					newChildren.splice(toIndex, 0, removed);
					return {
						...t,
						children: newChildren
					};
				}
				if (t.children) {
					return {
						...t,
						children: reorderInTree(t.children)
					};
				}
				return t;
			});
		};

		return reorderInTree(wbs);
	});
}

// Helper function to add a chat message
export function addChatMessage(role: 'user' | 'assistant', content: string) {
	chatHistory.update((history) => [
		...history,
		{
			id: `msg-${Date.now()}-${Math.random()}`,
			role,
			content,
			timestamp: new Date()
		}
	]);
}

// Helper function to reset all stores
export function resetWbsBuilder() {
	projectDetails.set({
		projectName: '',
		description: '',
		goal: '',
		startDate: '',
		endDate: '',
		constraints: '',
		teamMembers: []
	});
	currentWbs.set([]);
	currentPhase.set('input');
	selectedParentTask.set(null);
	isLoadingAi.set(false);
	chatHistory.set([]);
	errorMessage.set('');
}

// Helper function to save state to localStorage
export function saveToLocalStorage() {
	if (typeof window === 'undefined') return;

	try {
		const state = {
			projectDetails: null as any,
			currentWbs: null as any,
			currentPhase: null as any,
			chatHistory: null as any
		};

		// Get current values from stores
		projectDetails.subscribe((v) => (state.projectDetails = v))();
		currentWbs.subscribe((v) => (state.currentWbs = v))();
		currentPhase.subscribe((v) => (state.currentPhase = v))();
		chatHistory.subscribe((v) => (state.chatHistory = v))();

		localStorage.setItem('wbsBuilderState', JSON.stringify(state));
	} catch (e) {
		console.error('Failed to save to localStorage:', e);
	}
}

// Helper function to load state from localStorage
export function loadFromLocalStorage() {
	if (typeof window === 'undefined') return false;

	try {
		const saved = localStorage.getItem('wbsBuilderState');
		if (!saved) return false;

		const state = JSON.parse(saved);

		if (state.projectDetails) projectDetails.set(state.projectDetails);
		if (state.currentWbs) currentWbs.set(state.currentWbs);
		if (state.currentPhase) currentPhase.set(state.currentPhase);
		if (state.chatHistory) chatHistory.set(state.chatHistory);

		return true;
	} catch (e) {
		console.error('Failed to load from localStorage:', e);
		return false;
	}
}

// Helper function to clear localStorage
export function clearLocalStorage() {
	if (typeof window === 'undefined') return;

	try {
		localStorage.removeItem('wbsBuilderState');
	} catch (e) {
		console.error('Failed to clear localStorage:', e);
	}
}
