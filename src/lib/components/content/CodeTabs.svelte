<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		tsFile = 'main.ts',
		goFile = 'main.go',
		children
	}: { tsFile?: string; goFile?: string; children: Snippet } = $props();

	let active = $state<'ts' | 'go'>('ts');
	let root = $state<HTMLElement>();

	// Toggle the panels rendered (as raw HTML) by the markdown body.
	$effect(() => {
		if (!root) return;
		for (const panel of root.querySelectorAll<HTMLElement>('.ct-panel')) {
			panel.classList.toggle('ct-active', panel.dataset.lang === active);
		}
	});
</script>

<div class="code-tabs" bind:this={root}>
	<div class="code-tabs-header">
		<button class="code-tab-btn" class:active={active === 'ts'} onclick={() => (active = 'ts')}>
			<span class="tab-dot" style="background:#3178c6"></span>{tsFile}
		</button>
		<button class="code-tab-btn" class:active={active === 'go'} onclick={() => (active = 'go')}>
			<span class="tab-dot" style="background:#00add8"></span>{goFile}
		</button>
	</div>
	<div class="code-tabs-body">{@render children()}</div>
</div>

<style>
	.code-tabs {
		border: 1px solid var(--rule);
		border-radius: 12px;
		overflow: hidden;
		margin: 1.5rem 0;
	}
	.code-tabs-header {
		display: flex;
		border-bottom: 1px solid var(--rule);
		background: color-mix(in oklch, var(--fg) 3%, transparent);
	}
	.code-tab-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.5rem 1rem;
		font-size: 0.8125rem;
		font-family: var(--font-mono);
		color: var(--muted);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: color 0.15s;
	}
	.code-tab-btn.active {
		color: var(--fg);
		border-bottom-color: var(--accent);
	}
	.tab-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		display: inline-block;
		flex-shrink: 0;
	}
	/* panels come from the markdown body */
	.code-tabs-body :global(.ct-panel) {
		display: none;
	}
	.code-tabs-body :global(.ct-panel.ct-active) {
		display: block;
	}
	.code-tabs-body :global(pre) {
		margin: 0 !important;
		border-radius: 0 !important;
	}
</style>
