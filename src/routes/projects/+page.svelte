<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import { projects } from '$lib/data/projects';
	import { reveal } from '$lib/actions';

	const sorted = [...projects].sort((a, b) => a.order - b.order || b.year - a.year);
</script>

<Seo title="Projects" description="Things I've built: products, tools, experiments." />

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="Work"
		title="Projects"
		description="Products I've designed and built, and the engineering behind each one."
	/>

	<p class="mx-auto mb-10 max-w-2xl text-center text-[1.05rem] leading-[1.75] text-muted">
		Products I’ve built end to end, ordered from the most complex down: deployment, video, CDN, live
		streaming, AI calling, education, analytics, commerce and the tools around them. Each page says
		what’s built and what’s next. The theme is the same throughout: take something operationally
		painful and make it boring and reliable.
	</p>

	<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
		{#each sorted as project (project.title)}
			<div use:reveal class="h-full"><ProjectCard {project} /></div>
		{/each}
	</div>
</div>
