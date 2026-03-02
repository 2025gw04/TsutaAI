<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { apiClient } from '$lib/api/client';
	import { authStore } from '$lib/stores/auth';
	import WbsToolbar from '$lib/components/wbs/WbsToolbar.svelte';
	import WbsTree from '$lib/components/wbs/WbsTree.svelte';
	import GanttView from '$lib/components/wbs/GanttView.svelte';
	import BoardView from '$lib/components/wbs/BoardView.svelte';
	import CalendarView from '$lib/components/wbs/CalendarView.svelte';
	import TaskDetailPanel from '$lib/components/wbs/TaskDetailPanel.svelte';
	import FilterPanel from '$lib/components/wbs/FilterPanel.svelte';
	import TemplateManager from '$lib/components/wbs/TemplateManager.svelte';
	import RuleManager from '$lib/components/wbs/RuleManager.svelte';
	import CustomFieldManager from '$lib/components/wbs/CustomFieldManager.svelte';
	import GenerationModal from '$lib/components/wbs/GenerationModal.svelte';
	import TaskImportModal from '$lib/components/wbs/TaskImportModal.svelte';
	import TaskExportModal from '$lib/components/wbs/TaskExportModal.svelte';
	import DataOperationsModal from '$lib/components/wbs/DataOperationsModal.svelte';
	import SanityCheckResults from '$lib/components/wbs/SanityCheckResults.svelte';
	import TaskDecomposeModal from '$lib/components/wbs/TaskDecomposeModal.svelte';
	import TaskRefineModal from '$lib/components/wbs/TaskRefineModal.svelte';
	import ProjectEditModal from '$lib/components/wbs/ProjectEditModal.svelte';
	import RescheduleDetector from '$lib/components/wbs/RescheduleDetector.svelte';
	import WbsAiAssistantPanel from '$lib/components/wbs/WbsAiAssistantPanel.svelte';
	import RescheduleProposalModal from '$lib/components/wbs/RescheduleProposalModal.svelte';
	import AutoAssignModal from '$lib/components/wbs/AutoAssignModal.svelte';
	import AutoDurationModal from '$lib/components/wbs/AutoDurationModal.svelte';
	import HistoryPanel from '$lib/components/wbs/HistoryPanel.svelte';
	import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';
	import {
		undoableWbsStore,
		setWbs,
		addChildTask,
		appendSubtasks,
		replaceSubtasks,
		createBlankTask,
		findTask,
		updateTask,
		removeTask,
		moveTask,
		duplicateTask,
		archiveTask,
		unarchiveTask,
		undo,
		redo,
		canUndo,
		canRedo,
		isDirty,
		currentTasks,
		clearHistory,
		historyMetrics,
		jumpToHistory,
		historyData
	} from '$lib/stores/undoableWbsStore';
	import { loadCustomFields, loadTaskCustomFields } from '$lib/stores/customFieldStore';
	import {
		rescheduleStore,
		pendingTriggersCount,
		type RescheduleProposal,
		type RescheduleSummary
	} from '$lib/stores/rescheduleStore';
	import { setTaskIdMappings } from '$lib/stores/taskIdMappingStore';
	import type { WbsTask } from '$lib/components/wbs/types';

	/** 現在選択されているビュー */
	let currentView: 'tree' | 'gantt' | 'board' | 'calendar' = 'tree';

	/** プロジェクト情報 */
	let projectPayload = {
		project_name: '',
		project_goal: '',
		duration: '',
		start_date: '',
		end_date: '',
		team_structure: 'PM1名 / 開発3名 / QA1名',
		constraints: '',
		main_deliverable: '',
		milestone: ''
	};

	/** WBSタスク一覧 */
	let tasks: WbsTask[] = get(currentTasks);

	/** メンバー情報（担当者割り当て用） */
	let users: Array<{
		id: number;
		username: string;
		fullName: string;
		role: string;
		skills?: Array<{ skillName: string; skillLevel: number }>;
	}> = [];

	/** 選択中のタスクID */
	let selectedTaskId: string | null = null;

	/** 選択中のタスク */
	let selectedTask: WbsTask | null = null;

	/** コラボレーション機能のデータ */
	let comments: Array<any> = [];
	let attachments: Array<any> = [];
	let activities: Array<any> = [];
	let currentUserId: number | null = null;

	/** 現在のユーザーのフルネームを取得 */
	$: currentUserFullName = currentUserId
		? users.find((u) => u.id === currentUserId)?.fullName || null
		: null;

	/** AI生成モーダル表示フラグ */
	let showGenerationModal = false;

	/** データ操作モーダル表示フラグ */
	let showDataOperationsModal = false;

	/** タスクインポートモーダル表示フラグ */
	let showTaskImportModal = false;

	/** タスクエクスポートモーダル表示フラグ */
	let showTaskExportModal = false;

	/** WBS生成中フラグ */
	let isGenerating = false;

	/** タスク説明生成中フラグ */
	let isGeneratingDescription = false;

	/** 健全性チェックの進行状態 */
	let isCheckingSanity = false;

	/** 健全性チェック結果 */
	let sanitySuggestions: Array<{
		taskId: string;
		severity: 'info' | 'warning' | 'critical';
		message: string;
	}> = [];
	let showSanityResults = false;

	/** サブタスク分解モーダル */
	let showDecomposeModal = false;
	let decomposeTarget: WbsTask | null = null;
	let isDecomposing = false;

	/** タスク改善モーダル */
	let showRefineModal = false;
	let refineTarget: WbsTask | null = null;
	let isRefining = false;

	/** WBS保存中フラグ */
	let isSaving = false;

	/** プロジェクト編集モーダル表示フラグ */
	let showProjectEditModal = false;

	/** プロジェクト情報 */
	let projectData: any = null;

	/** リスケジュール機能 */
	let showRescheduleModal = false;
	let rescheduleProposals: RescheduleProposal[] = [];
	let rescheduleSummary: RescheduleSummary | null = null;
	let currentTriggerType: string = '';
	let currentTriggerDetails: any = {};
	let isRescheduling = false;

	/** AI自動割り当て機能 */
	let showAutoAssignModal = false;
	let isAutoAssigning = false;
	let autoAssignments: Array<{
		taskId: string;
		taskName: string;
		assignedTo: string;
		reason: string;
		confidence: number;
	}> = [];

	/** AI自動期間設定機能 */
	let showAutoDurationModal = false;
	let isAutoCalculatingDuration = false;
	let autoDurations: Array<{
		taskId: string;
		taskName: string;
		startDate: string;
		endDate: string;
		effortDays: number;
		reasoning: string;
	}> = [];
	let autoDurationProjectEndDate: string | null = null;
	let autoDurationCriticalPath: string[] = [];

	/** 履歴パネル表示フラグ */
	let showHistoryPanel = false;

	/** 検索、ソート、フィルタ機能 */
	let searchQuery = '';
	let sortBy: 'none' | 'endDate' | 'priority' | 'assignee' | 'progress' = 'none';
	let sortOrder: 'asc' | 'desc' = 'asc';
	let showFilters = false;
	let showArchived = false;
	let activeFilters: any = {
		assignees: [],
		statuses: [],
		priorities: [],
		tags: [],
		dateFrom: '',
		dateTo: ''
	};

	/** アクティブなフィルタ数を計算 */
	$: activeFilterCount =
		activeFilters.assignees.length +
		activeFilters.statuses.length +
		activeFilters.priorities.length +
		activeFilters.tags.length +
		(activeFilters.dateFrom ? 1 : 0) +
		(activeFilters.dateTo ? 1 : 0);

	/** 総合的なローディング状態とメッセージ */
	$: isLoading =
		isGenerating ||
		isGeneratingDescription ||
		isCheckingSanity ||
		isSaving ||
		isDecomposing ||
		isRefining ||
		isAutoAssigning ||
		isAutoCalculatingDuration ||
		isRescheduling;
	$: loadingMessage = isGenerating
		? 'AIでWBSを生成中...'
		: isGeneratingDescription
			? 'タスク説明を生成中...'
			: isCheckingSanity
				? 'WBSの健全性をチェック中...'
				: isSaving
					? 'WBSを保存中...'
					: isDecomposing
						? 'タスクを分解中...'
						: isRefining
							? 'タスクを改善中...'
							: isAutoAssigning
								? '担当者を自動割り当て中...'
								: isAutoCalculatingDuration
									? '期間を自動計算中...'
									: isRescheduling
										? 'リスケジュール提案を生成中...'
										: 'AI処理中...';

	let unsubscribe: () => void;

	$: projectId = Number($page.params.id);

	/** クエリパラメータからタスクIDを取得（?task=... / ?taskId=... 両対応） */
	$: deepLinkTaskId =
		$page.url.searchParams.get('taskId')?.trim() || $page.url.searchParams.get('task')?.trim() || '';
	let lastHandledDeepLinkTaskId = '';

	// プロジェクトIDが変更された場合も履歴をクリア
	$: if (projectId) {
		clearHistory();
	}

	/**
	 * クエリパラメータで指定されたタスクを選択する
	 */
	$: if (
		deepLinkTaskId &&
		tasks.length > 0 &&
		deepLinkTaskId !== lastHandledDeepLinkTaskId
	) {
		let normalizedTaskId = deepLinkTaskId;
		try {
			normalizedTaskId = decodeURIComponent(deepLinkTaskId);
		} catch {
			normalizedTaskId = deepLinkTaskId;
		}
		const numericTaskId = Number(normalizedTaskId);
		const targetTask =
			findTask(tasks, normalizedTaskId) ||
			(Number.isFinite(numericTaskId) ? findTask(tasks, String(numericTaskId)) : null);
		if (targetTask) {
			lastHandledDeepLinkTaskId = deepLinkTaskId;
			void handleSelectTask(targetTask);
		}
	} else if (!deepLinkTaskId) {
		lastHandledDeepLinkTaskId = '';
	}

	onMount(async () => {
		await loadProject(projectId);
		await loadUsers();

		// データベースから保存済みのタスクを読み込む
		await loadTasksFromDatabase(projectId);

		// カスタムフィールドを読み込む
		loadCustomFields(projectId);
		loadTaskCustomFields(projectId);

		// 現在のユーザーIDを取得
		const currentUser = get(authStore);
		if (currentUser) {
			currentUserId = currentUser.id;
		}

		unsubscribe = currentTasks.subscribe((value) => {
			tasks = value;
			if (selectedTaskId) {
				selectedTask = findTask(value, selectedTaskId);
			}
		});

		// 履歴をクリア（新しいプロジェクトの履歴と混ざらないように）
		clearHistory();

		// 開発環境でのメモリ使用量監視
		if (import.meta.env.DEV) {
			historyMetrics.subscribe((metrics) => {
				console.log('[Undo/Redo] History Metrics:', {
					past: metrics.pastSize,
					future: metrics.futureSize,
					memory: `${(metrics.estimatedMemoryUsage / 1024).toFixed(2)} KB`
				});

				// 警告: メモリ使用量が1MBを超えた場合
				if (metrics.estimatedMemoryUsage > 1024 * 1024) {
					console.warn('[Undo/Redo] History memory usage exceeded 1MB');
				}
			});
		}
	});

	onDestroy(() => {
		if (unsubscribe) {
			unsubscribe();
		}
	});

	/** Undo/Redo操作の競合状態を防ぐフラグ */
	let isUndoRedoInProgress = false;

	/**
	 * 元に戻す
	 */
	function handleUndo() {
		if (isUndoRedoInProgress) {
			console.warn('Undo/Redo operation already in progress');
			return;
		}

		isUndoRedoInProgress = true;

		try {
			const success = undo();

			if (success) {
				// 選択中のタスクが存在しなくなった場合はクリア
				if (selectedTaskId && !findTask(tasks, selectedTaskId)) {
					selectedTaskId = null;
					selectedTask = null;
				}
			}
		} finally {
			// 次のフレームで解除（UI更新を待つ）
			requestAnimationFrame(() => {
				isUndoRedoInProgress = false;
			});
		}
	}

	/**
	 * やり直し
	 */
	function handleRedo() {
		if (isUndoRedoInProgress) {
			console.warn('Undo/Redo operation already in progress');
			return;
		}

		isUndoRedoInProgress = true;

		try {
			const success = redo();

			if (success) {
				// 選択中のタスクが存在しなくなった場合はクリア
				if (selectedTaskId && !findTask(tasks, selectedTaskId)) {
					selectedTaskId = null;
					selectedTask = null;
				}
			}
		} finally {
			requestAnimationFrame(() => {
				isUndoRedoInProgress = false;
			});
		}
	}

	/**
	 * 履歴パネルを表示
	 */
	function handleShowHistory() {
		showHistoryPanel = true;
	}

	/**
	 * 履歴パネルを閉じる
	 */
	function handleCloseHistory() {
		showHistoryPanel = false;
	}

	/**
	 * 特定の履歴ポイントへジャンプ
	 */
	function handleHistoryJump(event: CustomEvent<{ index: number }>) {
		if (isUndoRedoInProgress) {
			console.warn('Undo/Redo operation already in progress');
			return;
		}

		isUndoRedoInProgress = true;

		try {
			const { index } = event.detail;
			const success = jumpToHistory(index);

			if (success) {
				// 選択中のタスクが存在しなくなった場合はクリア
				if (selectedTaskId && !findTask(tasks, selectedTaskId)) {
					selectedTaskId = null;
					selectedTask = null;
				}

				// 履歴パネルを閉じる
				showHistoryPanel = false;
			}
		} finally {
			requestAnimationFrame(() => {
				isUndoRedoInProgress = false;
			});
		}
	}

	/**
	 * 営業日ベースで日付を追加（土日を除外）
	 * @param startDate 開始日 (YYYY-MM-DD形式)
	 * @param businessDays 追加する営業日数
	 * @returns 終了日 (YYYY-MM-DD形式)
	 */
	function addBusinessDays(startDate: string, businessDays: number): string {
		const date = new Date(startDate);
		let count = 0;

		while (count < businessDays) {
			date.setDate(date.getDate() + 1);
			const dayOfWeek = date.getDay();
			const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
			if (!isWeekend) {
				count++;
			}
		}

		return date.toISOString().split('T')[0];
	}

	/**
	 * タスクに期間がない場合、effort_daysから計算して設定する
	 * @param tasksToProcess 処理対象のタスク一覧
	 * @param projectStartDate プロジェクト開始日
	 * @param parentStartDate 親タスクの開始日（デフォルト: プロジェクト開始日）
	 */
	function assignDatesFromEffortDays(
		tasksToProcess: WbsTask[],
		projectStartDate: string,
		parentStartDate: string = projectStartDate
	): WbsTask[] {
		let currentDate = parentStartDate;

		return tasksToProcess.map((task) => {
			const effortDays = task.effortDays || 1;

			// 期間が設定されていない場合のみ計算
			if (!task.startDate || !task.endDate) {
				const calculatedStartDate = currentDate;
				const calculatedEndDate = addBusinessDays(calculatedStartDate, effortDays - 1);

				// 子タスクがある場合、子タスクにも期間を割り当てる
				const processedChildren =
					task.children && task.children.length > 0
						? assignDatesFromEffortDays(task.children, projectStartDate, calculatedStartDate)
						: task.children || [];

				// 子タスクがある場合、親タスクの終了日は最後の子タスク終了日とする
				const finalEndDate =
					processedChildren.length > 0
						? processedChildren.reduce((maxDate, child) => {
								const childEndDate = child.endDate || calculatedEndDate;
								return childEndDate > maxDate ? childEndDate : maxDate;
							}, calculatedEndDate)
						: calculatedEndDate;

				currentDate = addBusinessDays(finalEndDate, 1); // 次のタスクは終了日の翌営業日から開始

				return {
					...task,
					startDate: calculatedStartDate,
					endDate: finalEndDate,
					children: processedChildren
				};
			}

			// 既に期間が設定されている場合はそれを使用
			currentDate = addBusinessDays(task.endDate, 1);
			return task;
		});
	}

	/** プロジェクト情報を取得する */
	async function loadProject(projectId: number) {
		try {
			const [projectRes, membersRes] = await Promise.all([
				apiClient.fetchProject(projectId),
				apiClient.fetchProjectMembers(projectId)
			]);

			console.log('[loadProject] Project:', projectRes.data);
			console.log('[loadProject] Members:', membersRes.data);

			const data = projectRes.data;
			// APIレスポンスのフィールド名は name, startDate, endDate (camelCase) です。
			// これを内部のデータ形式に正規化します。
			projectData = {
				...data,
				project_name: data.name,
				start_date: data.startDate,
				end_date: data.endDate,
				member_ids: membersRes.data?.map((m: any) => m.userId) || []
			};
			console.log('[loadProject] projectData constructed:', projectData);
			projectPayload.project_name = data.name ?? '';
			projectPayload.project_goal = data.description ?? '';
			projectPayload.duration = `${data.startDate ?? '未定'} ~ ${data.endDate ?? '未定'}`;
			projectPayload.start_date = data.startDate ?? '';
			projectPayload.end_date = data.endDate ?? '';
			projectPayload.team_structure = data.team_structure ?? 'PM1名 / 開発3名 / QA1名';
			projectPayload.main_deliverable = data.mainDeliverable ?? '';
			projectPayload.milestone = data.milestone ?? '';
		} catch (error) {
			console.error('プロジェクト情報の取得に失敗しました', error);
		}
	}

	/** データベースから保存済みのタスクを読み込む */
	async function loadTasksFromDatabase(projectId: number) {
		try {
			const response = await apiClient.fetchTasks(projectId);
			if (!response.data || response.data.length === 0) {
				// タスクがない場合は、空のWBSで初期化
				setWbs([]);
				return;
			}

			// フラットなタスク配列をツリー構造に復元
			const flatTasks = response.data as any[];
			console.log('[デバッグ] API生レスポンス（先頭3件）:', flatTasks.slice(0, 3));

			// IDマッピングを作成
			const idMapping = new Map<string, number>();
			flatTasks.forEach((task) => {
				// データベースIDをフロントエンドIDとしてマッピング
				idMapping.set(String(task.id), task.id);
			});
			setTaskIdMappings(idMapping);
			console.log(`[INFO] ${idMapping.size}個のタスクIDマッピングを読み込みました`);

			const tasksWithCamelCase = flatTasks.map((task) => normalizeTaskFromApi(task));
			console.log('[デバッグ] 正規化後のタスク（先頭3件）:', tasksWithCamelCase.slice(0, 3));

			const treeStructure = buildTaskHierarchy(tasksWithCamelCase);
			console.log(
				'[デバッグ] ツリー構造（ルートタスク）:',
				treeStructure.map((t) => ({
					id: t.id,
					name: t.name,
					childrenCount: t.children.length
				}))
			);

			// ストアに設定
			setWbs(treeStructure);
		} catch (error) {
			console.error('タスクの読み込みに失敗しました。デフォルトWBSを使用します。', error);
			// エラー時はサンプルデータのままにする
		}
	}

	/** APIから返されたタスクをフロントエンド形式に正規化 */
	function normalizeTaskFromApi(apiTask: any): WbsTask {
		// assignedTo / assigneeUserId からユーザー名を検索
		let assigneeName = '';
		const assigneeUserId = Number(
			apiTask.assignedTo ?? apiTask.assigneeUserId ?? apiTask.assignee_user_id
		);
		if (Number.isFinite(assigneeUserId) && assigneeUserId > 0) {
			const assignedUser = users.find((u) => u.id === assigneeUserId);
			assigneeName = assignedUser ? assignedUser.fullName || assignedUser.username : '';
		}

		// estimatedMinutes / estimatedHours の揺れを吸収
		const estimatedMinutes = Number(apiTask.estimatedMinutes ?? apiTask.estimated_minutes);
		const estimatedHours = Number(apiTask.estimatedHours ?? apiTask.estimated_hours);
		const effortDays = Number.isFinite(estimatedMinutes)
			? estimatedMinutes / (8 * 60)
			: Number.isFinite(estimatedHours)
				? estimatedHours / 8
				: 1;

		// dependencies のデータ形式揺れを吸収
		let dependencies: string[] = [];
		if (Array.isArray(apiTask.dependencies)) {
			dependencies = apiTask.dependencies.map((dep: any) => String(dep).trim()).filter(Boolean);
		} else if (typeof apiTask.dependencies === 'string') {
			try {
				const parsed = JSON.parse(apiTask.dependencies);
				dependencies = Array.isArray(parsed)
					? parsed.map((dep: any) => String(dep).trim()).filter(Boolean)
					: [];
			} catch {
				dependencies = apiTask.dependencies
					.split(',')
					.map((dep: string) => dep.trim())
					.filter(Boolean);
			}
		}

		const normalizedStatus = String(apiTask.status || 'todo').toLowerCase();
		const normalizedPriority = String(apiTask.priority || 'medium').toLowerCase();

		return {
			id: String(apiTask.id),
			name: apiTask.name || apiTask.title || 'Untitled',
			description: apiTask.description || '',
			assignee: assigneeName,
			effortDays,
			startDate: apiTask.startDate ?? apiTask.start_date,
			endDate: apiTask.endDate ?? apiTask.end_date,
			actualStartDate: apiTask.actualStartDate ?? apiTask.actual_start_date,
			actualEndDate: apiTask.actualEndDate ?? apiTask.actual_end_date,
			priority:
				normalizedPriority === 'high' || normalizedPriority === 'low' || normalizedPriority === 'none'
					? normalizedPriority
					: 'medium',
			status:
				normalizedStatus === 'in_progress' || normalizedStatus === 'in-progress'
					? 'in-progress'
					: normalizedStatus === 'planning'
						? 'planning'
						: normalizedStatus === 'in_review' || normalizedStatus === 'in-review'
							? 'in-review'
							: normalizedStatus === 'blocked'
								? 'blocked'
								: normalizedStatus === 'completed'
									? 'completed'
									: 'not-started',
			progress: apiTask.progress || 0,
			dependencies,
			deliverable: apiTask.deliverable || '',
			parentTaskId: apiTask.parentTaskId
				? String(apiTask.parentTaskId)
				: apiTask.parent_task_id
					? String(apiTask.parent_task_id)
					: undefined,
			archived: Boolean(apiTask.archived),
			children: []
		};
	}

	/** フラットなタスク配列をツリー構造に復元 */
	function buildTaskHierarchy(flatTasks: WbsTask[]): WbsTask[] {
		const taskMap = new Map<string, WbsTask>();

		// すべてのタスクをマップに追加
		flatTasks.forEach((task) => {
			taskMap.set(task.id, { ...task, children: [] });
		});

		const rootTasks: WbsTask[] = [];

		// 親子関係を構築
		taskMap.forEach((task) => {
			if (task.parentTaskId && taskMap.has(task.parentTaskId)) {
				const parent = taskMap.get(task.parentTaskId)!;
				parent.children.push(task);
			} else {
				rootTasks.push(task);
			}
		});

		return rootTasks;
	}
	/** メンバー情報を取得する */
	async function loadUsers() {
		try {
			const response = await apiClient.fetchUsers();
			const allUsers =
				response.data?.map((member) => ({
					id: member.id,
					username: member.username,
					fullName: member.fullName,
					role: member.role,
					skills: member.skills || []
				})) ?? [];

			// WBS生成と担当者選択は、プロジェクト参加メンバーに限定する
			const memberIds = new Set(
				(projectData?.member_ids || [])
					.map((id: unknown) => Number(id))
					.filter((id: number) => Number.isFinite(id))
			);
			users = memberIds.size > 0 ? allUsers.filter((member) => memberIds.has(member.id)) : allUsers;
		} catch (error) {
			console.warn('メンバー一覧の取得に失敗しました', error);
			users = [];
		}
	}

	/** WBS生成モーダルを表示する */
	function openGenerationModal() {
		showGenerationModal = true;
	}

	/** データ操作モーダルを表示する */
	function openDataOperationsModal() {
		showDataOperationsModal = true;
	}

	/** タスクインポートモーダルを表示する */
	function openTaskImportModal() {
		showDataOperationsModal = false;
		showTaskImportModal = true;
	}

	/** タスクエクスポートモーダルを表示する */
	function openTaskExportModal() {
		showDataOperationsModal = false;
		showTaskExportModal = true;
	}

	/** AIによるWBS生成を実行する */
	async function handleGenerate(event: CustomEvent<typeof projectPayload>) {
		showGenerationModal = false;
		isGenerating = true;
		try {
			const response = await apiClient.generateWbs(event.detail);
			if (!response.data?.wbs) {
				throw new Error('AIからWBSデータが取得できませんでした');
			}
			const normalized = response.data.wbs.map((task, index) =>
				normalizeAiTask(task, undefined, index)
			);
			setWbs(normalized);
			selectedTaskId = null;
			selectedTask = null;
		} catch (error) {
			alert(`WBS生成に失敗しました: ${(error as Error).message}`);
		} finally {
			isGenerating = false;
		}
	}

	/** タスクインポート完了時の処理 */
	async function handleTaskImportComplete(event: CustomEvent<{ updated: number; added: number }>) {
		const { updated, added } = event.detail;
		alert(`インポートが完了しました。\n更新: ${updated}件\n追加: ${added}件`);
		// WBSを再読み込み
		await loadTasksFromDatabase(projectId);
		// DataOperationsModalも閉じる
		showDataOperationsModal = false;
	}

	/** ルートタスクを追加する */
	function handleAddRoot() {
		const newTask = createBlankTask('ルートタスク');
		addChildTask(null, newTask);
	}

	/** タスク選択時の処理 */
	async function handleSelectTask(task: WbsTask) {
		selectedTaskId = task.id;
		selectedTask = task;

		// コラボレーションデータを読み込む
		await loadCollaborationData(task);
	}

	/** コラボレーションデータ（コメント、添付、アクティビティ）を読み込む */
	async function loadCollaborationData(task: WbsTask) {
		try {
			// タスクIDが数値でない場合は読み込まない（新規タスクなど）
			const taskIdNum = parseInt(task.id);
			if (isNaN(taskIdNum)) {
				comments = [];
				attachments = [];
				activities = [];
				return;
			}

			// 並行してデータ取得
			const [commentsRes, attachmentsRes, activitiesRes] = await Promise.all([
				apiClient.fetchTaskComments(taskIdNum).catch(() => ({ data: [] })),
				apiClient.fetchTaskAttachments(taskIdNum).catch(() => ({ data: [] })),
				apiClient.fetchTaskActivity(taskIdNum).catch(() => ({ data: [] }))
			]);

			comments = commentsRes.data || [];
			attachments = attachmentsRes.data || [];
			activities = activitiesRes.data || [];
		} catch (error) {
			console.error('コラボレーションデータの読み込みに失敗しました:', error);
			comments = [];
			attachments = [];
			activities = [];
		}
	}

	/** コメントを追加 */
	async function handleAddComment(event: CustomEvent<{ taskId: string; content: string }>) {
		const { taskId, content } = event.detail;
		const taskIdNum = parseInt(taskId);

		if (isNaN(taskIdNum)) {
			alert('タスクを保存してからコメントを追加してください。');
			return;
		}

		if (!currentUserId) {
			alert('ユーザー情報を取得できませんでした。ページを再読み込みしてください。');
			return;
		}

		try {
			const response = await apiClient.addTaskComment(taskIdNum, {
				content,
				userId: currentUserId
			});

			// コメント一覧を再取得
			if (selectedTask) {
				await loadCollaborationData(selectedTask);
			}
		} catch (error) {
			console.error('コメントの追加に失敗しました:', error);
			alert('コメントの追加に失敗しました。');
		}
	}

	/** コメントを削除 */
	async function handleDeleteComment(event: CustomEvent<{ commentId: number }>) {
		const { commentId } = event.detail;

		try {
			await apiClient.deleteTaskComment(commentId);

			// コメント一覧を再取得
			if (selectedTask) {
				await loadCollaborationData(selectedTask);
			}
		} catch (error) {
			console.error('コメントの削除に失敗しました:', error);
			alert('コメントの削除に失敗しました。');
		}
	}

	/** ファイルアップロード完了時の処理 */
	async function handleUploadComplete() {
		// 添付ファイル一覧を再取得
		if (selectedTask) {
			await loadCollaborationData(selectedTask);
		}
	}

	/** ファイルをダウンロード */
	async function handleDownloadFile(
		event: CustomEvent<{ attachmentId: number; fileName: string }>
	) {
		const { attachmentId, fileName } = event.detail;

		try {
			// JWTトークンを取得
			const authJson = window.localStorage.getItem('tsutaai.auth');
			const token = authJson ? JSON.parse(authJson).token : null;

			// ファイルダウンロード用のURLを生成
			const baseUrl = apiClient.getBaseUrl();
			const downloadUrl = `${baseUrl}/tasks/attachments/${attachmentId}/download`;

			// fetch APIを使ってダウンロード（認証トークン付き）
			const response = await fetch(downloadUrl, {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (!response.ok) {
				throw new Error('ダウンロードに失敗しました');
			}

			// Blobを作成してダウンロード
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = fileName;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);
		} catch (error) {
			console.error('ファイルのダウンロードに失敗しました:', error);
			alert('ファイルのダウンロードに失敗しました。');
		}
	}

	/** AI健全性チェックを実行する */
	async function handleSanityCheck() {
		try {
			isCheckingSanity = true;
			const payload = {
				wbs_json: JSON.stringify(tasks),
				project_goal: projectPayload.project_goal,
				team_structure: projectPayload.team_structure
			};
			const response = await apiClient.sanityCheckWbs(payload);
			const raw = response.data.suggestions ?? [];
			sanitySuggestions = raw.map((item: any) => ({
				taskId: item.taskId ?? '',
				message: item.message ?? '',
				severity: mapSeverity(item.severity)
			}));
			showSanityResults = true;
		} catch (error) {
			alert('AI健全性チェックに失敗しました。');
		} finally {
			isCheckingSanity = false;
		}
	}

	/** 工数を再計算する */
	async function handleRecalculateEffort() {
		if (
			!confirm(
				'プロジェクトの全タスクの工数を再計算しますか？\n開始日と終了日から営業日ベースで工数を自動計算します。'
			)
		) {
			return;
		}

		try {
			isSaving = true;
			const response = await apiClient.recalculateProjectEffort(projectId);

			if (response.success) {
				const { updatedCount, totalTasks } = response.data;
				alert(`工数の再計算が完了しました。\n対象タスク: ${totalTasks}件\n更新: ${updatedCount}件`);

				// WBSを再読み込み
				await loadTasksFromDatabase(projectId);
			} else {
				alert('工数の再計算に失敗しました。');
			}
		} catch (error) {
			console.error('工数再計算エラー:', error);
			alert(`工数の再計算に失敗しました: ${(error as Error).message}`);
		} finally {
			isSaving = false;
		}
	}

	/** サブタスク分解モーダルを開く */
	function openDecomposeModal(task: WbsTask) {
		decomposeTarget = task;
		showDecomposeModal = true;
	}

	/** タスク改善モーダルを開く */
	function openRefineModal(task: WbsTask) {
		refineTarget = task;
		showRefineModal = true;
	}

	/** AIサブタスク生成を実行する */
	async function handleDecomposeConfirm(event: CustomEvent<{ instruction: string }>) {
		if (!decomposeTarget) return;

		// 親タスクに説明がない場合、自動生成を提案
		if (!decomposeTarget.description) {
			const shouldGenerate = confirm(
				'親タスクに説明がありません。先に説明を生成しますか？\n' +
					'（説明があるとサブタスクの品質が向上します）'
			);

			if (shouldGenerate) {
				// AI説明生成を実行
				await handleGenerateDescription({ detail: decomposeTarget.id } as CustomEvent<string>);
				// 説明生成後、最新のタスク情報を取得
				const updatedTask = findTask(tasks, decomposeTarget.id);
				if (updatedTask) {
					decomposeTarget = updatedTask;
				}
			}
		}

		try {
			isDecomposing = true;

			// 既存の子タスク情報を取得（AIが参考にするため）
			const existingSubtasks = decomposeTarget.children || [];
			const existingSubtasksText =
				existingSubtasks.length > 0
					? `【既存のサブタスク】\n以下は現在このタスクに設定されているサブタスクです。これらを参考にして、改善版を生成してください：\n${JSON.stringify(
							existingSubtasks.map((child) => ({
								name: child.name,
								description: child.description || '',
								assignee: child.assignee || '',
								effort_days: child.effortDays || 1,
								start_date: child.startDate || '',
								end_date: child.endDate || '',
								deliverable: child.deliverable || ''
							})),
							null,
							2
						)}`
					: '';

			// チームメンバー情報を作成
			const teamMembersText = users
				.map((u) => `${u.fullName || u.username} (${u.role || '役割未設定'})`)
				.join(', ');

			// 各メンバーの現在のタスク数を計算
			const memberWorkload = new Map<string, number>();
			const allTasks = getAllTasks(tasks);
			allTasks.forEach((task) => {
				if (task.assignee) {
					const count = memberWorkload.get(task.assignee) || 0;
					memberWorkload.set(task.assignee, count + 1);
				}
			});

			// チームの負荷状況をテキスト化
			const workloadText = users
				.map((u) => {
					const name = u.fullName || u.username;
					const taskCount = memberWorkload.get(name) || 0;
					return `- ${name}: ${taskCount}タスク`;
				})
				.join('\n');

			const payload = {
				task_name: decomposeTarget.name,
				task_description: decomposeTarget.description || '',
				parent_context: decomposeTarget.description || '',
				effort_days: decomposeTarget.effortDays || 1,
				start_date: decomposeTarget.startDate || '',
				end_date: decomposeTarget.endDate || '',
				deliverable: decomposeTarget.deliverable || '',
				project_name: projectPayload.project_name,
				project_summary: projectPayload.project_goal,
				team_members: teamMembersText,
				team_workload: workloadText,
				instruction: event.detail.instruction,
				existing_subtasks: existingSubtasksText
			};

			const response = await apiClient.decomposeTask(payload);
			const subtasks = (response.data?.subtasks ?? []).map((item: any, index: number) =>
				convertSubtask(item, decomposeTarget!, index)
			);

			// 既存の子タスクを削除してから新しいサブタスクを追加
			replaceSubtasks(decomposeTarget.id, subtasks);
		} catch (error) {
			alert('サブタスクの生成に失敗しました。');
		} finally {
			isDecomposing = false;
			showDecomposeModal = false;
			decomposeTarget = null;
		}
	}

	/** AIタスク改善を実行する */
	async function handleRefineConfirm(
		event: CustomEvent<{ desiredOutcome: string; qualityFocus: string; riskNotes: string }>
	) {
		if (!refineTarget) return;
		try {
			isRefining = true;
			const payload = {
				task_id: refineTarget.id,
				task_name: refineTarget.name,
				current_description: refineTarget.description ?? '',
				desired_outcome: event.detail.desiredOutcome,
				quality_focus: event.detail.qualityFocus,
				risk_notes: event.detail.riskNotes
			};
			const response = await apiClient.refineWbsTask(payload);
			const result = response.data?.task;
			if (result) {
				updateTask(refineTarget.id, (current) => ({
					...current,
					name: result.name ?? current.name,
					description: result.description ?? current.description,
					assignee: result.assignee ?? current.assignee,
					deliverable: result.deliverable ?? current.deliverable,
					effortDays: result.effort_days ?? current.effortDays,
					startDate: result.start_date ?? current.startDate,
					endDate: result.end_date ?? current.endDate,
					priority: result.priority ?? current.priority,
					notes: result.notes ?? current.notes
				}));
			}
		} catch (error) {
			alert('タスクのブラッシュアップに失敗しました。');
		} finally {
			isRefining = false;
			showRefineModal = false;
			refineTarget = null;
		}
	}

	/** AIタスク説明を生成する */
	async function handleGenerateDescription(event: CustomEvent<string>) {
		const taskId = event.detail;
		const task = findTask(tasks, taskId);
		if (!task) return;

		isGeneratingDescription = true;
		try {
			const payload = {
				task_name: task.name,
				parent_task_name: '',
				parent_context: '',
				project_name: projectPayload.project_name,
				project_summary: projectPayload.project_goal,
				effort_days: task.effortDays || 1,
				deliverable: task.deliverable || ''
			};

			// 親タスクの情報を取得
			const parentTask = findParentTask(tasks, taskId);
			if (parentTask) {
				payload.parent_task_name = parentTask.name;
				payload.parent_context = parentTask.description || '';
			}

			const response = await apiClient.post('/tasks/ai/generate-description', payload);
			let description = response.data?.description;

			// AIがJSON形式で返してきた場合の処理
			if (description && typeof description === 'string') {
				// JSON形式かどうかをチェック（{"description":"..."} のような形式）
				const trimmed = description.trim();
				if (trimmed.startsWith('{') && trimmed.includes('"description"')) {
					try {
						const parsed = JSON.parse(trimmed);
						if (parsed.description) {
							description = parsed.description;
						}
					} catch (e) {
						// JSONパースに失敗した場合はそのまま使用
						console.warn(
							'JSON形式のレスポンスのパースに失敗しました。元のテキストを使用します。',
							e
						);
					}
				}
			}

			if (description) {
				updateTask(taskId, (current) => ({
					...current,
					description
				}));
			}
		} catch (error) {
			console.error('説明の生成に失敗しました:', error);
			alert('説明の生成に失敗しました。');
		} finally {
			isGeneratingDescription = false;
		}
	}

	/** 親タスクを検索する */
	function findParentTask(taskList: WbsTask[], childId: string): WbsTask | null {
		for (const task of taskList) {
			if (task.children.some((child) => child.id === childId)) {
				return task;
			}
			const found = findParentTask(task.children, childId);
			if (found) return found;
		}
		return null;
	}

	/** AI生成タスクを内部フォーマットへ変換する */
	function normalizeAiTask(task: any, parentId?: string, index = 0): WbsTask {
		// AIから返されたIDは使用せず、常に新しいIDを生成する（重複を防ぐため）
		const id = parentId ? `${parentId}.${index + 1}` : String(index + 1);

		return {
			id,
			name: task.name ?? '未命名タスク',
			description: task.description ?? '',
			assignee: task.assignee ?? undefined,
			deliverable: task.deliverable ?? '',
			effortDays: task.effort_days ?? undefined,
			progress: 0,
			startDate: task.start_date ?? undefined,
			endDate: task.end_date ?? undefined,
			actualStartDate: undefined,
			actualEndDate: undefined,
			status: 'not-started',
			priority: task.priority ?? 'medium',
			dependencies: (task.dependencies ?? []).map((dep: any) => String(dep).trim()),
			notes: task.notes ?? '',
			children: (task.children ?? []).map((child: any, childIndex: number) =>
				normalizeAiTask(child, id, childIndex)
			)
		};
	}

	/** サブタスクレスポンスをタスクへ変換する */
	function convertSubtask(item: any, parent: WbsTask, index: number): WbsTask {
		const childId = `${parent.id}.${parent.children.length + index + 1}`;
		return {
			id: childId,
			name: item.name ?? `サブタスク${index + 1}`,
			description: item.description ?? '',
			// AIが指定した担当者を優先（親タスクの担当者は使用しない）
			assignee: item.assignee ?? undefined,
			deliverable: item.deliverable ?? parent.deliverable,
			// AIが指定した工数を優先（親タスクの工数は使用しない）
			effortDays: item.effort_days ?? 1,
			// AIが指定した期限を優先（親タスクの期限は使用しない）
			startDate: item.start_date ?? undefined,
			endDate: item.end_date ?? undefined,
			actualStartDate: item.actual_start_date ?? undefined,
			actualEndDate: item.actual_end_date ?? undefined,
			// AIが指定した優先度を優先
			priority: item.priority ?? 'medium',
			progress: 0,
			dependencies: (item.dependencies ?? []).map((dep: any) => String(dep).trim()),
			children: [],
			status: 'not-started',
			notes: item.notes ?? ''
		};
	}

	/** 健全性チェックの重大度を変換する */
	function mapSeverity(severity: string): 'info' | 'warning' | 'critical' {
		const value = (severity ?? '').toLowerCase();
		if (value === 'high' || value === 'critical') return 'critical';
		if (value === 'medium' || value === 'warning') return 'warning';
		return 'info';
	}

	/** WBSをデータベースに保存する */
	async function handleSaveWbs(skipConfirmation = false) {
		const projectId = Number(get(page).params.id);
		if (!projectId || tasks.length === 0) {
			alert('保存するWBSがありません。');
			return;
		}

		// AIアシスタントからの自動保存の場合は確認ダイアログをスキップ
		if (!skipConfirmation) {
			const confirmed = confirm(
				'WBSをデータベースに保存して確定しますか？\n保存後はメンバーのダッシュボードに表示されます。'
			);
			if (!confirmed) return;
		}

		try {
			isSaving = true;

			// 既存のタスクを全て削除（重複を防ぐため）
			console.log('[INFO] 既存タスクを削除中...');
			const deleteResult = await apiClient.deleteAllTasks(projectId);
			console.log(`[INFO] ${deleteResult.deletedCount}個のタスクを削除しました`);

			// タスクに期間がない場合、effort_daysから自動計算（営業日ベース、土日除外）
			const projectStartDate =
				projectData?.start_date ||
				projectPayload.duration?.split('~')[0]?.trim() ||
				new Date().toISOString().split('T')[0];
			const tasksWithDates = assignDatesFromEffortDays(tasks, projectStartDate);

			// 全タスクをフラット化（親IDを保持）
			const tasksToSave = flattenTasksWithParent(tasksWithDates);

			// フロントエンドIDとデータベースIDのマッピング
			const idMap = new Map<string, number>();

			// 各タスクをAPIで保存
			for (const { task, parentTaskId } of tasksToSave) {
				const payload: any = {
					title: task.name,
					projectId,
					estimatedMinutes: (task.effortDays ?? 1) * 8 * 60,
					priority: normalizePriority(task.priority),
					startDate: task.startDate,
					endDate: task.endDate,
					actualStartDate: task.actualStartDate,
					actualEndDate: task.actualEndDate,
					status: normalizeStatus(task.status),
					deliverable: task.deliverable || '',
					progress: task.progress || 0
				};

				if (task.description) {
					payload.description = task.description;
				}

				// 親タスクIDをデータベースIDに解決
				if (parentTaskId !== null && idMap.has(parentTaskId)) {
					payload.parentTaskId = idMap.get(parentTaskId);
				}

				const assigneeId = resolveAssigneeUserId(task);
				if (assigneeId !== null) {
					payload.assigneeUserId = assigneeId;
				}

				const result = await apiClient.createTask(payload);
				// フロントエンドIDとデータベースIDをマッピング
				if (result.data?.id) {
					idMap.set(task.id, result.data.id);
				}
			}

			// IDマッピングをストアに保存
			setTaskIdMappings(idMap);
			console.log(`[INFO] ${idMap.size}個のタスクIDマッピングを保存しました`);

			// 保存完了したので履歴をクリア（isDirtyをfalseにする）
			clearHistory();

			// 自動保存の場合はアラートを表示しない
			if (!skipConfirmation) {
				alert('WBSをデータベースに保存しました！');
			}
		} catch (error) {
			console.error('WBSの保存に失敗しました:', error);
			alert(
				'WBSの保存に失敗しました。エラー: ' + (error instanceof Error ? error.message : '不明')
			);
		} finally {
			isSaving = false;
		}
	}

	function resolveAssigneeUserId(task: WbsTask): number | null {
		if (!task.assignee) {
			return null;
		}
		const target = task.assignee.trim().toLowerCase();
		const matched = users.find((user) => {
			return (
				(user.fullName ?? '').toLowerCase() === target ||
				(user.username ?? '').toLowerCase() === target
			);
		});
		return matched ? matched.id : null;
	}

	function normalizeStatus(status?: WbsTask['status']): string {
		switch (status) {
			case 'in-progress':
				return 'in_progress';
			case 'completed':
				return 'completed';
			default:
				return 'todo';
		}
	}

	/** Priority値を正規化（小文字に統一） */
	function normalizePriority(priority?: WbsTask['priority']): string {
		if (!priority) return 'medium';

		const normalized = priority.toLowerCase();
		const validPriorities = ['low', 'medium', 'high'];

		if (validPriorities.includes(normalized)) {
			return normalized;
		}

		console.warn(`Invalid priority value: ${priority}, defaulting to 'medium'`);
		return 'medium';
	}

	/** タスクツリーをフラット配列に変換する */
	function flattenTasks(taskList: WbsTask[]): WbsTask[] {
		const result: WbsTask[] = [];
		for (const task of taskList) {
			result.push(task);
			if (task.children && task.children.length > 0) {
				result.push(...flattenTasks(task.children));
			}
		}
		return result;
	}

	/** タスクツリーをフラット配列に変換（親IDを保持） */
	function flattenTasksWithParent(
		taskList: WbsTask[],
		parentId: string | null = null
	): Array<{ task: WbsTask; parentTaskId: string | null }> {
		const result: Array<{ task: WbsTask; parentTaskId: string | null }> = [];
		for (const task of taskList) {
			result.push({ task, parentTaskId: parentId });
			if (task.children && task.children.length > 0) {
				result.push(...flattenTasksWithParent(task.children, task.id));
			}
		}
		return result;
	}

	/** 検索・フィルタ・ソート済みのタスクを取得 */
	$: filteredTasks = (() => {
		let result = [...tasks];

		// アーカイブフィルタ（showArchivedがfalseの場合、アーカイブされたタスクを除外）
		if (!showArchived) {
			result = filterArchivedTasks(result);
		}

		// 検索フィルタ
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			const flat = flattenTasks(result);
			const matchedIds = new Set(
				flat
					.filter(
						(t) =>
							t.name.toLowerCase().includes(query) ||
							(t.description && t.description.toLowerCase().includes(query))
					)
					.map((t) => t.id)
			);

			result = filterTasksByIds(result, matchedIds);
		}

		// 条件フィルタ
		if (
			activeFilters.assignees.length > 0 ||
			activeFilters.statuses.length > 0 ||
			activeFilters.priorities.length > 0 ||
			activeFilters.tags.length > 0 ||
			activeFilters.dateFrom ||
			activeFilters.dateTo
		) {
			const flat = flattenTasks(result);
			const matchedIds = new Set(
				flat
					.filter((task) => {
						// 担当者フィルタ
						if (activeFilters.assignees.length > 0) {
							if (!task.assignee || !activeFilters.assignees.includes(task.assignee)) {
								return false;
							}
						}

						// ステータスフィルタ
						if (activeFilters.statuses.length > 0) {
							const status = task.status || 'not-started';
							if (!activeFilters.statuses.includes(status)) {
								return false;
							}
						}

						// 優先度フィルタ
						if (activeFilters.priorities.length > 0) {
							const priority = task.priority || 'none';
							if (!activeFilters.priorities.includes(priority)) {
								return false;
							}
						}

						// タグフィルタ
						if (activeFilters.tags.length > 0) {
							if (
								!task.tags ||
								!activeFilters.tags.some((tag: string) => task.tags?.includes(tag))
							) {
								return false;
							}
						}

						// 期限フィルタ
						if (activeFilters.dateFrom && task.endDate) {
							if (task.endDate < activeFilters.dateFrom) {
								return false;
							}
						}
						if (activeFilters.dateTo && task.endDate) {
							if (task.endDate > activeFilters.dateTo) {
								return false;
							}
						}

						return true;
					})
					.map((t) => t.id)
			);

			result = filterTasksByIds(result, matchedIds);
		}

		// ソート
		if (sortBy !== 'none') {
			result = sortTasks(result, sortBy, sortOrder);
		}

		return result;
	})();

	/** IDセットに基づいてタスクツリーをフィルタ */
	function filterTasksByIds(taskList: WbsTask[], ids: Set<string>): WbsTask[] {
		const results: WbsTask[] = [];
		for (const task of taskList) {
			const filteredChildren =
				task.children && task.children.length > 0 ? filterTasksByIds(task.children, ids) : [];
			if (ids.has(task.id) || filteredChildren.length > 0) {
				results.push({ ...task, children: filteredChildren });
			}
		}
		return results;
	}

	/** アーカイブされたタスクをフィルタ */
	function filterArchivedTasks(taskList: WbsTask[]): WbsTask[] {
		return taskList
			.filter((task) => !task.archived)
			.map((task) => ({
				...task,
				children: task.children.length > 0 ? filterArchivedTasks(task.children) : task.children
			}));
	}

	/** タスクをソート */
	function sortTasks(taskList: WbsTask[], sortField: string, order: 'asc' | 'desc'): WbsTask[] {
		const compare = (a: WbsTask, b: WbsTask): number => {
			let aVal: any, bVal: any;

			switch (sortField) {
				case 'endDate':
					aVal = a.endDate || '';
					bVal = b.endDate || '';
					break;
				case 'priority':
					const priorityOrder = { high: 3, medium: 2, low: 1, none: 0 };
					aVal = priorityOrder[a.priority || 'none'];
					bVal = priorityOrder[b.priority || 'none'];
					break;
				case 'assignee':
					aVal = a.assignee || '';
					bVal = b.assignee || '';
					break;
				case 'progress':
					aVal = a.progress;
					bVal = b.progress;
					break;
				default:
					return 0;
			}

			const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
			return order === 'asc' ? result : -result;
		};

		return taskList
			.map((task) => ({
				...task,
				children:
					task.children.length > 0 ? sortTasks(task.children, sortField, order) : task.children
			}))
			.sort(compare);
	}

	/** プロジェクト編集モーダルを開く */
	function openProjectEditModal() {
		showProjectEditModal = true;
	}

	/** プロジェクト情報を保存する */
	async function handleSaveProject(event: CustomEvent<any>) {
		const projectId = Number(get(page).params.id);
		const updatedData = event.detail;

		try {
			// APIの要求に合わせてsnake_caseからcamelCaseに変換します
			await Promise.all([
				apiClient.updateProject(projectId, {
					name: updatedData.project_name,
					description: updatedData.description,
					startDate: updatedData.start_date,
					endDate: updatedData.end_date,
					status: projectData?.status || 'planning',
					mainDeliverable: updatedData.main_deliverable,
					milestone: updatedData.milestone
				}),
				apiClient.updateProjectMembers(projectId, updatedData.selectedMemberIds)
			]);

			// プロジェクト情報を再読み込み
			await loadProject(projectId);
			await loadUsers();
			showProjectEditModal = false;
			alert('プロジェクト情報を更新しました！');
		} catch (error) {
			console.error('プロジェクト情報の更新に失敗しました:', error);
			alert('プロジェクト情報の更新に失敗しました。');
		}
	}

	/** タスクを複製する */
	function handleDuplicate(event: CustomEvent<string>) {
		const taskId = event.detail;
		const newTaskId = duplicateTask(taskId, { shiftDays: 7 });
		if (newTaskId) {
			console.log('タスクを複製しました:', newTaskId);
		}
	}

	/** タスクをアーカイブ/復元する */
	function handleArchive(event: CustomEvent<string>) {
		const taskId = event.detail;
		const task = findTask(get(currentTasks), taskId);
		if (!task) return;

		if (task.archived) {
			unarchiveTask(taskId);
			console.log('タスクを復元しました:', taskId);
		} else {
			archiveTask(taskId);
			console.log('タスクをアーカイブしました:', taskId);
		}
	}

	/** テンプレートを読み込む */
	function handleLoadTemplate(event: CustomEvent<{ tasks: WbsTask[] }>) {
		const { tasks: templateTasks } = event.detail;
		setWbs(templateTasks);
		tasks = get(currentTasks);
		console.log('テンプレートを読み込みました:', templateTasks.length, '個のタスク');
	}

	/** リスケジュール提案を表示 */
	function isValidYmd(value: string | undefined | null): value is string {
		return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
	}

	function getTaskDateRange(taskList: WbsTask[]): { startDate: string; endDate: string } {
		const allTasks = getAllTasks(taskList);
		let minStart = '';
		let maxEnd = '';

		for (const task of allTasks) {
			if (isValidYmd(task.startDate)) {
				minStart = !minStart || task.startDate < minStart ? task.startDate : minStart;
			}
			if (isValidYmd(task.endDate)) {
				maxEnd = !maxEnd || task.endDate > maxEnd ? task.endDate : maxEnd;
			}
		}

		const today = new Date().toISOString().split('T')[0];
		const fallbackStart = projectData?.start_date || projectPayload.start_date || today;
		const fallbackEnd = projectData?.end_date || projectPayload.end_date || fallbackStart;

		return {
			startDate: minStart || fallbackStart,
			endDate: maxEnd || fallbackEnd
		};
	}

	async function buildVacationText(startDate: string, endDate: string): Promise<string> {
		const safeStart = isValidYmd(startDate) ? startDate : new Date().toISOString().split('T')[0];
		const safeEnd = isValidYmd(endDate) ? endDate : safeStart;

		try {
			const response = await apiClient.fetchVacations(undefined, {
				startDate: safeStart,
				endDate: safeEnd
			});
			const memberIds = new Set(users.map((user) => Number(user.id)));
			const vacations = (response.data || []).filter((vacation: any) => {
				const userId = Number(vacation.user_id ?? vacation.userId);
				return memberIds.size === 0 || memberIds.has(userId);
			});

			if (vacations.length === 0) {
				return '休暇データなし';
			}

			return vacations
				.map((vacation: any) => {
					const userId = Number(vacation.user_id ?? vacation.userId);
					const userName =
						vacation.user_name ||
						users.find((user) => Number(user.id) === userId)?.fullName ||
						`ユーザー${userId}`;
					const start = vacation.start_date || vacation.startDate || '';
					const end = vacation.end_date || vacation.endDate || '';
					const type = vacation.vacation_type || vacation.vacationType || '休暇';
					return `- ${userName}: ${start}〜${end} (${type})`;
				})
				.join('\n');
		} catch (error) {
			console.warn('休暇情報の取得に失敗しました。休暇データなしとして送信します。', error);
			return '休暇データなし';
		}
	}

	async function handleReschedule() {
		const $rescheduleStore = get(rescheduleStore);
		const pendingTriggers = $rescheduleStore.triggers.filter((t) => !t.dismissed);

		if (pendingTriggers.length === 0) {
			alert('リスケジュールが必要なイベントはありません。');
			return;
		}

		// 最新のトリガーを使用
		const latestTrigger = pendingTriggers[pendingTriggers.length - 1];
		currentTriggerType = latestTrigger.type;
		currentTriggerDetails = latestTrigger.details;

		try {
			isRescheduling = true;

			// API呼び出し: リスケジュール提案を取得
			const today = new Date().toISOString().split('T')[0];

			// タスク一覧をJSON文字列化
			const tasksJson = JSON.stringify(tasks, null, 2);
			const dateRange = getTaskDateRange(tasks);
			const vacationsText = await buildVacationText(dateRange.startDate, dateRange.endDate);

			// メンバー情報をJSON文字列化
			const membersJson = JSON.stringify(
				users.map((u) => ({
					id: u.id,
					name: u.fullName || u.username
				})),
				null,
				2
			);

			const payload = {
				trigger_type: latestTrigger.type,
				affected_tasks: latestTrigger.affectedTaskIds.join(', '),
				trigger_details: JSON.stringify(latestTrigger.details),
				today,
				vacations: vacationsText,
				current_tasks: tasksJson,
				members: membersJson,
				project_name: projectPayload.project_name || 'プロジェクト',
				team_size: users.length.toString(),
				working_days_per_week: '5'
			};

			const response = await apiClient.post('/ai/reschedule', payload);

			if (response.success && response.data) {
				rescheduleProposals = response.data.changes || [];
				rescheduleSummary = response.data.summary || null;
				showRescheduleModal = true;
			} else {
				throw new Error('リスケジュール提案の取得に失敗しました');
			}
		} catch (error) {
			console.error('リスケジュール提案エラー:', error);
			alert('リスケジュール提案の生成中にエラーが発生しました。');
		} finally {
			isRescheduling = false;
		}
	}

	/** リスケジュール提案を承認 */
	function handleRescheduleApprove(event: CustomEvent<{ proposals: RescheduleProposal[] }>) {
		const { proposals } = event.detail;
		const today = new Date();

		try {
			// 過去タスク保護ロジック: 終了日が今日より前のタスクは変更しない
			proposals.forEach((proposal) => {
				const task = findTask(tasks, proposal.taskId);
				if (!task) return;

				// 終了日が過去の場合はスキップ
				if (task.endDate && new Date(task.endDate) < today) {
					console.log(`タスク ${task.id} (${task.name}) は過去なのでスキップ`);
					return;
				}

				// 開始日が過去の場合、今日に調整
				let newStartDate = proposal.proposedStart;
				if (new Date(proposal.proposedStart) < today) {
					newStartDate = today.toISOString().split('T')[0];
				}

				// タスクを更新
				updateTask(task.id, (current) => ({
					...current,
					startDate: newStartDate,
					endDate: proposal.proposedEnd
				}));
			});

			// ストアを更新
			tasks = get(currentTasks);

			// リスケジュール提案を適用完了
			rescheduleStore.applyProposal();

			// モーダルを明示的に閉じる
			showRescheduleModal = false;

			alert(`${proposals.length}個のタスクをリスケジュールしました。`);
		} catch (error) {
			console.error('リスケジュール承認エラー:', error);
			alert('リスケジュール承認中にエラーが発生しました。');
		}
	}

	/** リスケジュール提案をキャンセル */
	function handleRescheduleCancel() {
		rescheduleStore.cancelProposal();
	}

	/** AI自動割り当てを実行 */
	async function handleAutoAssign() {
		isAutoAssigning = true;
		autoAssignments = [];

		try {
			const projectId = Number(get(page).params.id);

			// 未割り当てタスクのみを対象
			const unassignedTasks = getAllTasks(tasks).filter((t) => !t.assignee);

			if (unassignedTasks.length === 0) {
				alert('割り当てが必要なタスクがありません。');
				return;
			}

			// タスク一覧をJSON文字列化
			const tasksJson = JSON.stringify(
				unassignedTasks.map((t) => ({
					id: t.id,
					name: t.name,
					description: t.description || '',
					priority: t.priority,
					complexity: t.children?.length || 0
				})),
				null,
				2
			);

			// メンバー情報をJSON文字列化（スキル情報と現在の負荷を含む）
			// 各メンバーの現在のタスク数を計算
			const memberWorkload = new Map<string, number>();
			getAllTasks(tasks).forEach((task) => {
				if (task.assignee) {
					const key = task.assignee;
					memberWorkload.set(key, (memberWorkload.get(key) || 0) + 1);
				}
			});

			// メンバーのスキル情報を取得（複数並行実行）
			const membersWithSkills = await Promise.all(
				users.map(async (u) => {
					try {
						const skillsResponse = await apiClient.get(`/user-skills/${u.id}`);
						// APIレスポンスからスキル情報を抽出（スキルは直接配列で返される）
						const skills = Array.isArray(skillsResponse.data)
							? skillsResponse.data
							: skillsResponse.data?.data || [];
						const userSkills = skills.map((s: any) => ({
							name: s.skillName,
							level: s.skillLevel,
							category: 'general' // スキルのカテゴリ（将来の拡張用）
						}));

						return {
							id: u.id,
							name: u.fullName || u.username,
							skills: userSkills,
							currentWorkload: memberWorkload.get(u.username) || 0,
							maxCapacity: 3 // 1人あたりの最大タスク数
						};
					} catch (error) {
						// スキル取得に失敗した場合はスキルなしで続行
						console.warn(`スキル情報の取得に失敗: ${u.username}`, error);
						return {
							id: u.id,
							name: u.fullName || u.username,
							skills: [],
							currentWorkload: memberWorkload.get(u.username) || 0,
							maxCapacity: 3
						};
					}
				})
			);

			const membersJson = JSON.stringify(membersWithSkills, null, 2);

			const payload = {
				projectId: projectId.toString(),
				project_name: projectPayload.project_name || 'プロジェクト',
				tasks: tasksJson,
				members: membersJson
			};

			const response = await apiClient.post('/ai/auto-assign', payload);

			if (response.success && response.data && response.data.assignments) {
				autoAssignments = response.data.assignments;
				showAutoAssignModal = true;
			} else {
				throw new Error('割り当て提案の取得に失敗しました');
			}
		} catch (error) {
			console.error('AI自動割り当てエラー:', error);
			alert('AI自動割り当ての実行中にエラーが発生しました。');
		} finally {
			isAutoAssigning = false;
		}
	}

	/** AI自動割り当てを承認 */
	function handleAutoAssignApprove(event: CustomEvent<{ assignments: any[] }>) {
		const { assignments } = event.detail;

		try {
			let assignedCount = 0;

			assignments.forEach((assignment) => {
				const task = findTask(tasks, assignment.taskId);
				if (task) {
					// 担当者名からユーザーIDを取得
					const user = users.find(
						(u) => u.fullName === assignment.assignedTo || u.username === assignment.assignedTo
					);
					if (user) {
						updateTask(task.id, (current) => ({
							...current,
							assignee: user.fullName || user.username
						}));
						assignedCount++;
					} else {
						console.warn(`ユーザーが見つかりません: ${assignment.assignedTo}`);
					}
				} else {
					console.warn(`タスクが見つかりません: ${assignment.taskId}`);
				}
			});

			// ストアを更新
			tasks = get(currentTasks);

			// モーダルを明示的に閉じる
			showAutoAssignModal = false;

			alert(`${assignedCount}個のタスクに担当者を割り当てました。`);

			// 期間の自動再計算を提案
			if (
				confirm(
					'担当者割り当てに合わせて、タスク期間（スケジュール）の自動再計算も実行しますか？\n（リソースに基づいた最適な並行スケジュールの生成を試みます）'
				)
			) {
				handleAutoDuration();
			}
		} catch (error) {
			console.error('AI自動割り当て承認エラー:', error);
			alert(
				'AI自動割り当て承認中にエラーが発生しました: ' +
					(error instanceof Error ? error.message : String(error))
			);
		}
	}

	/** AI自動割り当てをキャンセル */
	function handleAutoAssignCancel() {
		showAutoAssignModal = false;
	}

	/** 全タスクをフラットな配列で取得 */
	function getAllTasks(taskList: WbsTask[]): WbsTask[] {
		const result: WbsTask[] = [];
		function traverse(tasks: WbsTask[]) {
			for (const task of tasks) {
				result.push(task);
				if (task.children && task.children.length > 0) {
					traverse(task.children);
				}
			}
		}
		traverse(taskList);
		return result;
	}

	/** AI自動期間設定を実行 */
	async function handleAutoDuration() {
		isAutoCalculatingDuration = true;
		autoDurations = [];
		autoDurationProjectEndDate = null;
		autoDurationCriticalPath = [];

		try {
			const projectId = Number(get(page).params.id);

			// 開始日・終了日が未設定のタスクを対象
			const allTasks = getAllTasks(tasks);
			const unscheduledTasks = allTasks.filter((t) => !t.startDate || !t.endDate);

			if (unscheduledTasks.length === 0) {
				alert('期間設定が必要なタスクがありません。');
				return;
			}

			// タスク一覧をJSON文字列化
			const tasksJson = JSON.stringify(
				allTasks.map((t) => ({
					id: t.id,
					name: t.name,
					description: t.description || '',
					assignee: t.assignee,
					dependencies: t.dependencies || [],
					children: t.children?.length || 0,
					priority: t.priority
				})),
				null,
				2
			);

				// メンバー情報をJSON文字列化
				const membersJson = JSON.stringify(
					users.map((u) => ({
						id: u.id,
						name: u.fullName || u.username,
						// TODO: スキル情報を取得
						skills: []
					})),
					null,
					2
				);
				const dateRange = getTaskDateRange(allTasks);
				const vacationsText = await buildVacationText(dateRange.startDate, dateRange.endDate);

				const payload = {
					projectId: projectId.toString(),
					project_name: projectPayload.project_name || 'プロジェクト',
					startDate: projectData?.start_date || new Date().toISOString().split('T')[0],
					teamSize: users.length.toString(),
					workingDaysPerWeek: '5',
					tasks: tasksJson,
					members: membersJson,
					vacations: vacationsText
				};

				const response = await apiClient.post('/ai/auto-duration', payload);

				if (response.success && response.data && response.data.durations) {
					autoDurations = response.data.durations;
					autoDurationProjectEndDate = response.data.projectEndDate || null;
					autoDurationCriticalPath = response.data.criticalPath || [];
					showAutoDurationModal = true;
				} else {
					throw new Error('期間設定提案の取得に失敗しました');
				}
		} catch (error) {
			console.error('AI自動期間設定エラー:', error);
			alert('AI自動期間設定の実行中にエラーが発生しました。');
		} finally {
			isAutoCalculatingDuration = false;
		}
	}

	/** AI自動期間設定を承認 */
	function handleAutoDurationApprove(event: CustomEvent<{ durations: any[] }>) {
		const { durations } = event.detail;

		try {
			durations.forEach((duration) => {
				const task = findTask(tasks, duration.taskId);
				if (task) {
					updateTask(task.id, (current) => ({
						...current,
						startDate: duration.startDate,
						endDate: duration.endDate,
						effortDays: duration.effortDays
					}));
				}
			});

			// ストアを更新
			tasks = get(currentTasks);

			// モーダルを明示的に閉じる
			showAutoDurationModal = false;

			alert(`${durations.length}個のタスクの期間を設定しました。`);
		} catch (error) {
			console.error('AI自動期間設定承認エラー:', error);
			alert('AI自動期間設定承認中にエラーが発生しました。');
		}
	}

	/** AI自動期間設定をキャンセル */
	function handleAutoDurationCancel() {
		showAutoDurationModal = false;
	}

	/** AIアシスタントパネル表示フラグ */
	let showAiAssistant = false;

	/** AIアシスタントから変更を適用 */
	async function handleAiApplyChanges(event: CustomEvent<{ changes: any[] }>) {
		const { changes } = event.detail;

		console.log('handleAiApplyChanges - event.detail:', event.detail);
		console.log('handleAiApplyChanges - changes:', changes);
		console.log('handleAiApplyChanges - changes is array?', Array.isArray(changes));

		try {
			let hasExternalAction = false;

			// changesが配列でない場合は配列に変換
			const changesArray = Array.isArray(changes) ? changes : [changes];

			// nullや空の要素を除外
			const validChanges = changesArray.filter((change) => change && change.type);

			console.log('handleAiApplyChanges - validChanges:', validChanges);
			console.log('handleAiApplyChanges - validChanges.length:', validChanges.length);

			for (const change of validChanges) {
				console.log('処理中のchange:', change.type, change.taskName || change.taskId);
				switch (change.type) {
					case 'create': {
						// タスク作成（フロントエンドのみ更新、後でまとめて保存）
						const newTask = createBlankTask(
							change.taskName || '新しいタスク',
							change.parentId || null
						);
						// 変更内容を反映
						if (change.changes) {
							Object.assign(newTask, change.changes);
						}
						addChildTask(change.parentId || null, newTask);
						break;
					}

					case 'update': {
						// タスク更新（フロントエンドのみ更新、後でまとめて保存）
						if (change.taskId) {
							updateTask(change.taskId, (task) => ({
								...task,
								...change.changes
							}));
						}
						break;
					}

					case 'delete': {
						// タスク削除（フロントエンドのみ更新、後でまとめて保存）
						if (change.taskId) {
							removeTask(change.taskId);
						}
						break;
					}

					case 'move': {
						// タスク移動（フロントエンドのみ更新、後でまとめて保存）
						if (change.taskId && change.parentId !== undefined) {
							moveTask(change.taskId, change.parentId, change.newPosition || 0);
						}
						break;
					}

					case 'external_action': {
						// 外部AI機能を呼び出す
						hasExternalAction = true;
						await handleExternalAiAction(change);
						break;
					}

					case 'error': {
						// エラーの場合は警告を表示
						console.warn('AI処理エラー:', change.message || 'エラーが発生しました', change);
						// エラーメッセージを収集して後でまとめて表示
						if (!change.silent) {
							const errorMsg =
								change.message || `タスク ${change.taskId || ''} の処理中にエラーが発生しました`;
							console.error('タスク処理エラー:', errorMsg);
						}
						break;
					}

					default: {
						console.warn('未知の変更タイプ:', change.type, change);
						break;
					}
				}
			}

			// 通常の変更があれば保存
			if (!hasExternalAction || validChanges.some((c) => c.type !== 'external_action')) {
				// WBSストアを更新
				tasks = get(currentTasks);

				console.log('handleAiApplyChanges - WBS保存前のタスク数:', tasks.length);

				// 自動保存（確認ダイアログなし）
				await handleSaveWbs(true);

				console.log('handleAiApplyChanges - WBS保存完了');
			}

			if (!hasExternalAction) {
				alert(`${validChanges.length}件の変更を適用しました。`);
			} else {
				// 外部AI機能の場合は、その機能側で成功メッセージを表示する
				console.log('外部AI機能を実行しました');
			}
		} catch (error) {
			console.error('AI変更適用エラー:', error);
			alert('変更の適用中にエラーが発生しました。');
		}
	}

	/** 外部AI機能を実行 */
	async function handleExternalAiAction(action: any) {
		switch (action.action) {
			case 'reschedule':
				// リスケジュール機能を呼び出し
				await handleReschedule();
				break;

			case 'auto_assign':
				// 自動割り当て機能を呼び出し
				await handleAutoAssign();
				break;

			case 'decompose':
				// タスク分解機能を呼び出し
				if (action.taskId) {
					const task = findTask(tasks, action.taskId);
					if (task) {
						decomposeTarget = task;
						showDecomposeModal = true;
					} else {
						alert(`タスク ${action.taskId} が見つかりませんでした。`);
					}
				}
				break;

			default:
				console.warn(`未知の外部アクション: ${action.action}`);
		}
	}

	/** 高度なツール（テンプレート、ルール、カスタムフィールド）の表示切り替え */
	let showAdvancedTools = false;

	let templateManager: TemplateManager;
	let ruleManager: RuleManager;
	let customFieldManager: CustomFieldManager;
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-diagram-3"></i>
				{projectPayload.project_name || 'プロジェクトWBS'}
			</h1>
			<p>WBS作成・構成編集</p>
			{#if $isDirty}
				<div class="unsaved-warning-mini">
					<i class="bi bi-exclamation-circle"></i>
					未保存の変更あり
				</div>
			{/if}
		</div>
	</header>
</div>

<div class="wbs-page">
	<header class="desktop-header">
		<div class="title-section">
			<div class="page-label-group">
				<span class="page-category">プロジェクト管理</span>
				<span class="separator">/</span>
				<span class="page-function">WBS作成</span>
			</div>
			<h1>{projectPayload.project_name}</h1>
			<p class="project-goal">
				<i class="bi bi-info-circle"></i>
				{projectPayload.project_goal || 'プロジェクトの目標を入力・更新してください。'}
			</p>
			{#if $isDirty}
				<div class="unsaved-warning">
					<i class="bi bi-exclamation-triangle-fill"></i>
					未保存の変更があります
				</div>
			{/if}
		</div>
		<div class="header-actions">
			<div class="meta">
				<span class="badge">期間: {projectPayload.duration || '未定'}</span>
				<span class="badge">体制: {projectPayload.team_structure}</span>
				<!--
				{#if projectPayload.main_deliverable}
					<span class="badge">成果物: {projectPayload.main_deliverable}</span>
				{/if}
				{#if projectPayload.milestone}
					<span class="badge">マイルストーン: {projectPayload.milestone}</span>
				{/if}
				-->
			</div>
			<button type="button" class="edit-project-btn" on:click={openProjectEditModal}>
				<i class="bi bi-pencil-square"></i>
				プロジェクト編集
			</button>
		</div>
	</header>

	<WbsToolbar
		{currentView}
		{isCheckingSanity}
		{isSaving}
		{searchQuery}
		{sortBy}
		{sortOrder}
		{showFilters}
		{showArchived}
		{activeFilterCount}
		rescheduleNotificationCount={$pendingTriggersCount}
		canUndo={$canUndo && !isLoading}
		canRedo={$canRedo && !isLoading}
		on:generate={openGenerationModal}
		on:openDataOperations={openDataOperationsModal}
			on:addRoot={handleAddRoot}
			on:sanityCheck={handleSanityCheck}
			on:save={() => handleSaveWbs()}
			on:reschedule={handleReschedule}
		on:autoAssign={handleAutoAssign}
		on:autoDuration={handleAutoDuration}
		on:openAiAssistant={() => (showAiAssistant = true)}
		on:viewChange={(event) => (currentView = event.detail)}
		on:searchChange={(event) => (searchQuery = event.detail)}
		on:sortChange={(event) => {
			sortBy = event.detail.sortBy;
			sortOrder = event.detail.sortOrder;
		}}
		on:toggleFilters={() => (showFilters = !showFilters)}
		on:toggleArchived={() => (showArchived = !showArchived)}
		on:saveTemplate={() => templateManager.openSaveDialog()}
		on:loadTemplate={() => templateManager.openLoadDialog()}
		on:openRules={() => ruleManager.openRulesDialog()}
		on:openCustomFields={() => customFieldManager.openDialog()}
		on:recalculateEffort={handleRecalculateEffort}
		on:undo={handleUndo}
		on:redo={handleRedo}
		on:showHistory={handleShowHistory}
	/>

	<!-- Hidden components for logic only (Dialogs will be visible) -->
	<div>
		<TemplateManager
			bind:this={templateManager}
			{tasks}
			projectName={projectPayload.project_name}
			showTriggerButton={false}
			on:loadTemplate={handleLoadTemplate}
		/>
		<RuleManager bind:this={ruleManager} showTriggerButton={false} />
		<CustomFieldManager
			bind:this={customFieldManager}
			projectId={Number(get(page).params.id)}
			showTriggerButton={false}
		/>
	</div>

	{#if showFilters}
		<FilterPanel
			{users}
			{currentUserFullName}
			initialFilters={activeFilters}
			on:filterChange={(event) => (activeFilters = event.detail)}
		/>
	{/if}

	<div class="main">
		<div class="board">
			{#if currentView === 'tree'}
				<WbsTree
					tasks={filteredTasks}
					{selectedTaskId}
					on:select={(event) => handleSelectTask(event.detail)}
					on:decompose={(event) => openDecomposeModal(event.detail)}
					on:refine={(event) => openRefineModal(event.detail)}
					on:duplicate={handleDuplicate}
					on:archive={handleArchive}
				/>
			{:else if currentView === 'board'}
				<BoardView
					tasks={filteredTasks}
					{selectedTaskId}
					projectId={Number($page.params.id)}
					on:select={(event) => handleSelectTask(event.detail)}
				/>
			{:else if currentView === 'calendar'}
				<CalendarView
					tasks={filteredTasks}
					{selectedTaskId}
					on:select={(event) => handleSelectTask(event.detail)}
				/>
			{:else if currentView === 'gantt'}
				<GanttView
					tasks={filteredTasks}
					on:select={(event) => {
						const taskId = event.detail.taskId;
						const found = findTask(tasks, taskId);
						if (found) {
							handleSelectTask(found);
						}
					}}
				/>
			{/if}
		</div>
	</div>
</div>

<!-- Task Detail Modal (outside main layout) -->
<TaskDetailPanel
	task={selectedTask}
	{users}
	{comments}
	{attachments}
	{activities}
	{currentUserId}
	projectId={Number(get(page).params.id)}
	on:close={() => {
		selectedTask = null;
		selectedTaskId = null;
	}}
	on:generateDescription={handleGenerateDescription}
	on:addComment={handleAddComment}
	on:deleteComment={handleDeleteComment}
	on:uploadComplete={handleUploadComplete}
	on:downloadFile={handleDownloadFile}
/>

{#if showGenerationModal}
	<GenerationModal
		payload={projectPayload}
		teamMembers={users}
		on:close={() => (showGenerationModal = false)}
		on:generate={handleGenerate}
	/>
{/if}

{#if showDataOperationsModal}
	<DataOperationsModal
		show={showDataOperationsModal}
		isProcessing={isGenerating}
		on:close={() => (showDataOperationsModal = false)}
		on:selectImport={openTaskImportModal}
		on:selectExport={openTaskExportModal}
	/>
{/if}

{#if showTaskImportModal}
	<TaskImportModal
		{projectId}
		bind:show={showTaskImportModal}
		on:imported={handleTaskImportComplete}
		on:close={() => (showTaskImportModal = false)}
	/>
{/if}

{#if showTaskExportModal}
	<TaskExportModal
		{projectId}
		bind:show={showTaskExportModal}
		on:close={() => (showTaskExportModal = false)}
	/>
{/if}

{#if showSanityResults}
	<SanityCheckResults
		suggestions={sanitySuggestions}
		on:close={() => (showSanityResults = false)}
		on:selectTask={(event) => {
			const taskId = event.detail;
			const found = findTask(tasks, taskId);
			if (found) {
				handleSelectTask(found);
				currentView = 'tree';
			}
		}}
	/>
{/if}

{#if showDecomposeModal && decomposeTarget}
	<TaskDecomposeModal
		task={decomposeTarget}
		isProcessing={isDecomposing}
		on:close={() => {
			showDecomposeModal = false;
			decomposeTarget = null;
		}}
		on:confirm={handleDecomposeConfirm}
	/>
{/if}

{#if showRefineModal && refineTarget}
	<TaskRefineModal
		task={refineTarget}
		isProcessing={isRefining}
		on:close={() => {
			showRefineModal = false;
			refineTarget = null;
		}}
		on:confirm={handleRefineConfirm}
	/>
{/if}

{#if showProjectEditModal && projectData}
	<ProjectEditModal
		project={{
			id: projectData.id,
			project_name: projectData.project_name,
			description: projectData.description ?? '',
			start_date: projectData.start_date ?? '',
			end_date: projectData.end_date ?? '',
			team_structure: projectData.team_structure ?? 'PM1名 / 開発3名 / QA1名',
			main_deliverable: projectPayload.main_deliverable ?? '',
			milestone: projectPayload.milestone ?? '',
			member_ids: projectData.member_ids || []
		}}
		{users}
		on:close={() => (showProjectEditModal = false)}
		on:save={handleSaveProject}
	/>
{/if}

<!-- リスケジュールトリガー検出 -->
<RescheduleDetector {tasks} projectId={Number(get(page).params.id)} enabled={true} />

<!-- リスケジュール提案モーダル -->
<RescheduleProposalModal
	bind:show={showRescheduleModal}
	proposals={rescheduleProposals}
	summary={rescheduleSummary}
	triggerType={currentTriggerType}
	triggerDetails={currentTriggerDetails}
	on:approve={handleRescheduleApprove}
	on:cancel={handleRescheduleCancel}
/>

<!-- AI自動割り当てモーダル -->
<AutoAssignModal
	bind:show={showAutoAssignModal}
	isProcessing={isAutoAssigning}
	assignments={autoAssignments}
	on:approve={handleAutoAssignApprove}
	on:cancel={handleAutoAssignCancel}
/>

<!-- AI自動期間設定モーダル -->
<AutoDurationModal
	bind:show={showAutoDurationModal}
	isProcessing={isAutoCalculatingDuration}
	durations={autoDurations}
	projectEndDate={autoDurationProjectEndDate}
	criticalPath={autoDurationCriticalPath}
	on:approve={handleAutoDurationApprove}
	on:cancel={handleAutoDurationCancel}
/>

<!-- 履歴パネル -->
<HistoryPanel
	isOpen={showHistoryPanel}
	past={$historyData.past}
	present={$historyData.present}
	future={$historyData.future}
	on:jump={handleHistoryJump}
	on:close={handleCloseHistory}
/>

<!-- Loading Overlay -->
<LoadingOverlay show={isLoading} message={loadingMessage} />

<!-- AI Assistant Panel -->
<WbsAiAssistantPanel
	bind:show={showAiAssistant}
	{tasks}
	{projectId}
	projectName={projectData?.project_name || ''}
	projectGoal={projectData?.goal || ''}
	{users}
	on:close={() => (showAiAssistant = false)}
	on:applyChanges={handleAiApplyChanges}
/>

<style>
	.wbs-page {
		display: flex;
		flex-direction: column;
		gap: 10px;
		max-width: 100%;
		overflow-x: hidden;
		box-sizing: border-box;
		padding: 16px;
	}

	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.desktop-header {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		align-items: flex-end;
	}

	.desktop-header h1 {
		margin: 8px 0;
		font-size: 32px;
		font-weight: 800;
		color: #111827;
		letter-spacing: -0.02em;
	}

	.page-label-group {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 600;
		color: #3b82f6;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.page-label-group .separator {
		color: #d1d5db;
		font-weight: 400;
	}

	.project-goal {
		margin: 4px 0 0;
		font-size: 14px;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.project-goal i {
		color: #9ca3af;
		font-size: 16px;
	}

	.unsaved-warning {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
		padding: 6px 14px;
		background-color: #fff1f2;
		border: 1px solid #fecdd3;
		border-radius: 8px;
		color: #e11d48;
		font-size: 13px;
		font-weight: 700;
		box-shadow: 0 2px 4px rgba(225, 29, 72, 0.1);
		animation: pulse-border 2s infinite;
	}

	.unsaved-warning-mini {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 4px;
		padding: 2px 8px;
		background-color: #fb7185;
		border-radius: 4px;
		color: #ffffff;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
	}

	@keyframes pulse-border {
		0% {
			border-color: #fecdd3;
			box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.2);
		}
		50% {
			border-color: #fb7185;
			box-shadow: 0 0 0 4px rgba(225, 29, 72, 0);
		}
		100% {
			border-color: #fecdd3;
			box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.2);
		}
	}

	.header-actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: flex-end;
		margin-top: 5px;
	}

	.meta {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.badge {
		padding: 6px 12px;
		border-radius: 999px;
		background: #dbeafe;
		color: #3b82f6;
		font-size: 12px;
	}

	.utility-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
	}

	.edit-project-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-radius: 12px;
		background: #e0e7ff;
		border: 1px solid #818cf8;
		color: #4338ca;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			border-color 0.2s ease;
	}

	.edit-project-btn:hover {
		transform: translateY(-1px);
		border-color: #4338ca;
	}

	.main {
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: 100%;
	}

	.board {
		display: flex;
		flex-direction: column;
		gap: 16px;
		width: 100%;
		min-width: 0;
		overflow-x: hidden;
		flex: 1; /* 親の高さに合わせて伸びる */
		min-height: 0; /* Flexboxの縮小を許可 */
	}

	.advanced-tools-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 8px;
	}

	.toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: 8px;
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		color: #6b7280;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.toggle-btn:hover {
		background: #e5e7eb;
		border-color: #9ca3af;
		color: #374151;
	}

	.toggle-btn i {
		font-size: 14px;
	}

	/* Mobile/Tablet Styles (<960px) */
	@media (max-width: 960px) {
		.page-header-wrapper {
			display: block; /* Show header */
			margin: 0;
			background: #1c2638;
			color: #ffffff;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		}

		.page-header {
			width: 100%;
			height: 100%;
			display: flex;
			justify-content: flex-start;
			align-items: center;
			padding: 0 24px;
			box-sizing: border-box;
		}

		.header-content {
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 4px;
			height: 100%;
		}

		.header-content h1 {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 0;
			color: #ffffff;
			font-size: 20px;
			font-weight: 700;
			line-height: 1.2;
		}

		.header-content p {
			margin: 0;
			font-size: 13px;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.8);
			line-height: 1.4;
		}

		.title-section {
			display: none; /* Hide desktop title on mobile */
		}

		.desktop-header {
			flex-direction: column;
			align-items: stretch;
			gap: 16px;
		}

		.header-actions {
			align-items: stretch;
			margin-top: 0;
		}

		.meta {
			flex-wrap: wrap;
		}

		.utility-bar {
			flex-wrap: wrap;
			padding: 10px 12px;
		}

		.edit-project-btn {
			width: 100%;
			justify-content: center;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.wbs-page {
			gap: 8px;
			max-width: 100%;
			overflow-x: hidden;
			padding: 10px;
		}

		/* Removed redundant page-header styles as they are handled by wrapper/desktop-header */

		.header-actions {
			gap: 10px;
		}

		.meta {
			gap: 6px;
		}

		.badge {
			padding: 4px 10px;
			font-size: 11px;
		}

		.utility-bar {
			gap: 8px;
			padding: 8px 10px;
			border-radius: 10px;
		}

		.edit-project-btn {
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
		}

		.main {
			gap: 16px;
		}

		.board {
			gap: 12px;
		}

		.advanced-tools-toggle {
			padding: 6px;
		}

		.toggle-btn {
			padding: 10px 14px;
			font-size: 13px;
			min-height: 44px;
			width: 100%;
			justify-content: center;
		}
	}

	/* 超極小画面（390px以下）での完全な横スクロール防止 */
	@media (max-width: 390px) {
		.wbs-page {
			width: 100%;
			max-width: 100%;
			padding: 10px;
			margin: 0;
			gap: 6px;
		}

		.desktop-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}

		.header-actions {
			width: 100%;
			align-items: stretch;
		}

		.meta {
			flex-wrap: wrap;
			gap: 4px;
		}

		.badge {
			padding: 3px 8px;
			font-size: 10px;
		}

		.edit-project-btn {
			padding: 10px 14px;
			font-size: 13px;
			min-height: 44px;
			width: 100%;
		}

		.main {
			gap: 12px;
			width: 100%;
			max-width: 100%;
		}

		.board {
			gap: 10px;
			width: 100%;
			max-width: 100%;
		}

		.utility-bar {
			padding: 6px 8px;
			gap: 6px;
		}

		.toggle-btn {
			padding: 8px 12px;
			font-size: 12px;
			min-height: 40px;
		}
	}
</style>
