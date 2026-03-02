<script lang="ts">
	import type { WbsTask } from './types';
	import { calculateDelayStatistics } from '$lib/utils/delayCalculator';

	export let tasks: WbsTask[] = [];

	$: stats = calculateDelayStatistics(tasks);
</script>

<div class="statistics-panel">
	<div class="panel-header">
		<h3><i class="bi bi-graph-up"></i> プロジェクト進捗統計</h3>
	</div>

	<div class="stats-grid">
		<!-- 完了状況 -->
		<div class="stat-card">
			<div class="stat-label">完了タスク</div>
			<div class="stat-breakdown">
				<div class="stat-item early">
					<i class="bi bi-check-circle-fill"></i>
					<span>前倒し: {stats.completedEarly}</span>
				</div>
				<div class="stat-item on-time">
					<i class="bi bi-check-circle"></i>
					<span>予定通り: {stats.completedOnTime}</span>
				</div>
				<div class="stat-item late">
					<i class="bi bi-exclamation-circle"></i>
					<span>遅延: {stats.completedLate}</span>
				</div>
			</div>
		</div>

		<!-- 進行中タスク -->
		<div class="stat-card">
			<div class="stat-label">進行中タスク</div>
			<div class="stat-breakdown">
				<div class="stat-item on-track">
					<i class="bi bi-clock"></i>
					<span>順調: {stats.inProgressOnTrack}</span>
				</div>
				<div class="stat-item delayed">
					<i class="bi bi-exclamation-triangle"></i>
					<span>遅延中: {stats.inProgressDelayed}</span>
				</div>
			</div>
		</div>

		<!-- 未着手で遅延 -->
		{#if stats.notStartedDelayed > 0}
			<div class="stat-card warning">
				<div class="stat-label">
					<i class="bi bi-exclamation-triangle-fill"></i>
					未着手で遅延
				</div>
				<div class="stat-value critical">{stats.notStartedDelayed}</div>
				<div class="stat-hint">早急に対応が必要です</div>
			</div>
		{/if}

		<!-- 平均遅延 -->
		{#if stats.averageDelay !== 0}
			<div class="stat-card" class:warning={stats.averageDelay > 3}>
				<div class="stat-label">平均遅延</div>
				<div
					class="stat-value"
					class:positive={stats.averageDelay < 0}
					class:negative={stats.averageDelay > 0}
				>
					{stats.averageDelay > 0 ? '+' : ''}{stats.averageDelay}日
				</div>
				{#if stats.averageDelay > 0}
					<div class="stat-hint">プロジェクト全体で遅延傾向</div>
				{:else}
					<div class="stat-hint">プロジェクト全体で前倒し傾向</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- パーセンテージバー -->
	<div class="percentage-section">
		<div class="percentage-label">完了タスクの内訳</div>
		<div class="percentage-bar">
			{#if stats.earlyPercentage > 0}
				<div
					class="bar-segment early"
					style="width: {stats.earlyPercentage}%"
					title="前倒し: {stats.earlyPercentage}%"
				></div>
			{/if}
			{#if stats.onTimePercentage > 0}
				<div
					class="bar-segment on-time"
					style="width: {stats.onTimePercentage}%"
					title="予定通り: {stats.onTimePercentage}%"
				></div>
			{/if}
			{#if stats.latePercentage > 0}
				<div
					class="bar-segment late"
					style="width: {stats.latePercentage}%"
					title="遅延: {stats.latePercentage}%"
				></div>
			{/if}
		</div>
		<div class="percentage-legend">
			<span class="legend-item early">
				<span class="legend-color"></span>
				前倒し {stats.earlyPercentage}%
			</span>
			<span class="legend-item on-time">
				<span class="legend-color"></span>
				予定通り {stats.onTimePercentage}%
			</span>
			<span class="legend-item late">
				<span class="legend-color"></span>
				遅延 {stats.latePercentage}%
			</span>
		</div>
	</div>
</div>

<style>
	.statistics-panel {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 16px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.panel-header h3 {
		margin: 0;
		font-size: 16px;
		color: #111827;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.panel-header i {
		color: #3b82f6;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
	}

	.stat-card {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.stat-card.warning {
		background: #fef3c7;
		border-color: #fbbf24;
	}

	.stat-label {
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.stat-value {
		font-size: 32px;
		font-weight: 700;
		color: #111827;
	}

	.stat-value.positive {
		color: #10b981;
	}

	.stat-value.negative {
		color: #ef4444;
	}

	.stat-value.critical {
		color: #dc2626;
	}

	.stat-hint {
		font-size: 11px;
		color: #9ca3af;
	}

	.stat-breakdown {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}

	.stat-item.early {
		color: #10b981;
	}

	.stat-item.on-time {
		color: #3b82f6;
	}

	.stat-item.on-track {
		color: #6b7280;
	}

	.stat-item.late {
		color: #f59e0b;
	}

	.stat-item.delayed {
		color: #ef4444;
	}

	.stat-item i {
		font-size: 16px;
	}

	.percentage-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.percentage-label {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.percentage-bar {
		height: 24px;
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		background: #e5e7eb;
	}

	.bar-segment {
		transition: width 0.3s ease;
		cursor: pointer;
	}

	.bar-segment.early {
		background: #10b981;
	}

	.bar-segment.on-time {
		background: #3b82f6;
	}

	.bar-segment.late {
		background: #f59e0b;
	}

	.bar-segment:hover {
		opacity: 0.8;
	}

	.percentage-legend {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #6b7280;
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}

	.legend-item.early .legend-color {
		background: #10b981;
	}

	.legend-item.on-time .legend-color {
		background: #3b82f6;
	}

	.legend-item.late .legend-color {
		background: #f59e0b;
	}

	@media (max-width: 768px) {
		.stats-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
