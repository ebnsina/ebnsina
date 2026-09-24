<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		description,
		lang,
		actions
	}: {
		eyebrow?: string;
		title: string;
		description?: string;
		lang?: string;
		/** optional controls rendered under the description */
		actions?: Snippet;
	} = $props();
</script>

<!-- Full-bleed and pulled up under the sticky header, like the home hero, so
	 the header blends into it. Must be the first thing inside <main>. -->
<section
	class="page-hero relative isolate mb-4 flex flex-col items-center px-5 pb-10 text-center sm:mb-6 sm:pb-12"
>
	<div class="hero-bg" aria-hidden="true"></div>
	{#if eyebrow}
		<p class="mb-5 eyebrow">{eyebrow}</p>
	{/if}
	<h1
		{lang}
		class="max-w-3xl font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-balance sm:text-5xl"
	>
		{title}
	</h1>
	{#if description}
		<p {lang} class="mt-5 max-w-xl text-base leading-[1.65] text-pretty text-muted sm:text-lg">
			{description}
		</p>
	{/if}
	{#if actions}
		<div class="mt-7 flex flex-wrap justify-center gap-3">{@render actions()}</div>
	{/if}
</section>

<style>
	/* escape the max-w container to full width, then undo main's top padding + header height */
	.page-hero {
		width: 100vw;
		margin-left: calc(50% - 50vw);
		margin-top: -6.5rem;
		padding-top: 7.5rem;
	}
	@media (min-width: 640px) {
		.page-hero {
			margin-top: -9rem;
			padding-top: 9.5rem;
		}
	}
</style>
