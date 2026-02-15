<script lang="ts">
	import type { RescheduleProposal } from '$lib/stores/rescheduleStore';

	export let proposals: RescheduleProposal[] = [];

	/** 全タスクの最小・最大日付を取得 */
	function getDateRange(): { min: Date; max: Date } {
		let min = new Date();
		let max = new Date();

		proposals.forEach((p) => {
			if (p.currentStart) {
				const currentStart = new Date(p.currentStart);
				if (currentStart < min) min = currentStart;
			}
			if (p.currentEnd) {
				const currentEnd = new Date(p.currentEnd);
				if (currentEnd > max) max = currentEnd;
			}
			if (p.proposedStart) {
				const proposedStart = new Date(p.proposedStart);
				if (proposedStart < min) min = proposedStart;
			}
			if (p.proposedEnd) {
				const proposedEnd = new Date(p.proposedEnd);
				if (proposedEnd > max) max = proposedEnd;
			}
		});

		return { min, max };
	}

	/** 日付の位置をパーセンテージで計算 */
	function getPosition(dateStr: string | undefined, min: Date, max: Date): number {
		if (!dateStr) return 0;
		const date = new Date(dateStr);
		const totalDays = (max.getTime() - min.getTime()) / (1000 * 60 * 60 * 24) + 1;
		const daysSinceMin = (date.getTime() - min.getTime()) / (1000 * 60 * 60 * 24);
		return (daysSinceMin / totalDays) * 100;
	}

	/** 期間の幅をパーセンテージで計算 */
	function getWidth(
		startStr: string | undefined,
		endStr: string | undefined,
		min: Date,
		max: Date
	): number {
		if (!startStr || !endStr) return 0;
		const start = new Date(startStr);
		const end = new Date(endStr);
		const totalDays = (max.getTime() - min.getTime()) / (1000 * 60 * 60 * 24) + 1;
		const taskDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
		return (taskDays / totalDays) * 100;
	}

	/** 日付フォーマット */
	function formatDate(dateStr: string | undefined): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
	}

	/** 日付フォーマット（ヘッダー用） */
	function formatMonthDay(date: Date): string {
		return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
	}

	/** タイムライングリッドのマーカーを生成 */
	function generateTimelineMarkers(min: Date, max: Date): Date[] {
		const markers: Date[] = [];
		const totalDays = Math.round((max.getTime() - min.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		const interval = totalDays > 60 ? 14 : 7; // 60日以上なら2週間ごと、それ以外は1週間ごと

		let current = new Date(min);
		while (current <= max) {
			markers.push(new Date(current));
			current.setDate(current.getDate() + interval);
		}
		markers.push(new Date(max));

		return markers;
	}

	/** 影響度の色 */
	function getImpactColor(impact: 'low' | 'medium' | 'high'): string {
		switch (impact) {
			case 'high':
				return '#ef4444';
			case 'medium':
				return '#f59e0b';
			case 'low':
				return '#10b981';
			default:
				return '#6b7280';
		}
	}

	/** 遅延があるか */
	function hasDelay(proposal: RescheduleProposal): boolean {
		if (!proposal.currentEnd || !proposal.proposedEnd) return false;
		return new Date(proposal.proposedEnd) > new Date(proposal.currentEnd);
	}

	$: dateRange = getDateRange();
	$: timelineMarkers = generateTimelineMarkers(dateRange.min, dateRange.max);
</script>

<div class="timeline-container">
	<!-- タイムラインヘッダー（日付マーカー） -->
	<div class="timeline-header">
		<div class="task-name-col">タスク名</div>
		<div class="timeline-col">
			<div class="timeline-markers">
				{#each timelineMarkers as marker}
					<div
						class="marker"
						style="left: {getPosition(marker.toISOString(), dateRange.min, dateRange.max)}%"
					>
						<div class="marker-label">{formatMonthDay(marker)}</div>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- タイムラインアイテム -->
	<div class="timeline-items">
		{#each proposals as proposal (proposal.taskId)}
			<div class="timeline-item">
				<div class="task-name-col">
					<div class="task-name">{proposal.taskName}</div>
					<span
						class="impact-badge"
						style="background: {getImpactColor(proposal.impact)}20; color: {getImpactColor(
							proposal.impact
						)};"
					>
						{proposal.impact}
					</span>
				</div>

				<div class="timeline-col">
					<!-- 現在のスケジュール -->
					<div
						class="timeline-bar current"
						style="
              left: {getPosition(proposal.currentStart, dateRange.min, dateRange.max)}%;
              width: {getWidth(
							proposal.currentStart,
							proposal.currentEnd,
							dateRange.min,
							dateRange.max
						)}%;
            "
					>
						<div class="bar-label">現在</div>
						<div class="bar-dates">
							{formatDate(proposal.currentStart)} 〜 {formatDate(proposal.currentEnd)}
						</div>
					</div>

					<!-- 提案スケジュール -->
					<div
						class="timeline-bar proposed"
						class:delayed={hasDelay(proposal)}
						style="
              left: {getPosition(proposal.proposedStart, dateRange.min, dateRange.max)}%;
              width: {getWidth(
							proposal.proposedStart,
							proposal.proposedEnd,
							dateRange.min,
							dateRange.max
						)}%;
              border-color: {getImpactColor(proposal.impact)};
            "
					>
						<div class="bar-label">提案</div>
						<div class="bar-dates">
							{formatDate(proposal.proposedStart)} 〜 {formatDate(proposal.proposedEnd)}
						</div>
					</div>

					<!-- 変更の矢印 -->
					{#if hasDelay(proposal)}
						<div class="delay-indicator">
							<i class="bi bi-arrow-right"></i>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<!-- 凡例 -->
	<div class="legend">
		<div class="legend-item">
			<div class="legend-bar current"></div>
			<span>現在のスケジュール</span>
		</div>
		<div class="legend-item">
			<div class="legend-bar proposed"></div>
			<span>提案スケジュール</span>
		</div>
	</div>
</div>

<style>
	.timeline-container {
		background: #ffffff;
		border-radius: 8px;
	}

	.timeline-header {
		display: flex;
		border-bottom: 2px solid #e5e7eb;
		background: #f9fafb;
		border-radius: 8px 8px 0 0;
	}

	.task-name-col {
		width: 220px;
		flex-shrink: 0;
		padding: 12px 16px;
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
		border-right: 1px solid #e5e7eb;
	}

	.timeline-col {
		flex: 1;
		position: relative;
		min-height: 60px;
		padding: 12px 16px;
	}

	.timeline-markers {
		position: relative;
		height: 100%;
	}

	.marker {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: #e5e7eb;
	}

	.marker-label {
		position: absolute;
		top: -20px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		color: #6b7280;
		white-space: nowrap;
	}

	.timeline-items {
		max-height: 500px;
		overflow-y: auto;
	}

	.timeline-item {
		display: flex;
		border-bottom: 1px solid #e5e7eb;
		transition: background 0.2s ease;
	}

	.timeline-item:hover {
		background: #f9fafb;
	}

	.timeline-item .task-name-col {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.task-name {
		font-size: 14px;
		font-weight: 600;
		color: #111827;
	}

	.impact-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.timeline-bar {
		position: absolute;
		height: 24px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.timeline-bar:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
	}

	.timeline-bar.current {
		top: 8px;
		background: #d1d5db;
		border: 2px solid #9ca3af;
		color: #374151;
	}

	.timeline-bar.proposed {
		top: 40px;
		background: #dbeafe;
		border: 2px solid #3b82f6;
		color: #1e40af;
	}

	.timeline-bar.proposed.delayed {
		background: #fecaca;
		border-color: #ef4444;
		color: #991b1b;
	}

	.bar-label {
		position: absolute;
		left: 8px;
		font-weight: 700;
	}

	.bar-dates {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 4px;
		white-space: nowrap;
		font-size: 10px;
		color: #6b7280;
		background: #ffffff;
		padding: 2px 6px;
		border-radius: 4px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.2s ease;
	}

	.timeline-bar:hover .bar-dates {
		opacity: 1;
	}

	.delay-indicator {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: #ef4444;
		font-size: 20px;
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.legend {
		display: flex;
		gap: 24px;
		padding: 16px;
		background: #f9fafb;
		border-top: 1px solid #e5e7eb;
		border-radius: 0 0 8px 8px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: #6b7280;
	}

	.legend-bar {
		width: 40px;
		height: 16px;
		border-radius: 4px;
	}

	.legend-bar.current {
		background: #d1d5db;
		border: 2px solid #9ca3af;
	}

	.legend-bar.proposed {
		background: #dbeafe;
		border: 2px solid #3b82f6;
	}
</style>
