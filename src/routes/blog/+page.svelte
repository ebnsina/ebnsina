<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PostCard from '$lib/components/PostCard.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { partsLabel } from '$lib/data/series';
	import { reveal } from '$lib/actions';

	let { data } = $props();
</script>

<Seo
	title="Writing"
	description="Notes on engineering, craft, and the tools I use to build software."
/>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		title="Writing"
		description="Essays, post-mortems, and small notes on software engineering."
	/>
	{#if data.tags.length}
		<div class="-mt-6 mb-10 flex flex-wrap justify-center gap-2">
			{#each data.tags as t (t)}
				<a href={`/blog/tags/${t}`} class="tag-pill"><Icon name="tag" size={12} />{t}</a>
			{/each}
		</div>
	{/if}

	{#if data.series.length}
		<!-- Series live at /series; here they collapse to one strip so the grid
		     below stays the standalone writing. -->
		<div class="mb-10 flex flex-col gap-3">
			{#each data.series as { meta, count } (meta.slug)}
				<a
					use:reveal
					href={`/series/${meta.slug}`}
					class="series-strip surface"
				>
					<span class="strip-eyebrow"><Icon name="bookText" size={14} /> Series · {partsLabel(count, meta.plannedParts)}</span>
					<span class="strip-title" lang="bn">{meta.title}</span>
					<span class="strip-tagline">{meta.tagline}</span>
					<span class="strip-cta"><Icon name="arrowRight" size={16} /></span>
				</a>
			{/each}
		</div>
	{/if}

	<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.posts as post (post.slug)}
			<div use:reveal class="h-full">
				<PostCard
					href={`/blog/${post.slug}`}
					title={post.meta.title}
					description={post.meta.description}
					slug={post.slug}
				/>
			</div>
		{/each}
	</div>
</div>

<style>
	.series-strip {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			'eyebrow cta'
			'title cta'
			'tagline cta';
		align-items: center;
		gap: 0.2rem 1rem;
		padding: 1.15rem 1.35rem;
		text-decoration: none;
	}


	.strip-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		grid-area: eyebrow;
		font-family: var(--font-pixel);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--muted);
	}

	.strip-title {
		grid-area: title;
		font-family: var(--font-serif, var(--font-display));
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.25;
		letter-spacing: -0.01em;
	}

	.strip-tagline {
		grid-area: tagline;
		font-size: 0.875rem;
		line-height: 1.55;
		color: var(--muted);
	}

	.strip-cta {
		grid-area: cta;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--fg) 6%, transparent);
		transition: background-color 0.15s ease;
	}

	.series-strip:hover .strip-cta {
		background: color-mix(in oklch, var(--fg) 10%, transparent);
	}

	@media (prefers-reduced-motion: reduce) {
		.series-strip,
		.strip-cta {
			transition: none;
		}
	}
</style>
