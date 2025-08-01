<script lang="ts">
	import BlogPost from '$lib/components/blog/BlogPost.svelte';
	import BlogTag from '$lib/components/blog/BlogTag.svelte';
	import { tagsColors } from '$lib/utils/constants';
	import { flip } from 'svelte/animate';

	export let data;
	const { posts, allTags } = data;
</script>

<svelte:head>
	<title>Blogs - Ebn Sina</title>
</svelte:head>

<section class="min-h-screen flex justify-center flex-col">
	<div
		class="py-20 border-b border-slate-200 px-6"
		style="
    background-image: 
      repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px),
      repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px);
  "
	>
		<h1 class="text-xl md:text-3xl xl:text-4xl font-bold mb-4">Blogs</h1>
		<p class="text-sm md:text-base text-slate-600">
			Deep dives and practical tips on development and technology.
		</p>
	</div>

	<div class="px-6 py-10 border-b border-slate-200">
		<div class="flex gap-2.5 items-center flex-wrap">
			{#each allTags as tag, index (tag)}
				<div animate:flip={{ delay: index * 1000 }}>
					<BlogTag label={tag} color={tagsColors[index % tagsColors.length]} />
				</div>
			{/each}
		</div>
	</div>

	<div class="pb-10 border-b border-slate-200 divide-y divide-slate-200">
		{#each posts as post, index}
			<div class="pt-12 px-6">
				<BlogPost {post} {index} />
			</div>
		{/each}
	</div>
</section>
