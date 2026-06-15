<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, children }: { title?: string; children: Snippet } = $props();
</script>

<div class="diagram">
	{#if title}
		<div class="diagram-label">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
				<line x1="3" y1="9" x2="21" y2="9" />
				<line x1="9" y1="21" x2="9" y2="9" />
			</svg>
			{title}
		</div>
	{/if}
	<div class="diagram-body">{@render children()}</div>
</div>

<style>
	.diagram {
		border: 1px solid color-mix(in oklch, var(--fg) 8%, transparent);
		border-radius: 0.75rem;
		padding: 1.25rem;
		margin: 1.5rem 0;
		overflow-x: auto;
		background: color-mix(in oklch, var(--fg) 2.5%, transparent);
	}
	.diagram-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		margin-bottom: 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--rule);
	}
	/* Diagram primitives used by the content's raw HTML */
	.diagram-body :global(.diagram-row) {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin: 0.5rem 0;
	}
	.diagram-body :global(.box) {
		padding: 0.6rem 0.9rem;
		border-radius: 10px;
		font-size: 0.82rem;
		font-weight: 600;
		text-align: center;
		line-height: 1.3;
		border: 1px solid color-mix(in oklch, var(--fg) 12%, transparent);
		background: color-mix(in oklch, var(--fg) 5%, transparent);
		color: var(--fg);
	}
	.diagram-body :global(.box-client),
	.diagram-body :global(.box-server),
	.diagram-body :global(.box-db),
	.diagram-body :global(.box-lb),
	.diagram-body :global(.box-cache),
	.diagram-body :global(.box-queue) {
		border-color: color-mix(in oklch, var(--accent) 45%, transparent);
		background: color-mix(in oklch, var(--accent) 12%, transparent);
	}
	.diagram-body :global(.arrow),
	.diagram-body :global(.arrow-down) {
		font-family: var(--font-mono);
		color: var(--muted);
		font-size: 0.85rem;
		white-space: nowrap;
	}
</style>
