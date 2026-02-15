import { writable, get } from 'svelte/store';

/** カスタムフィールド定義 */
export interface CustomField {
	id: string;
	name: string;
	type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox';
	options?: string[];
	required: boolean;
	createdAt: string;
}

/** カスタムフィールド値 */
export interface CustomFieldValue {
	fieldId: string;
	value: string | number | boolean;
}

/** タスクIDとカスタムフィールド値のマップ */
export interface TaskCustomFields {
	[taskId: string]: CustomFieldValue[];
}

/** カスタムフィールドストア */
export const customFieldsStore = writable<CustomField[]>([]);

/** タスクのカスタムフィールド値ストア */
export const taskCustomFieldsStore = writable<TaskCustomFields>({});

/** プロジェクトのカスタムフィールドを読み込む */
export function loadCustomFields(projectId: number): CustomField[] {
	const key = `custom_fields_project_${projectId}`;
	const stored = localStorage.getItem(key);
	if (stored) {
		try {
			const fields = JSON.parse(stored);
			customFieldsStore.set(fields);
			return fields;
		} catch (error) {
			console.error('カスタムフィールドの読み込みに失敗しました:', error);
		}
	}
	customFieldsStore.set([]);
	return [];
}

/** プロジェクトのカスタムフィールドを保存する */
export function saveCustomFields(projectId: number, fields: CustomField[]) {
	const key = `custom_fields_project_${projectId}`;
	localStorage.setItem(key, JSON.stringify(fields));
	customFieldsStore.set(fields);
}

/** タスクのカスタムフィールド値を読み込む */
export function loadTaskCustomFields(projectId: number): TaskCustomFields {
	const key = `task_custom_fields_project_${projectId}`;
	const stored = localStorage.getItem(key);
	if (stored) {
		try {
			const taskFields = JSON.parse(stored);
			taskCustomFieldsStore.set(taskFields);
			return taskFields;
		} catch (error) {
			console.error('タスクカスタムフィールド値の読み込みに失敗しました:', error);
		}
	}
	taskCustomFieldsStore.set({});
	return {};
}

/** タスクのカスタムフィールド値を保存する */
export function saveTaskCustomFields(projectId: number, taskFields: TaskCustomFields) {
	const key = `task_custom_fields_project_${projectId}`;
	localStorage.setItem(key, JSON.stringify(taskFields));
	taskCustomFieldsStore.set(taskFields);
}

/** 特定タスクのカスタムフィールド値を取得 */
export function getTaskFieldValues(taskId: string): CustomFieldValue[] {
	const taskFields = get(taskCustomFieldsStore);
	return taskFields[taskId] || [];
}

/** 特定タスクのカスタムフィールド値を更新 */
export function updateTaskFieldValues(
	projectId: number,
	taskId: string,
	values: CustomFieldValue[]
) {
	const taskFields = get(taskCustomFieldsStore);
	taskFields[taskId] = values;
	saveTaskCustomFields(projectId, taskFields);
}

/** 特定タスクの特定フィールドの値を取得 */
export function getTaskFieldValue(
	taskId: string,
	fieldId: string
): string | number | boolean | null {
	const values = getTaskFieldValues(taskId);
	const value = values.find((v) => v.fieldId === fieldId);
	return value ? value.value : null;
}

/** 特定タスクの特定フィールドの値を設定 */
export function setTaskFieldValue(
	projectId: number,
	taskId: string,
	fieldId: string,
	value: string | number | boolean
) {
	const values = getTaskFieldValues(taskId);
	const existingIndex = values.findIndex((v) => v.fieldId === fieldId);

	if (existingIndex >= 0) {
		values[existingIndex].value = value;
	} else {
		values.push({ fieldId, value });
	}

	updateTaskFieldValues(projectId, taskId, values);
}

/** フィールド削除時に関連する値も削除 */
export function deleteFieldValues(projectId: number, fieldId: string) {
	const taskFields = get(taskCustomFieldsStore);
	const updatedTaskFields: TaskCustomFields = {};

	for (const [taskId, values] of Object.entries(taskFields)) {
		updatedTaskFields[taskId] = values.filter((v) => v.fieldId !== fieldId);
	}

	saveTaskCustomFields(projectId, updatedTaskFields);
}
