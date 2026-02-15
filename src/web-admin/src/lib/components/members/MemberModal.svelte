<script lang="ts" context="module">
	export type MemberModalMode = 'create' | 'edit';
</script>

<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';

	export let mode: MemberModalMode = 'create';
	export let member: {
		username: string;
		fullName: string;
		email: string;
		role: string;
	} = {
		username: '',
		fullName: '',
		email: '',
		role: 'member'
	};
	export let userId: number | null = null;

	const dispatch = createEventDispatcher();

	let password = '';
	let skills: Array<{ name: string; level: number }> = [];
	let newSkillName = '';
	let newSkillLevel = 5;

	const roleOptions = [
		{ value: 'admin', label: '管理者' },
		{ value: 'project_manager', label: 'プロジェクト管理' },
		{ value: 'member', label: 'メンバー' }
	];

	const commonSkills = [
		'Java',
		'C#',
		'Python',
		'JavaScript',
		'TypeScript',
		'HTML',
		'CSS',
		'React',
		'Vue.js',
		'Angular',
		'Node.js',
		'SQL',
		'NoSQL',
		'設計書作成',
		'テスト仕様書作成',
		'コードレビュー',
		'プロジェクト管理'
	];

	onMount(async () => {
		if (mode === 'edit' && userId) {
			await loadUserSkills();
		}
	});

	async function loadUserSkills() {
		try {
			const response = await apiClient.get<{ success: boolean; data: any[] }>(
				`/user-skills/${userId}`
			);
			if (response.success && Array.isArray(response.data)) {
				skills = response.data.map((s: any) => ({
					name: s.skillName,
					level: s.skillLevel
				}));
			}
		} catch (error) {
			console.error('スキルの読み込みに失敗しました:', error);
		}
	}

	function addSkill() {
		if (!newSkillName.trim()) return;
		if (skills.some((s) => s.name === newSkillName.trim())) {
			alert('このスキルは既に追加されています。');
			return;
		}
		skills = [...skills, { name: newSkillName.trim(), level: newSkillLevel }];
		newSkillName = '';
		newSkillLevel = 5;
	}

	function removeSkill(index: number) {
		skills = skills.filter((_, i) => i !== index);
	}

	function close() {
		dispatch('cancel');
	}

	async function handleSubmit() {
		const memberData = {
			username: member.username,
			fullName: member.fullName,
			email: member.email,
			role: member.role,
			...(mode === 'create' ? { password } : {})
		};

		dispatch('save', { ...memberData, skills });
	}
</script>

<div
	class="overlay"
	role="presentation"
	tabindex="-1"
	on:click={close}
	on:keydown={(event) => {
		if (event.key === 'Escape') {
			close();
		}
	}}
>
	<div
		class="modal-window"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		on:click|stopPropagation
		on:keydown|stopPropagation
	>
		<header>
			<h3>{mode === 'create' ? 'メンバーを追加' : 'メンバーを編集'}</h3>
			<button type="button" class="close" on:click={close} aria-label="閉じる">
				<i class="bi bi-x-lg"></i>
			</button>
		</header>

		<form class="form" on:submit|preventDefault={handleSubmit}>
			<label>
				<span>ユーザー名</span>
				<input
					type="text"
					bind:value={member.username}
					placeholder="yamada"
					disabled={mode === 'edit'}
					required
				/>
			</label>

			<label>
				<span>氏名</span>
				<input type="text" bind:value={member.fullName} placeholder="山田 太郎" required />
			</label>

			<label>
				<span>メールアドレス</span>
				<input type="email" bind:value={member.email} placeholder="user@example.com" required />
			</label>

			<label>
				<span>権限ロール</span>
				<select bind:value={member.role}>
					{#each roleOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>

			{#if mode === 'create'}
				<label>
					<span>初期パスワード</span>
					<input
						type="password"
						bind:value={password}
						minlength="4"
						placeholder="初期パスワード"
						required
					/>
				</label>
			{/if}

			<div class="skills-section">
				<label>
					<span>保有スキル</span>
					<div class="skill-input-group">
						<input
							type="text"
							bind:value={newSkillName}
							list="common-skills"
							placeholder="スキル名を入力または選択"
							class="skill-name-input"
						/>
						<datalist id="common-skills">
							{#each commonSkills as skill}
								<option value={skill}>{skill}</option>
							{/each}
						</datalist>
						<input
							type="number"
							bind:value={newSkillLevel}
							min="0"
							max="10"
							placeholder="レベル"
							class="skill-level-input"
						/>
						<button type="button" class="btn skill-add" on:click={addSkill}>
							<i class="bi bi-plus-lg"></i>
						</button>
					</div>
				</label>

				{#if skills.length > 0}
					<div class="skills-list">
						{#each skills as skill, index}
							<div class="skill-item">
								<div class="skill-info">
									<span class="skill-name">{skill.name}</span>
									<span class="skill-level-bar">
										<span class="skill-level-fill" style="width: {skill.level * 10}%"></span>
									</span>
									<span class="skill-level-text">{skill.level} / 10</span>
								</div>
								<button type="button" class="btn-remove" on:click={() => removeSkill(index)}>
									<i class="bi bi-x-lg"></i>
								</button>
							</div>
						{/each}
					</div>
				{:else}
					<p class="empty-skills">スキルが登録されていません</p>
				{/if}
			</div>

			<div class="actions">
				<button type="button" class="btn ghost" on:click={close}>キャンセル</button>
				<button type="submit" class="btn primary">
					{mode === 'create' ? '追加する' : '更新する'}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		padding: 24px;
	}

	.modal-window {
		width: min(520px, 100%);
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		padding: 26px 30px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #111827;
	}

	h3 {
		margin: 0;
		font-size: 20px;
	}

	.close {
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		color: #6b7280;
	}

	input,
	select {
		border-radius: 12px;
		border: 1px solid #d1d5db;
		background: #f9fafb;
		color: #111827;
		padding: 10px 12px;
		font-size: 14px;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
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

	.btn.ghost {
		background: transparent;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn.primary {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		color: #ffffff;
	}

	.skills-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		background: #f9fafb;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
	}

	.skill-input-group {
		display: grid;
		grid-template-columns: 1fr 80px 48px;
		gap: 8px;
	}

	.skill-name-input {
		grid-column: 1;
	}

	.skill-level-input {
		grid-column: 2;
		text-align: center;
	}

	.btn.skill-add {
		grid-column: 3;
		padding: 10px;
		background: #dbeafe;
		color: #3b82f6;
		border-color: #93c5fd;
	}

	.skills-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 200px;
		overflow-y: auto;
	}

	.skill-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		background: #ffffff;
		border-radius: 8px;
		border: 1px solid #e5e7eb;
	}

	.skill-info {
		display: grid;
		grid-template-columns: 140px 1fr 60px;
		gap: 12px;
		align-items: center;
		flex: 1;
	}

	.skill-name {
		font-weight: 600;
		color: #111827;
		font-size: 13px;
	}

	.skill-level-bar {
		position: relative;
		height: 8px;
		background: #e5e7eb;
		border-radius: 4px;
		overflow: hidden;
	}

	.skill-level-fill {
		position: absolute;
		left: 0;
		top: 0;
		height: 100%;
		background: linear-gradient(90deg, #3b82f6, #8b5cf6);
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.skill-level-text {
		font-size: 12px;
		color: #6b7280;
		text-align: right;
	}

	.btn-remove {
		background: transparent;
		border: 1px solid #fca5a5;
		color: #dc2626;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
	}

	.btn-remove:hover {
		background: #fee2e2;
		border-color: #f87171;
	}

	.empty-skills {
		margin: 0;
		padding: 12px;
		text-align: center;
		color: #9ca3af;
		font-size: 13px;
	}

	/* Responsive Design */
	@media (max-width: 768px) {
		.modal-window {
			width: 100%;
			max-width: 100%;
			padding: 20px 16px;
		}

		.skill-input-group {
			grid-template-columns: 1fr 70px 44px;
			gap: 6px;
		}

		.skill-level-input {
			font-size: 13px;
		}

		.skill-info {
			grid-template-columns: 120px 1fr 55px;
			gap: 8px;
		}

		.skill-name {
			font-size: 12px;
		}
	}

	@media (max-width: 480px) {
		.modal-window {
			padding: 16px 12px;
			border-radius: 16px;
		}

		header h3 {
			font-size: 18px;
		}

		.skill-input-group {
			grid-template-columns: 1fr 60px 44px;
			gap: 4px;
		}

		.skill-name-input,
		.skill-level-input {
			font-size: 13px;
			padding: 8px 10px;
		}

		.btn.skill-add {
			padding: 8px;
			font-size: 14px;
		}

		.skill-info {
			grid-template-columns: 100px 1fr 50px;
			gap: 6px;
		}

		.skill-name {
			font-size: 11px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.skill-level-text {
			font-size: 11px;
		}

		.btn-remove {
			width: 28px;
			height: 28px;
			font-size: 12px;
		}
	}

	@media (max-width: 390px) {
		.overlay {
			padding: 12px;
		}

		.modal-window {
			padding: 14px 10px;
			border-radius: 12px;
			gap: 14px;
		}

		header h3 {
			font-size: 16px;
		}

		.form {
			gap: 12px;
		}

		label {
			font-size: 11px;
		}

		input,
		select {
			font-size: 13px;
			padding: 8px 10px;
			border-radius: 10px;
		}

		.skills-section {
			padding: 12px;
			gap: 10px;
		}

		.skill-input-group {
			grid-template-columns: 1fr 44px;
			grid-template-rows: auto auto;
			gap: 6px;
		}

		.skill-name-input {
			grid-column: 1 / -1;
			grid-row: 1;
		}

		.skill-level-input {
			grid-column: 1;
			grid-row: 2;
			text-align: left;
		}

		.btn.skill-add {
			grid-column: 2;
			grid-row: 2;
			width: 44px;
			height: 44px;
		}

		.skill-info {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto;
			gap: 8px;
		}

		.skill-name {
			grid-column: 1;
			grid-row: 1;
			font-size: 12px;
			white-space: normal;
			overflow: visible;
			text-overflow: clip;
		}

		.skill-level-bar {
			grid-column: 1;
			grid-row: 2;
			height: 6px;
		}

		.skill-level-text {
			grid-column: 1;
			grid-row: 2;
			text-align: right;
			font-size: 10px;
			margin-top: -20px;
			position: relative;
			z-index: 1;
			background: white;
			padding-left: 4px;
			width: fit-content;
			margin-left: auto;
		}

		.skill-item {
			padding: 8px 10px;
			gap: 8px;
		}

		.btn-remove {
			width: 32px;
			height: 32px;
			align-self: flex-start;
		}

		.actions {
			gap: 8px;
		}

		.btn {
			padding: 10px 14px;
			font-size: 14px;
		}
	}
</style>
