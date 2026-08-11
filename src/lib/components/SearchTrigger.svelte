<script lang="ts">
	/** Opens the global search palette. On desktop the shortcut itself is the
	 *  affordance — no icon, no label. `compact` is the mobile form, where the
	 *  shortcut is meaningless without a keyboard, so it shows the icon instead. */
	import Icon from '$lib/components/Icon.svelte';
	import { openSearch, warmSearch } from '$lib/search-ui.svelte';

	let { compact = false }: { compact?: boolean } = $props();
</script>

<button
	type="button"
	onclick={openSearch}
	onpointerenter={warmSearch}
	onfocus={warmSearch}
	class="search-trigger"
	class:is-compact={compact}
	aria-label="Search"
	aria-keyshortcuts="Meta+K Control+K"
>
	{#if compact}
		<Icon name="search" size={18} />
	{:else}
		<kbd>⌘K</kbd>
	{/if}
</button>

<style>
	.search-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border-radius: var(--radius-button);
		/* Sized off the theme toggle beside it: same icon, same padding, so the
		   two read as one pair of controls rather than a pill next to a button. */
		padding: 0.375rem;
		font-size: 0.8rem;
		color: var(--muted);
		transition:
			color 0.15s,
			background-color 0.15s;
	}
	.search-trigger:hover {
		background: color-mix(in oklch, var(--fg) 6%, transparent);
		color: var(--fg);
	}
	kbd {
		border: 1px solid var(--rule);
		border-radius: 0.35rem;
		padding: 0.05rem 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		line-height: 1.5;
	}
</style>
