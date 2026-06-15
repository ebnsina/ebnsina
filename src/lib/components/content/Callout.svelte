<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		type = 'info',
		title,
		children
	}: {
		type?: 'info' | 'tip' | 'warning';
		title?: string;
		children: Snippet;
	} = $props();

	const iconColor = $derived(
		{
			info: 'var(--accent)',
			tip: 'oklch(0.7 0.18 145)',
			warning: 'oklch(0.78 0.18 85)'
		}[type]
	);
</script>

<div class="callout callout-{type}">
	<div class="flex items-start gap-3">
		<span class="callout-icon" style="color: {iconColor}">
			{#if type === 'info'}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
			{:else if type === 'tip'}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
			{:else}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
			{/if}
		</span>
		<div class="min-w-0">
			{#if title}<div class="callout-title">{title}</div>{/if}
			<div class="callout-body">{@render children()}</div>
		</div>
	</div>
</div>

<style>
	.callout {
		position: relative;
		padding: 1rem 1.1rem;
		margin: 1.5rem 0;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklch, var(--fg) 8%, transparent);
		background: color-mix(in oklch, var(--fg) 2.5%, transparent);
	}
	.callout-icon {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.callout-title {
		font-weight: 600;
		font-size: 0.875rem;
		margin-bottom: 0.25rem;
		color: var(--fg);
	}
	.callout-body {
		font-size: 0.875rem;
		color: var(--muted);
		line-height: 1.7;
	}
	.callout-body :global(p) {
		margin: 0.5em 0;
	}
	.callout-body :global(p:first-child) {
		margin-top: 0;
	}
	.callout-body :global(p:last-child) {
		margin-bottom: 0;
	}
	.callout-body :global(strong) {
		color: var(--fg);
	}
	.callout-body :global(ul),
	.callout-body :global(ol) {
		margin: 0.5em 0;
		padding-left: 1.2em;
	}
	.callout-body :global(ul) {
		list-style: disc;
	}
	.callout-body :global(ol) {
		list-style: decimal;
	}
	.callout-body :global(code) {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		background: color-mix(in oklch, var(--fg) 10%, transparent);
		padding: 0.1em 0.35em;
		border-radius: 4px;
	}
</style>
