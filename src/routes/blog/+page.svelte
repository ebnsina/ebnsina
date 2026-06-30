<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PostCard from '$lib/components/PostCard.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
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
