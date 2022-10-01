<script>
	export let data;
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<section class="py-10 lg:py-20">
	<div class="container mx-auto px-4 lg:px-0">
		<div class="max-w-3xl mx-auto">
			<article class="prose text-white prose-headings:text-white prose-emerald">
				<h1 class="text-white">{data.title}</h1>
				<p class="text-white">Published: {data.date}</p>
				<svelte:component this={data.content} />
			</article>
		</div>
	</div>
</section>
