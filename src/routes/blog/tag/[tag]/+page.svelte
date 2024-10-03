<script lang="ts">
	import BlogPost from '$lib/components/blog/BlogPost.svelte';

	export let data;
	const { posts, tag } = data;
</script>

<svelte:head>
	<title>Blog posts tagged with {tag}</title>
</svelte:head>

<section>
	<header class="mb-6">
		<h2>My Tags Post</h2>
		<a class="inline-flex text-slate-600" href="/">Ebn Sina</a>
	</header>

	<h4 class="text-base font-medium text-slate-600 mb-8">Posts tagged with "{tag}"</h4>

	{#each posts as post}
		<BlogPost {post} />
	{/each}
</section>
