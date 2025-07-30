<script lang="ts">
	import { cardColors } from '$lib/utils/constants';

	export let post: {
		slug: string;
		title: string;
		date: string;
		excerpt: string;
		tags: string[];
		readingTime: number;
	};

	export let index: number;

	const isEven = index % 2 === 1;

	const randomColor = cardColors[index % cardColors.length];
</script>

<article class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center mb-12">
	<div class={isEven ? 'md:order-2' : ''}>
		<time class="text-xs text-slate-600" datetime={post.date}>{post.date}</time>
		<span>&middot;</span>
		<span class="text-xs text-slate-600">{post.readingTime} minutes to read</span>

		<a class="hover:underline hover:text-primary" href={`/blog/${post.slug}`}>
			<h1 class="text-xl font-semibold mt-2">{post.title}</h1>
		</a>

		<p class="mt-2 text-slate-700 text-sm">{post.excerpt}</p>

		<div class="mt-4 flex space-x-2 items-center">
			<div
				class={`rounded-xl size-10 -rotate-6 hover:rotate-0 transition-all transform ${randomColor}`}
			></div>
			<span class="text-sm text-slate-600">Ebn Sina</span>
		</div>
	</div>

	<div class={isEven ? 'md:order-1' : ''}>
		<div
			class="relative rounded-xl h-56 w-full flex items-center justify-center text-center p-4"
			style="background: conic-gradient(from 180deg at center, #000000, #1f2937, #4b5563, #000000);"
		>
			<h2
				class={`text-white text-2xl font-extrabold drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] truncate ${isEven ? '-rotate-3' : 'rotate-3'}`}
			>
				{post.title}
			</h2>
		</div>
	</div>
</article>
