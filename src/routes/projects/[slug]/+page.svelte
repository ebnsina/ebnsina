<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import ContactCta from '$lib/components/ContactCta.svelte';
	import { reveal, vtName } from '$lib/actions';
	import { auroraFor, catFor } from '$lib/colors';
	import { ArrowUpRight } from '@lucide/svelte';

	let { data } = $props();
	const project = $derived(data.project);
	const cs = $derived(data.project.caseStudy!);
	const accent = $derived(catFor(project.title));
</script>

<Seo
	title={`${project.title} — Case study`}
	description={cs.summary}
	type="article"
/>

<article class="mx-auto max-w-3xl px-5 pb-8 sm:px-8" style="--cc: {accent}">
	<a
		href="/projects"
		class="mt-2 inline-block font-mono text-[0.72rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-fg"
	>
		← Projects
	</a>

	<header class="mb-12 mt-6 border-b border-[color-mix(in_oklch,var(--fg)_10%,transparent)] pb-10">
		<div class="mb-4 flex flex-wrap items-center gap-3 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-muted">
			<span>{project.year}</span>
			{#if cs.status}<span>·</span><span>{cs.status}</span>{/if}
			{#if project.featured}<span>·</span><span style="color: var(--cc)">Featured</span>{/if}
		</div>
		<h1
			class="font-serif text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl"
			style={`view-transition-name: ${vtName('project-title', project.slug)}`}
		>
			{project.title}
		</h1>
		<p class="mt-4 text-base leading-relaxed text-muted sm:text-lg">{cs.summary}</p>

		<div class="mt-6 flex flex-wrap gap-2">
			{#each project.stack as tech (tech)}
				<span class="tag-pill">{tech}</span>
			{/each}
		</div>

		{#if project.url}
			<a
				href={project.url}
				target="_blank"
				rel="noopener"
				class="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-fg underline decoration-[color-mix(in_oklch,var(--fg)_25%,transparent)] underline-offset-4 transition-colors hover:text-accent"
			>
				Visit project <ArrowUpRight size={15} strokeWidth={2.5} />
			</a>
		{/if}
	</header>

	<!-- Problem -->
	<section class="mb-12" use:reveal>
		<h2 class="mb-3 font-mono text-[0.72rem] uppercase tracking-[0.2em]" style="color: var(--cc)">
			The problem
		</h2>
		<p class="text-[1.05rem] leading-[1.8] text-fg/90">{cs.problem}</p>
	</section>

	<!-- Challenges -->
	<section class="mb-12" use:reveal>
		<h2 class="mb-5 font-mono text-[0.72rem] uppercase tracking-[0.2em]" style="color: var(--cc)">
			Challenges
		</h2>
		<div class="space-y-6">
			{#each cs.challenges as item (item.title)}
				<div>
					<h3 class="mb-1.5 font-serif text-lg font-semibold tracking-tight">{item.title}</h3>
					<p class="leading-[1.75] text-muted">{item.body}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Implementation -->
	<section class="mb-12" use:reveal>
		<h2 class="mb-5 font-mono text-[0.72rem] uppercase tracking-[0.2em]" style="color: var(--cc)">
			Implementation
		</h2>
		<div class="space-y-6">
			{#each cs.implementation as item (item.title)}
				<div class="glass-card p-5" style={auroraFor(item.title)}>
					<h3 class="mb-1.5 font-serif text-lg font-semibold tracking-tight">{item.title}</h3>
					<p class="leading-[1.75] text-muted">{item.body}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Stack rationale -->
	<section class="mb-12" use:reveal>
		<h2 class="mb-5 font-mono text-[0.72rem] uppercase tracking-[0.2em]" style="color: var(--cc)">
			Why this stack
		</h2>
		<dl class="divide-y divide-[color-mix(in_oklch,var(--fg)_8%,transparent)]">
			{#each cs.stackWhy as row (row.tech)}
				<div class="grid grid-cols-[8rem_1fr] gap-4 py-3 sm:grid-cols-[10rem_1fr]">
					<dt class="font-mono text-sm font-medium text-fg">{row.tech}</dt>
					<dd class="text-sm leading-relaxed text-muted">{row.why}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<!-- Features -->
	<section class="mb-4" use:reveal>
		<h2 class="mb-5 font-mono text-[0.72rem] uppercase tracking-[0.2em]" style="color: var(--cc)">
			What it does
		</h2>
		<ul class="grid gap-2.5 sm:grid-cols-2">
			{#each cs.features as feat (feat)}
				<li class="flex gap-2.5 text-sm leading-relaxed text-muted">
					<span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style="background: var(--cc)"></span>
					<span>{feat}</span>
				</li>
			{/each}
		</ul>
	</section>

	<ContactCta />
</article>
