<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FormattedDate from '$lib/components/FormattedDate.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import { partLabel, partsLabel } from '$lib/data/series';
	import { reveal } from '$lib/actions';

	let { data } = $props();

	const meta = $derived(data.meta);
	const parts = $derived(data.parts);
	const minutes = $derived(parts.reduce((n, p) => n + (p.meta.minutesRead ?? 0), 0));
	const href = $derived((slug: string) => `/series/${meta.slug}/${slug}`);
</script>

<Seo title={meta.title} description={meta.tagline} />

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow={`Series · ${partsLabel(parts.length, meta.plannedParts)} · ${minutes} min · ${meta.status === 'complete' ? 'Complete' : 'Ongoing'}`}
		title={meta.title}
		description={meta.tagline}
		lang="bn"
	>
		{#snippet actions()}
			<a href={href(parts[0].slug)} class="start-link">
				Start with part 1
				<Icon name="arrowRight" size={15} />
			</a>
			<a href="/series" class="back-link">All series</a>
		{/snippet}
	</PageBanner>

	<p class="mx-auto max-w-2xl text-base leading-relaxed text-muted" lang="bn">
		{meta.description}
	</p>

	<ol class="parts" lang="bn">
		{#each parts as part (part.slug)}
			<li use:reveal>
				<a href={href(part.slug)} class="part">
					<span class="part-num">{String(part.meta.seriesPart).padStart(2, '0')}</span>
					<span class="part-copy">
						<span class="part-title">{partLabel(part.meta.title)}</span>
						<span class="part-desc">{part.meta.description}</span>
						<span class="part-meta" lang="en">
							<FormattedDate date={part.meta.date} />
							{#if part.meta.minutesRead}
								<span>·</span><span>{part.meta.minutesRead} min read</span>
							{/if}
						</span>
					</span>
				</a>
			</li>
		{/each}
	</ol>
</div>

<style>
	.start-link {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.6rem 1.05rem;
		border-radius: var(--radius-button);
		background: var(--accent-solid);
		color: #fff;
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		padding: 0.6rem 1.05rem;
		border-radius: var(--radius-button);
		background: color-mix(in oklch, var(--fg) 6%, transparent);
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
	}

	.parts {
		list-style: none;
		/* Set here, not as a utility class: the scoped selector outranks `mt-*`,
		   so a Tailwind margin on this element would silently do nothing. */
		margin: 3.5rem auto 0;
		max-width: 48rem;
		padding: 0;
		border-top: 1px solid var(--rule);
	}

	.parts li {
		border-bottom: 1px solid var(--rule);
	}

	.part {
		display: flex;
		gap: 1rem;
		padding: 1.15rem 0.5rem;
		text-decoration: none;
		color: var(--fg);
		transition: background-color 0.15s ease;
	}

	.part:hover {
		background: color-mix(in oklab, var(--accent) 5%, var(--bg));
	}

	.part-num {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		line-height: 1.6;
		color: color-mix(in oklch, var(--fg) 45%, transparent);
	}

	.part-copy {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	.part-title {
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.35;
		transition: color 0.15s ease;
	}

	.part:hover .part-title {
		color: var(--accent);
	}

	.part-desc {
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--muted);
	}

	.part-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		font-family: var(--font-pixel);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: color-mix(in oklch, var(--fg) 45%, transparent);
	}

	@media (prefers-reduced-motion: reduce) {
		.part {
			transition: none;
		}
	}
</style>
