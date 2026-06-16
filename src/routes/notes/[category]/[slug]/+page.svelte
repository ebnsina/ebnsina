<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import ArticleLayout from '$lib/components/ArticleLayout.svelte';
	import LevelBadge from '$lib/components/content/LevelBadge.svelte';
	import ReadingBar from '$lib/components/notes/ReadingBar.svelte';
	import ChapterComplete from '$lib/components/notes/ChapterComplete.svelte';

	let { data } = $props();
	const Content = $derived(data.component);
	const meta = $derived(data.meta);
	const nextHref = $derived(data.next ? `/notes/${data.category}/${data.next.slug}` : null);
</script>

<Seo title={`${meta.title} — ${data.categoryLabel}`} description={meta.subtitle} type="article" />

<ReadingBar />

<ArticleLayout>
	{#snippet header()}
		<header class="mb-10 pb-8">
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<a
					href={`/notes/${data.category}`}
					class="text-[10px] font-semibold uppercase tracking-widest text-muted transition-colors hover:text-fg"
					>← {data.categoryLabel}</a
				>
				<span class="text-rule">·</span>
				<LevelBadge level={meta.level} />
				<span class="text-rule">·</span>
				<span class="text-[10px] font-semibold uppercase tracking-widest text-muted"
					>{meta.readingTime}</span
				>
				<span class="text-rule">·</span>
				<span class="text-[10px] font-semibold uppercase tracking-widest text-muted">
					{String(meta.chapter).padStart(2, '0')} / {String(data.total).padStart(2, '0')}
				</span>
			</div>
			<h1 class="mb-4 font-serif text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
				{meta.title}
			</h1>
			<p class="text-lg leading-relaxed text-muted">{meta.subtitle}</p>
			{#if meta.topics?.length}
				<div class="mt-5 flex flex-wrap gap-2">
					{#each meta.topics as t (t)}
						<span class="tag-pill">{t}</span>
					{/each}
				</div>
			{/if}
		</header>
	{/snippet}

	<Content />

	{#snippet footer()}
		<ChapterComplete
			category={data.category}
			slug={data.slug}
			level={meta.level}
			{nextHref}
		/>
		<nav class="mt-10 flex justify-between gap-3">
			{#if data.prev}
				<a href={`/notes/${data.category}/${data.prev.slug}`} class="chapter-nav-link">
					<span class="chapter-nav-label">← Previous</span>
					<span class="chapter-nav-title">{data.prev.meta.title}</span>
				</a>
			{:else}
				<div></div>
			{/if}
			{#if data.next}
				<a href={`/notes/${data.category}/${data.next.slug}`} class="chapter-nav-link ml-auto text-right">
					<span class="chapter-nav-label">Next →</span>
					<span class="chapter-nav-title">{data.next.meta.title}</span>
				</a>
			{:else}
				<div></div>
			{/if}
		</nav>
	{/snippet}
</ArticleLayout>

<style>
	.chapter-nav-link {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 0.75rem 0;
		text-decoration: none;
		max-width: 280px;
	}
	.chapter-nav-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}
	.chapter-nav-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 220px;
		transition: color 0.15s;
	}
	.chapter-nav-link:hover .chapter-nav-title {
		color: var(--accent);
	}
</style>
