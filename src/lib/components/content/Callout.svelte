<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
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
	/* One colour per type drives the whole block — fill, ink and icon — so the
	   callout reads as a single tinted object rather than a bordered box. The
	   light-theme greens/ambers are darkened for contrast on a pale tint and
	   lifted again in dark. */
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
	.callout-tip {
		--cl: oklch(0.52 0.15 152);
	}
	.callout-warning {
		--cl: oklch(0.55 0.14 70);
	}
	:global(html.dark) .callout-tip {
		--cl: oklch(0.8 0.16 152);
	}
	:global(html.dark) .callout-warning {
		--cl: oklch(0.83 0.15 82);
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
		color: var(--cl);
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
