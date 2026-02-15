<script lang="ts">
	import type { WbsTask } from './types';
	import {
		calculateDelayInfo,
		calculateStartDelayInfo,
		getDelayColor,
		getDelayIcon
	} from '$lib/utils/delayCalculator';
	import { createEventDispatcher } from 'svelte';

	export let task: WbsTask;

	const dispatch = createEventDispatcher();

	/** 遅延情報を計算 */
	$: endDelayInfo = calculateDelayInfo(task);
	$: startDelayInfo = calculateStartDelayInfo(task);

	/** 日付フィールドの変更ハンドラー */
	function handleDateChange(
		field: 'startDate' | 'endDate' | 'actualStartDate' | 'actualEndDate',
		event: Event
	) {
		const value = (event.target as HTMLInputElement).value || undefined;
		dispatch('updateField', { field, value });
	}

	/** 今日を実績日として記録 */
	function recordTodayAsActual(field: 'actualStartDate' | 'actualEndDate') {
		const today = new Date().toISOString().split('T')[0];
		dispatch('updateField', { field, value: today });
	}
</script>

<div class="schedule-section">
	<div class="section-header">
		<h4><i class="bi bi-calendar-range"></i> スケジュール</h4>
	</div>

	<!-- 予定日 -->
	<div class="schedule-box planned-box">
		<div class="box-header">
			<span class="box-label"><i class="bi bi-calendar3"></i> 予定</span>
		</div>
		<div class="date-fields">
			<label>
				<span>開始予定日</span>
				<input
					type="date"
					value={task.startDate ?? ''}
					on:change={(event) => handleDateChange('startDate', event)}
				/>
			</label>
			<label>
				<span>終了予定日</span>
				<input
					type="date"
					value={task.endDate ?? ''}
					on:change={(event) => handleDateChange('endDate', event)}
				/>
			</label>
		</div>
		{#if task.startDate && task.endDate}
			<div class="info-text">
				<i class="bi bi-info-circle"></i>
				予定期間: {Math.ceil(
					(new Date(task.endDate).getTime() - new Date(task.startDate).getTime()) /
						(1000 * 60 * 60 * 24)
				) + 1}日間
			</div>
		{/if}
	</div>

	<!-- 実績日 -->
	<div class="schedule-box actual-box">
		<div class="box-header">
			<span class="box-label"><i class="bi bi-check2-circle"></i> 実績</span>
		</div>
		<div class="date-fields">
			<label>
				<span>実際の開始日</span>
				<div class="date-input-group">
					<input
						type="date"
						value={task.actualStartDate ?? ''}
						on:change={(event) => handleDateChange('actualStartDate', event)}
					/>
					<button
						type="button"
						class="btn-today"
						on:click={() => recordTodayAsActual('actualStartDate')}
						title="今日を記録"
					>
						<i class="bi bi-calendar-check"></i>
						今日
					</button>
				</div>
			</label>
			<label>
				<span>実際の終了日</span>
				<div class="date-input-group">
					<input
						type="date"
						value={task.actualEndDate ?? ''}
						on:change={(event) => handleDateChange('actualEndDate', event)}
					/>
					<button
						type="button"
						class="btn-today"
						on:click={() => recordTodayAsActual('actualEndDate')}
						title="今日を記録"
					>
						<i class="bi bi-calendar-check"></i>
						今日
					</button>
				</div>
			</label>
		</div>
		{#if task.actualStartDate && task.actualEndDate}
			<div class="info-text">
				<i class="bi bi-info-circle"></i>
				実績期間: {Math.ceil(
					(new Date(task.actualEndDate).getTime() - new Date(task.actualStartDate).getTime()) /
						(1000 * 60 * 60 * 24)
				) + 1}日間
			</div>
		{/if}
	</div>

	<!-- 遅延情報 -->
	{#if endDelayInfo && endDelayInfo.severity !== 'none'}
		<div class="delay-alert" style="border-left-color: {getDelayColor(endDelayInfo.severity)}">
			<i
				class={getDelayIcon(endDelayInfo.severity)}
				style="color: {getDelayColor(endDelayInfo.severity)}"
			></i>
			<div class="delay-message">
				<span class="delay-text">{endDelayInfo.message}</span>
				{#if startDelayInfo && startDelayInfo.severity !== 'none'}
					<span class="delay-subtext">{startDelayInfo.message}</span>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.schedule-section {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.section-header h4 {
		margin: 0;
		font-size: 14px;
		color: #374151;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.section-header h4 i {
		color: #3b82f6;
	}

	.schedule-box {
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		padding: 16px;
		background: #f9fafb;
	}

	.planned-box {
		background: linear-gradient(135deg, #eff6ff 0%, #f9fafb 100%);
	}

	.actual-box {
		background: linear-gradient(135deg, #f0fdf4 0%, #f9fafb 100%);
	}

	.box-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}

	.box-label {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.date-fields {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		color: #9ca3af;
	}

	input[type='date'] {
		border-radius: 8px;
		border: 1px solid #d1d5db;
		background: #ffffff;
		color: #111827;
		padding: 8px 10px;
		font-size: 13px;
		transition:
			border 0.2s ease,
			box-shadow 0.2s ease;
	}

	input[type='date']:focus {
		border-color: #3b82f6;
		outline: none;
		box-shadow: 0 0 0 3px #dbeafe;
	}

	.date-input-group {
		display: flex;
		gap: 8px;
	}

	.date-input-group input {
		flex: 1;
	}

	.btn-today {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 12px;
		border-radius: 8px;
		border: 1px solid #d1d5db;
		background: #ffffff;
		color: #374151;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.btn-today:hover {
		background: #f3f4f6;
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.btn-today i {
		font-size: 14px;
	}

	.info-text {
		margin-top: 8px;
		padding: 8px;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 6px;
		font-size: 12px;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.delay-alert {
		padding: 12px 16px;
		border-radius: 10px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-left-width: 4px;
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.delay-alert i {
		font-size: 20px;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.delay-message {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
	}

	.delay-text {
		font-size: 13px;
		font-weight: 600;
		color: #111827;
	}

	.delay-subtext {
		font-size: 12px;
		color: #6b7280;
	}

	@media (max-width: 768px) {
		.date-fields {
			grid-template-columns: 1fr;
		}
	}
</style>
