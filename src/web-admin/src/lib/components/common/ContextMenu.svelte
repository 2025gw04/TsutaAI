<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	export let x: number;
	export let y: number;

	let menuElement: HTMLElement;

	onMount(() => {
		// Adjust position if menu goes off-screen
		const { innerWidth, innerHeight } = window;
		const { width, height } = menuElement.getBoundingClientRect();
		if (x + width > innerWidth) {
			x = innerWidth - width - 10;
		}
		if (y + height > innerHeight) {
			y = innerHeight - height - 10;
		}

		// Close on outside click
		window.addEventListener('click', closeMenu);
	});

	onDestroy(() => {
		window.removeEventListener('click', closeMenu);
	});

	function closeMenu() {
		// Dispatch a close event to the parent
		menuElement.dispatchEvent(new CustomEvent('close', { bubbles: true }));
	}
</script>

<div
	class="context-menu"
	bind:this={menuElement}
	style="left: {x}px; top: {y}px;"
	role="menu"
	tabindex="-1"
	on:click|stopPropagation
	on:keydown|stopPropagation={(event) => {
		if (event.key === 'Escape') {
			closeMenu();
		}
	}}
>
	<slot />
</div>

<style>
	.context-menu {
		position: fixed;
		z-index: 1000;
		background-color: white;
		border: 1px solid #e5e7eb; /* gray-200 */
		border-radius: 0.5rem; /* 8px */
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.1),
			0 2px 4px -2px rgb(0 0 0 / 0.1);
		padding: 0.5rem;
		min-width: 180px;
	}
</style>
