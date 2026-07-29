<script lang="ts">
	import type { SeriesInfo } from '$lib/content';
	import { auroraFor } from '$lib/colors';

	let { series }: { series: SeriesInfo } = $props();

	// Series titles read "<series> — <part>", so the shared prefix is redundant
	// once it's already the heading. Fall back to the full title if a post
	// doesn't follow that shape.
	function partLabel(title: string): string {
		const i = title.indexOf('—');
		return i > -1 ? title.slice(i + 1).trim() : title;
	}
</script>

<nav aria-label="Series navigation" class="media-card series-card mt-16">
	<!-- The aurora stands in for a cover image. `.aurora-surface` only paints the
	     gradient (unlike `.glass-card`, which also pins white ink and its own
	     radius/shadow), so the ink is set locally and the card owns the frame. -->
	<div class="series-cover aurora-surface" style={auroraFor(series.title)}>
		<span class="series-eyebrow">Series</span>
		<h2 class="series-heading">{series.title}</h2>
		<span class="series-count">Part {series.currentIndex + 1} of {series.parts.length}</span>
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
	/* Frame comes from .media-card in layout.css; this only sizes the cover,
	   which unlike a post card carries its own copy. */
	.series-cover {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.25rem;
		min-height: 10rem;
		padding: 1.15rem 1.25rem;
		color: #fff;
	}

	.series-eyebrow,
	.series-count {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: rgba(255, 255, 255, 0.82);
	}

	.series-heading {
		font-family: var(--font-serif, var(--font-display));
		font-size: 1.375rem;
		font-weight: 600;
		line-height: 1.15;
		letter-spacing: -0.01em;
		color: #fff;
		margin: 0;
	}

	.series-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.series-list li + li {
		border-top: 1px solid color-mix(in oklch, var(--fg) 7%, transparent);
	}

	.series-row {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.625rem 1.25rem;
		text-decoration: none;
		color: var(--fg);
		font-size: 0.9375rem;
		line-height: 1.45;
		transition: background-color 0.15s ease;
	}

	a.series-row:hover {
		background: color-mix(in oklch, var(--accent) 7%, var(--bg));
	}

	.series-num {
		flex: none;
		min-width: 1.25rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: color-mix(in oklch, var(--fg) 55%, transparent);
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
