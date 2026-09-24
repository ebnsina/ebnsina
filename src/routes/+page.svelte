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

	const FOCUS = ['Video infrastructure', 'CDN & edge', 'Analytics pipelines', 'Developer tools'];
</script>

<Seo />

<section
	class="hero relative isolate -mt-[6.5rem] -mb-12 overflow-hidden pt-14 sm:-mt-36 sm:-mb-20 sm:pt-16"
>
	<div class="hero-bg" aria-hidden="true"></div>

	<div class="mx-auto flex max-w-3xl flex-col items-center px-5 pt-12 pb-20 text-center sm:px-8 sm:pt-20 sm:pb-28">
		<p
			class="mb-8 inline-flex items-center gap-2 rounded-full bg-[color-mix(in_oklch,var(--fg)_5%,transparent)] px-3.5 py-1.5 eyebrow"
		>
			<span class="inline-block size-1.5 rounded-full bg-accent"></span>
			<Typewriter words={TITLES} />
		</p>

		<h1
			class="font-display text-[2.4rem] font-semibold leading-[1.04] tracking-[-0.035em] text-balance sm:text-6xl"
		>
			Building <span class="text-accent">fast, durable</span> systems — and the craft behind them.
		</h1>

		<p class="mt-7 max-w-2xl text-lg leading-[1.65] text-pretty text-muted sm:text-xl">
			I'm {SITE.name}, an engineer where infrastructure meets product. Right now I'm deep in
			<span class="text-fg">video infrastructure</span> — ingest, transcoding at scale, and the edge caching
			that gets frames to viewers fast. I write here to think out loud.
		</p>

		<div class="mt-10 flex flex-wrap items-center justify-center gap-3">
			<a
				href="/projects"
				class="rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[color-mix(in_oklab,var(--accent-solid)_82%,black)]"
				>See my work</a
			>
			<a
				href="/blog"
				class="group inline-flex items-center gap-1.5 rounded-xl bg-[color-mix(in_oklch,var(--fg)_6%,transparent)] px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[color-mix(in_oklch,var(--fg)_10%,transparent)]"
			>
				Read the writing
				<Icon
					name="arrowRight"
					size={14}
					class="transition-transform group-hover:translate-x-0.5"
				/>
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

