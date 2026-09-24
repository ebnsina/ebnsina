<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { Snippet } from 'svelte';

	let {
		type = 'info',
		title,
		children
	}: {
		type?: 'info' | 'tip' | 'warning' | 'danger';
		title?: string;
		children: Snippet;
	} = $props();
</script>

<div class="callout callout-{type}">
	<div class="flex items-start gap-3">
		<span class="callout-icon">
			<Icon name={type === 'info' ? 'info' : type === 'tip' ? 'lightbulb' : 'warning'} size={18} />
		</span>
		<div class="min-w-0">
			{#if title}<div class="callout-title">{title}</div>{/if}
			<div class="callout-body">{@render children()}</div>
		</div>
	</div>
</div>

<style>
	/* One palette token per type tints the fill and inks the icon and title;
	   body text stays --fg so it reads at full contrast on every tint. */
	.callout {
		--cl: var(--accent);
		position: relative;
		padding: 1rem 1.1rem;
		margin: 1.5rem 0;
		border-radius: var(--radius-card);
		border: 0;
		background: color-mix(in oklab, var(--cl) 12%, transparent);
		color: var(--cl);
	}
	.callout-info {
		--cl: var(--info);
	}
	.callout-tip {
		--cl: var(--success);
	}
	.callout-warning {
		--cl: var(--warning);
	}
	.callout-danger {
		--cl: var(--danger);
	}
	.callout-icon {
		flex-shrink: 0;
		margin-top: 2px;
		color: var(--cl);
	}
	.callout-title {
		font-weight: 600;
		font-size: 0.875rem;
		margin-bottom: 0.25rem;
		color: var(--cl);
	}
	.callout-body {
		font-size: 0.875rem;
		color: var(--fg);
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
	.callout-body :global(strong),
	.callout-body :global(a) {
		color: inherit;
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
		background: color-mix(in oklab, var(--cl) 16%, transparent);
		padding: 0.1em 0.35em;
		border-radius: 4px;
	}
</style>
