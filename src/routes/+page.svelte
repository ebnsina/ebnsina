<script lang="ts">
	import Hero from '$lib/three/Hero.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import PostCard from '$lib/components/PostCard.svelte';
	import Typewriter from '$lib/components/Typewriter.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { projects } from '$lib/data/projects';
	import { SITE } from '$lib/config';
	import { reveal } from '$lib/actions';

	let { data } = $props();

	const featured = projects.filter((p) => p.featured).sort((a, b) => a.order - b.order);

	const TITLES = [
		'Software Engineer',
		'Solution Architect',
		'Platform Engineer',
		'Backend Engineer',
		'Systems Designer',
		'Reliability Engineer',
		'Full-Stack Engineer'
	];
</script>

<Seo />

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<!-- Hero -->
	<section
		class="relative -mx-5 mb-6 flex min-h-[54vh] items-center py-10 sm:-mx-8 sm:min-h-[82vh] sm:py-0"
	>
		<!-- The point cloud is masked away from the left half so it never sits
			 behind the headline and copy, which was making them hard to read.
			 Mobile renders no canvas at all (threeEnabled() is false <768px). -->
		<div
			class="hero-canvas pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2"
		>
			<Hero />
		</div>

		<div class="relative z-10 px-5 sm:px-8">
			<p
				class="mb-6 inline-flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.28em] text-muted"
			>
				<span class="inline-block size-1.5 rounded-full bg-accent"></span>
				<Typewriter words={TITLES} />
			</p>
			<h1
				class="mb-7 max-w-xl font-display text-[2rem] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-4xl lg:text-5xl"
			>
				Building <span class="text-accent">fast, durable</span> systems &mdash; and the craft behind them.
			</h1>
			<p class="max-w-xl text-lg leading-[1.65] text-muted sm:text-xl">
				I'm {SITE.name}. I design and ship product-grade software: distributed backends, snappy
				frontends, and the infrastructure that makes both possible. Currently focused on
				<span class="text-fg">platform engineering</span>.
			</p>
			<div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
				<a
					href="/projects"
					class="rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[color-mix(in_oklch,var(--accent-solid)_82%,black)]"
					>See my work</a
				>
				<a
					href="/about"
					class="group inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-fg"
				>
					More about me
					<span class="transition-transform group-hover:translate-x-0.5">→</span>
				</a>
			</div>
		</div>
	</section>

	<!-- Intro -->
	<section class="border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] py-16" use:reveal>
		<p class="mb-5 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">Intro</p>
		<div class="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
			<h2 class="font-display text-2xl font-bold leading-[1.2] tracking-[-0.02em] sm:text-3xl">
				Engineer at the intersection of infrastructure and product.
			</h2>
			<div class="max-w-2xl space-y-4 text-[1.05rem] leading-[1.75] text-muted">
				<p>
					I've spent the last several years shipping software that real people rely on — backend
					services, developer tools, and the occasional deeply unfashionable internal CLI. Right now
					I'm deep in <span class="text-fg">video infrastructure</span>: ingest pipelines,
					transcoding at scale, and the edge caching that gets frames to viewers fast.
				</p>
				<p>
					I care about correctness, taste, and shipping. I write here mostly to think out loud —
					post-mortems, patterns that held up under load, and opinions I'd defend with diagrams.
				</p>
			</div>
		</div>
	</section>

	<!-- Selected work -->
	<section class="border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] py-16" use:reveal>
		<div class="mb-6 flex items-end justify-between gap-6">
			<div>
				<p class="mb-2 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">
					Selected work
				</p>
				<h2 class="font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
					Things I've shipped
				</h2>
			</div>
			<a href="/projects" class="shrink-0 text-sm text-muted transition-colors hover:text-fg"
				>All projects →</a
			>
		</div>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each featured as project (project.title)}
				<div class="h-full"><ProjectCard {project} /></div>
			{/each}
		</div>
	</section>

	<!-- Recent writing -->
	{#if data.posts.length}
		<section
			class="border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] py-16"
			use:reveal
		>
			<div class="mb-6 flex items-end justify-between gap-6">
				<div>
					<p class="mb-2 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">Writing</p>
					<h2 class="font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
						Recent notes
					</h2>
				</div>
				<a href="/blog" class="shrink-0 text-sm text-muted transition-colors hover:text-fg"
					>All writing →</a
				>
			</div>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.posts as post (post.slug)}
					<div class="h-full">
						<PostCard
							href={`/blog/${post.slug}`}
							title={post.meta.title}
							description={post.meta.description}
							slug={post.slug}
						/>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	/* Keep the point cloud clear of the copy: fully transparent across the left
	   (text) side, fading in across the middle. Only the standard `mask-image`
	   is written — Lightning CSS adds the -webkit- alias, and hand-writing both
	   makes it drop the standard one. */
	.hero-canvas {
		mask-image: linear-gradient(to right, transparent 46%, #000 72%);
	}
</style>
