<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { getCategoryGroups, GROUP_ORDER } from '$lib/data/categories';
	import { getTotalChapters, getTracks } from '$lib/content';
	import NotesFolder from '$lib/components/NotesFolder.svelte';
	import { catColor } from '$lib/colors';

	const groups = getCategoryGroups();
	const total = getTotalChapters();
	const trackCount = getTracks().length;
</script>

<Seo
	title="Track directory — Notes"
	description="Browse every notes track, grouped by area — foundations, languages, infrastructure, data, scaling and more."
/>

<div class="mx-auto max-w-5xl px-5 sm:px-8 pb-20 pt-12 sm:pt-16">
	<header class="mb-9 mt-4">
		<p class="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">The directory</p>
		<h1 class="mt-1 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl lg:text-5xl">
			Browse all tracks
		</h1>
		<p class="mt-3 max-w-xl text-base leading-relaxed text-muted">
			Every track, grouped by area — {trackCount} tracks across {total} chapters. Hover a folder to open
			its topics.
		</p>
	</header>

	<div class="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
		{#each GROUP_ORDER as groupName, gi (groupName)}
			{@const items = groups[groupName]}
			{#if items?.length}
				<NotesFolder name={groupName} {items} color={catColor(gi)} />
			{/if}
		{/each}
	</div>
</div>
