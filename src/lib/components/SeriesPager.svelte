<script lang="ts">
	/**
	 * Step to the neighbouring part. The full index lives on the series page, so
	 * this is the only in-article navigation — the "keep reading" move, which is
	 * why *next* stays on the right even when there is no previous part.
	 */
	import type { SeriesInfo } from '$lib/content';
	import { partLabel } from '$lib/data/series';
	import Icon from '$lib/components/Icon.svelte';

	let { series }: { series: SeriesInfo } = $props();

	const prev = $derived(series.prev);
	const next = $derived(series.next);
	const href = (slug: string) => `/series/${series.series}/${slug}`;
</script>

<nav aria-label="Series parts" class="pager mt-16">
	{#if prev}
		<a href={href(prev.slug)} class="pager-link is-prev">
			<span class="pager-eyebrow">
				<Icon name="arrowLeft" size={13} />
				Part {prev.meta.seriesPart}
			</span>
			<span class="pager-title">{partLabel(prev.meta.title)}</span>
		</a>
	{:else}
		<span class="pager-edge">Part 1, the start of the series</span>
	{/if}

	{#if next}
		<a href={href(next.slug)} class="pager-link is-next">
			<span class="pager-eyebrow">
				Part {next.meta.seriesPart}
				<Icon name="arrowRight" size={13} />
			</span>
			<span class="pager-title">{partLabel(next.meta.title)}</span>
		</a>
	{:else}
		<span class="pager-edge is-next">You've finished the series</span>
	{/if}
</nav>

<style>
	.pager {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 640px) {
		.pager {
			grid-template-columns: 1fr 1fr;
		}
	}

	.pager-link,
	.pager-edge {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.875rem 1rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		text-decoration: none;
		color: var(--fg);
		transition:
			border-color 0.15s ease,
			background-color 0.15s ease;
	}

	.pager-link:hover {
		border-color: color-mix(in oklab, var(--accent) 45%, var(--rule));
		background: color-mix(in oklab, var(--accent) 5%, var(--bg));
	}

	.is-next {
		text-align: right;
	}

	.pager-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-pixel);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--muted);
	}

	.is-next .pager-eyebrow {
		justify-content: flex-end;
	}

	.pager-link:hover .pager-eyebrow {
		color: var(--accent);
	}

	.pager-title {
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.4;
	}

	/* The edge of the series is stated, not linked — an empty cell would leave
	   the remaining half looking mis-aligned. */
	.pager-edge {
		justify-content: center;
		border-style: dashed;
		color: var(--muted);
		font-size: 0.875rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.pager-link {
			transition: none;
		}
	}
</style>
