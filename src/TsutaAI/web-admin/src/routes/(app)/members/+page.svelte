<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import MemberModal, { type MemberModalMode } from '$lib/components/members/MemberModal.svelte';
	import PromptModal, { type PromptModalMode } from '$lib/components/members/PromptModal.svelte';

	type MemberStats = {
		activeTasks: number;
		dueSoonTasks: number;
		completedThisWeek: number;
		loadScore: number;
		loadLabel: string;
		riskLevel: 'critical' | 'warning' | 'balanced';
	};

	type MemberPrompt = {
		id: number;
		promptName: string;
		responsibility: string;
		notes: string;
		createdAt: string;
	};

	type MemberTask = {
		id: number;
		name: string;
		projectName: string | null;
		status: string;
		priority: string;
		dueDate: string | null;
	};

	type Skill = {
		name: string;
		level: number;
	};

	type Member = {
		id: number;
		username: string;
		email: string;
		fullName: string;
		role: string;
		createdAt: string;
		updatedAt: string;
		stats: MemberStats;
		prompts: MemberPrompt[];
		tasks: MemberTask[];
		skills: Skill[];
	};

	let members: Member[] = [];
	let promptCatalog: Array<{ id: string; name: string; preview: string }> = [];
	let isLoading = true;
	let message = '';

	let showMemberModal = false;
	let memberModalMode: MemberModalMode = 'create';
	let editingMemberId: number | null = null;
	let draftMember = {
		username: '',
		fullName: '',
		email: '',
		role: 'member'
	};

	let showPromptModal = false;
	let promptModalMode: PromptModalMode = 'create';
	let promptTargetMemberId: number | null = null;
	let draftPrompt = {
		id: undefined as number | undefined,
		promptName: '',
		responsibility: '',
		notes: ''
	};

	let viewMode: 'list' | 'grid' = 'list';
	let expandedMemberIds = new Set<number>();
	let isSavingMember = false;
	let deletingMemberIds = new Set<number>();
	let isSavingPrompt = false;
	let deletingPromptKeys = new Set<string>();

	let selectedMemberId: number | 'all' = 'all';

	$: filteredMembers =
		selectedMemberId === 'all' ? members : members.filter((m) => m.id === selectedMemberId);

	function toggleExpand(memberId: number) {
		if (expandedMemberIds.has(memberId)) {
			expandedMemberIds.delete(memberId);
		} else {
			expandedMemberIds.add(memberId);
		}
		expandedMemberIds = new Set(expandedMemberIds); // Trigger reactivity
	}

	onMount(async () => {
		await loadMembers();
		await loadPromptCatalog();
	});

	function ensureArray<T>(value: unknown): T[] {
		return Array.isArray(value) ? value : [];
	}

	function normalizeMember(member: any): Member {
		const safeMember = member && typeof member === 'object' ? member : {};
		const rawStats = member?.stats ?? {};
		const riskLevel =
			rawStats.riskLevel === 'critical' || rawStats.riskLevel === 'warning'
				? rawStats.riskLevel
				: 'balanced';

		return {
			...safeMember,
			stats: {
				activeTasks: Number(rawStats.activeTasks ?? 0),
				dueSoonTasks: Number(rawStats.dueSoonTasks ?? 0),
				completedThisWeek: Number(rawStats.completedThisWeek ?? 0),
				loadScore: Number(rawStats.loadScore ?? 0),
				loadLabel: String(rawStats.loadLabel ?? '未設定'),
				riskLevel
			},
			prompts: ensureArray<any>(member?.prompts),
			tasks: ensureArray<any>(member?.tasks),
			skills: ensureArray<any>(member?.skills).map((s) => ({
				name: String(s.skillName ?? s.name ?? ''),
				level: Number(s.skillLevel ?? s.level ?? 0)
			}))
		};
	}

	async function loadMembers() {
		try {
			isLoading = true;
			const response = await apiClient.fetchUsers();
			members = ensureArray<any>(response.data)
				.filter((item) => item && typeof item === 'object')
				.map(normalizeMember);

			if (selectedMemberId !== 'all' && !members.some((member) => member.id === selectedMemberId)) {
				selectedMemberId = 'all';
			}

			message = '';
		} catch (error) {
			message = error instanceof Error ? error.message : 'メンバー情報の取得に失敗しました。';
		} finally {
			isLoading = false;
		}
	}

	async function loadPromptCatalog() {
		try {
			const response = await apiClient.fetchPromptCatalog();
			promptCatalog = response.data ?? [];
		} catch (error) {
			console.warn('プロンプトカタログの取得に失敗しました', error);
			promptCatalog = [];
		}
	}

	function openMemberModal(mode: MemberModalMode, member?: Member) {
		memberModalMode = mode;
		if (mode === 'edit' && member) {
			editingMemberId = member.id;
			draftMember = {
				username: member.username,
				fullName: member.fullName,
				email: member.email,
				role: member.role
			};
		} else {
			draftMember = {
				username: '',
				fullName: '',
				email: '',
				role: 'member'
			};
			editingMemberId = null;
		}
		showMemberModal = true;
	}

	async function handleMemberSave(event: CustomEvent<Record<string, any>>) {
		if (isSavingMember) {
			return;
		}
		isSavingMember = true;

		const payload = event.detail;
		const { skills, ...memberData } = payload;

		try {
			let targetUserId: number;

			if (memberModalMode === 'create') {
				const result = await apiClient.createUser(memberData as any);
				targetUserId = result.data.id;
				message = 'メンバーを追加しました。';
			} else {
				if (editingMemberId == null) {
					throw new Error('対象メンバーが見つかりません。');
				}
				await apiClient.updateUser(editingMemberId, {
					email: memberData.email,
					fullName: memberData.fullName,
					role: memberData.role
				});
				targetUserId = editingMemberId;
				message = 'メンバー情報を更新しました。';
			}

			// スキルを保存
			if (skills && Array.isArray(skills)) {
				await apiClient.put(`/user-skills/${targetUserId}`, { skills });
			}

			await loadMembers();
		} catch (error) {
			message = error instanceof Error ? error.message : 'メンバーの保存に失敗しました。';
		} finally {
			isSavingMember = false;
			showMemberModal = false;
			editingMemberId = null;
		}
	}

	async function handleDeleteMember(member: Member) {
		if (deletingMemberIds.has(member.id)) {
			return;
		}
		if (!confirm(`${member.fullName} を削除しますか？`)) {
			return;
		}
		deletingMemberIds.add(member.id);
		deletingMemberIds = new Set(deletingMemberIds);
		try {
			await apiClient.deleteUser(member.id);
			message = 'メンバーを削除しました。';
			await loadMembers();
		} catch (error) {
			message = error instanceof Error ? error.message : 'メンバーの削除に失敗しました。';
		} finally {
			deletingMemberIds.delete(member.id);
			deletingMemberIds = new Set(deletingMemberIds);
		}
	}

	function openPromptModal(mode: PromptModalMode, member: Member, prompt?: MemberPrompt) {
		if (mode === 'create' && promptCatalog.length === 0) {
			message = '割り当て可能なプロンプトが登録されていません。';
			return;
		}
		promptModalMode = mode;
		promptTargetMemberId = member.id;
		if (mode === 'edit' && prompt) {
			draftPrompt = {
				id: prompt.id,
				promptName: prompt.promptName,
				responsibility: prompt.responsibility,
				notes: prompt.notes
			};
		} else {
			draftPrompt = {
				id: undefined,
				promptName: promptCatalog[0]?.name ?? '',
				responsibility: '',
				notes: ''
			};
		}
		showPromptModal = true;
	}

	async function handlePromptSave(
		event: CustomEvent<{ id?: number; promptName: string; responsibility: string; notes: string }>
	) {
		if (isSavingPrompt) {
			return;
		}
		if (promptTargetMemberId == null) {
			return;
		}
		isSavingPrompt = true;
		const payload = event.detail;
		try {
			if (promptModalMode === 'create') {
				await apiClient.addUserPrompt(promptTargetMemberId, {
					promptName: payload.promptName,
					responsibility: payload.responsibility,
					notes: payload.notes
				});
				message = 'プロンプトを割り当てました。';
			} else if (payload.id != null) {
				await apiClient.updateUserPrompt(promptTargetMemberId, payload.id, {
					responsibility: payload.responsibility,
					notes: payload.notes
				});
				message = 'プロンプト情報を更新しました。';
			}
			await loadMembers();
		} catch (error) {
			message = error instanceof Error ? error.message : 'プロンプトの更新に失敗しました。';
		} finally {
			isSavingPrompt = false;
			showPromptModal = false;
			promptTargetMemberId = null;
		}
	}

	async function handlePromptDelete(member: Member, prompt: MemberPrompt) {
		const deleteKey = `${member.id}:${prompt.id}`;
		if (deletingPromptKeys.has(deleteKey)) {
			return;
		}
		if (!confirm(`「${prompt.promptName}」の担当割り当てを削除しますか？`)) {
			return;
		}
		deletingPromptKeys.add(deleteKey);
		deletingPromptKeys = new Set(deletingPromptKeys);
		try {
			await apiClient.deleteUserPrompt(member.id, prompt.id);
			message = '担当プロンプトを削除しました。';
			await loadMembers();
		} catch (error) {
			message = error instanceof Error ? error.message : '担当プロンプトの削除に失敗しました。';
		} finally {
			deletingPromptKeys.delete(deleteKey);
			deletingPromptKeys = new Set(deletingPromptKeys);
		}
	}

	function getRiskClass(riskLevel: string) {
		if (riskLevel === 'critical') return 'critical';
		if (riskLevel === 'warning') return 'warning';
		return 'balanced';
	}

	function formatDate(value: string | null) {
		if (!value) return '未設定';
		return new Date(value).toLocaleDateString();
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-people"></i>
				メンバー管理
			</h1>
			<p>体制・稼働状況</p>
		</div>
	</header>
</div>

<section class="members-page">
	<div class="page-actions">
		<div class="actions-left">
			<div class="view-toggle">
				<button
					class="toggle-btn {viewMode === 'list' ? 'active' : ''}"
					on:click={() => (viewMode = 'list')}
					aria-label="リスト表示"
				>
					<i class="bi bi-list-ul"></i>
				</button>
				<button
					class="toggle-btn {viewMode === 'grid' ? 'active' : ''}"
					on:click={() => (viewMode = 'grid')}
					aria-label="グリッド表示"
				>
					<i class="bi bi-grid-fill"></i>
				</button>
			</div>

			<div class="filter-box">
				<i class="bi bi-funnel-fill filter-icon"></i>
				<select bind:value={selectedMemberId} class="member-select">
					<option value="all">全てのメンバー ({members.length})</option>
					{#each members as member}
						<option value={member.id}>{member.fullName}</option>
					{/each}
				</select>
			</div>
		</div>

		<button class="btn primary" on:click={() => openMemberModal('create')}>
			<i class="bi bi-person-plus"></i>
			メンバーを追加
		</button>
	</div>

	{#if message}
		<div class="flash">{message}</div>
	{/if}

	{#if isLoading}
		<p class="state">読み込み中です…</p>
	{:else if members.length === 0}
		<p class="state">メンバーが登録されていません。追加ボタンから登録してください。</p>
	{:else}
		<div class="members-container">
			{#if viewMode === 'list'}
				<div class="list-view">
					<table class="member-table">
						<thead>
							<tr>
								<th style="width: 40px;"></th>
								<th>メンバー</th>
								<th>役割</th>
								<th>稼働状況</th>
								<th>タスク状況</th>
								<th>操作</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredMembers as member (member.id)}
								<tr
									class="member-row {expandedMemberIds.has(member.id) ? 'expanded' : ''}"
									on:click={() => toggleExpand(member.id)}
								>
									<td class="expand-cell">
										<i
											class="bi bi-chevron-right expand-icon {expandedMemberIds.has(member.id)
												? 'rotated'
												: ''}"
										></i>
									</td>
									<td data-label="メンバー">
										<div class="member-info">
											<div class="member-name">{member.fullName}</div>
											<div class="member-meta">@{member.username}</div>
										</div>
									</td>
									<td data-label="役割">
										<span class={`role-pill ${member.role}`}>{member.role}</span>
									</td>
									<td data-label="稼働状況">
										<div class="load-score">
											<span class={`risk-dot ${getRiskClass(member.stats.riskLevel)}`}></span>
											<span>{member.stats.loadScore}</span>
											<small class="load-label">({member.stats.loadLabel})</small>
										</div>
									</td>
									<td data-label="タスク状況">
										<div class="task-summary">
											<span title="稼働中">{member.stats.activeTasks} 件</span>
											{#if member.stats.dueSoonTasks > 0}
												<span class="due-warning" title="期限間近">
													<i class="bi bi-exclamation-circle-fill"></i>
													{member.stats.dueSoonTasks}
												</span>
											{/if}
										</div>
									</td>
									<td class="actions-cell" data-label="操作">
										<button
											class="icon-btn small"
											on:click|stopPropagation={() => openMemberModal('edit', member)}
											title="編集"
										>
											<i class="bi bi-pencil"></i>
										</button>
										<a
											href="/members/{member.id}/growth"
											class="icon-btn small"
											on:click|stopPropagation
											title="成長レポート"
										>
											<i class="bi bi-graph-up"></i>
										</a>
									</td>
								</tr>
								{#if expandedMemberIds.has(member.id)}
									<tr class="detail-row">
										<td colspan="6">
											<div class="detail-container">
												<section class="detail-section">
													<h4><i class="bi bi-stars"></i> 保有スキル</h4>
													<div class="skills-grid compact">
														{#each member.skills as skill}
															<div class="skill-pill">
																<span>{skill.name}</span>
																<span class="level">{skill.level}</span>
															</div>
														{/each}
														{#if member.skills.length === 0}
															<span class="text-muted">スキルなし</span>
														{/if}
													</div>
												</section>

												<section class="detail-section">
													<h4><i class="bi bi-chat-square-text"></i> 担当プロンプト</h4>
													<ul class="prompt-list compact">
														{#each member.prompts as prompt}
															<li>
																<span class="prompt-name">{prompt.promptName}</span>
																{#if prompt.responsibility}<span class="prompt-tag"
																		>{prompt.responsibility}</span
																	>{/if}
															</li>
														{/each}
														{#if member.prompts.length === 0}
															<span class="text-muted">担当なし</span>
														{/if}
													</ul>
													<button
														class="btn text-only"
														on:click|stopPropagation={() => openPromptModal('create', member)}
													>
														+ 割り当て
													</button>
												</section>

												<section class="detail-section">
													<h4><i class="bi bi-list-check"></i> タスク詳細</h4>
													<div class="tasks-preview">
														{#if member.tasks.length > 0}
															<ul>
																{#each member.tasks.slice(0, 3) as task}
																	<li>
																		<span class={`status-dot ${task.status}`}></span>
																		{task.name}
																		<span class="due-date">{formatDate(task.dueDate)}</span>
																	</li>
																{/each}
																{#if member.tasks.length > 3}
																	<li class="more">他 {member.tasks.length - 3} 件...</li>
																{/if}
															</ul>
														{:else}
															<span class="text-muted">担当タスクなし</span>
														{/if}
													</div>
												</section>
											</div>
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="member-grid">
					{#each filteredMembers as member (member.id)}
						<article class="member-card">
							<div class="card-header">
								<div>
									<h2>{member.fullName}</h2>
									<div class="meta">
										<span class="username">@{member.username}</span>
										<span class={`role-pill ${member.role}`}>{member.role}</span>
										<span class="email">{member.email}</span>
									</div>
								</div>
								<div class="actions">
									<a href="/members/{member.id}/growth" class="btn ghost">
										<i class="bi bi-graph-up"></i>成長レポート
									</a>
									<button class="btn ghost" on:click={() => openMemberModal('edit', member)}>
										<i class="bi bi-pencil"></i>編集
									</button>
									<button class="btn danger" on:click={() => handleDeleteMember(member)}>
										<i class="bi bi-trash"></i>削除
									</button>
								</div>
							</div>

							<div class="stats-grid">
								<div class={`stat-card load ${getRiskClass(member.stats.riskLevel)}`}>
									<span class="label">稼働スコア</span>
									<strong>{member.stats.loadScore}</strong>
									<small>{member.stats.loadLabel}</small>
								</div>
								<div class="stat-card">
									<span class="label">稼働中タスク</span>
									<strong>{member.stats.activeTasks}</strong>
								</div>
								<div class="stat-card">
									<span class="label">今週期限</span>
									<strong>{member.stats.dueSoonTasks}</strong>
								</div>
								<div class="stat-card">
									<span class="label">今週完了</span>
									<strong>{member.stats.completedThisWeek}</strong>
								</div>
							</div>

							<section class="skills-section">
								<div class="section-header">
									<h3>保有スキル</h3>
								</div>
								{#if member.skills.length === 0}
									<p class="empty">スキルが登録されていません。</p>
								{:else}
									<div class="skills-grid">
										{#each member.skills as skill}
											<div class="skill-badge">
												<span class="skill-name">{skill.name}</span>
												<div class="skill-level-bar">
													<div class="skill-level-fill" style="width: {skill.level * 10}%"></div>
												</div>
												<span class="skill-level-text">{skill.level} / 10</span>
											</div>
										{/each}
									</div>
								{/if}
							</section>

							<section class="prompts-section">
								<div class="section-header">
									<h3>担当プロンプト</h3>
									<button class="btn small" on:click={() => openPromptModal('create', member)}>
										<i class="bi bi-plus-lg"></i>割り当て
									</button>
								</div>
								{#if member.prompts.length === 0}
									<p class="empty">担当プロンプトは未設定です。</p>
								{:else}
									<ul class="prompt-list">
										{#each member.prompts as prompt}
											<li>
												<div class="prompt-body">
													<div class="prompt-title">
														<span class="prompt-name">{prompt.promptName}</span>
														{#if prompt.responsibility}
															<span class="prompt-tag">{prompt.responsibility}</span>
														{/if}
													</div>
													{#if prompt.notes}
														<p class="prompt-notes">{prompt.notes}</p>
													{/if}
												</div>
												<div class="prompt-actions">
													<button
														class="icon-btn"
														aria-label="担当プロンプトを編集"
														on:click={() => openPromptModal('edit', member, prompt)}
													>
														<i class="bi bi-pencil"></i>
													</button>
													<button
														class="icon-btn danger"
														aria-label="担当プロンプトを削除"
														on:click={() => handlePromptDelete(member, prompt)}
													>
														<i class="bi bi-x-lg"></i>
													</button>
												</div>
											</li>
										{/each}
									</ul>
								{/if}
							</section>

							<section class="tasks-section">
								<div class="section-header">
									<h3>担当タスク</h3>
								</div>
								{#if member.tasks.length === 0}
									<p class="empty">担当タスクはありません。</p>
								{:else}
									<div class="table-wrapper">
										<table>
											<thead>
												<tr>
													<th>タスク名</th>
													<th>プロジェクト</th>
													<th>ステータス</th>
													<th>優先度</th>
													<th>期限</th>
												</tr>
											</thead>
											<tbody>
												{#each member.tasks as task}
													<tr>
														<td data-label="タスク名">{task.name}</td>
														<td data-label="プロジェクト">{task.projectName ?? '未割り当て'}</td>
														<td data-label="ステータス">{task.status}</td>
														<td data-label="優先度">{task.priority}</td>
														<td data-label="期限">{formatDate(task.dueDate)}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}
							</section>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</section>

{#if showMemberModal}
	<MemberModal
		mode={memberModalMode}
		member={draftMember}
		userId={editingMemberId}
		on:cancel={() => (showMemberModal = false)}
		on:save={handleMemberSave}
	/>
{/if}

{#if showPromptModal && promptTargetMemberId !== null}
	<PromptModal
		mode={promptModalMode}
		catalog={promptCatalog}
		assignment={draftPrompt}
		on:cancel={() => {
			showPromptModal = false;
			promptTargetMemberId = null;
		}}
		on:save={handlePromptSave}
	/>
{/if}

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.members-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #f9fafb;
		flex: 1;
		overflow: hidden;
		padding: 24px;
		box-sizing: border-box;
	}

	.members-container {
		flex: 1;
		overflow-y: auto;
		/* Custom Scrollbar for premium feel */
		scrollbar-width: thin;
		scrollbar-color: #cbd5e1 transparent;
		padding-bottom: 24px;
	}

	.members-container::-webkit-scrollbar {
		width: 6px;
	}
	.members-container::-webkit-scrollbar-track {
		background: transparent;
	}
	.members-container::-webkit-scrollbar-thumb {
		background-color: #cbd5e1;
		border-radius: 20px;
	}

	.page-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 24px;
		gap: 16px;
		flex-wrap: wrap;
	}

	@media (max-width: 640px) {
		.page-actions {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}

		.actions-left {
			flex-direction: column;
			width: 100%;
			align-items: stretch;
		}

		.view-toggle {
			width: 100%;
			justify-content: center;
		}

		.view-toggle .toggle-btn {
			flex: 1;
		}

		.filter-box {
			max-width: none;
			width: 100%;
		}

		.btn.primary {
			width: 100%;
			justify-content: center;
		}
	}

	.actions-left {
		display: flex;
		align-items: center;
		gap: 16px;
		flex: 1;
		min-width: 0; /* flexbox fix */
	}

	.view-toggle {
		display: flex;
		background: #e5e7eb;
		padding: 4px;
		border-radius: 12px;
		gap: 4px;
		flex-shrink: 0;
	}

	.filter-box {
		position: relative;
		display: flex;
		align-items: center;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 0 12px;
		height: 44px;
		flex: 1;
		max-width: 300px;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}

	.filter-box:focus-within {
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.filter-icon {
		color: #9ca3af;
		margin-right: 8px;
		font-size: 14px;
	}

	.member-select {
		border: none;
		outline: none;
		background: transparent;
		font-size: 14px;
		color: #374151;
		width: 100%;
		cursor: pointer;
		padding: 10px 0;
	}

	.toggle-btn {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: #6b7280;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s;
	}

	.toggle-btn:hover {
		color: #374151;
	}

	.toggle-btn.active {
		background: #ffffff;
		color: #3b82f6;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
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
			height: 100%; /* Ensure full height for centering if needed */
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

		.members-page {
			padding: 16px;
		}
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.btn.primary {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		color: #ffffff;
	}

	.btn.ghost {
		background: #f3f4f6;
		border-color: #d1d5db;
		color: #374151;
	}

	.btn.danger {
		background: #fee2e2;
		color: #dc2626;
		border-color: #fecaca;
	}

	.btn.small {
		padding: 8px 14px;
		font-size: 13px;
		background: #dbeafe;
		color: #1e40af;
		border-color: #93c5fd;
	}

	.flash {
		padding: 12px 16px;
		border-radius: 12px;
		background: #dbeafe;
		border: 1px solid #93c5fd;
		color: #1e40af;
	}

	.state,
	.empty {
		padding: 18px;
		border-radius: 16px;
		background: #f9fafb;
		color: #6b7280;
		text-align: center;
	}

	.member-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 24px;
	}

	.member-card {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 22px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		gap: 16px;
	}

	.card-header h2 {
		margin: 0;
		font-size: 20px;
		color: #111827;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 6px;
		font-size: 13px;
		color: #6b7280;
	}

	.username {
		color: #6b7280;
	}

	.email {
		color: #6b7280;
	}

	.role-pill {
		padding: 2px 10px;
		border-radius: 999px;
		font-size: 11px;
		text-transform: uppercase;
		background: #dbeafe;
		color: #1e40af;
	}

	.role-pill.admin {
		background: #fee2e2;
		color: #dc2626;
	}

	.role-pill.project_manager {
		background: #fef3c7;
		color: #d97706;
	}

	.actions {
		display: flex;
		gap: 10px;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 12px;
	}

	.stat-card {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 16px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.stat-card .label {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
	}

	.stat-card strong {
		font-size: 20px;
		color: #111827;
	}

	.stat-card.load.critical {
		border-color: #fca5a5;
		background: #fef2f2;
	}

	.stat-card.load.warning {
		border-color: #fcd34d;
		background: #fffbeb;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.skills-section,
	.prompts-section,
	.tasks-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.skills-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 10px;
	}

	.skill-badge {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
	}

	.skill-name {
		font-weight: 600;
		font-size: 13px;
		color: #111827;
	}

	.skill-level-bar {
		position: relative;
		height: 6px;
		background: #e5e7eb;
		border-radius: 3px;
		overflow: hidden;
	}

	.skill-level-fill {
		position: absolute;
		left: 0;
		top: 0;
		height: 100%;
		background: linear-gradient(90deg, #3b82f6, #8b5cf6);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.skill-level-text {
		font-size: 11px;
		color: #6b7280;
	}

	.prompt-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.prompt-list li {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		padding: 12px;
		border-radius: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
	}

	.prompt-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.prompt-title {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.prompt-name {
		font-weight: 600;
		color: #111827;
	}

	.prompt-tag {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 999px;
		background: #dbeafe;
		color: #1e40af;
	}

	.prompt-notes {
		margin: 0;
		font-size: 12px;
		color: #6b7280;
	}

	.prompt-actions {
		display: flex;
		gap: 8px;
	}

	.icon-btn {
		background: transparent;
		border: 1px solid #d1d5db;
		color: #6b7280;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.icon-btn:hover {
		border-color: #93c5fd;
		color: #3b82f6;
	}

	.icon-btn.danger {
		border-color: #fca5a5;
		color: #dc2626;
	}

	.table-wrapper {
		border-radius: 16px;
		border: 1px solid #e5e7eb;
		overflow: hidden;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: #ffffff;
	}

	th,
	td {
		padding: 10px 12px;
		border-bottom: 1px solid #f3f4f6;
		font-size: 13px;
		color: #374151;
		text-align: left;
	}

	th {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #6b7280;
		background: #f9fafb;
	}

	tr:last-child td {
		border-bottom: none;
	}

	@media (max-width: 900px) {
		.member-grid {
			grid-template-columns: 1fr;
		}
	}

	/* タブレット対応 */
	@media (max-width: 768px) {
		.page-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}

		.btn.primary {
			width: 100%;
			justify-content: center;
		}

		.card-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}

		.actions {
			width: 100%;
			flex-direction: column;
		}

		.actions .btn,
		.actions a {
			width: 100%;
			text-align: center;
			justify-content: center;
		}

		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.skills-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		/* テーブルをカード表示に切り替え */
		.table-wrapper table,
		.table-wrapper thead,
		.table-wrapper tbody,
		.table-wrapper tr {
			display: block;
		}

		.table-wrapper thead {
			display: none;
		}

		.table-wrapper tr {
			margin-bottom: 12px;
			border: 1px solid #e5e7eb;
			border-radius: 12px;
			padding: 12px;
			background: #ffffff;
		}

		.table-wrapper td {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 8px 0;
			border-bottom: 1px solid #f3f4f6;
		}

		.table-wrapper td:last-child {
			border-bottom: none;
		}

		.table-wrapper td::before {
			content: attr(data-label);
			font-weight: 600;
			color: #6b7280;
			margin-right: 12px;
			flex-shrink: 0;
		}

		/* Member Table Responsive Card View */
		.member-table,
		.member-table tbody,
		.member-table tr {
			display: block;
			width: 100%;
		}

		.member-table thead {
			display: none;
		}

		.member-table tr.member-row {
			margin-bottom: 12px;
			border: 1px solid #e5e7eb;
			border-radius: 16px;
			padding: 16px;
			background: #ffffff;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
			position: relative;
		}

		.member-table tr.member-row.expanded {
			border-radius: 16px 16px 0 0;
			margin-bottom: 0;
			border-bottom: none;
			background: #f8fafc;
		}

		.member-table td {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 8px 0;
			border-bottom: 1px solid #f3f4f6;
			text-align: right;
			font-size: 14px;
		}

		.member-table td:last-child {
			border-bottom: none;
		}

		.member-table td::before {
			content: attr(data-label);
			font-weight: 600;
			font-size: 11px;
			color: #6b7280;
			text-transform: uppercase;
			margin-right: 12px;
			text-align: left;
		}

		/* Hide expand cell in card view, user clicks whole card */
		.member-table td.expand-cell {
			display: none;
		}

		.member-info {
			align-items: flex-end;
			text-align: right;
		}

		.load-score {
			justify-content: flex-end;
		}

		.task-summary {
			justify-content: flex-end;
		}

		.actions-cell {
			justify-content: flex-end;
			padding-top: 12px;
			gap: 12px;
		}

		/* Detail Row in Card View */
		.member-table tr.detail-row {
			display: block;
			border: 1px solid #e5e7eb;
			border-top: none;
			border-radius: 0 0 16px 16px;
			margin-bottom: 16px;
			background: #f8fafc;
			padding: 0;
		}

		.member-table tr.detail-row td {
			display: block;
			width: 100%;
			padding: 0;
			border: none;
		}

		.detail-container {
			padding: 16px;
			padding-top: 8px;
			display: flex;
			flex-direction: column;
			gap: 20px;
			border: none;
			background: transparent;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		h1 {
			font-size: 22px;
		}

		.page-header p {
			font-size: 12px;
		}

		.member-card {
			padding: 18px;
			gap: 16px;
		}

		.card-header h2 {
			font-size: 18px;
		}

		.meta {
			font-size: 12px;
			gap: 8px;
		}

		.actions {
			gap: 8px;
		}

		.btn,
		.actions a {
			padding: 12px 16px;
			font-size: 14px;
			min-height: 44px; /* タッチターゲット確保 */
		}

		.stats-grid {
			grid-template-columns: 1fr;
		}

		.stat-card {
			padding: 12px;
		}

		.skills-grid {
			grid-template-columns: 1fr;
		}

		.prompt-list li {
			padding: 10px;
		}

		.prompt-actions {
			flex-direction: row;
		}

		.icon-btn {
			min-width: 36px;
			min-height: 36px;
		}

		.table-wrapper {
			border-radius: 12px;
		}

		.table-wrapper tr {
			padding: 10px;
		}

		.table-wrapper td {
			padding: 6px 0;
			font-size: 12px;
		}

		.table-wrapper td::before {
			font-size: 11px;
		}
	}

	/* List View Styles */
	.member-table {
		width: 100%;
		border-collapse: collapse;
		background: #ffffff;
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}

	.member-table th {
		background: #f9fafb;
		padding: 12px 16px;
		text-align: left;
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.member-row {
		border-bottom: 1px solid #f3f4f6;
		cursor: pointer;
		transition: background 0.1s;
	}

	.member-row:hover {
		background: #f9fafb;
	}

	.member-row.expanded {
		background: #f0f9ff;
		border-bottom: none;
	}

	.member-row td {
		padding: 16px;
		vertical-align: middle;
		color: #374151;
		font-size: 14px;
	}

	.expand-cell {
		text-align: center;
		color: #9ca3af;
	}

	.expand-icon {
		display: inline-block;
		transition: transform 0.2s;
	}

	.expand-icon.rotated {
		transform: rotate(90deg);
	}

	.member-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.member-name {
		font-weight: 600;
		color: #111827;
	}

	.member-meta {
		font-size: 12px;
		color: #6b7280;
	}

	.load-score {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		color: #111827;
	}

	.risk-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #10b981; /* Default balanced */
	}

	.risk-dot.critical {
		background: #ef4444;
	}

	.risk-dot.warning {
		background: #f59e0b;
	}

	.load-label {
		font-weight: 400;
		color: #6b7280;
		font-size: 12px;
	}

	.task-summary {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.due-warning {
		color: #ef4444;
		font-size: 12px;
		display: flex;
		align-items: center;
		gap: 4px;
		font-weight: 500;
	}

	.actions-cell {
		display: flex;
		gap: 8px;
	}

	/* Detail Row */
	.detail-row td {
		padding: 0;
		border-bottom: 1px solid #e5e7eb;
		background: #f8fafc;
	}

	.detail-container {
		padding: 24px;
		padding-left: 72px; /* Align with content */
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 32px;
	}

	.detail-section h4 {
		margin: 0 0 12px 0;
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.skills-grid.compact {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.skill-pill {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		padding: 2px 8px;
		border-radius: 12px;
		font-size: 11px;
		color: #475569;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.skill-pill .level {
		background: #e2e8f0;
		padding: 0 4px;
		border-radius: 4px;
		font-weight: 600;
		font-size: 10px;
	}

	.prompt-list.compact {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.prompt-list.compact li {
		font-size: 13px;
		color: #1e293b;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.btn.text-only {
		background: none;
		border: none;
		padding: 0;
		color: #3b82f6;
		font-size: 12px;
		margin-top: 8px;
		cursor: pointer;
		font-weight: 500;
	}

	.btn.text-only:hover {
		text-decoration: underline;
	}

	.text-muted {
		font-size: 12px;
		color: #94a3b8;
		font-style: italic;
	}

	.tasks-preview ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.tasks-preview li {
		font-size: 13px;
		color: #334155;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #cbd5e1;
	}

	.due-date {
		margin-left: auto;
		font-size: 11px;
		color: #94a3b8;
	}

	@media (max-width: 1024px) {
		.detail-container {
			grid-template-columns: 1fr;
			gap: 24px;
			padding-left: 24px;
		}
	}
</style>
