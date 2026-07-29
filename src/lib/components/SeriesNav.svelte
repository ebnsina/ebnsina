<script lang="ts">
	import type { SeriesInfo } from '$lib/content';

	let { series }: { series: SeriesInfo } = $props();

	// Series titles read "<series> — <part>", so the shared prefix is redundant
	// once it's already the heading. Fall back to the full title if a post
	// doesn't follow that shape.
	function partLabel(title: string): string {
		const i = title.indexOf('—');
		return i > -1 ? title.slice(i + 1).trim() : title;
	}
</script>

<nav aria-label="Series navigation" class="series-nav mt-16">
	<div class="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<h2 class="font-serif text-base font-semibold tracking-tight">{series.title}</h2>
		<span class="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
			Part {series.currentIndex + 1} of {series.parts.length}
		</span>
	</div>

	<ol class="series-list">
		{#each series.parts as part, i (part.slug)}
			{@const current = i === series.currentIndex}
			<li>
				{#if current}
					<span class="series-row is-current" aria-current="page">
						<span class="series-num">{i + 1}</span>
						<span class="series-title">{partLabel(part.meta.title)}</span>
					</span>
				{:else}
					<a href={`/blog/${part.slug}`} class="series-row">
						<span class="series-num">{i + 1}</span>
						<span class="series-title">{partLabel(part.meta.title)}</span>
					</a>
				{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	.series-nav {
		border-top: 1px solid color-mix(in oklch, var(--fg) 10%, transparent);
		padding-top: 1.5rem;
	}

	.series-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1px;
		background: color-mix(in oklch, var(--fg) 7%, transparent);
		border: 1px solid color-mix(in oklch, var(--fg) 7%, transparent);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.series-row {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		background: var(--bg);
		text-decoration: none;
		color: var(--fg);
		font-size: 0.9375rem;
		line-height: 1.45;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	a.series-row:hover {
		background: color-mix(in oklch, var(--accent) 7%, var(--bg));
	}

	.series-num {
		flex: none;
		min-width: 1.25rem;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: var(--muted, color-mix(in oklch, var(--fg) 55%, transparent));
	}

	.is-current {
		background: color-mix(in oklch, var(--accent) 10%, var(--bg));
		font-weight: 600;
	}

	.is-current .series-num,
	.is-current .series-title {
		color: var(--accent);
	}

	@media (prefers-reduced-motion: reduce) {
		.series-row {
			transition: none;
		}
	}
</style>
