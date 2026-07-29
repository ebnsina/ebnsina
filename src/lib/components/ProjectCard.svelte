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
	class="media-card group h-full {primary ? 'media-card--link' : ''}"
>
	<div class="media-card__cover aurora-surface" style={auroraFor(project.title)}></div>
	<div class="media-card__body">
		<h3
			class="line-clamp-2 font-serif text-base font-semibold leading-snug tracking-tight transition-colors group-hover:text-accent"
		>
			{project.title}
		</h3>
		<p class="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{project.description}</p>
		{#if project.caseStudy}
			<span
				class="mt-auto pt-2 font-mono text-[0.7rem] uppercase tracking-[0.15em] text-muted transition-colors group-hover:text-accent"
			>
				Case study →
			</span>
		{/if}
	</div>
</svelte:element>
