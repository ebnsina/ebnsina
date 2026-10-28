<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import Work from '$lib/components/home/Work.svelte';
	import { projects } from '$lib/data/projects';

	const sorted = [...projects].sort((a, b) => a.order - b.order || b.year - a.year);
</script>

<Seo title="Projects" description="Things I've built: products, tools, experiments." />

<div class="page">
	<PageBanner
		eyebrow="Work"
		title="Projects"
		description="Products I've built end to end, most complex first, and the engineering behind each one."
	/>
</div>

<Work items={sorted} heading="{sorted.length} projects" more={false} />
