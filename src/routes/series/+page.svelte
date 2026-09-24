<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { partLabel, partsLabel } from '$lib/data/series';
	import { reveal } from '$lib/actions';

	let { data } = $props();

	// Enough parts to show the shape of the series without turning the index
	// into the series page itself.
	const PREVIEW = 4;
</script>

<Seo
	title="Series"
	description="Multi-part writing meant to be read in order: one subject taken from first principles to production."
/>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		title="Series"
		description="Multi-part writing meant to be read in order: one subject, taken from first principles all the way to production."
	/>

	<div class="flex flex-col gap-10">
		{#each data.series as { meta, parts } (meta.slug)}
			<section use:reveal class="series-panel">
				<a href={`/series/${meta.slug}`} class="panel-cover surface">
					<span class="panel-eyebrow">
						<Icon name="bookText" size={14} />
						{partsLabel(parts.length, meta.plannedParts)} · {meta.status === 'complete'
							? 'Complete'
							: 'Ongoing'}
					</span>
					<h2 class="panel-heading" lang="bn">{meta.title}</h2>
					<p class="panel-tagline">{meta.tagline}</p>
				</a>

				<div class="panel-body">
					<ol class="panel-list" lang="bn">
						{#each parts.slice(0, PREVIEW) as part (part.slug)}
							<li>
								<a href={`/series/${meta.slug}/${part.slug}`} class="panel-row">
									<span class="panel-num">{String(part.meta.seriesPart).padStart(2, '0')}</span>
									<span class="panel-title">{partLabel(part.meta.title)}</span>
								</a>
							</li>
						{/each}
					</ol>
					<a href={`/series/${meta.slug}`} class="panel-more">
						{parts.length > PREVIEW ? `All ${partsLabel(parts.length)}` : 'Open the series'}
						<Icon name="arrowRight" size={14} />
					</a>
				</div>
			</section>
		{/each}
	</div>
</div>

<style>
	.series-panel {
		display: grid;
		gap: 1.5rem;
		align-items: start;
	}

	@media (min-width: 768px) {
		.series-panel {
			grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
			gap: 2rem;
		}
	}

	.panel-cover {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.4rem;
		min-height: 12rem;
		padding: 1.25rem 1.35rem;
		text-decoration: none;
	}

	.panel-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-pixel);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--muted);
	}

	.panel-heading {
		margin: 0;
		font-family: var(--font-serif, var(--font-display));
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}

	.panel-tagline {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.55;
		color: var(--muted);
	}

	.panel-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.panel-list li + li {
		border-top: 1px solid color-mix(in oklch, var(--fg) 7%, transparent);
	}

	.panel-row {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.625rem 0.5rem;
		border-radius: var(--radius-button);
		text-decoration: none;
		color: var(--fg);
		font-size: 0.9375rem;
		line-height: 1.5;
		transition: background-color 0.15s ease;
	}

	.panel-row:hover {
		background: color-mix(in oklab, var(--accent) 7%, var(--bg));
	}

	.panel-num {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: color-mix(in oklch, var(--fg) 55%, transparent);
	}

	.panel-more {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.85rem;
		padding-left: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--accent);
		text-decoration: none;
	}

	.panel-more:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	@media (prefers-reduced-motion: reduce) {
		.panel-cover,
		.panel-row {
			transition: none;
		}
	}
</style>
