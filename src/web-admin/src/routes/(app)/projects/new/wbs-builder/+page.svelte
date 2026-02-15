<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';
	import PhaseNavigator from '$lib/components/wbs-builder/PhaseNavigator.svelte';
	import WbsEditArea from '$lib/components/wbs-builder/WbsEditArea.svelte';
	import AiAssistantChat from '$lib/components/wbs-builder/AiAssistantChat.svelte';
	import ProjectInfoModal from '$lib/components/wbs-builder/ProjectInfoModal.svelte';
	import {
		currentPhase,
		projectDetails,
		currentWbs,
		selectedParentTask,
		isLoadingAi,
		errorMessage,
		chatHistory,
		addChatMessage,
		replaceTaskChildren,
		findTaskById,
		canProceedToNextPhase,
		saveToLocalStorage,
		loadFromLocalStorage,
		clearLocalStorage,
		resetWbsBuilder
	} from '$lib/stores/wbsBuilderStore';
	import type { ProjectDetails, WbsBuilderTask } from '$lib/stores/wbsBuilderStore';
	import { get } from 'svelte/store';

	// UI state
	let showProjectInfoModal = false; // Start with false to prevent flash
	let members: Array<{
		id: number;
		username: string;
		fullName: string;
		role?: string;
		skills?: Array<{ skillName?: string; skillLevel?: number; name?: string; level?: number }>;
	}> = [];
	let hasLoadedInitialProject = false;
	let isGeneratingMajorTasks = false;

	// Load members on mount
	onMount(async () => {
		try {
			const response = await apiClient.fetchUsers();
			const fetched = response.data || [];
			members = fetched.map((member: any) => ({
				id: Number(member.id),
				username: member.username || '',
				fullName: member.fullName || member.user?.fullName || member.username || '',
				role: member.role || member.user?.role,
				skills: member.skills || []
			}));
		} catch (e) {
			console.error('メンバー一覧の取得に失敗しました', e);
		}

		// Check if project info was passed from previous page via sessionStorage
		if (typeof window !== 'undefined') {
			const savedProjectInfo = sessionStorage.getItem('wbsBuilderInitialProject');
			if (savedProjectInfo && !hasLoadedInitialProject) {
				try {
					const initialProjectInfo = JSON.parse(savedProjectInfo);
					hasLoadedInitialProject = true;

					// Clear from sessionStorage immediately
					sessionStorage.removeItem('wbsBuilderInitialProject');

					// Clear any existing data (localStorage and stores)
					clearLocalStorage();
					resetWbsBuilder();

					// Set project details
					projectDetails.set({
						projectName: initialProjectInfo.projectName || '',
						description: initialProjectInfo.description || '',
						goal: initialProjectInfo.goal || '',
						startDate: initialProjectInfo.startDate || '',
						endDate: initialProjectInfo.endDate || '',
						constraints: initialProjectInfo.constraints || '',
						teamMembers: initialProjectInfo.teamMembers || []
					});

					// Set phase to major
					currentPhase.set('major');

					// Trigger generation directly (one-time call)
					await generateMajorTasks();
					return;
				} catch (e) {
					console.error('Failed to parse project info from sessionStorage', e);
					// If error, show modal
					showProjectInfoModal = true;
				}
			} else {
				// No sessionStorage data - try to load from localStorage
				const loaded = loadFromLocalStorage();
				if (loaded && get(currentPhase) !== 'input') {
					// Has saved progress, don't show modal
					showProjectInfoModal = false;
				} else {
					// No saved data, show modal
					showProjectInfoModal = true;
				}
			}
		} else {
			// Not in browser, show modal
			showProjectInfoModal = true;
		}
	});

	// Handle project info submit
	function handleProjectInfoSubmit() {
		showProjectInfoModal = false;
		// Automatically trigger AI generation for major tasks
		generateMajorTasks();
	}

	// Generate major tasks (using new WBS Builder API)
	async function generateMajorTasks() {
		// Prevent multiple simultaneous calls
		if (isGeneratingMajorTasks) {
			console.log('Already generating major tasks, skipping...');
			return;
		}

		try {
			isGeneratingMajorTasks = true;
			isLoadingAi.set(true);
			errorMessage.set('');

			const details = get(projectDetails);
			const history = get(chatHistory).map((msg) => ({
				role: msg.role,
				content: msg.content
			}));

			// Use new /ai/wbs/builder/generate endpoint
			const payload = {
				projectDetails: {
					projectName: details.projectName,
					goal: details.goal,
					startDate: details.startDate,
					endDate: details.endDate,
					constraints: details.constraints || '',
					teamMembers: details.teamMembers || []
				},
				phase: 'major' as const,
				userInstruction: '',
				history
			};

			const response = await apiClient.generateWbsBuilder(payload);

			if (!response.success || !response.data || !response.data.suggestedTasks) {
				throw new Error('AI生成に失敗しました');
			}

			const suggestedTasks = response.data.suggestedTasks;
			const aiComment = response.data.aiComment || '';

			// Convert AI response to WbsBuilderTask format (major tasks only)
			const tasks: WbsBuilderTask[] = suggestedTasks.map((t: any, index: number) => ({
				id: `major-${Date.now()}-${Math.random()}-${index}`,
				name: t.name || '',
				description: t.description || '',
				effortDays: t.effortDays || 0,
				startDate: '',
				endDate: '',
				level: 'major',
				children: [] // Ensure no children are included
			}));

			// Replace root tasks
			replaceTaskChildren(null, tasks);

			// Add AI comment to chat
			if (aiComment) {
				addChatMessage('assistant', aiComment);
			} else {
				addChatMessage(
					'assistant',
					`${tasks.length}件の大分類タスクを生成しました。内容を確認して、修正が必要な場合は指示してください。`
				);
			}

			// Save to localStorage
			saveToLocalStorage();
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'AI生成に失敗しました';
			errorMessage.set(msg);
			addChatMessage('assistant', `エラー: ${msg}`);
		} finally {
			isLoadingAi.set(false);
			isGeneratingMajorTasks = false;
		}
	}

	// Generate medium/minor tasks (using new WBS Builder API)
	async function generateChildTasks(userInstruction: string = '') {
		try {
			isLoadingAi.set(true);
			errorMessage.set('');

			const phase = get(currentPhase);
			const parentTaskId = get(selectedParentTask);
			const wbs = get(currentWbs);
			const details = get(projectDetails);

			if (!parentTaskId) {
				throw new Error('親タスクが選択されていません');
			}

			const parentTask = findTaskById(wbs, parentTaskId);
			if (!parentTask) {
				throw new Error('親タスクが見つかりません');
			}

			const history = get(chatHistory).map((msg) => ({
				role: msg.role,
				content: msg.content
			}));

			// Use new /ai/wbs/builder/generate endpoint
			const payload = {
				projectDetails: {
					projectName: details.projectName,
					goal: details.goal,
					startDate: details.startDate,
					endDate: details.endDate,
					constraints: details.constraints || '',
					teamMembers: details.teamMembers || []
				},
				phase: phase as 'medium' | 'minor',
				parentTask: {
					id: parentTask.id,
					name: parentTask.name,
					description: parentTask.description || '',
					effortDays: parentTask.effortDays || 0
				},
				userInstruction: userInstruction || '',
				history
			};

			const response = await apiClient.generateWbsBuilder(payload);

			if (!response.success || !response.data || !response.data.suggestedTasks) {
				throw new Error('AI生成に失敗しました');
			}

			const suggestedTasks = response.data.suggestedTasks;
			const aiComment = response.data.aiComment || '';

			// Convert AI response to WbsBuilderTask format
			const tasks: WbsBuilderTask[] = suggestedTasks.map((t: any, index: number) => ({
				id: `${phase === 'medium' ? 'medium' : 'minor'}-${Date.now()}-${Math.random()}-${index}`,
				name: t.name || '',
				description: t.description || '',
				effortDays: t.effortDays || 0,
				startDate: '',
				endDate: '',
				level: phase === 'medium' ? 'medium' : 'minor',
				parentId: parentTaskId,
				children: [] // Ensure no children are included (ignore sub-tasks from AI)
			}));

			// Replace children of parent task
			replaceTaskChildren(parentTaskId, tasks);

			// Add AI comment to chat
			if (aiComment) {
				addChatMessage('assistant', aiComment);
			} else {
				const levelName = phase === 'medium' ? '中分類' : '小分類';
				addChatMessage(
					'assistant',
					`${tasks.length}件の${levelName}タスクを生成しました。内容を確認して、修正が必要な場合は指示してください。`
				);
			}

			// Save to localStorage
			saveToLocalStorage();
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'AI生成に失敗しました';
			errorMessage.set(msg);
			addChatMessage('assistant', `エラー: ${msg}`);
		} finally {
			isLoadingAi.set(false);
		}
	}

	// Handle AI message from chat
	function handleAiMessage(event: CustomEvent<{ message: string }>) {
		const userMessage = event.detail.message;
		const phase = get(currentPhase);

		if (phase === 'major') {
			// Re-generate major tasks with user instruction
			generateMajorTasksWithInstruction(userMessage);
		} else if (phase === 'medium' || phase === 'minor') {
			generateChildTasks(userMessage);
		}
	}

	// Generate major tasks with user instruction (using new WBS Builder API)
	async function generateMajorTasksWithInstruction(userInstruction: string) {
		try {
			isLoadingAi.set(true);
			errorMessage.set('');

			const details = get(projectDetails);
			const history = get(chatHistory).map((msg) => ({
				role: msg.role,
				content: msg.content
			}));

			// Use new /ai/wbs/builder/generate endpoint with user instruction
			const payload = {
				projectDetails: {
					projectName: details.projectName,
					goal: details.goal,
					startDate: details.startDate,
					endDate: details.endDate,
					constraints: details.constraints || '',
					teamMembers: details.teamMembers || []
				},
				phase: 'major' as const,
				userInstruction: userInstruction,
				history
			};

			const response = await apiClient.generateWbsBuilder(payload);

			if (!response.success || !response.data || !response.data.suggestedTasks) {
				throw new Error('AI生成に失敗しました');
			}

			const suggestedTasks = response.data.suggestedTasks;
			const aiComment = response.data.aiComment || '';

			const tasks: WbsBuilderTask[] = suggestedTasks.map((t: any, index: number) => ({
				id: `major-${Date.now()}-${Math.random()}-${index}`,
				name: t.name || '',
				description: t.description || '',
				effortDays: t.effortDays || 0,
				startDate: '',
				endDate: '',
				level: 'major',
				children: [] // Ensure no children are included
			}));

			replaceTaskChildren(null, tasks);

			if (aiComment) {
				addChatMessage('assistant', aiComment);
			} else {
				addChatMessage(
					'assistant',
					`ご指示に基づいて修正しました。${tasks.length}件の大分類タスクを生成しました。`
				);
			}

			saveToLocalStorage();
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'AI生成に失敗しました';
			errorMessage.set(msg);
			addChatMessage('assistant', `エラー: ${msg}`);
		} finally {
			isLoadingAi.set(false);
		}
	}

	// Proceed to next phase
	function handleProceedToNext() {
		const phase = get(currentPhase);

		if (phase === 'major') {
			currentPhase.set('medium');
			selectedParentTask.set(null);
			addChatMessage(
				'assistant',
				'大分類が確定しました。左側から大分類タスクを選択して中分類を生成できます。中分類が不要な場合は、そのまま次のフェーズへ進むこともできます。'
			);
		} else if (phase === 'medium') {
			currentPhase.set('minor');
			selectedParentTask.set(null);
			addChatMessage(
				'assistant',
				'中分類が確定しました。左側から中分類タスクを選択して小分類を生成できます。小分類が不要な場合は、そのまま次のフェーズへ進むこともできます。'
			);
		} else if (phase === 'minor') {
			currentPhase.set('confirm');
			addChatMessage(
				'assistant',
				'すべての分類が完了しました。最終確認を行ってください。必要に応じて、後から詳細タスクを追加することもできます。'
			);
		}

		saveToLocalStorage();
	}

	// Go back to previous phase
	function handleGoBack() {
		const phase = get(currentPhase);

		if (phase === 'medium') {
			currentPhase.set('major');
		} else if (phase === 'minor') {
			currentPhase.set('medium');
		} else if (phase === 'confirm') {
			currentPhase.set('minor');
		}

		saveToLocalStorage();
	}

	function getSelectedMembers(details: ProjectDetails) {
		const selectedIds = new Set(
			(details.teamMembers || []).map((id) => Number(id)).filter((id) => Number.isFinite(id))
		);
		if (selectedIds.size === 0) {
			return members;
		}
		return members.filter((member) => selectedIds.has(Number(member.id)));
	}

	function resolveAssigneeUserId(
		assignee: unknown,
		targetMembers: Array<{ id: number; username: string; fullName: string }>
	): number | null {
		if (typeof assignee === 'number' && Number.isFinite(assignee)) {
			return targetMembers.some((member) => member.id === assignee) ? assignee : null;
		}

		if (typeof assignee === 'string') {
			const normalized = assignee.trim().toLowerCase();
			if (!normalized) {
				return null;
			}

			if (/^\d+$/.test(normalized)) {
				const parsed = Number(normalized);
				return targetMembers.some((member) => member.id === parsed) ? parsed : null;
			}

			const matched = targetMembers.find((member) => {
				return (
					(member.fullName || '').trim().toLowerCase() === normalized ||
					(member.username || '').trim().toLowerCase() === normalized
				);
			});
			return matched ? matched.id : null;
		}

		return null;
	}

	function flattenBuilderTasks(tasks: WbsBuilderTask[]): WbsBuilderTask[] {
		const result: WbsBuilderTask[] = [];
		for (const task of tasks) {
			result.push(task);
			if (task.children && task.children.length > 0) {
				result.push(...flattenBuilderTasks(task.children));
			}
		}
		return result;
	}

	function needsDetailGeneration(
		tasks: WbsBuilderTask[],
		targetMembers: Array<{ id: number; username: string; fullName: string }>
	): boolean {
		const leaves = flattenBuilderTasks(tasks).filter((task) => !task.children || task.children.length === 0);
		if (leaves.length === 0) {
			return false;
		}

		return leaves.some((task) => {
			const resolvedAssignee = resolveAssigneeUserId(task.assignedTo as unknown, targetMembers);
			return resolvedAssignee === null || !task.startDate || !task.endDate;
		});
	}

	async function buildDetailedWbsFromAi() {
		const wbs = get(currentWbs);
		const details = get(projectDetails);
		const selectedMembers = getSelectedMembers(details);
		if ((details.teamMembers || []).length > 0 && selectedMembers.length === 0) {
			throw new Error('選択されたチームメンバー情報を取得できませんでした。再読み込みしてください。');
		}

		const teamMembersWithDetails = selectedMembers.map((member) => ({
			id: member.id,
			fullName: member.fullName,
			role: member.role || undefined,
			skills: member.skills || []
		}));

		const payload = {
			projectDetails: {
				projectName: details.projectName,
				goal: details.goal,
				startDate: details.startDate,
				endDate: details.endDate,
				constraints: details.constraints || ''
			},
			wbs: wbs,
			teamMembers: teamMembersWithDetails
		};

		const response = await apiClient.finalizeWbsBuilder(payload);
		if (!response.success || !response.data || !response.data.tasks) {
			throw new Error('詳細情報の生成に失敗しました');
		}

		const generatedTasks = response.data.tasks;
		const aiComment = response.data.aiComment || '';

		const mapTasks = (
			aiTasks: any[],
			defaultLevel: 'major' | 'medium' | 'minor' = 'major'
		): WbsBuilderTask[] => {
			return aiTasks.map((t) => {
				let level: 'major' | 'medium' | 'minor' = t.level || defaultLevel;
				const nextLevel = level === 'major' ? 'medium' : 'minor';
				const resolvedAssignee = resolveAssigneeUserId(
					t.assignee ?? t.assignedTo,
					selectedMembers
				);

				return {
					id: t.id,
					name: t.name,
					description: t.description || '',
					effortDays: t.effortDays || 0,
					startDate: t.startDate || '',
					endDate: t.endDate || '',
					assignedTo: resolvedAssignee ?? undefined,
					priority: t.priority,
					status: t.status,
					deliverable: t.deliverable,
					level: level,
					children: t.children ? mapTasks(t.children, nextLevel) : []
				};
			});
		};

		return {
			tasks: mapTasks(generatedTasks),
			aiComment,
			selectedMembers
		};
	}

	// Create project with WBS
	async function handleCreateProject() {
		try {
			isLoadingAi.set(true);
			errorMessage.set('');

			const details = get(projectDetails);
			const selectedMembers = getSelectedMembers(details);

			// First create the project
			const payload = {
				projectName: details.projectName,
				description: details.description,
				startDate: details.startDate,
				endDate: details.endDate,
				status: 'planning',
				createdBy: 1, // TODO: Use actual user ID
				mainDeliverable: '',
				milestone: '',
				teamMembers: details.teamMembers
			};

			const response = await apiClient.createProject(payload);
			const projectId = response.data.id;

			if (!projectId) {
				throw new Error('プロジェクトIDの取得に失敗しました');
			}

			// Then create WBS tasks
			let wbs = get(currentWbs);

			// 未詳細のまま保存されることを防ぐため、必要ならここで詳細生成を自動実行する
			if (needsDetailGeneration(wbs, selectedMembers)) {
				const detailed = await buildDetailedWbsFromAi();
				wbs = detailed.tasks;
				replaceTaskChildren(null, wbs);
				addChatMessage(
					'assistant',
					detailed.aiComment ||
						'保存前に担当者と日程を自動補完しました。内容を反映してプロジェクトを作成します。'
				);
				saveToLocalStorage();
			}

			await createWbsTasks(projectId, wbs, null, selectedMembers);

			// Clear localStorage
			clearLocalStorage();
			resetWbsBuilder();

			// Redirect to WBS page
			goto(`/projects/${projectId}/wbs`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'プロジェクトの作成に失敗しました';
			errorMessage.set(msg);
			alert(msg);
		} finally {
			isLoadingAi.set(false);
		}
	}

	// Recursively create WBS tasks
	async function createWbsTasks(
		projectId: number,
		tasks: WbsBuilderTask[],
		parentTaskId: number | null,
		targetMembers: Array<{ id: number; username: string; fullName: string }>
	) {
		for (const task of tasks) {
			try {
				// ステータスをAPIが受け付ける形式に変換
				let status = 'todo';
				if (task.status === 'not-started') {
					status = 'todo';
				} else if (task.status) {
					status = task.status;
				}

				const assigneeUserId = resolveAssigneeUserId(task.assignedTo as unknown, targetMembers);

				const taskPayload: Record<string, any> = {
					title: task.name,
					description: task.description || '', // 説明を追加
					projectId,
					estimatedMinutes: (task.effortDays || 0) * 480, // Convert days to minutes (8 hours/day)
					priority: task.priority || 'medium', // Use generated priority or default
					status: status, // ステータスを追加
					deliverable: task.deliverable || '', // 成果物を追加
					parentTaskId: parentTaskId || undefined,
					startDate: task.startDate || undefined,
					endDate: task.endDate || undefined
				};
				if (assigneeUserId !== null) {
					taskPayload.assigneeUserId = assigneeUserId;
				}

				const taskResponse = await apiClient.createTask(taskPayload as any);
				const newTaskId = taskResponse.data?.id;

				// Create children recursively
				if (task.children && task.children.length > 0 && newTaskId) {
					await createWbsTasks(projectId, task.children, newTaskId, targetMembers);
				}
			} catch (e) {
				console.error(`Failed to create task: ${task.name}`, e);
			}
		}
	}

	// Track which parents have been auto-generated
	let autoGeneratedParents = new Set<string>();

	// Generate full details for all tasks (Final Phase)
	async function generateFullDetails() {
		try {
			isLoadingAi.set(true);
			errorMessage.set('');
			const detailed = await buildDetailedWbsFromAi();
			replaceTaskChildren(null, detailed.tasks);

			addChatMessage(
				'assistant',
				detailed.aiComment ||
					'詳細情報（担当者・日程・優先度・成果物）を自動生成しました。内容を確認してください。'
			);
			saveToLocalStorage();
		} catch (e) {
			const msg = e instanceof Error ? e.message : '詳細情報の生成に失敗しました';
			errorMessage.set(msg);
			addChatMessage('assistant', `エラー: ${msg}`);
		} finally {
			isLoadingAi.set(false);
		}
	}

	// Watch for parent task selection to trigger generation
	$: if ($currentPhase === 'medium' || $currentPhase === 'minor') {
		if ($selectedParentTask && !autoGeneratedParents.has($selectedParentTask)) {
			const parentTask = findTaskById($currentWbs, $selectedParentTask);
			if (parentTask && (!parentTask.children || parentTask.children.length === 0)) {
				// Mark as generated to prevent multiple calls
				autoGeneratedParents.add($selectedParentTask);
				// Auto-generate children if parent has no children
				generateChildTasks();
			}
		}
	}
</script>

<div class="wbs-builder-page">
	<div class="page-header-wrapper">
		<header class="page-header">
			<div class="header-content">
				<h1>
					<i class="bi bi-diagram-3"></i>
					段階的WBS構築
				</h1>
				<p>AI対話型WBS作成</p>
			</div>
		</header>
	</div>

	<div class="wbs-toolbar">
		<div class="header-content">
			<button class="back-btn" on:click={() => goto('/projects/new')}>
				<i class="bi bi-arrow-left"></i>
			</button>
			<div class="toolbar-title">
				<h1>段階的WBS構築</h1>
				<p>AIと対話しながら、段階的にプロジェクトのWBSを構築します</p>
			</div>
		</div>

		<div class="toolbar-actions">
			{#if $currentPhase !== 'input' && $currentPhase !== 'confirm'}
				<button class="action-btn secondary" on:click={handleGoBack}>
					<i class="bi bi-arrow-left-circle"></i>
					前のフェーズへ
				</button>
			{/if}

			{#if $currentPhase === 'confirm'}
				<button class="action-btn secondary" on:click={generateFullDetails} disabled={$isLoadingAi}>
					<i class="bi bi-magic"></i>
					詳細を自動生成
				</button>
				<button class="action-btn primary" on:click={handleCreateProject} disabled={$isLoadingAi}>
					<i class="bi bi-check-circle"></i>
					この内容でプロジェクトを作成
				</button>
			{:else if $currentPhase !== 'input'}
				<button
					class="action-btn primary"
					on:click={handleProceedToNext}
					disabled={!$canProceedToNextPhase}
				>
					<i class="bi bi-arrow-right-circle"></i>
					次のフェーズへ
				</button>
			{/if}
		</div>
	</div>

	{#if $errorMessage}
		<div class="error-banner">
			<i class="bi bi-exclamation-triangle"></i>
			{$errorMessage}
			<button class="close-error" on:click={() => errorMessage.set('')}>
				<i class="bi bi-x"></i>
			</button>
		</div>
	{/if}

	<div class="main-content">
		<aside class="left-pane">
			<PhaseNavigator />
		</aside>

		<main class="center-pane">
			<WbsEditArea isLoading={$isLoadingAi} />
		</main>

		<aside class="right-pane">
			<AiAssistantChat on:sendMessage={handleAiMessage} />
		</aside>
	</div>

	<ProjectInfoModal
		bind:isOpen={showProjectInfoModal}
		{members}
		on:submit={handleProjectInfoSubmit}
		on:cancel={() => goto('/projects/new')}
	/>
</div>

<style>
	.wbs-builder-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #f9fafb;
	}

	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
		flex-shrink: 0;
	}

	.wbs-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px 32px;
		background: #ffffff;
		border-bottom: 1px solid #e5e7eb;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		flex-shrink: 0;
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #ffffff;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.back-btn:hover {
		background: #f9fafb;
		border-color: #d1d5db;
		color: #111827;
	}

	.wbs-toolbar h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		color: #111827;
	}

	.wbs-toolbar p {
		margin: 4px 0 0;
		font-size: 13px;
		color: #6b7280;
	}

	.toolbar-actions {
		display: flex;
		gap: 12px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.action-btn.primary {
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.action-btn.primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.action-btn.secondary {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		color: #374151;
	}

	.action-btn.secondary:hover {
		background: #f9fafb;
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 32px;
		background: #fee2e2;
		border-bottom: 1px solid #fca5a5;
		color: #dc2626;
		font-size: 14px;
	}

	.close-error {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: #dc2626;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	.close-error:hover {
		background: #fca5a5;
	}

	.main-content {
		flex: 1;
		display: grid;
		grid-template-columns: 280px 1fr 380px;
		overflow: hidden;
	}

	.left-pane,
	.center-pane,
	.right-pane {
		height: 100%;
		overflow: hidden;
	}

	@media (max-width: 1200px) {
		.main-content {
			grid-template-columns: 240px 1fr 320px;
		}
	}

	@media (max-width: 900px) {
		.main-content {
			grid-template-columns: 1fr;
		}

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

		/* Standard Header Content */
		.page-header .header-content {
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 4px;
			height: 100%;
		}

		.page-header h1 {
			display: flex;
			align-items: center;
			gap: 12px;
			margin: 0;
			color: #ffffff;
			font-size: 20px;
			font-weight: 700;
			line-height: 1.2;
		}

		.page-header p {
			margin: 0;
			font-size: 13px;
			font-weight: 500;
			color: rgba(255, 255, 255, 0.8);
			line-height: 1.4;
		}

		.toolbar-title {
			display: none;
		}

		.wbs-toolbar {
			padding: 12px 16px;
		}

		.left-pane,
		.right-pane {
			display: none;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.page-header {
			padding: 12px 16px;
		}

		.page-header h1 {
			font-size: 20px;
		}

		.page-header p {
			font-size: 13px;
		}

		.header-actions {
			gap: 8px;
		}

		.action-btn {
			padding: 12px 16px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
			width: 100%;
			justify-content: center;
		}

		.error-banner {
			padding: 12px 16px;
			font-size: 13px;
		}

		.close-error {
			width: 32px;
			height: 32px;
		}
	}
</style>
