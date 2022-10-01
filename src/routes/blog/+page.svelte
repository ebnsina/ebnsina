<script lang="ts">
	export let data;
</script>

<svelte:head>
	<title>Blog - Ebn Sina</title>
</svelte:head>

<section class="py-10 lg:py-20 min-h-[70vh]">
	<div class="container mx-auto px-4 lg:px-0">
		<div class="max-w-lg mx-auto prose text-white prose-headings:text-white prose-emerald">
			{#each data.posts as post}
				<article class="mb-5">
					<h2 class="text-2xl m-0">
						<a href={post.path} class="no-underline">
							{post.meta.title}
						</a>
					</h2>
					<span class="block text-sm text-slate-400">Published {post.meta.date}</span>
				</article>
			{/each}
		</div>
	</div>
</section>
