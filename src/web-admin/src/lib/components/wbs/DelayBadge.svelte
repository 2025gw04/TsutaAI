<script lang="ts">
	import type { WbsTask } from './types';
	import { calculateDelayInfo, getDelayColor, getDelayIcon } from '$lib/utils/delayCalculator';

	export let task: WbsTask;
	export let compact: boolean = false;

	$: delayInfo = calculateDelayInfo(task);
	$: showBadge = delayInfo && (delayInfo.isDelayed || delayInfo.severity === 'ahead');
</script>

{#if showBadge}
	<span
		class="delay-badge"
		class:compact
		style="background-color: {getDelayColor(delayInfo.severity)}20; color: {getDelayColor(
			delayInfo.severity
		)}; border-color: {getDelayColor(delayInfo.severity)}"
		title={delayInfo.message}
	>
		<i class={getDelayIcon(delayInfo.severity)}></i>
		{#if !compact}
			<span class="badge-text">
				{#if delayInfo.isDelayed}
					+{delayInfo.delayDays}日
				{:else if delayInfo.severity === 'ahead'}
					-{Math.abs(delayInfo.delayDays)}日
				{/if}
			</span>
		{/if}
	</span>
{/if}

<style>
	.delay-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 12px;
		border: 1px solid;
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
		transition: all 0.2s ease;
	}

	.delay-badge.compact {
		padding: 2px 6px;
		gap: 0;
	}

	.delay-badge i {
		font-size: 12px;
	}

	.badge-text {
		line-height: 1;
	}

	.delay-badge:hover {
		transform: scale(1.05);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}
</style>
