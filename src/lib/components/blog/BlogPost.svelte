<script lang="ts">
	import ClockIcon from '$lib/icons/ClockIcon.svelte';
	import Tag from './Tag.svelte';

	export let post: {
		slug: string;
		title: string;
		excerpt: string;
		tags: string[];
		readingTime: number;
	};
</script>

<article
	class="mb-8 border border-dashed border-slate-300 rounded-md hover:border-primary transition p-6"
>
	<h2 class="text-lg font-medium mb-2">
		<a href={`/blog/${post.slug}`} class="hover:underline hover:text-primary">{post.title}</a>
	</h2>

	<div class="flex space-x-2 items-center mb-2 text-slate-500">
		<ClockIcon />
		<p class="text-xs text-slate-500">{post.readingTime} minutes</p>
		<span>&middot;</span>
		<p class="text-slate-600 text-sm flex-1 truncate">{post.excerpt}</p>
	</div>

	<div class="flex space-x-2 items-center mb-2">
		{#each post.tags as tag}
			<Tag {tag} />
		{/each}
	</div>
</article>
