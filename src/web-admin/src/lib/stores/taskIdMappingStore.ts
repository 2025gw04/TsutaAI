import { writable } from 'svelte/store';

/**
 * フロントエンドタスクIDとデータベースタスクIDのマッピングを保持するストア
 * キー: フロントエンドタスクID (例: "1", "1.1", "2")
 * 値: データベースタスクID (例: 123, 456, 789)
 */
export const taskIdMappingStore = writable<Map<string, number>>(new Map());

/**
 * IDマッピングを設定
 */
export function setTaskIdMapping(frontendId: string, databaseId: number) {
	taskIdMappingStore.update((map) => {
		map.set(frontendId, databaseId);
		return map;
	});
}

/**
 * IDマッピングを一括設定
 */
export function setTaskIdMappings(mappings: Map<string, number>) {
	taskIdMappingStore.set(new Map(mappings));
}

/**
 * フロントエンドIDからデータベースIDを取得
 */
export function getTaskDatabaseId(frontendId: string): number | null {
	let databaseId: number | null = null;
	const unsubscribe = taskIdMappingStore.subscribe((map) => {
		databaseId = map.get(frontendId) ?? null;
	});
	unsubscribe();
	return databaseId;
}

/**
 * IDマッピングをクリア
 */
export function clearTaskIdMappings() {
	taskIdMappingStore.set(new Map());
}
