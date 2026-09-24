<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { Project } from '$lib/data/projects';
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
	class="media-card group relative h-full {primary ? 'media-card--link' : ''}"
>
	<div class="flex flex-1 flex-col">
		<span
			class="pointer-events-none absolute right-7 top-7 -rotate-12 text-accent opacity-80 transition duration-300 group-hover:rotate-0 group-hover:scale-110 group-hover:opacity-100 motion-reduce:transition-none"
			aria-hidden="true"
		>
			<Icon name={project.icon} size={36} />
		</span>
		<h3
			class="pr-12 font-display text-base font-semibold leading-snug tracking-tight transition-colors group-hover:text-accent"
		>
			{project.title}
		</h3>
		<p class="mt-2.5 line-clamp-2 text-[0.95rem] leading-relaxed text-muted">
			{project.description}
		</p>
		{#if project.caseStudy}
			<span
				class="mt-auto inline-flex items-center gap-1.5 pt-7 eyebrow transition-colors group-hover:text-accent"
			>
				Case study <Icon name="arrowRight" size={14} />
			</span>
		{/if}
	</div>
</svelte:element>
