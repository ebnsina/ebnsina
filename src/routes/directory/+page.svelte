<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { getCategoryGroups, GROUP_ORDER } from '$lib/data/categories';
	import { getTotalChapters, getTracks } from '$lib/content';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import NotesFolder from '$lib/components/NotesFolder.svelte';
	import { auroraAt } from '$lib/colors';

	const groups = getCategoryGroups();
	const total = getTotalChapters();
	const trackCount = getTracks().length;
</script>

<Seo
	title="Track directory — Notes"
	description="Browse every notes track, grouped by area — foundations, languages, infrastructure, data, scaling and more."
/>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="The directory"
		title="Browse all tracks"
		description={`Every track, grouped by area — ${trackCount} tracks across ${total} chapters. Hover a folder to open its topics.`}
	/>

	<div class="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
		{#each GROUP_ORDER as groupName, gi (groupName)}
			{@const items = groups[groupName]}
			{#if items?.length}
				<NotesFolder name={groupName} {items} aurora={auroraAt(gi)} />
			{/if}
		{/each}
	</div>
</div>
