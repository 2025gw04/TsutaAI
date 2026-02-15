<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiClient } from '$lib/api/client';
	import { onMount } from 'svelte';

	// フォームフィールド
	let projectName = '';
	let description = '';
	let startDate = '';
	let endDate = '';
	let status = 'planning';
	let mainDeliverable = '';
	let milestone = '';
	let selectedTeamMembers: number[] = [];

	// メンバー情報
	let members: Array<{ id: number; username: string; fullName: string }> = [];

	// UI状態
	let isSubmitting = false;
	let isGenerating = false;
	let error = '';
	let projectGoal = '';
	let constraints = '';

	// AI生成結果で推奨されたメンバー情報
	let aiRecommendedMembers: Array<{
		member_id: number;
		member_name: string;
		role: string;
		reason: string;
	}> = [];

	/** メンバー一覧を取得 */
	onMount(async () => {
		try {
			const response = await apiClient.fetchUsers();
			members = response.data || [];
		} catch (e) {
			console.error('メンバー一覧の取得に失敗しました', e);
		}

		// すべてのフィールドは空欄のまま（AI自動生成ボタンで埋める）
	});

	/** 選択されたメンバーの説明テキストを生成 */
	function buildTeamStructureText(): string {
		if (selectedTeamMembers.length === 0) {
			return '';
		}
		return selectedTeamMembers
			.map((id) => {
				const member = members.find((m) => m.id === id);
				return member ? member.fullName || member.username : '';
			})
			.filter(Boolean)
			.join('、');
	}

	/** AIで全フィールドを包括的に生成（チームメンバーのスキル情報も含む） */
	async function handleAiGeneration() {
		try {
			isGenerating = true;
			error = '';

			// チームメンバーのスキル情報を取得
			const teamMembersWithSkills = await Promise.all(
				members.map(async (member) => {
					try {
						const skillsResponse = await apiClient.get<any[]>(`/user-skills/${member.id}`);
						const skills = Array.isArray(skillsResponse.data) ? skillsResponse.data : [];

						return {
							id: member.id,
							name: member.fullName || member.username,
							skills: skills.map((s: any) => ({
								name: s.skillName || s.skill_name || '',
								level: s.skillLevel || s.skill_level || 'beginner'
							})),
							role: '', // 役割は未設定
							experience_years: 0 // 経験年数は未設定
						};
					} catch (e) {
						console.warn(`スキル情報の取得に失敗: ${member.username}`, e);
						return {
							id: member.id,
							name: member.fullName || member.username,
							skills: [],
							role: '',
							experience_years: 0
						};
					}
				})
			);

			const teamStructureText = buildTeamStructureText() || '未選択';
			const payload = {
				project_name: projectName.trim() || '',
				project_goal: projectGoal.trim() || '',
				description: description.trim() || '',
				main_deliverable: mainDeliverable.trim() || '',
				milestone: milestone.trim() || '',
				team_structure: teamStructureText,
				constraints: constraints.trim() || '',
				team_members: teamMembersWithSkills
			};

			const response = (await apiClient.post<any>('/ai/generate-project-fields', payload)) as any;

			if (!response.success) {
				throw new Error(response.message || 'AI生成に失敗しました');
			}

			const result = response.data;

			// すべてのフィールドを更新（既に入力済みの項目も含む）
			projectName = result.project_name || projectName;
			projectGoal = result.project_goal || projectGoal;
			description = result.description || description;
			mainDeliverable = result.main_deliverable || mainDeliverable;
			milestone = result.milestone || milestone;
			startDate = result.start_date || startDate;
			endDate = result.end_date || endDate;

			// AIが推奨するメンバー情報を保存
			if (result.assigned_members && Array.isArray(result.assigned_members)) {
				aiRecommendedMembers = result.assigned_members;

				// 推奨されたメンバーを自動選択
				selectedTeamMembers = aiRecommendedMembers.map((m) => m.member_id);
			}

			alert(
				'✅ AIがすべての項目を生成しました！\n\n' +
					(aiRecommendedMembers.length > 0
						? `推奨メンバー: ${aiRecommendedMembers.map((m) => m.member_name).join('、')}`
						: '必要に応じて内容を修正してください。')
			);
		} catch (e) {
			error = e instanceof Error ? e.message : 'AI生成に失敗しました。';
		} finally {
			isGenerating = false;
		}
	}

	/** プロジェクトを作成する */
	async function handleSubmit() {
		// 必須フィールドのバリデーション
		if (!projectName.trim()) {
			error = 'プロジェクト名は必須です。AI自動生成ボタンを使用してください。';
			return;
		}
		if (!description.trim()) {
			error = 'プロジェクト説明は必須です。AI自動生成ボタンを使用してください。';
			return;
		}
		if (!startDate || !endDate) {
			error = '開始日と終了日は必須です。AI自動生成ボタンを使用してください。';
			return;
		}

		try {
			isSubmitting = true;
			error = '';

			const payload = {
				projectName: projectName.trim(),
				description: description.trim(),
				startDate,
				endDate,
				status,
				createdBy: 1, // TODO: 実際のログインユーザーIDを使用
				mainDeliverable: mainDeliverable.trim(),
				milestone: milestone.trim(),
				teamMembers: selectedTeamMembers
			};

			const response = await apiClient.createProject(payload);
			const projectId = response.data.id;

			// プロジェクト作成後、WBS画面に遷移
			goto(`/projects/${projectId}/wbs`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'プロジェクトの作成に失敗しました。';
		} finally {
			isSubmitting = false;
		}
	}

	function handleCancel() {
		goto('/projects');
	}

	/** フェーズごとに作成を開始 */
	function handlePhaseWiseCreation() {
		// 必須フィールドのバリデーション
		if (!projectName.trim()) {
			error = 'プロジェクト名を入力してください。';
			return;
		}
		if (!projectGoal.trim()) {
			error = 'プロジェクトの目的を入力してください。';
			return;
		}
		if (!startDate || !endDate) {
			error = '開始日と終了日を入力してください。';
			return;
		}

		// フォーム情報をsessionStorageに保存
		const projectInfo = {
			projectName: projectName.trim(),
			description: description.trim(),
			goal: projectGoal.trim(),
			startDate,
			endDate,
			constraints: constraints.trim(),
			teamMembers: selectedTeamMembers,
			mainDeliverable: mainDeliverable.trim(),
			milestone: milestone.trim()
		};

		// Save to sessionStorage
		if (typeof window !== 'undefined') {
			sessionStorage.setItem('wbsBuilderInitialProject', JSON.stringify(projectInfo));
		}

		// navigate to WBS builder
		goto('/projects/new/wbs-builder');
	}
</script>

<div class="page-header-wrapper">
	<header class="page-header">
		<div class="header-content">
			<h1>
				<i class="bi bi-folder-plus"></i>
				プロジェクト作成
			</h1>
			<p>AI自動生成で効率化</p>
		</div>
	</header>
</div>

<div class="page">
	{#if error}
		<div class="error-banner">
			<i class="bi bi-exclamation-circle"></i>
			{error}
		</div>
	{/if}

	<form on:submit|preventDefault={handleSubmit}>
		<div class="form-section">
			<h2>基本情報</h2>

			<div class="form-group">
				<label for="project-name">プロジェクト名</label>
				<input
					id="project-name"
					type="text"
					bind:value={projectName}
					placeholder="例: ECサイト新規構築プロジェクト"
				/>
				<p class="hint-text">AI自動生成ボタンで入力できます</p>
			</div>

			<div class="form-group">
				<label for="description">説明</label>
				<textarea
					id="description"
					bind:value={description}
					placeholder="プロジェクトの概要"
					rows="3"
				></textarea>
				<p class="hint-text">AI自動生成ボタンで入力できます</p>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="start-date">開始日</label>
					<input id="start-date" type="date" bind:value={startDate} />
					<p class="hint-text">AI自動生成ボタンで入力できます</p>
				</div>

				<div class="form-group">
					<label for="end-date">終了日</label>
					<input id="end-date" type="date" bind:value={endDate} />
					<p class="hint-text">
						AI自動生成ボタンで入力できます（プロジェクト規模に応じた適切な期間）
					</p>
				</div>
			</div>

			<div class="form-group">
				<label for="status">ステータス</label>
				<select id="status" bind:value={status}>
					<option value="planning">計画中</option>
					<option value="in-progress">進行中</option>
					<option value="on-hold">保留</option>
					<option value="completed">完了</option>
				</select>
			</div>
		</div>

		<div class="form-section">
			<h2>チーム</h2>

			{#if aiRecommendedMembers.length > 0}
				<div class="ai-recommendations">
					<h3>🤖 AI推奨メンバー</h3>
					<div class="recommended-members">
						{#each aiRecommendedMembers as rec}
							<div class="recommended-member">
								<div class="member-info">
									<strong>{rec.member_name}</strong>
									<span class="role-badge">{rec.role}</span>
								</div>
								<p class="reason">{rec.reason}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="form-group">
				<label>チームメンバー</label>
				<div class="members-list">
					{#each members as member (member.id)}
						<label class="checkbox-item">
							<input type="checkbox" value={member.id} bind:group={selectedTeamMembers} />
							<span>{member.fullName || member.username}</span>
						</label>
					{/each}
				</div>
				{#if selectedTeamMembers.length === 0 && aiRecommendedMembers.length === 0}
					<p class="hint">AI自動生成ボタンを使用すると、最適なメンバーを自動選択します</p>
				{/if}
			</div>
		</div>

		<div class="form-section">
			<h2>プロジェクト詳細</h2>

			<div class="form-group">
				<label for="main-deliverable">主要成果物</label>
				<input
					id="main-deliverable"
					type="text"
					bind:value={mainDeliverable}
					placeholder="例: 完全なECサイトシステム、ユーザーマニュアル"
				/>
				<p class="hint-text">AI自動生成ボタンで入力できます</p>
			</div>

			<div class="form-group">
				<label for="milestone">主要マイルストーン</label>
				<input
					id="milestone"
					type="text"
					bind:value={milestone}
					placeholder="例: 要件定義完了、実装完了"
				/>
				<p class="hint-text">AI自動生成ボタンで入力できます</p>
			</div>
		</div>

		<div class="form-section ai-section">
			<h2>🤖 AI自動生成</h2>
			<p class="help-text">
				ボタンをクリックするだけで、すべての項目（プロジェクト名、期間、成果物、チームメンバーの最適な割り当て）を自動生成します。
			</p>

			<div class="form-group">
				<label for="project-goal">プロジェクトの目的</label>
				<textarea
					id="project-goal"
					bind:value={projectGoal}
					placeholder="例: ECサイトの新規構築。商品管理、在庫管理、決済機能を実装する"
					rows="3"
				></textarea>
				<p class="hint-text">AI自動生成ボタンで入力できます</p>
			</div>

			<div class="form-group">
				<label for="constraints">制約・特記事項（オプション）</label>
				<textarea
					id="constraints"
					bind:value={constraints}
					placeholder="例: 3ヶ月以内に完了、既存システムとの連携が必要"
					rows="2"
				></textarea>
				<p class="hint-text">特別な要件や制約条件がある場合に記入してください</p>
			</div>

			<button
				type="button"
				class="ai-generation-button"
				on:click={handleAiGeneration}
				disabled={isGenerating}
			>
				<i class="bi bi-stars"></i>
				{isGenerating ? 'AI最適化中...' : 'AI詳細情報最適化'}
			</button>
		</div>

		<div class="form-actions">
			<button type="button" class="secondary-button" on:click={handleCancel}> キャンセル </button>
			<button type="button" class="secondary-button" on:click={handlePhaseWiseCreation}>
				フェーズごとに作成
			</button>
			<button type="submit" class="primary-button" disabled={isSubmitting}>
				{isSubmitting ? '作成中...' : '作成開始'}
			</button>
		</div>
	</form>
</div>

<style>
	/* Base Style (Hidden on Desktop) */
	.page-header-wrapper {
		display: none;
		width: 100%;
		height: 80px;
	}

	.page {
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 900px;
		margin: 0 auto;
		padding: 24px;
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

		.page {
			padding: 16px;
		}
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 18px;
		background: #fee2e2;
		border: 1px solid #dc2626;
		border-radius: 12px;
		color: #dc2626;
		font-size: 14px;
	}

	form {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 16px;
		padding: 32px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
	}

	.form-section {
		display: flex;
		flex-direction: column;
		gap: 20px;
		margin-bottom: 32px;
		padding-bottom: 32px;
		border-bottom: 1px solid #e5e7eb;
	}

	.form-section:last-of-type {
		border-bottom: none;
		margin-bottom: 0;
		padding-bottom: 0;
	}

	.ai-section {
		background: #f5f3ff;
		border: 1px solid #e9d5ff;
		border-radius: 12px;
		padding: 24px;
		margin-bottom: 32px;
		border-bottom: none;
	}

	.form-section h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: #111827;
	}

	.ai-section h2 {
		color: #7c3aed;
	}

	.help-text {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	label {
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
	}

	.required {
		color: #dc2626;
		margin-left: 2px;
	}

	input[type='text'],
	input[type='date'],
	input[type='email'],
	select,
	textarea {
		padding: 12px 16px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #f9fafb;
		color: #111827;
		font-size: 14px;
		font-family: inherit;
		transition:
			border-color 0.2s ease,
			background-color 0.2s ease;
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		background: #ffffff;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	textarea {
		resize: vertical;
		min-height: 80px;
	}

	.members-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 12px;
		padding: 16px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font-size: 14px;
		color: #374151;
	}

	.checkbox-item input[type='checkbox'] {
		cursor: pointer;
		width: 18px;
		height: 18px;
	}

	.hint {
		margin: 8px 0 0;
		font-size: 12px;
		color: #9ca3af;
		font-style: italic;
	}

	.ai-generation-button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		border-radius: 8px;
		border: none;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.ai-generation-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.ai-generation-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		margin-top: 24px;
	}

	.primary-button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		border-radius: 8px;
		border: none;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: #ffffff;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	.primary-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
	}

	.primary-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.secondary-button {
		padding: 12px 24px;
		border-radius: 8px;
		border: 1px solid #e5e7eb;
		background: transparent;
		color: #111827;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.secondary-button:hover {
		background: #f9fafb;
	}

	.input-with-button {
		display: flex;
		gap: 8px;
		align-items: stretch;
	}

	.input-with-button input {
		flex: 1;
	}

	.auto-generate-btn {
		padding: 12px 16px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #f9fafb;
		color: #111827;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.auto-generate-btn:hover {
		background: #f0f9ff;
		border-color: #3b82f6;
		color: #0284c7;
		box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
	}

	.auto-generate-btn:active {
		transform: scale(0.98);
	}

	.hint-text {
		margin: 6px 0 0;
		font-size: 12px;
		color: #9ca3af;
		font-style: italic;
	}

	.ai-recommendations {
		margin-bottom: 24px;
		padding: 20px;
		background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
		border: 1px solid #0ea5e9;
		border-radius: 12px;
	}

	.ai-recommendations h3 {
		margin: 0 0 16px;
		font-size: 16px;
		color: #0284c7;
		font-weight: 700;
	}

	.recommended-members {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.recommended-member {
		padding: 14px 16px;
		background: #ffffff;
		border: 1px solid #bae6fd;
		border-radius: 8px;
		box-shadow: 0 2px 6px rgba(14, 165, 233, 0.1);
	}

	.member-info {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 8px;
	}

	.member-info strong {
		font-size: 14px;
		color: #0c4a6e;
	}

	.role-badge {
		display: inline-block;
		padding: 4px 10px;
		background: #0ea5e9;
		color: #ffffff;
		font-size: 11px;
		font-weight: 600;
		border-radius: 6px;
	}

	.reason {
		margin: 0;
		font-size: 13px;
		color: #475569;
		line-height: 1.6;
	}

	@media (max-width: 640px) {
		.form-row {
			grid-template-columns: 1fr;
		}

		.members-list {
			grid-template-columns: 1fr;
		}

		.form-actions {
			flex-direction: column-reverse;
		}
	}
</style>
