<script lang="ts">
	import { cardGradients } from '$lib/utils/constants';

	export let data: any;
	const { post } = data;

	const randomColor = cardGradients[Math.floor(Math.random() * cardGradients.length)];
</script>

<svelte:head>
	<title>{post.title} - Ebn Sina</title>
</svelte:head>

<section class="px-6 md:px-24 py-6 md:py-10 space-y-4">
	<div class="max-w-xl mx-auto flex flex-col justify-center items-center space-y-6">
		<div
			class="rounded-xl h-56 w-full"
			style={`background: conic-gradient(from 180deg at center, ${randomColor});`}
		></div>

		<div class="text-xs text-slate-500">
			<time datetime={post.date}>{post.date}</time>
			<span>&middot;</span>
			<span>{post.readingTime} minutes to read</span>
		</div>

		<h1 class="text-2xl md:text-3xl text-center font-bold">{post.title}</h1>

		<div class="flex space-x-2 items-center">
			<div
				class={`size-10 rounded-xl -rotate-6`}
				style={`background: conic-gradient(from 180deg at center, ${randomColor});`}
			></div>
			<p>Ebn Sina</p>
		</div>
	</div>

	<div
		class="pt-10 prose prose-zinc prose-headings:text-2xl prose-headings:font-medium prose-img:rounded-xl prose-headings:underline prose-a:text-primary mx-auto"
	>
		{@html post.content}
	</div>
</section>
