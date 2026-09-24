<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import ArticleLayout from '$lib/components/ArticleLayout.svelte';
	import FormattedDate from '$lib/components/FormattedDate.svelte';
	import SeriesPager from '$lib/components/SeriesPager.svelte';

	let { data } = $props();
	const Content = $derived(data.component);
	const meta = $derived(data.meta);
	const series = $derived(data.series);
</script>

<Seo
	title={meta.title}
	description={meta.description}
	type="article"
	image={meta.cover ?? undefined}
/>

<ArticleLayout lang="bn">
	{#snippet header()}
		<header class="mb-10 pb-8">
			<div
				class="article-meta mb-4 flex flex-wrap items-center gap-3 eyebrow"
			>
				<a href={`/series/${series.series}`} class="transition-colors hover:text-fg" lang="bn"
					><Icon name="arrowLeft" size={14} /> {series.title}</a
				>
				<span class="text-rule">·</span>
				<span>Part {series.currentIndex + 1} / {series.parts.length}</span>
				<span class="text-rule">·</span>
				<FormattedDate date={meta.date} />
				{#if meta.minutesRead}
					<span class="text-rule">·</span><span>{meta.minutesRead} min read</span>
				{/if}
			</div>
			<h1
				class="mb-4 title-page"
			>
				{meta.title}
			</h1>
			<p class="text-base leading-relaxed text-muted sm:text-lg">{meta.description}</p>
			{#if meta.tags?.length}
				<!-- Plain pills, not links: tag pages index the standalone blog, and a
				     series part is read through its series, not through a tag. -->
				<div class="article-meta mt-5 flex flex-wrap gap-2" lang="en">
					{#each meta.tags as tag (tag)}
						<span class="tag-pill"><Icon name="tag" size={12} />{tag}</span>
					{/each}
				</div>
			{/if}
		</header>
	{/snippet}

	<Content />

	{#snippet footer()}
		<!-- Prev/next only: the full index lives on the series page, one click away
		     via "All parts" below — repeating it under every article was noise. -->
		<SeriesPager {series} />
		<footer class="mt-16 flex justify-between pt-8 text-sm text-muted">
			<a href={`/series/${series.series}`} class="hover:text-fg"><Icon name="arrowLeft" size={14} /> All parts</a>
			<a href="/rss.xml" class="hover:text-fg">Subscribe via RSS</a>
		</footer>
	{/snippet}
</ArticleLayout>
