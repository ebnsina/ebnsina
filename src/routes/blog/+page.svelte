<script lang="ts">
	import BlogPost from '$lib/components/blog/BlogPost.svelte';
	import Tag from '$lib/components/blog/Tag.svelte';
	import SiteHeader from '$lib/components/shared/SiteHeader.svelte';

	export let data;
	const { posts, allTags } = data;
</script>

<svelte:head>
	<title>My Blog Posts - Ebn Sina - Full Stack Developer | Instructor | JS Evangelist</title>
</svelte:head>

<section class="min-h-screen flex justify-center flex-col">
	<SiteHeader>
		<span slot="title">Blog</span>
	</SiteHeader>

	<details>
		<summary class="mb-2 text-sm text-slate-600 uppercase tracking-wider">Tags</summary>
		<div>
			<div class="flex gap-2.5 items-center flex-wrap">
				{#each allTags as tag}
					<Tag {tag} />
				{/each}
			</div>
		</div>
	</details>

	<div class="mt-4">
		{#each posts as post}
			<BlogPost {post} />
		{/each}
	</div>
</section>
