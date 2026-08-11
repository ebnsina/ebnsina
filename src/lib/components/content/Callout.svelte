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
</script>

<div class="callout callout-{type}">
	<div class="flex items-start gap-3">
		<span class="callout-icon">
			{#if type === 'info'}
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line
						x1="12"
						y1="8"
						x2="12.01"
						y2="8"
					/></svg
				>
			{:else if type === 'tip'}
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path
						d="M2 12l10 5 10-5"
					/></svg
				>
			{:else}
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path
						d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
					/><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg
				>
			{/if}
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
		background: color-mix(in oklch, var(--cl) 12%, transparent);
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
		background: color-mix(in oklch, var(--cl) 16%, transparent);
		padding: 0.1em 0.35em;
		border-radius: 4px;
	}
</style>
