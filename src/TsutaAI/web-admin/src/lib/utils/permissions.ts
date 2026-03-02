// 権限管理ユーティリティ

export type UserRole = 'admin' | 'manager' | 'member';

export type Permission =
	| 'create_project'
	| 'edit_project'
	| 'delete_project'
	| 'create_user'
	| 'edit_user'
	| 'delete_user'
	| 'create_task'
	| 'edit_task'
	| 'delete_task'
	| 'view_reports'
	| 'generate_ai'
	| 'manage_vacations'
	| 'view_versions'
	| 'manage_sprints'
	| 'manage_help_requests';

/**
 * ロールと権限のマッピング
 */
const rolePermissions: Record<UserRole, Permission[]> = {
	admin: [
		'create_project',
		'edit_project',
		'delete_project',
		'create_user',
		'edit_user',
		'delete_user',
		'create_task',
		'edit_task',
		'delete_task',
		'view_reports',
		'generate_ai',
		'manage_vacations',
		'view_versions',
		'manage_sprints',
		'manage_help_requests'
	],
	manager: [
		'create_project',
		'edit_project',
		'create_task',
		'edit_task',
		'delete_task',
		'view_reports',
		'generate_ai',
		'manage_vacations',
		'manage_sprints',
		'manage_help_requests'
	],
	member: ['create_task', 'edit_task', 'view_reports']
};

/**
 * ユーザーが特定の権限を持っているかチェックします
 * @param userRole - ユーザーのロール
 * @param permission - チェックする権限
 * @returns 権限がある場合true
 */
export function hasPermission(userRole: string, permission: Permission): boolean {
	const role = userRole as UserRole;
	if (!rolePermissions[role]) {
		return false;
	}
	return rolePermissions[role].includes(permission);
}

/**
 * ユーザーが複数の権限のうち、いずれかを持っているかチェックします
 * @param userRole - ユーザーのロール
 * @param permissions - チェックする権限のリスト
 * @returns いずれかの権限がある場合true
 */
export function hasAnyPermission(userRole: string, permissions: Permission[]): boolean {
	return permissions.some((permission) => hasPermission(userRole, permission));
}

/**
 * ユーザーがすべての権限を持っているかチェックします
 * @param userRole - ユーザーのロール
 * @param permissions - チェックする権限のリスト
 * @returns すべての権限がある場合true
 */
export function hasAllPermissions(userRole: string, permissions: Permission[]): boolean {
	return permissions.every((permission) => hasPermission(userRole, permission));
}

/**
 * ユーザーが管理者かどうかチェックします
 * @param userRole - ユーザーのロール
 * @returns 管理者の場合true
 */
export function isAdmin(userRole: string): boolean {
	return userRole === 'admin';
}

/**
 * ユーザーが管理者またはマネージャーかどうかチェックします
 * @param userRole - ユーザーのロール
 * @returns 管理者またはマネージャーの場合true
 */
export function isManagerOrAbove(userRole: string): boolean {
	return userRole === 'admin' || userRole === 'manager';
}

/**
 * 権限エラーメッセージを取得します
 * @param permission - 権限
 * @returns エラーメッセージ
 */
export function getPermissionErrorMessage(permission: Permission): string {
	const messages: Record<Permission, string> = {
		create_project: 'プロジェクトを作成する権限がありません。',
		edit_project: 'プロジェクトを編集する権限がありません。',
		delete_project: 'プロジェクトを削除する権限がありません。',
		create_user: 'ユーザーを作成する権限がありません。',
		edit_user: 'ユーザーを編集する権限がありません。',
		delete_user: 'ユーザーを削除する権限がありません。',
		create_task: 'タスクを作成する権限がありません。',
		edit_task: 'タスクを編集する権限がありません。',
		delete_task: 'タスクを削除する権限がありません。',
		view_reports: 'レポートを閲覧する権限がありません。',
		generate_ai: 'AI機能を使用する権限がありません。',
		manage_vacations: '休暇を管理する権限がありません。',
		view_versions: 'バージョン履歴を閲覧する権限がありません。',
		manage_sprints: 'スプリントを管理する権限がありません。',
		manage_help_requests: 'ヘルプリクエストを管理する権限がありません。'
	};

	return messages[permission] || 'この操作を実行する権限がありません。';
}
