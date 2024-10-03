<script lang="ts">
	import Tag from '$lib/components/blog/Tag.svelte';
	import ClockIcon from '$lib/icons/ClockIcon.svelte';

	export let data: any;
	const { post } = data;
</script>

<svelte:head>
	<title>{post.title}</title>
</svelte:head>

<section>
	<header class="mb-6">
		<h2>My Blog</h2>
		<a class="inline-flex text-slate-600" href="/">Ebn Sina</a>
	</header>

	<article class="prose prose-slate prose-headings:text-2xl prose-headings:font-medium mx-auto">
		<h1>{post.title}</h1>

		<div class="flex text-xs text-slate-500 space-x-2 items-center mb-4">
			<ClockIcon />
			<span>{post.readingTime} minutes to read</span>
		</div>

		<div class="mb-4 space-x-2 items-center">
			{#each post.tags as tag}
				<Tag {tag} />
			{/each}
		</div>

		<div class="mt-6">
			{@html post.content}
		</div>
	</article>
</section>
