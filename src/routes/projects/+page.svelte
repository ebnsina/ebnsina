<script lang="ts">
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import { projects } from '$lib/data/projects';
	import { reveal } from '$lib/actions';

	const sorted = [...projects].sort((a, b) => a.order - b.order || b.year - a.year);
</script>

<svelte:head>
	<title>Projects — Ebn Sina</title>
	<meta name="description" content="Things I've built — products, tools, experiments." />
</svelte:head>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="Work"
		title="Projects"
		description="A selection of the things I've designed, shipped, or contributed to."
		shape="cubes"
	/>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each sorted as project, i (project.title)}
			<div use:reveal class="h-full"><ProjectCard {project} index={i} /></div>
		{/each}
	</div>
</div>
