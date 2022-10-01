<script>
	export let data;
</script>

<svelte:head>
	<title>Blog - Ebn Sina</title>
</svelte:head>

<section class="py-10 lg:py-20">
	<div class="container mx-auto px-4 lg:px-0">
		<div class="prose text-white prose-headings:text-white prose-green">
			<div class="grid grid-cols-2 gap-4">
				{#each data.posts as post}
					<article class="border border-primary p-6">
						<h2 class="text-lg m-0">
							<a href={post.path}>
								{post.meta.title}
							</a>
						</h2>
						<span>Published {post.meta.date}</span>
					</article>
				{/each}
			</div>
		</div>
	</div>
</section>
