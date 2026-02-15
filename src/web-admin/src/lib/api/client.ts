// 動的にベースURLを決定（複数ドメイン対応）
function getBaseUrl(): string {
	// ブラウザ環境でない場合（SSR時など）
	if (typeof window === 'undefined') {
		return 'http://localhost:3000';
	}

	// 本番環境の判定: localhost以外の場合
	const isProduction =
		!window.location.hostname.includes('localhost') &&
		!window.location.hostname.includes('127.0.0.1');

	if (isProduction) {
		// 本番環境: 現在のドメインの /api を使用
		const protocol = window.location.protocol; // https: or http:
		const host = window.location.host; // ドメイン:ポート
		return `${protocol}//${host}/api`;
	} else {
		// 開発環境: 環境変数またはlocalhost:3000/apiを使用
		return (
			(import.meta.env && (import.meta.env.VITE_API_BASE_URL as string)) ||
			'http://localhost:3000/api'
		);
	}
}

function getWebSocketUrl(): string {
	// ブラウザ環境でない場合
	if (typeof window === 'undefined') {
		return 'ws://localhost:3000/ws';
	}

	// 本番環境の判定
	const isProduction =
		!window.location.hostname.includes('localhost') &&
		!window.location.hostname.includes('127.0.0.1');

	if (isProduction) {
		// 本番環境: 現在のドメインの /ws を使用
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.host;
		return `${protocol}//${host}/ws`;
	} else {
		// 開発環境: 環境変数またはデフォルト値を使用
		const devBaseUrl =
			(import.meta.env && (import.meta.env.VITE_API_BASE_URL as string)) || 'http://localhost:3000';
		return (
			(import.meta.env && (import.meta.env.VITE_WS_URL as string)) ||
			devBaseUrl.replace(/^http/, 'ws') + '/ws'
		);
	}
}

export const baseUrl = getBaseUrl();
export const WEBSOCKET_URL = getWebSocketUrl();

/**
 * localStorageからJWTトークンを取得します
 */
function getAuthToken(): string | null {
	if (typeof window === 'undefined') return null;

	const authJson = window.localStorage.getItem('tsutaai.auth');
	if (!authJson) return null;

	try {
		const auth = JSON.parse(authJson);
		return auth.token || null;
	} catch {
		return null;
	}
}

let isHandlingAuthError = false;

/**
 * 認証エラー時の処理: エラーメッセージを表示してログアウト、ログイン画面にリダイレクト
 */
function handleAuthError(): void {
	if (typeof window === 'undefined') return;
	if (isHandlingAuthError) return;

	isHandlingAuthError = true;

	// エラーメッセージを表示
	alert('セッションが切れました。再度ログインしてください。');

	// localStorageから認証情報をクリア
	window.localStorage.removeItem('tsutaai.auth');

	// ログイン画面にリダイレクト
	// 現在のパスを保存して、ログイン後に戻れるようにする
	const currentPath = window.location.pathname;
	if (currentPath !== '/' && currentPath !== '/login') {
		window.localStorage.setItem('tsutaai.redirectAfterLogin', currentPath);
	}

	// ログイン画面にリダイレクト
	window.location.href = '/';

	// リダイレクト後にフラグをリセット（念のため）
	setTimeout(() => {
		isHandlingAuthError = false;
	}, 1000);
}

/**
 * 403エラー時の処理: セッション切れの可能性を示し、再ログインを促す
 */
function handleForbiddenError(): void {
	if (typeof window === 'undefined') return;
	if (isHandlingAuthError) return;

	isHandlingAuthError = true;

	// 確認ダイアログを表示
	const shouldRelogin = window.confirm(
		'403エラーが発生しました。\n\nアカウントのセッションが切れている可能性があります。\n再ログインしますか？'
	);

	if (shouldRelogin) {
		// localStorageから認証情報をクリア
		window.localStorage.removeItem('tsutaai.auth');

		// ログイン画面にリダイレクト
		// 現在のパスを保存して、ログイン後に戻れるようにする
		const currentPath = window.location.pathname;
		if (currentPath !== '/' && currentPath !== '/login') {
			window.localStorage.setItem('tsutaai.redirectAfterLogin', currentPath);
		}

		// ログイン画面にリダイレクト
		window.location.href = '/';
	} else {
		// キャンセルされた場合はフラグをリセットして、次のエラーで再度ダイアログを表示できるようにする
		isHandlingAuthError = false;
	}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	// JWTトークンを取得してAuthorizationヘッダーに追加
	const token = getAuthToken();
	const headers: any = {
		'Content-Type': 'application/json',
		...(options.headers || {})
	};

	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	try {
		const response = await fetch(`${baseUrl}${path}`, {
			headers,
			...options
		});

		if (!response.ok) {
			// レスポンスのContent-Typeを確認
			const contentType = response.headers.get('content-type');
			let errorMessage = 'API呼び出しに失敗しました。';

			if (contentType && contentType.includes('application/json')) {
				// JSONレスポンスの場合
				try {
					const errorData = await response.json();
					errorMessage = errorData.message || errorMessage;
				} catch {
					// JSONパースに失敗した場合はデフォルトメッセージを使用
				}
			} else {
				// テキストレスポンスの場合
				const textMessage = await response.text();
				if (textMessage) {
					errorMessage = textMessage;
				}
			}

			// ステータスコード別のエラーメッセージ
			if (response.status === 401) {
				errorMessage = 'セッションが切れました。再度ログインしてください。';
				// 401エラー: 自動的にログアウトしてログイン画面にリダイレクト
				handleAuthError();
			} else if (response.status === 403) {
				errorMessage = 'アクセス権限がありません。';
				// 403エラー: セッション切れの可能性があるため、再ログインを促す
				handleForbiddenError();
			} else if (response.status === 404) {
				errorMessage = 'リソースが見つかりませんでした。';
			} else if (response.status >= 500) {
				errorMessage = `サーバーエラーが発生しました（${response.status}）: ${errorMessage}`;
			}

			throw new Error(errorMessage);
		}

		// Content-Typeに基づいてレスポンスを処理
		const contentType = response.headers.get('content-type');
		if (
			contentType &&
			(contentType.includes('text/markdown') ||
				contentType.includes('text/html') ||
				contentType.includes('text/plain'))
		) {
			// テキストベースのレスポンスの場合
			const textData = await response.text();
			return textData as T;
		} else {
			// JSONレスポンスの場合
			return (await response.json()) as T;
		}
	} catch (error) {
		// ネットワークエラーやその他のfetchエラーを処理
		if (error instanceof TypeError) {
			// ネットワークエラー（接続失敗、CORS、など）
			console.error('Network error:', error);
			throw new Error(
				`バックエンドAPIに接続できません。backend-apiが起動していることを確認してください。(${baseUrl})`
			);
		}
		// その他のエラーはそのまま再スロー
		throw error;
	}
}

async function post<T>(path: string, payload?: any): Promise<T> {
	return request<T>(path, {
		method: 'POST',
		body: JSON.stringify(payload || {})
	});
}

async function get<T>(path: string): Promise<T> {
	return request<T>(path, {
		method: 'GET'
	});
}

async function put<T>(path: string, payload?: any): Promise<T> {
	return request<T>(path, {
		method: 'PUT',
		body: JSON.stringify(payload || {})
	});
}

async function patch<T>(path: string, payload?: any): Promise<T> {
	return request<T>(path, {
		method: 'PATCH',
		body: JSON.stringify(payload || {})
	});
}

async function del<T>(path: string): Promise<T> {
	return request<T>(path, {
		method: 'DELETE'
	});
}

export const apiClient = {
	// baseUrl を返すgetterを追加
	getBaseUrl: () => baseUrl,

	// 汎用的な GET メソッド（パス指定で任意の API を呼び出し）
	get: <T = any>(path: string) => get<{ success: boolean; data: T }>(path),

	// 汎用的な POST メソッド（パス指定で任意の API を呼び出し）
	post: <T = any>(path: string, payload?: any) =>
		post<{ success: boolean; data: T }>(path, payload),

	// 汎用的な PUT メソッド（パス指定で任意の API を呼び出し）
	put: <T = any>(path: string, payload?: any) => put<{ success: boolean; data: T }>(path, payload),

	// 汎用的な PATCH メソッド（パス指定で任意の API を呼び出し）
	patch: <T = any>(path: string, payload?: any) =>
		patch<{ success: boolean; data: T }>(path, payload),

	// 汎用的な DELETE メソッド（パス指定で任意の API を呼び出し）
	delete: <T = any>(path: string) => del<{ success: boolean; data: T }>(path),

	login: (payload: { username: string; password: string }) =>
		request<{
			success: boolean;
			data: { id: number; username: string; fullName: string; role: string; token: string };
		}>('/auth/login', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	fetchProjects: () => request<{ success: boolean; data: any[] }>('/projects'),
	fetchProject: (id: number) => request<{ success: boolean; data: any }>(`/projects/${id}`),
	createProject: (payload: {
		name?: string;
		projectName?: string;
		description: string;
		startDate: string;
		endDate: string;
		status: string;
		createdBy: number;
	}) =>
		request<{ success: boolean; data: { id: number } }>('/projects', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	updateProject: (
		id: number,
		payload: {
			name?: string;
			projectName?: string;
			description: string;
			startDate: string;
			endDate: string;
			status: string;
			mainDeliverable?: string;
			milestone?: string;
		}
	) =>
		request<{ success: boolean }>(`/projects/${id}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		}),
	deleteProject: (id: number) =>
		request<{ success: boolean }>(`/projects/${id}`, {
			method: 'DELETE'
		}),

	fetchProjectMembers: (projectId: number) =>
		request<{ success: boolean; data: any[] }>(`/projects/${projectId}/members`),
	updateProjectMembers: (projectId: number, userIds: number[]) =>
		request<{ success: boolean }>(`/projects/${projectId}/members`, {
			method: 'PUT',
			body: JSON.stringify({ userIds })
		}),

	// プロジェクトの全タスクの工数を再計算
	recalculateProjectEffort: (projectId: number) =>
		request<{ success: boolean; message: string; data: any }>(
			`/projects/${projectId}/recalculate-effort`,
			{
				method: 'POST'
			}
		),

	fetchUsers: () => request<{ success: boolean; data: any[] }>('/users'),
	createUser: (payload: {
		username: string;
		email: string;
		password: string;
		fullName: string;
		role: string;
	}) =>
		request<{ success: boolean; data: { id: number } }>('/users', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	updateUser: (
		id: number,
		payload: { email: string; fullName: string; role: string; password?: string }
	) =>
		request<{ success: boolean }>(`/users/${id}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		}),
	deleteUser: (id: number) =>
		request<{ success: boolean }>(`/users/${id}`, {
			method: 'DELETE'
		}),
	fetchPromptCatalog: () => request<{ success: boolean; data: any[] }>('/users/prompts/catalog'),
	summarizeProject: (payload: Record<string, string>) =>
		request<{ success: boolean; data: any }>('/ai/project-summary', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	addUserPrompt: (
		userId: number,
		payload: { promptName: string; responsibility: string; notes: string }
	) =>
		request<{ success: boolean; data: any }>(`/users/${userId}/prompts`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	updateUserPrompt: (
		userId: number,
		promptId: number,
		payload: { responsibility: string; notes: string }
	) =>
		request<{ success: boolean; data: any }>(`/users/${userId}/prompts/${promptId}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		}),
	deleteUserPrompt: (userId: number, promptId: number) =>
		request<{ success: boolean }>(`/users/${userId}/prompts/${promptId}`, {
			method: 'DELETE'
		}),

	fetchTasks: (projectId?: number) =>
		request<{ success: boolean; data: any[] }>(
			projectId ? `/tasks?projectId=${projectId}` : '/tasks'
		),
	deleteAllTasks: (projectId: number) =>
		request<{ success: boolean; deletedCount: number }>(`/tasks?projectId=${projectId}`, {
			method: 'DELETE'
		}),
	createTask: (payload: {
		title: string;
		projectId: number;
		assigneeUserId?: number;
		estimatedMinutes: number;
		priority: string;
		status?: string;
		description?: string;
		deliverable?: string;
		parentTaskId?: number;
		startDate?: string;
		endDate?: string;
	}) =>
		request<{ success: boolean; data: { id: number } }>('/tasks', {
			method: 'POST',
			body: JSON.stringify({ ...payload, status: payload.status || 'todo' })
		}),
	updateTask: (
		id: number,
		payload: {
			title?: string;
			assigneeUserId?: number;
			estimatedMinutes?: number;
			priority?: string;
			status?: string;
			description?: string;
			deliverable?: string;
			startDate?: string;
			endDate?: string;
		}
	) =>
		request<{ success: boolean }>(`/tasks/${id}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		}),
	deleteTask: (id: number) =>
		request<{ success: boolean }>(`/tasks/${id}`, {
			method: 'DELETE'
		}),
	fetchWorkLogs: (userId: number) =>
		request<{ success: boolean; data: any[] }>(`/worklogs?userId=${userId}`),
	fetchReports: (options?: { userId?: number | string; date?: string }) => {
		let query = '';
		if (options?.userId) query += `userId=${options.userId}`;
		if (options?.date) query += (query ? '&' : '') + `date=${options.date}`;
		return request<{ success: boolean; data: any[] }>(`/reports${query ? '?' + query : ''}`);
	},
	analyzeDailyReportTrendsAI: (userId: number) =>
		request<{ success: boolean; analysis: any; reportCount: number; error?: string }>(
			`/reports/${userId}/analyze-trends-ai`
		),

	generateWbs: (payload: Record<string, any>) =>
		request<{ success: boolean; data: { wbs: any[] } }>('/ai/wbs', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	generateWbsBuilder: (payload: {
		projectDetails: any;
		phase: 'major' | 'medium' | 'minor';
		parentTask?: { id: string; name: string; description?: string; effortDays?: number };
		userInstruction?: string;
		history?: Array<{ role: 'user' | 'assistant'; content: string }>;
	}) =>
		request<{ success: boolean; data: { suggestedTasks: any[]; aiComment: string } }>(
			'/ai/wbs/builder/generate',
			{
				method: 'POST',
				body: JSON.stringify(payload)
			}
		),
	finalizeWbsBuilder: (payload: {
		projectDetails: {
			projectName: string;
			goal?: string;
			startDate: string;
			endDate: string;
			constraints?: string;
		};
		wbs: any[];
		teamMembers: Array<{ id: number; fullName: string; role?: string; skills?: any[] }>;
	}) =>
		request<{ success: boolean; data: { tasks: any[]; aiComment: string } }>(
			'/ai/wbs/builder/finalize',
			{
				method: 'POST',
				body: JSON.stringify(payload)
			}
		),
	generateDailyReportDraft: (payload: Record<string, string>) =>
		request<{ success: boolean; data: any }>('/ai/daily-report', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	generateDailyReportFromLogs: (payload: { userId: number; date: string }) =>
		request<{ success: boolean; data: any }>('/ai/daily-report-draft', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	suggestTasks: (payload: Record<string, string>) =>
		request<{ success: boolean; data: string }>('/ai/task-suggestion', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	generateProjectAlerts: (payload: { projectsJson: string }) =>
		request<{ success: boolean; data: { alerts: any[] } }>('/ai/generate-alerts', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	decomposeTask: (payload: { task_name: string; task_description: string }) =>
		request<{ success: boolean; data: { subtasks: any[] } }>('/ai/wbs/decompose', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	refineWbsTask: (payload: {
		task_id: string;
		task_name: string;
		current_description: string;
		desired_outcome: string;
		quality_focus: string;
		risk_notes: string;
	}) =>
		request<{ success: boolean; data: { task: any } }>('/ai/wbs/refine', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	sanityCheckWbs: (payload: { wbs_json: string; project_goal: string; team_structure: string }) =>
		request<{ success: boolean; data: { suggestions: any[] } }>('/ai/wbs/sanity-check', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	detectRisk: (payload: { projects_summary: string }) =>
		request<{ success: boolean; data: { alerts: any[] } }>('/ai/risk-detection', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	analyzeSentiment: (payload: { comments_json: string }) =>
		request<{ success: boolean; data: any }>('/ai/sentiment-analysis', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	// ダッシュボード用API
	fetchAllProjectSummaries: () =>
		request<{ success: boolean; data: any[] }>('/dashboards/project-summaries'),
	saveProjectSummary: (projectId: number, payload: any) =>
		request<{ success: boolean }>(`/dashboards/project-summaries/${projectId}`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	fetchAllAlerts: (filters?: {
		severity?: string;
		type?: string;
		isRead?: boolean;
		projectId?: number;
	}) => {
		const params = new URLSearchParams();
		if (filters) {
			if (filters.severity) params.append('severity', filters.severity);
			if (filters.type) params.append('type', filters.type);
			if (filters.isRead !== undefined) params.append('isRead', String(filters.isRead));
			if (filters.projectId) params.append('projectId', String(filters.projectId));
		}
		return request<{ success: boolean; data: any[] }>(
			`/dashboards/alerts${params.toString() ? '?' + params.toString() : ''}`
		);
	},
	fetchAlert: (alertId: number) =>
		request<{ success: boolean; data: any }>(`/dashboards/alerts/${alertId}`),
	saveAlerts: (alerts: any[]) =>
		request<{ success: boolean }>('/dashboards/alerts', {
			method: 'POST',
			body: JSON.stringify({ alerts })
		}),
	markAlertAsRead: (alertId: number, isRead: boolean) =>
		request<{ success: boolean }>(`/dashboards/alerts/${alertId}/read`, {
			method: 'PATCH',
			body: JSON.stringify({ isRead })
		}),
	markAlertsAsRead: (alertIds: number[], isRead: boolean) =>
		request<{ success: boolean }>('/dashboards/alerts/mark-read', {
			method: 'PATCH',
			body: JSON.stringify({ alertIds, isRead })
		}),
	markAllAlertsAsRead: () =>
		request<{ success: boolean }>('/dashboards/alerts/mark-all-read', {
			method: 'POST'
		}),
	// 新規: アラートを差分更新（改善版）
	refreshAlerts: (payload?: { forceFullRefresh?: boolean }) =>
		request<{
			success: boolean;
			data: {
				newAlertsCount: number;
				resolvedAlertsCount: number;
				unchangedAlertsCount: number;
				processedProjects: number;
				skippedProjects: number;
			};
			message?: string;
		}>('/dashboards/alerts/refresh', {
			method: 'POST',
			body: JSON.stringify(payload || {})
		}),
	// 新規: アラートを手動で解決
	resolveAlert: (alertId: number) =>
		request<{ success: boolean; message: string }>(`/dashboards/alerts/${alertId}/resolve`, {
			method: 'POST'
		}),
	fetchSentiment: () => request<{ success: boolean; data: any }>('/dashboards/sentiment'),
	saveSentiment: (payload: any) =>
		request<{ success: boolean }>('/dashboards/sentiment', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	// 休暇管理API
	fetchVacations: (userId?: number, options?: { startDate?: string; endDate?: string }) => {
		let query = '';
		if (userId) query += `userId=${userId}`;
		if (options?.startDate) query += (query ? '&' : '') + `startDate=${options.startDate}`;
		if (options?.endDate) query += (query ? '&' : '') + `endDate=${options.endDate}`;
		return request<{ success: boolean; data: any[] }>(`/vacations${query ? '?' + query : ''}`);
	},
	createVacation: (payload: {
		userId: number;
		startDate: string;
		endDate: string;
		vacationType?: string;
		notes?: string;
	}) =>
		request<{ success: boolean; data: any }>('/vacations', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	updateVacation: (
		id: number,
		payload: { startDate?: string; endDate?: string; vacationType?: string; notes?: string }
	) =>
		request<{ success: boolean }>(`/vacations/${id}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		}),
	deleteVacation: (id: number) =>
		request<{ success: boolean }>(`/vacations/${id}`, {
			method: 'DELETE'
		}),
	analyzeVacationImpact: (startDate: string, endDate: string) =>
		request<{ success: boolean; data: any[] }>(
			`/vacations/analyze?startDate=${startDate}&endDate=${endDate}`
		),
	getAffectedTasks: (userId: number, startDate: string, endDate: string) =>
		request<{ success: boolean; data: any[] }>(
			`/vacations/affected-tasks?userId=${userId}&startDate=${startDate}&endDate=${endDate}`
		),

	// タスクコメントAPI
	fetchTaskComments: (taskId: number) =>
		request<{ success: boolean; data: any[] }>(`/tasks/${taskId}/comments`),
	addTaskComment: (taskId: number, payload: { content: string; userId: number }) =>
		request<{ success: boolean; data: any }>(`/tasks/${taskId}/comments`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	deleteTaskComment: (commentId: number) =>
		request<{ success: boolean }>(`/tasks/comments/${commentId}`, {
			method: 'DELETE'
		}),

	// タスク添付ファイルAPI
	fetchTaskAttachments: (taskId: number) =>
		request<{ success: boolean; data: any[] }>(`/tasks/${taskId}/attachments`),
	uploadTaskAttachment: async (taskId: number, file: File) => {
		const formData = new FormData();
		formData.append('file', file);

		// JWTトークンを取得してAuthorizationヘッダーに追加
		const token = getAuthToken();
		const headers: HeadersInit = {};
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		const response = await fetch(`${baseUrl}/tasks/${taskId}/attachments`, {
			method: 'POST',
			headers,
			body: formData
		});

		if (!response.ok) {
			throw new Error('ファイルのアップロードに失敗しました。');
		}

		return (await response.json()) as { success: boolean; data: any };
	},

	// タスクアクティビティログAPI
	fetchTaskActivity: (taskId: number) =>
		request<{ success: boolean; data: any[] }>(`/tasks/${taskId}/activity`),

	// レポート生成API
	generateProjectReport: (
		projectId: number,
		payload: {
			includeTasks?: boolean;
			includeWorkLogs?: boolean;
			includeAiInsights?: boolean;
			includeTeamMetrics?: boolean;
			includeRiskAssessment?: boolean;
			startDate?: string;
			endDate?: string;
			format?: 'json' | 'markdown' | 'html';
		}
	) =>
		request<{ success: boolean; data: any }>(`/report-generator/projects/${projectId}`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	generateAllProjectsReport: (payload: {
		includeMetrics?: boolean;
		includeAlerts?: boolean;
		format?: 'json' | 'markdown' | 'html';
	}) =>
		request<{ success: boolean; data: any }>('/report-generator/all-projects', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	generateUserWorkReport: (
		userId: number,
		payload: {
			startDate?: string;
			endDate?: string;
			includeTaskDetails?: boolean;
			format?: 'json' | 'markdown' | 'html';
		}
	) =>
		request<{ success: boolean; data: any }>(`/report-generator/users/${userId}`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	exportProjectReportCSV: async (projectId: number) => {
		const token = getAuthToken();
		const headers: HeadersInit = {};
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		try {
			const response = await fetch(`${baseUrl}/report-generator/projects/${projectId}/csv`, {
				method: 'GET',
				headers
			});

			if (!response.ok) {
				throw new Error('CSVのエクスポートに失敗しました');
			}

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `project_report_${projectId}.csv`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (error) {
			console.error('Export error:', error);
			throw error;
		}
	},

	exportProject: async (projectId: number, format: 'json' | 'md' | 'csv') => {
		const token = getAuthToken();
		const headers: HeadersInit = {};
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		try {
			const response = await fetch(`${baseUrl}/projects/${projectId}/export?format=${format}`, {
				method: 'GET',
				headers
			});

			if (!response.ok) {
				throw new Error('エクスポートに失敗しました');
			}

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;

			// ファイル名の決定
			const timestamp = new Date().toISOString().split('T')[0];
			a.download = `project_${projectId}_${timestamp}.${format === 'md' ? 'md' : format}`;

			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (error) {
			console.error('Export error:', error);
			throw error;
		}
	},

	// AI タスク説明生成API
	generateTaskDescription: (payload: {
		taskName: string;
		parentTaskName?: string;
		parentContext?: string;
		projectName: string;
		projectSummary: string;
		effortDays?: number;
		deliverable?: string;
	}) =>
		request<{ success: boolean; data: { description: string } }>('/tasks/ai/generate-description', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	// AI リスケジュール提案API
	suggestReschedule: (payload: any) =>
		request<{ success: boolean; data: { changes: any[]; summary: string } }>('/ai/reschedule', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	// AI 自動タスク割り当てAPI
	suggestAutoAssign: (payload: any) =>
		request<{ success: boolean; data: { assignments: any[] } }>('/ai/auto-assign', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	// AI 自動期間調整API
	suggestAutoDuration: (payload: any) =>
		request<{ success: boolean; data: { adjustments: any[] } }>('/ai/auto-duration', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	// 成長トラッキングAPI
	// 成長レポート取得
	fetchGrowthReport: (
		userId: number,
		options?: { months?: number; includeGoals?: boolean; includeContributions?: boolean }
	) => {
		let query = '';
		if (options?.months) query += `months=${options.months}`;
		if (options?.includeGoals !== undefined)
			query += (query ? '&' : '') + `includeGoals=${options.includeGoals}`;
		if (options?.includeContributions !== undefined)
			query += (query ? '&' : '') + `includeContributions=${options.includeContributions}`;
		return request<{ success: boolean; data: any }>(
			`/growth/reports/${userId}${query ? '?' + query : ''}`
		);
	},

	// スキル成長履歴
	fetchSkillGrowthHistory: (userId: number, options?: { months?: number; skillName?: string }) => {
		let query = '';
		if (options?.months) query += `months=${options.months}`;
		if (options?.skillName)
			query += (query ? '&' : '') + `skillName=${encodeURIComponent(options.skillName)}`;
		return request<{ success: boolean; data: any[] }>(
			`/growth/skills/${userId}/history${query ? '?' + query : ''}`
		);
	},
	recordSkillGrowth: (
		userId: number,
		payload: { skillName: string; skillLevel: number; changeReason?: string; notes?: string }
	) =>
		request<{ success: boolean; data: any }>(`/growth/skills/${userId}/history`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	// パフォーマンスメトリクス
	fetchPerformanceMetrics: (userId: number, months?: number) =>
		request<{ success: boolean; data: any[] }>(
			`/growth/metrics/${userId}${months ? '?months=' + months : ''}`
		),
	calculatePerformanceMetrics: (userId: number, targetMonth?: string) =>
		request<{ success: boolean; data: any }>(`/growth/metrics/${userId}/calculate`, {
			method: 'POST',
			body: JSON.stringify({ targetMonth })
		}),

	// 貢献記録
	fetchContributions: (userId: number, options?: { startDate?: string; endDate?: string }) => {
		let query = '';
		if (options?.startDate) query += `startDate=${options.startDate}`;
		if (options?.endDate) query += (query ? '&' : '') + `endDate=${options.endDate}`;
		return request<{ success: boolean; data: any[] }>(
			`/growth/contributions/${userId}${query ? '?' + query : ''}`
		);
	},
	recordContribution: (
		userId: number,
		payload: {
			contributionDate: string;
			contributionType: string;
			title: string;
			description?: string;
			impactLevel?: 'low' | 'medium' | 'high';
			projectId?: number;
			taskId?: number;
		}
	) =>
		request<{ success: boolean; data: any }>(`/growth/contributions/${userId}`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	// 成長目標
	fetchGrowthGoals: (userId: number, status?: string) =>
		request<{ success: boolean; data: any[] }>(
			`/growth/goals/${userId}${status ? '?status=' + status : ''}`
		),
	createGrowthGoal: (
		userId: number,
		payload: {
			goalTitle: string;
			goalDescription?: string;
			targetSkill?: string;
			targetLevel?: number;
			estimatedDurationWeeks?: number;
		}
	) =>
		request<{ success: boolean; data: any }>(`/growth/goals/${userId}`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	updateGrowthGoal: (
		goalId: number,
		payload: {
			goalTitle?: string;
			goalDescription?: string;
			targetSkill?: string;
			targetLevel?: number;
			status?: 'active' | 'completed' | 'cancelled';
			progress?: number;
		}
	) =>
		request<{ success: boolean; data: any }>(`/growth/goals/${goalId}`, {
			method: 'PUT',
			body: JSON.stringify(payload)
		}),
	deleteGrowthGoal: (goalId: number) =>
		request<{ success: boolean }>(`/growth/goals/${goalId}`, {
			method: 'DELETE'
		}),

	// AI分析
	analyzeStrengths: (userId: number) =>
		request<{ success: boolean; data: { strengths: string[] } }>(
			`/growth/analyze/${userId}/strengths`,
			{
				method: 'POST'
			}
		),
	suggestGrowthOpportunities: (userId: number) =>
		request<{ success: boolean; data: { opportunities: string[] } }>(
			`/growth/analyze/${userId}/opportunities`,
			{
				method: 'POST'
			}
		),
	suggestGrowthGoals: (userId: number) =>
		request<{ success: boolean; data: { goals: any[] } }>(
			`/growth/analyze/${userId}/goal-suggestions`,
			{
				method: 'POST'
			}
		),

	// レポート生成
	generate1on1Material: (userId: number, period?: string) =>
		request<{ success: boolean; data: any }>(`/growth/reports/${userId}/1on1`, {
			method: 'POST',
			body: JSON.stringify({ period })
		}),
	generateEvaluationSheet: (userId: number, evaluationPeriod?: string) =>
		request<{ success: boolean; data: any }>(`/growth/reports/${userId}/evaluation`, {
			method: 'POST',
			body: JSON.stringify({ evaluationPeriod })
		}),

	// アクティビティログAPI
	fetchUserActivityLogs: (userId: number, options?: { hours?: number; limit?: number }) => {
		let query = '';
		if (options?.hours) query += `hours=${options.hours}`;
		if (options?.limit) query += (query ? '&' : '') + `limit=${options.limit}`;
		return request<{ success: boolean; data: any[] }>(
			`/activity-logs/user/${userId}${query ? '?' + query : ''}`
		);
	},
	fetchTaskActivityLogs: (taskId: number) =>
		request<{ success: boolean; data: any[] }>(`/activity-logs/task/${taskId}`),
	fetchUserActivityStats: (userId: number, hours?: number) =>
		request<{ success: boolean; data: any }>(
			`/activity-logs/user/${userId}/stats${hours ? '?hours=' + hours : ''}`
		),
	fetchTeamActivityStats: (hours?: number) =>
		request<{ success: boolean; data: any }>(
			`/activity-logs/team/stats${hours ? '?hours=' + hours : ''}`
		),
	detectActivityAnomaly: (userId: number) =>
		request<{ success: boolean; data: any }>(`/activity-logs/user/${userId}/anomaly`),

	// メンタルヘルスAPI
	createMentalHealthLog: (payload: {
		userId: number;
		reportDate: string;
		mood?: number;
		stressLevel?: number;
		hasBlocker?: boolean;
		blockerDetails?: string;
		needSupport?: boolean;
		supportDetails?: string;
	}) =>
		request<{ success: boolean; data: any }>('/mental-health', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	fetchMentalHealthLogs: (userId: number, options?: { days?: number }) => {
		let query = '';
		if (options?.days) query += `days=${options.days}`;
		return request<{ success: boolean; data: any[] }>(
			`/mental-health/user/${userId}${query ? '?' + query : ''}`
		);
	},
	fetchMentalHealthLogByDate: (userId: number, date: string) =>
		request<{ success: boolean; data: any }>(`/mental-health/user/${userId}/date/${date}`),
	fetchTeamMentalHealthSummary: (days?: number) =>
		request<{ success: boolean; data: any }>(
			`/mental-health/team/summary${days ? '?days=' + days : ''}`
		),
	fetchUsersNeedingSupport: () =>
		request<{ success: boolean; data: any[] }>('/mental-health/team/need-support'),
	analyzeMentalHealthTrend: (userId: number, weeks?: number) =>
		request<{ success: boolean; data: any }>(
			`/mental-health/user/${userId}/trend${weeks ? '?weeks=' + weeks : ''}`
		),
	addManagerComment: (logId: number, payload: { managerComment: string; managerId: number }) =>
		request<{ success: boolean; data: any }>(`/mental-health/${logId}/comment`, {
			method: 'POST',
			body: JSON.stringify(payload)
		}),

	// 進捗予測API
	calculateProgressPrediction: (taskId: number, userId?: number) =>
		request<{ success: boolean; data: any }>(`/progress-predictions/task/${taskId}/calculate`, {
			method: 'POST',
			body: JSON.stringify({ userId })
		}),
	fetchLatestPrediction: (taskId: number) =>
		request<{ success: boolean; data: any }>(`/progress-predictions/task/${taskId}/latest`),
	fetchPredictionHistory: (taskId: number, limit?: number) =>
		request<{ success: boolean; data: any[] }>(
			`/progress-predictions/task/${taskId}/history${limit ? '?limit=' + limit : ''}`
		),
	fetchUserPredictions: (userId: number) =>
		request<{ success: boolean; data: any[] }>(`/progress-predictions/user/${userId}`),
	fetchHighRiskTasks: (riskLevel?: 'low' | 'medium' | 'high') =>
		request<{ success: boolean; data: any[] }>(
			`/progress-predictions/high-risk${riskLevel ? '?riskLevel=' + riskLevel : ''}`
		),
	fetchDelayedTasks: () =>
		request<{ success: boolean; data: any[] }>('/progress-predictions/delayed'),
	fetchProjectProgressSummary: (projectId: number) =>
		request<{ success: boolean; data: any }>(`/progress-predictions/project/${projectId}/summary`),
	analyzeProjectDeadline: (projectId: number) =>
		request<{ success: boolean; data: any }>(
			`/progress-predictions/project/${projectId}/analyze-deadline`,
			{
				method: 'POST'
			}
		),

	// プロジェクトダッシュボードAPI
	calculateProjectHealthScore: (projectId: number) =>
		request<{ success: boolean; data: any }>(`/project-dashboard/${projectId}/health-score`, {
			method: 'POST'
		}),
	fetchLatestHealthScore: (projectId: number) =>
		request<{ success: boolean; data: any }>(`/project-dashboard/${projectId}/health-score/latest`),
	fetchHealthScoreHistory: (projectId: number, days?: number) =>
		request<{ success: boolean; data: any[] }>(
			`/project-dashboard/${projectId}/health-score/history${days ? '?days=' + days : ''}`
		),
	recordProjectBurndown: (projectId: number, date?: string) =>
		request<{ success: boolean; data: any }>(`/project-dashboard/${projectId}/burndown`, {
			method: 'POST',
			body: JSON.stringify({ date })
		}),
	fetchProjectBurndown: (projectId: number, days?: number) =>
		request<{ success: boolean; data: any[] }>(
			`/project-dashboard/${projectId}/burndown${days ? '?days=' + days : ''}`
		),
	analyzeProjectCriticalPath: (projectId: number) =>
		request<{ success: boolean; data: any }>(`/project-dashboard/${projectId}/critical-path`, {
			method: 'POST'
		}),

	// システム設定API

	updateSettings: (payload: any) =>
		request<{ success: boolean }>('/settings', {
			method: 'PUT',
			body: JSON.stringify(payload)
		}),

	fetchProjectCriticalPath: (projectId: number, date?: string) =>
		request<{ success: boolean; data: any[] }>(
			`/project-dashboard/${projectId}/critical-path${date ? '?date=' + date : ''}`
		),

	// ヘルプリクエストAPI
	createHelpRequest: (payload: {
		taskId: number;
		requesterId: number;
		requestTitle: string;
		requestDescription?: string;
		urgency?: 'low' | 'medium' | 'high' | 'critical';
		generateContext?: boolean;
		generateSuggestions?: boolean;
	}) =>
		request<{ success: boolean; data: any }>('/help-requests', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	fetchHelpRequests: (filters?: {
		status?: string;
		requesterId?: number;
		assignedTo?: number;
		urgency?: string;
		projectId?: number;
		limit?: number;
	}) => {
		const params = new URLSearchParams();
		if (filters) {
			Object.entries(filters).forEach(([key, value]) => {
				if (value !== undefined) params.append(key, String(value));
			});
		}
		return request<{ success: boolean; data: any[] }>(`/help-requests?${params.toString()}`);
	},
	fetchHelpRequest: (id: number) =>
		request<{ success: boolean; data: any }>(`/help-requests/${id}`),
	updateHelpRequest: (id: number, updates: any) =>
		request<{ success: boolean; data: any }>(`/help-requests/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(updates)
		}),
	deleteHelpRequest: (id: number) =>
		request<{ success: boolean }>(`/help-requests/${id}`, {
			method: 'DELETE'
		}),
	assignHelpRequest: (id: number, helperId: number) =>
		request<{ success: boolean; data: any }>(`/help-requests/${id}/assign`, {
			method: 'POST',
			body: JSON.stringify({ helperId })
		}),
	resolveHelpRequest: (
		id: number,
		resolutionNotes: string,
		effectiveness?: 'very_effective' | 'effective' | 'somewhat_effective' | 'not_effective'
	) =>
		request<{ success: boolean; data: any }>(`/help-requests/${id}/resolve`, {
			method: 'POST',
			body: JSON.stringify({ resolutionNotes, effectiveness })
		}),
	fetchHelperSuggestions: (requestId: number) =>
		request<{ success: boolean; data: any[] }>(`/help-requests/${requestId}/suggestions`),
	fetchHelpRequestStats: (filters?: {
		projectId?: number;
		startDate?: string;
		endDate?: string;
	}) => {
		const params = new URLSearchParams();
		if (filters) {
			Object.entries(filters).forEach(([key, value]) => {
				if (value !== undefined) params.append(key, String(value));
			});
		}
		return request<{ success: boolean; data: any }>(`/help-requests/stats?${params.toString()}`);
	},
	fetchTopHelpers: (limit?: number) =>
		request<{ success: boolean; data: any[] }>(
			`/help-requests/top-helpers${limit ? '?limit=' + limit : ''}`
		),

	// スプリントAPI
	createSprint: (payload: {
		projectId: number;
		sprintName: string;
		sprintNumber?: number;
		startDate: string;
		endDate: string;
		goalDescription: string;
		targetStoryPoints?: number;
		targetTaskCount?: number;
		createdBy: number;
	}) =>
		request<{ success: boolean; data: any }>('/sprints', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	fetchSprints: (filters?: { projectId?: number; status?: string; limit?: number }) => {
		const params = new URLSearchParams();
		if (filters) {
			Object.entries(filters).forEach(([key, value]) => {
				if (value !== undefined) params.append(key, String(value));
			});
		}
		return request<{ success: boolean; data: any[] }>(`/sprints?${params.toString()}`);
	},
	fetchSprint: (id: number) => request<{ success: boolean; data: any }>(`/sprints/${id}`),
	updateSprint: (id: number, updates: any) =>
		request<{ success: boolean; data: any }>(`/sprints/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(updates)
		}),
	startSprint: (id: number) =>
		request<{ success: boolean; data: any }>(`/sprints/${id}/start`, {
			method: 'POST'
		}),
	completeSprint: (id: number) =>
		request<{ success: boolean; data: any }>(`/sprints/${id}/complete`, {
			method: 'POST'
		}),
	recordSprintProgress: (id: number, date?: string) =>
		request<{ success: boolean; data: any }>(`/sprints/${id}/progress`, {
			method: 'POST',
			body: JSON.stringify({ date })
		}),
	fetchSprintProgress: (id: number, days?: number) =>
		request<{ success: boolean; data: any[] }>(
			`/sprints/${id}/progress${days ? '?days=' + days : ''}`
		),
	fetchLatestSprintProgress: (id: number) =>
		request<{ success: boolean; data: any }>(`/sprints/${id}/progress/latest`),
	recordSprintPerformance: (id: number) =>
		request<{ success: boolean; data: any[] }>(`/sprints/${id}/performance`, {
			method: 'POST'
		}),
	fetchSprintPerformance: (id: number) =>
		request<{ success: boolean; data: any[] }>(`/sprints/${id}/performance`),
	fetchSprintStats: (id: number) =>
		request<{ success: boolean; data: any }>(`/sprints/${id}/stats`),
	analyzeSprintGoal: (id: number) =>
		request<{ success: boolean; data: any }>(`/sprints/${id}/analyze`, {
			method: 'POST'
		}),

	// システム設定
	fetchSettings: () => request<{ success: boolean; data: Record<string, any> }>('/settings'),
	fetchSetting: (key: string) => request<{ success: boolean; data: any }>(`/settings/${key}`),
	upsertSetting: (key: string, value: any, type: string = 'string', description: string = '') =>
		post<{ success: boolean }>('/settings', { key, value, type, description }),
	bulkUpdateSettings: (settings: Record<string, any>) =>
		put<{ success: boolean }>('/settings/bulk', { settings }),
	deleteSetting: (key: string) =>
		request<{ success: boolean }>(`/settings/${key}`, { method: 'DELETE' }),

	// 祝日
	fetchHolidays: (year?: string) =>
		request<{ success: boolean; data: any[] }>(`/holidays${year ? `?year=${year}` : ''}`),
	fetchHoliday: (id: number) => request<{ success: boolean; data: any }>(`/holidays/${id}`),
	createHoliday: (holiday: any) => post<{ success: boolean; data: any }>('/holidays', holiday),
	updateHoliday: (id: number, holiday: any) =>
		put<{ success: boolean; data: any }>(`/holidays/${id}`, holiday),
	deleteHoliday: (id: number) =>
		request<{ success: boolean }>(`/holidays/${id}`, { method: 'DELETE' }),
	bulkCreateHolidays: (holidays: any[]) =>
		post<{ success: boolean }>('/holidays/bulk', { holidays }),
	fetchHolidaysByRange: (start_date: string, end_date: string) =>
		request<{ success: boolean; data: any[] }>(
			`/holidays/range?start_date=${start_date}&end_date=${end_date}`
		),

	// 見積もり
	fetchEstimatePatterns: () => request<{ success: boolean; data: any[] }>('/estimates/patterns'),
	fetchEstimates: (filters?: { projectId?: number; status?: string }) => {
		const params = new URLSearchParams();
		if (filters?.projectId) params.append('projectId', String(filters.projectId));
		if (filters?.status) params.append('status', filters.status);
		return request<{ success: boolean; data: any[] }>(`/estimates?${params.toString()}`);
	},
	fetchEstimate: (id: number) => request<{ success: boolean; data: any }>(`/estimates/${id}`),
	createEstimate: (payload: {
		projectId?: number;
		patternType: string;
		title: string;
		description?: string;
	}) => post<{ success: boolean; data: { id: number } }>('/estimates', payload),
	updateEstimate: (
		id: number,
		payload: { title?: string; description?: string; status?: string }
	) => put<{ success: boolean }>(`/estimates/${id}`, payload),
	deleteEstimate: (id: number) =>
		request<{ success: boolean }>(`/estimates/${id}`, { method: 'DELETE' }),
	fetchEstimateConversations: (id: number) =>
		request<{ success: boolean; data: any[] }>(`/estimates/${id}/conversations`),
	sendEstimateChat: (id: number, message: string) =>
		post<{
			success: boolean;
			data: {
				message: string;
				preview: any[] | null;
				needsConfirmation: boolean;
				toolCalls: any[] | null;
			};
		}>(`/estimates/${id}/chat`, { message }),
	applyEstimateChanges: (id: number, changes: any[]) =>
		post<{ success: boolean; data: { results: any[]; phases: any[] } }>(
			`/estimates/${id}/apply-changes`,
			{ changes }
		),
	fetchEstimateParameters: (id: number) =>
		request<{ success: boolean; data: any }>(`/estimates/${id}/parameters`),
	saveEstimateParameters: (id: number, parameters: any) =>
		put<{ success: boolean }>(`/estimates/${id}/parameters`, parameters),
	fetchEstimatePhases: (id: number) =>
		request<{ success: boolean; data: any[] }>(`/estimates/${id}/phases`),
	saveEstimatePhase: (id: number, phase: any) =>
		post<{ success: boolean; data: any }>(`/estimates/${id}/phases`, phase),
	deleteEstimatePhase: (estimateId: number, phaseId: number) =>
		request<{ success: boolean }>(`/estimates/${estimateId}/phases/${phaseId}`, {
			method: 'DELETE'
		}),
	fetchEstimateResults: (id: number) =>
		request<{ success: boolean; data: any[] }>(`/estimates/${id}/results`),
	calculateEstimateResult: (id: number) =>
		post<{ success: boolean; data: any[] }>(`/estimates/${id}/calculate`, {}),

	// WBS AIチャット
	wbsChat: (payload: {
		message: string;
		history: Array<{ role: 'user' | 'assistant'; content: string }>;
		currentTasks: any[];
		projectContext: {
			id: number;
			name: string;
			goal?: string;
		};
		users: Array<{ id: number; username: string; fullName: string }>;
	}) =>
		post<{
			success: boolean;
			data: {
				message: string;
				toolCalls: any[] | null;
				preview: any[] | null;
				needsConfirmation: boolean;
			};
		}>('/wbs-ai-chat/chat', payload),

	// レポートアシスタント
	reportAssistantGetInitial: () =>
		request<{ success: boolean; data: any }>('/report-assistant/initial'),
	reportAssistantChat: (payload: {
		message: string;
		chatHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp?: Date }>;
		context?: {
			reportType?: string;
			projectId?: number;
			userId?: number;
			dateRange?: { start: string; end: string };
		};
	}) =>
		request<{
			success: boolean;
			data: {
				message: string;
				suggestions?: string[];
				reportPreview?: any;
				insights?: any[];
				requiresConfirmation: boolean;
				nextAction?: string;
				metadata?: any;
			};
		}>('/report-assistant/chat', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
	reportAssistantGetProjects: () =>
		request<{ success: boolean; data: any[] }>('/report-assistant/projects'),
	reportAssistantGetNextStep: (reportType: string) =>
		request<{ success: boolean; data: any }>('/report-assistant/next-step', {
			method: 'POST',
			body: JSON.stringify({ reportType })
		}),
	reportAssistantGenerate: (config: {
		reportType: string;
		projectId?: number;
		userId?: number;
		dateRange?: { start: string; end: string };
		audience?: string;
		purpose?: string;
	}) =>
		request<{
			success: boolean;
			report?: {
				title: string;
				summary: string;
				sections: any[];
				insights: string[];
				metadata: any;
			};
			error?: string;
		}>('/report-assistant/generate', {
			method: 'POST',
			body: JSON.stringify(config)
		}),
	reportAssistantExtractInsights: (projectId: number) =>
		request<{
			success: boolean;
			insights?: {
				trends: any[];
				anomalies: any[];
				patterns: any[];
				predictions: any[];
				aiInsights: any[];
			};
			error?: string;
		}>(`/report-assistant/insights/${projectId}`),

	// 1時間ごとのアクティビティデータAPI
	fetchHourlyActivitySummaries: (
		userId: number,
		options?: { startDate?: string; endDate?: string; limit?: number }
	) => {
		let query = '';
		if (options?.startDate) query += `startDate=${options.startDate}`;
		if (options?.endDate) query += (query ? '&' : '') + `endDate=${options.endDate}`;
		if (options?.limit) query += (query ? '&' : '') + `limit=${options.limit}`;
		return request<{ success: boolean; data: any[] }>(
			`/hourly-activity/user/${userId}${query ? '?' + query : ''}`
		);
	},
	fetchHourlyActivitySummary: (summaryId: number) =>
		request<{ success: boolean; data: any }>(`/hourly-activity/${summaryId}`),

	// 新しい作業セッションAPI（プライバシー配慮）
	fetchWorkSessions: (
		userId: number,
		options?: {
			startDate?: string;
			endDate?: string;
			projectId?: number;
			taskId?: number;
			limit?: number;
		}
	) => {
		let query = '';
		if (options?.startDate) query += `startDate=${options.startDate}`;
		if (options?.endDate) query += (query ? '&' : '') + `endDate=${options.endDate}`;
		if (options?.projectId) query += (query ? '&' : '') + `projectId=${options.projectId}`;
		if (options?.taskId) query += (query ? '&' : '') + `taskId=${options.taskId}`;
		if (options?.limit) query += (query ? '&' : '') + `limit=${options.limit}`;
		return request<{ success: boolean; data: any[] }>(
			`/work-session/user/${userId}${query ? '?' + query : ''}`
		);
	},
	fetchProjectWorkSummary: (
		projectId: number,
		options?: { startDate?: string; endDate?: string }
	) => {
		let query = '';
		if (options?.startDate) query += `startDate=${options.startDate}`;
		if (options?.endDate) query += (query ? '&' : '') + `endDate=${options.endDate}`;
		return request<{ success: boolean; data: any[] }>(
			`/work-session/project/${projectId}/summary${query ? '?' + query : ''}`
		);
	}
};
