<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { getCategoryGroups, GROUP_ORDER } from '$lib/data/categories';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import NotesFolder from '$lib/components/NotesFolder.svelte';
	import { cardColor } from '$lib/colors';

	const groups = getCategoryGroups();
</script>

<Seo title="Notes" description="Deep-dive series on systems, infrastructure, and engineering craft." />

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="Notes"
		title="Notes"
		description="Deep-dive series on systems, infrastructure, and engineering craft."
		shape="graph"
	/>

	<p class="mb-5 font-mono text-xs text-muted">Hover a folder to open its topics.</p>
	<div class="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
		{#each GROUP_ORDER as groupName, gi (groupName)}
			{@const items = groups[groupName]}
			{#if items?.length}
				<NotesFolder name={groupName} {items} color={cardColor(gi)} />
			{/if}
		{/each}
	</div>
</div>
