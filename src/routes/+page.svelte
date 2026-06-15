<script lang="ts">
	import Hero from '$lib/three/Hero.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import { projects } from '$lib/data/projects';
	import { SITE } from '$lib/config';
	import { reveal } from '$lib/actions';
	import { colorFor } from '$lib/colors';

	const featured = projects.filter((p) => p.featured).sort((a, b) => a.order - b.order);

	const capabilities = [
		{ k: 'Backend', v: 'Distributed services, queues, durable execution.' },
		{ k: 'Frontend', v: 'Fast, accessible interfaces. Svelte, React, WebGL.' },
		{ k: 'Platform', v: 'CI/CD, observability, the boring glue that scales.' }
	];
</script>

<svelte:head>
	<title>{SITE.title}</title>
	<meta name="description" content={SITE.description} />
</svelte:head>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<!-- Hero -->
	<section class="relative -mx-5 mb-6 flex min-h-[82vh] items-center sm:-mx-8">
	<!-- 3D bleeds full-width past the container, vertically centred with the text -->
	<div class="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2">
		<Hero />
	</div>

	<div class="relative z-10 px-5 sm:px-8">
		<p class="mb-6 font-mono text-[0.7rem] uppercase tracking-[0.28em] text-muted">
			Software Engineer
		</p>
		<h1
			class="mb-7 max-w-2xl font-display text-[2.9rem] font-bold leading-[1.02] tracking-[-0.03em] sm:text-7xl"
		>
			Building <span class="text-accent">fast, durable</span> systems &mdash; and the craft
			behind them.
		</h1>
		<p class="max-w-xl text-lg leading-[1.65] text-muted sm:text-xl">
			I'm {SITE.name}. I design and ship product-grade software: distributed backends, snappy
			frontends, and the infrastructure that makes both possible. Currently focused on
			<span class="text-fg">platform engineering</span>.
		</p>
		<div class="mt-8 flex flex-wrap gap-3">
			<a
				href="/projects"
				class="rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-accent"
				>See projects</a
			>
			<a
				href="/about"
				class="rounded-full border border-[color-mix(in_oklch,var(--fg)_14%,transparent)] px-4 py-2 text-sm font-medium transition-colors hover:border-[color-mix(in_oklch,var(--accent)_45%,transparent)] hover:text-accent"
				>About me</a
			>
			<a
				href={`mailto:${SITE.email}`}
				class="rounded-full border border-[color-mix(in_oklch,var(--fg)_14%,transparent)] px-4 py-2 text-sm font-medium transition-colors hover:border-[color-mix(in_oklch,var(--accent)_45%,transparent)] hover:text-accent"
				>Get in touch</a
			>
		</div>
	</div>
</section>

<!-- Capabilities -->
<section class="grid gap-4 py-14 sm:grid-cols-3" use:reveal>
	{#each capabilities as c (c.k)}
		<div class="glass-card p-6" style="--cc: {colorFor(c.k)}">
			<h3 class="font-serif text-lg font-semibold tracking-tight">{c.k}</h3>
			<p class="mt-2 text-sm leading-[1.6] text-muted">{c.v}</p>
		</div>
	{/each}
</section>

<!-- Selected work -->
<section class="py-2" use:reveal>
	<div class="mb-6 flex items-baseline justify-between">
		<h2 class="font-serif text-2xl font-semibold tracking-tight">Selected work</h2>
		<a href="/projects" class="text-sm text-muted transition-colors hover:text-fg"
			>All projects →</a
		>
	</div>
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each featured as project, i (project.title)}
			<div class="h-full"><ProjectCard {project} index={i} /></div>
		{/each}
	</div>
	</section>
</div>
