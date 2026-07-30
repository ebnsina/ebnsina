<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import ArticleLayout from '$lib/components/ArticleLayout.svelte';
	import FormattedDate from '$lib/components/FormattedDate.svelte';
	import SeriesNav from '$lib/components/SeriesNav.svelte';
	import { getSeries } from '$lib/content';
	import { vtName } from '$lib/actions';

	let { data } = $props();
	const Content = $derived(data.component);
	const meta = $derived(data.meta);
	const series = $derived(getSeries(data.slug));
</script>

<Seo
	title={meta.title}
	description={meta.description}
	type="article"
	image={meta.cover ?? undefined}
/>

<ArticleLayout>
	{#snippet header()}
		<header class="mb-10 pb-8">
			<div
				class="article-meta mb-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-wider text-muted"
			>
				<FormattedDate date={meta.date} />
				{#if meta.minutesRead}
					<span>·</span><span>{meta.minutesRead} min read</span>
				{/if}
				{#if meta.updated}
					<span>·</span><span>Updated <FormattedDate date={meta.updated} /></span>
				{/if}
			</div>
			<h1
				class="mb-4 font-serif text-2xl font-semibold leading-[1.15] tracking-tight sm:text-3xl sm:leading-[1.1]"
				style={`view-transition-name: ${vtName('post-title', data.slug)}`}
			>
				{meta.title}
			</h1>
			<p class="text-base leading-relaxed text-muted sm:text-lg">{meta.description}</p>
			{#if meta.tags?.length}
				<div class="article-meta mt-5 flex flex-wrap gap-2">
					{#each meta.tags as t (t)}
						<a href={`/blog/tags/${t}`} class="tag-pill">#{t}</a>
					{/each}
				</div>
			{/if}
		</header>
	{/snippet}

	<Content />

	{#snippet footer()}
		{#if series}
			<SeriesNav {series} />
		{/if}
		<footer class="mt-16 flex justify-between pt-8 text-sm text-muted">
			<a href="/blog" class="hover:text-fg">← All writing</a>
			<a href="/rss.xml" class="hover:text-fg">Subscribe via RSS</a>
		</footer>
	{/snippet}
</ArticleLayout>
