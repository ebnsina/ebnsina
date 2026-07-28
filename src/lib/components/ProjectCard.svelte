<script lang="ts">
	import type { Project } from '$lib/data/projects';
	import { auroraFor } from '$lib/colors';
	let { project }: { project: Project } = $props();
	// Prefer the internal case-study page; fall back to a live/repo link.
	const primary = $derived(
		project.caseStudy ? `/projects/${project.slug}` : (project.url ?? project.repo)
	);
	const external = $derived(!project.caseStudy && !!primary);
</script>

<svelte:element
	this={primary ? 'a' : 'div'}
	href={primary}
	target={external ? '_blank' : undefined}
	rel={external ? 'noopener' : undefined}
	class="glass-card group flex h-full min-h-[7rem] flex-col justify-center p-5"
	style={auroraFor(project.title)}
>
	<h3
		class="line-clamp-2 font-serif text-base font-semibold leading-snug tracking-tight transition-colors group-hover:text-accent"
	>
		{project.title}
	</h3>
	<p class="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{project.description}</p>
	{#if project.caseStudy}
		<span
			class="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.15em] text-muted transition-colors group-hover:text-accent"
		>
			Case study →
		</span>
	{/if}
</svelte:element>
