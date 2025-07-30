<script lang="ts">
	import BlogPost from '$lib/components/blog/BlogPost.svelte';

	export let data;
	const { posts, tag } = data;
</script>

<svelte:head>
	<title>{tag} - Articles & Insights - Ebn Sina</title>
</svelte:head>

<section class="">
	<div
		class="py-20 border-b border-slate-200 px-6"
		style="
    background-image: 
      repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px),
      repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 14px);
  "
	>
		<h1 class="text-xl md:text-3xl xl:text-4xl font-bold mb-4">
			Articles Tagged: <span class="text-primary">{tag}</span>
		</h1>
		<p class="text-sm md:text-base text-slate-600">
			Curated posts focused on <strong class="">{tag}</strong> to deepen your knowledge.
		</p>
	</div>

	<div class="pb-10 border-b border-slate-200 divide-y divide-slate-200">
		{#each posts as post, index}
			<div class="pt-12 px-6">
				<BlogPost {post} {index} />
			</div>
		{/each}
	</div>
</section>
