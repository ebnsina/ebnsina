<script lang="ts">
	import ArticleLayout from '$lib/components/ArticleLayout.svelte';
	import FormattedDate from '$lib/components/FormattedDate.svelte';

	let { data } = $props();
	const Content = $derived(data.component);
	const meta = $derived(data.meta);
</script>

<svelte:head>
	<title>{meta.title} — Ebn Sina</title>
	<meta name="description" content={meta.description} />
</svelte:head>

<ArticleLayout>
	{#snippet header()}
		<header class="mb-10 pb-8">
			<div
				class="mb-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-wider text-muted"
			>
				<FormattedDate date={meta.date} />
				{#if meta.minutesRead}
					<span>·</span><span>{meta.minutesRead} min read</span>
				{/if}
				{#if meta.updated}
					<span>·</span><span>Updated <FormattedDate date={meta.updated} /></span>
				{/if}
			</div>
			<h1 class="mb-4 font-serif text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
				{meta.title}
			</h1>
			<p class="text-lg leading-relaxed text-muted">{meta.description}</p>
			{#if meta.tags?.length}
				<div class="mt-5 flex flex-wrap gap-2">
					{#each meta.tags as t (t)}
						<a href={`/blog/tags/${t}`} class="tag-pill">#{t}</a>
					{/each}
				</div>
			{/if}
		</header>
	{/snippet}

	<Content />

	{#snippet footer()}
		<footer class="mt-16 flex justify-between pt-8 text-sm text-muted">
			<a href="/blog" class="hover:text-fg">← All writing</a>
			<a href="/rss.xml" class="hover:text-fg">Subscribe via RSS</a>
		</footer>
	{/snippet}
</ArticleLayout>
