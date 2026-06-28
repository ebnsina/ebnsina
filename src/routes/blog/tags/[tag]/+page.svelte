<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PostCard from '$lib/components/PostCard.svelte';

	let { data } = $props();
</script>

<Seo title={`#${data.tag}`} description={`Posts tagged #${data.tag}`} />

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<header class="mb-10">
		<a href="/blog" class="text-sm text-muted hover:text-fg">← All writing</a>
		<h1 class="mt-4 font-serif text-5xl font-semibold tracking-tight">
			<span class="text-muted">#</span>{data.tag}
		</h1>
		<p class="mt-2 text-muted">
			{data.posts.length} post{data.posts.length === 1 ? '' : 's'}
		</p>
	</header>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.posts as post (post.slug)}
			<div class="h-full">
				<PostCard
					href={`/blog/${post.slug}`}
					title={post.meta.title}
					description={post.meta.description}
				/>
			</div>
		{/each}
	</div>
</div>
