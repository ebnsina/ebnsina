<script lang="ts">
	import BlogPost from '$lib/components/blog/BlogPost.svelte';
	import BlogTag from '$lib/components/blog/BlogTag.svelte';
	import PatternedSection from '$lib/components/shared/PatternedSection.svelte';
	import { tagsColors } from '$lib/utils/constants';
	import { flip } from 'svelte/animate';

	export let data;
	const { posts, allTags } = data;
</script>

<svelte:head>
	<title>Blogs - Ebn Sina</title>
</svelte:head>

<section class="min-h-screen flex justify-center flex-col">
	<PatternedSection
		title="Blogs"
		description="Deep dives and practical tips on development and technology."
	/>

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
