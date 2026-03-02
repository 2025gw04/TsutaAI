import { writable } from 'svelte/store';

/**
 * ボード列の定義
 */
export interface BoardColumn {
	id: string;
	label: string;
	color: string;
	wipLimit: number | null;
	order: number;
	isDefault: boolean; // デフォルト列かどうか
}

/**
 * デフォルトの列定義
 */
export const DEFAULT_COLUMNS: BoardColumn[] = [
	{
		id: 'not-started',
		label: '未着手',
		color: '#9ca3af',
		wipLimit: null,
		order: 0,
		isDefault: true
	},
	{ id: 'planning', label: '計画中', color: '#8b5cf6', wipLimit: null, order: 1, isDefault: true },
	{ id: 'in-progress', label: '進行中', color: '#3b82f6', wipLimit: 5, order: 2, isDefault: true },
	{
		id: 'in-review',
		label: 'レビュー待ち',
		color: '#f59e0b',
		wipLimit: 3,
		order: 3,
		isDefault: true
	},
	{
		id: 'blocked',
		label: 'ブロック中',
		color: '#ef4444',
		wipLimit: null,
		order: 4,
		isDefault: true
	},
	{ id: 'completed', label: '完了', color: '#10b981', wipLimit: null, order: 5, isDefault: true }
];

/**
 * ボード列ストア
 */
const createBoardColumnStore = () => {
	const { subscribe, set, update } = writable<BoardColumn[]>(DEFAULT_COLUMNS);

	return {
		subscribe,

		/**
		 * プロジェクト固有の列定義を読み込む
		 */
		loadColumns: (projectId: number): BoardColumn[] => {
			const key = `board_columns_project_${projectId}`;
			const stored = localStorage.getItem(key);

			if (stored) {
				try {
					const columns = JSON.parse(stored);
					set(columns);
					return columns;
				} catch (error) {
					console.error('Failed to parse board columns:', error);
					set(DEFAULT_COLUMNS);
					return DEFAULT_COLUMNS;
				}
			}

			set(DEFAULT_COLUMNS);
			return DEFAULT_COLUMNS;
		},

		/**
		 * 列定義を保存する
		 */
		saveColumns: (projectId: number, columns: BoardColumn[]) => {
			const key = `board_columns_project_${projectId}`;
			localStorage.setItem(key, JSON.stringify(columns));
			set(columns);
		},

		/**
		 * 列を追加する
		 */
		addColumn: (projectId: number, column: Omit<BoardColumn, 'order' | 'isDefault'>) => {
			update((columns) => {
				const maxOrder = Math.max(...columns.map((c) => c.order), -1);
				const newColumn: BoardColumn = {
					...column,
					order: maxOrder + 1,
					isDefault: false
				};
				const newColumns = [...columns, newColumn];

				const key = `board_columns_project_${projectId}`;
				localStorage.setItem(key, JSON.stringify(newColumns));

				return newColumns;
			});
		},

		/**
		 * 列を更新する
		 */
		updateColumn: (projectId: number, columnId: string, updates: Partial<BoardColumn>) => {
			update((columns) => {
				const newColumns = columns.map((c) => (c.id === columnId ? { ...c, ...updates } : c));

				const key = `board_columns_project_${projectId}`;
				localStorage.setItem(key, JSON.stringify(newColumns));

				return newColumns;
			});
		},

		/**
		 * 列を削除する
		 */
		deleteColumn: (projectId: number, columnId: string) => {
			update((columns) => {
				// デフォルト列は削除できない
				const column = columns.find((c) => c.id === columnId);
				if (column?.isDefault) {
					console.warn('Cannot delete default column');
					return columns;
				}

				const newColumns = columns.filter((c) => c.id !== columnId);

				const key = `board_columns_project_${projectId}`;
				localStorage.setItem(key, JSON.stringify(newColumns));

				return newColumns;
			});
		},

		/**
		 * 列の順序を変更する
		 */
		reorderColumns: (projectId: number, newOrder: string[]) => {
			update((columns) => {
				const newColumns = newOrder
					.map((id, index) => {
						const column = columns.find((c) => c.id === id);
						return column ? { ...column, order: index } : null;
					})
					.filter((c): c is BoardColumn => c !== null);

				const key = `board_columns_project_${projectId}`;
				localStorage.setItem(key, JSON.stringify(newColumns));

				return newColumns;
			});
		},

		/**
		 * デフォルト列に戻す
		 */
		resetToDefault: (projectId: number) => {
			const key = `board_columns_project_${projectId}`;
			localStorage.removeItem(key);
			set(DEFAULT_COLUMNS);
		},

		/**
		 * 列が存在するかチェック
		 */
		hasColumn: (columns: BoardColumn[], columnId: string): boolean => {
			return columns.some((c) => c.id === columnId);
		},

		/**
		 * 列IDから列を取得
		 */
		getColumn: (columns: BoardColumn[], columnId: string): BoardColumn | undefined => {
			return columns.find((c) => c.id === columnId);
		}
	};
};

export const boardColumnStore = createBoardColumnStore();

/**
 * ステータスIDから列IDへのマッピング
 * 既存のタスクステータスと列を対応させる
 */
export function mapStatusToColumnId(status: string): string {
	const mapping: Record<string, string> = {
		'not-started': 'not-started',
		planning: 'planning',
		'in-progress': 'in-progress',
		'in-review': 'in-review',
		blocked: 'blocked',
		completed: 'completed',
		// 旧形式との互換性
		todo: 'not-started',
		done: 'completed',
		in_progress: 'in-progress',
		pending: 'planning'
	};

	return mapping[status] || status;
}

/**
 * 列IDからステータスへのマッピング
 */
export function mapColumnIdToStatus(columnId: string): string {
	// デフォルト列の場合はそのまま返す
	const defaultIds = DEFAULT_COLUMNS.map((c) => c.id);
	if (defaultIds.includes(columnId)) {
		return columnId;
	}

	// カスタム列の場合は in-progress として扱う
	return 'in-progress';
}
