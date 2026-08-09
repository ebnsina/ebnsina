<script lang="ts">
	/** Opens the global search palette. `compact` is the icon-only form used in
	 *  the mobile header, where there is no room for the label and shortcut. */
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
	<Icon name="search" size={compact ? 18 : 15} />
	{#if !compact}
		<span class="label">Search</span>
		<kbd>⌘K</kbd>
	{/if}
</button>

<style>
	.search-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 0.75rem;
		padding: 0.4rem 0.6rem;
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
	.search-trigger.is-compact {
		padding: 0.375rem;
	}
	.label {
		font-size: 0.8rem;
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
