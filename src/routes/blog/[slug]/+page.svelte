<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import ArticleLayout from '$lib/components/ArticleLayout.svelte';
	import FormattedDate from '$lib/components/FormattedDate.svelte';
	import { vtName } from '$lib/actions';

	let { data } = $props();
	const Content = $derived(data.component);
	const meta = $derived(data.meta);
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
				class="article-meta mb-4 flex flex-wrap items-center gap-3 eyebrow"
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
				class="mb-4 title-page"
				style={`view-transition-name: ${vtName('post-title', data.slug)}`}
			>
				{meta.title}
			</h1>
			<p class="text-base leading-relaxed text-muted sm:text-lg">{meta.description}</p>
			{#if meta.tags?.length}
				<div class="article-meta mt-5 flex flex-wrap gap-2">
					{#each meta.tags as t (t)}
						<a href={`/blog/tags/${t}`} class="tag-pill"><Icon name="tag" size={12} />{t}</a>
					{/each}
				</div>
			{/if}
		</header>
	{/snippet}

	<Content />

	{#snippet footer()}
		<footer class="mt-16 flex justify-between pt-8 text-sm text-muted">
			<a href="/blog" class="hover:text-fg"><Icon name="arrowLeft" size={14} /> All writing</a>
			<a href="/rss.xml" class="hover:text-fg">Subscribe via RSS</a>
		</footer>
	{/snippet}
</ArticleLayout>
