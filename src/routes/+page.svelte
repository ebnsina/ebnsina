<script lang="ts">
	import Typewriter from '$lib/components/Typewriter.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { SITE } from '$lib/config';

	const TITLES = [
		'Software Engineer',
		'Solution Architect',
		'Platform Engineer',
		'Backend Engineer',
		'Systems Designer',
		'Reliability Engineer',
		'Full-Stack Engineer'
	];

	const FOCUS = ['Backend & APIs', 'Distributed systems', 'Video & streaming', 'Data pipelines'];
</script>

<Seo />

<section
	class="hero relative isolate -mt-[6.5rem] -mb-12 overflow-hidden pt-14 sm:-mt-36 sm:-mb-20 sm:pt-16"
>
	<div class="hero-bg" aria-hidden="true"></div>

	<div
		class="mx-auto flex max-w-5xl flex-col items-center px-5 pt-12 pb-20 text-center sm:px-8 sm:pt-20 sm:pb-28"
	>
		<p class="mb-8 inline-flex items-center gap-2 eyebrow">
			<span class="inline-block size-1.5 rounded-full bg-accent"></span>
			<Typewriter words={TITLES} />
		</p>

		<h1
			class="font-display text-[clamp(2.5rem,7.2vw,5.75rem)] leading-[0.97] tracking-[-0.038em] text-balance"
		>
			Building <span class="text-accent">fast, durable</span> systems.
		</h1>

		<p class="mt-7 max-w-xl text-lg leading-[1.65] text-pretty text-muted sm:text-xl">
			I'm {SITE.name}, a backend and platform engineer. I design systems that stay fast and reliable
			as they scale, and write about how they work.
		</p>

		<div class="mt-10 flex flex-wrap items-center justify-center gap-3">
			<a href="/projects" class="btn btn-solid">See my work</a>
			<a href="/blog" class="btn btn-ghost">
				Read the writing
				<Icon name="arrowRight" size={14} class="icon-shift" />
			</a>
		</div>

		<ul
			class="mt-14 flex flex-wrap justify-center gap-x-6 gap-y-2 eyebrow"
			aria-label="Focus areas"
		>
			{#each FOCUS as item (item)}
				<li>{item}</li>
			{/each}
		</ul>
	</div>
</section>
