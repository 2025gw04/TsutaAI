<script lang="ts">
	import { goto } from '$app/navigation';

	/** 表示対象のプロジェクト情報 */
	export let project: {
		id: number | string;
		name: string;
		description?: string;
		status?: string;
		startDate?: string;
		endDate?: string;
	};

	/** AIサマリーの結果情報 */
	export let summary: {
		progress_percentage?: number;
		current_phase?: string;
		summary_text?: string;
	} | null = null;

	/** タスク統計値（親コンポーネント側で算出） */
	export let stats: {
		totalTasks: number;
		completedTasks: number;
		upcomingCount: number;
	} = { totalTasks: 0, completedTasks: 0, upcomingCount: 0 };

	/** プロジェクトステータスに応じた表示設定 */
	const statusMap: Record<
		string,
		{ label: string; tone: 'planning' | 'running' | 'onhold' | 'completed' }
	> = {
		planning: { label: '計画中', tone: 'planning' },
		active: { label: '進行中', tone: 'running' },
		running: { label: '進行中', tone: 'running' },
		onhold: { label: '保留', tone: 'onhold' },
		hold: { label: '保留', tone: 'onhold' },
		completed: { label: '完了', tone: 'completed' }
	};

	/** WBS画面へ遷移するハンドラー */
	function openWbs() {
		goto(`/projects/${project.id}/wbs`);
	}

	/** プロジェクト詳細ページへ遷移するハンドラー */
	function openProjectDetail() {
		goto(`/projects/${project.id}`);
	}

	/** 進捗率表示用の数値（AI結果を優先） */
	$: progressValue =
		summary?.progress_percentage ??
		(stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0);
</script>

<article class="project-card">
	<header>
		<div class="titles">
			<h3>{project.name}</h3>
			<p>{project.description || 'プロジェクト概要は未入力です。'}</p>
		</div>
		{#if project.status}
			{#key project.status}
				<span class={`status-pill ${statusMap[project.status]?.tone ?? 'planning'}`}>
					{statusMap[project.status]?.label ?? project.status}
				</span>
			{/key}
		{/if}
	</header>

	<section class="summary">
		<div class="progress-ring">
			<svg viewBox="0 0 120 120">
				<defs>
					<linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stop-color="#38bdf8" />
						<stop offset="100%" stop-color="#818cf8" />
					</linearGradient>
				</defs>
				<circle class="ring-bg" cx="60" cy="60" r="52" />
				<circle
					class="ring-progress"
					cx="60"
					cy="60"
					r="52"
					stroke-dasharray={`${progressValue * 3.27} ${327 - progressValue * 3.27}`}
				/>
				<text x="60" y="68">{progressValue}%</text>
			</svg>
		</div>
		<div class="summary-text">
			<p class="phase-label">{summary?.current_phase ?? 'フェーズ未解析'}</p>
			<p class="description">
				{summary?.summary_text ||
					'AIサマリーは未取得です。WBSを登録してインサイトを生成しましょう。'}
			</p>
		</div>
	</section>

	<section class="metrics">
		<div>
			<span class="label">総タスク</span>
			<span class="value">{stats.totalTasks}</span>
		</div>
		<div>
			<span class="label">完了済み</span>
			<span class="value">{stats.completedTasks}</span>
		</div>
		<div>
			<span class="label">今週の期限</span>
			<span class="value highlight">{stats.upcomingCount}</span>
		</div>
	</section>

	<footer>
		<button type="button" class="btn primary" on:click={openWbs}>
			<i class="bi bi-diagram-3-fill"></i>
			WBSを開く
		</button>
		<button type="button" class="btn ghost" on:click={openProjectDetail}>
			<i class="bi bi-arrow-right"></i>
			詳細へ
		</button>
	</footer>
</article>

<style>
	.project-card {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 22px;
		border-radius: 20px;
		background:
			radial-gradient(circle at top right, rgba(59, 130, 246, 0.03), transparent 55%), #ffffff;
		border: 1px solid #e5e7eb;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
		min-height: 280px;
		transition:
			transform 0.3s ease,
			box-shadow 0.3s ease,
			border-color 0.3s ease;
	}

	.project-card:hover {
		transform: translateY(-4px);
		box-shadow:
			0 8px 24px rgba(59, 130, 246, 0.12),
			0 4px 12px rgba(0, 0, 0, 0.08);
		border-color: #93c5fd;
	}

	header {
		display: flex;
		justify-content: space-between;
		gap: 16px;
	}

	.titles h3 {
		margin: 0 0 4px;
		font-size: 18px;
		color: #111827;
		font-weight: 600;
	}

	.titles p {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
		color: #6b7280;
	}

	.status-pill {
		align-self: flex-start;
		padding: 6px 12px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		min-width: 63px;
		white-space: nowrap;
	}

	.status-pill.planning {
		background: #dbeafe;
		color: #1e40af;
	}

	.status-pill.running {
		background: #e0e7ff;
		color: #4338ca;
	}

	.status-pill.onhold {
		background: #fed7aa;
		color: #c2410c;
	}

	.status-pill.completed {
		background: #d1fae5;
		color: #047857;
	}

	.summary {
		display: grid;
		grid-template-columns: 120px 1fr;
		gap: 18px;
		align-items: center;
	}

	.progress-ring {
		position: relative;
		width: 120px;
		height: 120px;
	}

	svg {
		width: 120px;
		height: 120px;
		transform: rotate(-90deg);
	}

	.ring-bg {
		fill: none;
		stroke: #e5e7eb;
		stroke-width: 8;
	}

	.ring-progress {
		fill: none;
		stroke: url(#ringGradient);
		stroke-width: 8;
		stroke-linecap: round;
		transition: stroke-dasharray 0.6s ease;
	}

	text {
		font-size: 18px;
		fill: #111827;
		font-weight: 600;
		text-anchor: middle;
		transform: rotate(90deg);
	}

	.summary-text {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.phase-label {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: #4338ca;
	}

	.description {
		margin: 0;
		font-size: 13px;
		line-height: 1.7;
		color: #6b7280;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 18px;
	}

	.metrics div {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px;
		border-radius: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
	}

	.label {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9ca3af;
	}

	.value {
		font-size: 18px;
		font-weight: 600;
		color: #111827;
	}

	.highlight {
		color: #3b82f6;
	}

	footer {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		border-radius: 12px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
		transition:
			transform 0.2s ease,
			opacity 0.2s ease;
		min-width: 120px;
		white-space: nowrap;
	}

	.btn i {
		font-size: 16px;
	}

	.btn.primary {
		background: #3b82f6;
		color: #ffffff;
		box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
	}

	.btn.primary:hover {
		background: #2563eb;
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
	}

	.btn.ghost {
		background: transparent;
		border-color: #d1d5db;
		color: #374151;
	}

	.btn.ghost:hover {
		border-color: #3b82f6;
		color: #3b82f6;
		background: #eff6ff;
	}

	@media (max-width: 768px) {
		.project-card {
			min-height: 0;
		}

		.summary {
			grid-template-columns: 1fr;
			justify-items: center;
			text-align: center;
		}

		footer {
			flex-direction: column;
			align-items: stretch;
		}
	}

	/* 極小画面での最適化（UX重視） */
	@media (max-width: 480px) {
		.project-card {
			padding: 18px;
			gap: 16px;
		}

		header {
			flex-direction: column;
			gap: 12px;
		}

		.titles h3 {
			font-size: 16px;
		}

		.titles p {
			font-size: 12px;
		}

		.status-pill {
			align-self: flex-start;
			font-size: 11px;
			padding: 4px 10px;
		}

		.summary {
			gap: 14px;
		}

		.progress-ring,
		.progress-ring svg {
			width: 100px;
			height: 100px;
		}

		.ring-bg,
		.ring-progress {
			r: 44px;
		}

		text {
			font-size: 16px;
		}

		.phase-label {
			font-size: 13px;
		}

		.description {
			font-size: 12px;
		}

		.metrics {
			grid-template-columns: 1fr;
			gap: 10px;
		}

		.metrics div {
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
			padding: 10px 12px;
		}

		.label {
			font-size: 12px;
		}

		.value {
			font-size: 18px;
		}

		footer {
			gap: 10px;
		}

		.btn {
			padding: 14px 18px;
			font-size: 14px;
			min-height: 48px; /* タッチターゲット確保（UX重視） */
			min-width: unset;
		}

		.btn i {
			font-size: 18px;
		}
	}
</style>
