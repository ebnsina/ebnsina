<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FormattedDate from '$lib/components/FormattedDate.svelte';
	import { auroraFor } from '$lib/colors';
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
	<nav class="pt-2 text-sm text-muted">
		<a href="/series" class="hover:text-fg">← All series</a>
	</nav>

	<header class="hero aurora-surface mt-6" style={auroraFor(meta.title)}>
		<span class="hero-eyebrow">
			Series · {partsLabel(parts.length, meta.plannedParts)} · {minutes} min · {meta.status ===
			'complete'
				? 'Complete'
				: 'Ongoing'}
		</span>
		<h1 class="hero-heading" lang="bn">{meta.title}</h1>
		<p class="hero-tagline">{meta.tagline}</p>
	</header>

	<p class="mt-8 max-w-2xl text-base leading-relaxed text-muted" lang="bn">
		{meta.description}
	</p>

	<a href={href(parts[0].slug)} class="start-link mt-7">
		Start with part 1
		<Icon name="arrowRight" size={15} />
	</a>

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
	.hero {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.5rem;
		min-height: 15rem;
		padding: 1.5rem 1.75rem;
		color: #fff;
	}

	.hero-eyebrow {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: rgba(255, 255, 255, 0.82);
	}

	.hero-heading {
		margin: 0;
		font-family: var(--font-serif, var(--font-display));
		font-size: 2rem;
		font-weight: 600;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}

	.hero-tagline {
		margin: 0;
		max-width: 44ch;
		font-size: 0.9375rem;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.9);
	}

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

	.parts {
		list-style: none;
		/* Set here, not as a utility class: the scoped selector outranks `mt-*`,
		   so a Tailwind margin on this element would silently do nothing. */
		margin: 3.5rem 0 0;
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
		background: color-mix(in oklch, var(--accent) 5%, var(--bg));
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
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: color-mix(in oklch, var(--fg) 45%, transparent);
	}

	@media (prefers-reduced-motion: reduce) {
		.part {
			transition: none;
		}
	}
</style>
