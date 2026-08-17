<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PostCard from '$lib/components/PostCard.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { auroraFor } from '$lib/colors';
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
		eyebrow="Writing"
		title="Writing"
		description="Essays, post-mortems, and small notes on software engineering."
		shape="pages"
	/>
	{#if data.tags.length}
		<div class="-mt-6 mb-10 flex flex-wrap gap-2">
			{#each data.tags as t (t)}
				<a href={`/blog/tags/${t}`} class="tag-pill">#{t}</a>
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
					class="series-strip aurora-surface"
					style={auroraFor(meta.title)}
				>
					<span class="strip-eyebrow">Series · {partsLabel(count, meta.plannedParts)}</span>
					<span class="strip-title" lang="bn">{meta.title}</span>
					<span class="strip-tagline">{meta.tagline}</span>
					<span class="strip-cta"><Icon name="arrowRight" size={16} color="#fff" /></span>
				</a>
			{/each}
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
		color: #fff;
		text-decoration: none;
		transition: transform 0.2s ease;
	}

	.series-strip:hover {
		transform: translateY(-2px);
	}

	.strip-eyebrow {
		grid-area: eyebrow;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: rgba(255, 255, 255, 0.82);
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
		color: rgba(255, 255, 255, 0.88);
	}

	.strip-cta {
		grid-area: cta;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.16);
		transition: background-color 0.15s ease;
	}

	.series-strip:hover .strip-cta {
		background: rgba(255, 255, 255, 0.28);
	}

	@media (prefers-reduced-motion: reduce) {
		.series-strip,
		.strip-cta {
			transition: none;
		}
	}
</style>
