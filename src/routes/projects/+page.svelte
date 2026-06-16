<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import ContactCta from '$lib/components/ContactCta.svelte';
	import { projects } from '$lib/data/projects';
	import { SITE } from '$lib/config';
	import { reveal } from '$lib/actions';

	const sorted = [...projects].sort((a, b) => a.order - b.order || b.year - a.year);
</script>

<Seo title="Projects" description="Things I've built — products, tools, experiments." />

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="Work"
		title="Projects"
		description="A selection of the things I've designed, shipped, or contributed to."
		shape="cubes"
	/>

	<p class="mb-8 max-w-2xl text-[1.05rem] leading-[1.75] text-muted">
		A mix of products, internal platforms, and open-source tools. Most share a theme: take
		something operationally painful, make it boring and reliable, and get out of the way. A few
		highlights are below — source is on
		<a
			href={SITE.social.github}
			target="_blank"
			rel="noopener"
			class="text-fg underline decoration-[color-mix(in_oklch,var(--fg)_25%,transparent)] underline-offset-2 hover:text-accent"
			>GitHub</a
		>.
	</p>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each sorted as project, i (project.title)}
			<div use:reveal class="h-full"><ProjectCard {project} index={i} /></div>
		{/each}
	</div>

	<ContactCta />
</div>
