<script lang="ts">
	import type { Project } from '$lib/data/projects';
	import { colorFor } from '$lib/colors';
	let { project, index = 0 }: { project: Project; index?: number } = $props();
	const primary = $derived(project.url ?? project.repo);
</script>

<svelte:element
	this={primary ? 'a' : 'div'}
	href={primary}
	target={primary ? '_blank' : undefined}
	rel={primary ? 'noopener' : undefined}
	class="glass-card group flex h-full min-h-[7rem] flex-col justify-center p-5"
	style="--cc: {colorFor(project.title)}"
>
	<h3 class="truncate font-serif text-lg font-semibold tracking-tight transition-colors group-hover:text-accent">
		{project.title}
	</h3>
	<p class="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{project.description}</p>
</svelte:element>
