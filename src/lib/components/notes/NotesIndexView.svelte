<script lang="ts">
	import { onMount } from 'svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { getCategoryGroups } from '$lib/data/categories';
	import { categoryLabel } from '$lib/data/notes-labels';
	import { ROADMAP } from '$lib/data/roadmap';
	import { getTotalChapters, getChapters } from '$lib/content';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import JourneyHeader from '$lib/components/notes/JourneyHeader.svelte';
	import Roadmap from '$lib/components/notes/Roadmap.svelte';
	import { progress } from '$lib/progress.svelte';
	import { t } from '$lib/data/notes-strings';

	const groups = getCategoryGroups();
	const total = getTotalChapters();

	// Build the 4-level path: each level pulls whole tracks from its groups,
	// with chapter counts + estimated time derived from the content metadata.
	const minutesOf = (rt: string) => parseInt(rt, 10) || 0;
	const levels = ROADMAP.map((lvl) => {
		const tracks = lvl.groups.flatMap((g) =>
			(groups[g] ?? [])
				// A declared track with no chapters yet would render an empty card.
				.filter(({ key }) => getChapters(key).length > 0)
				.map(({ key }) => {
					const chs = getChapters(key);
					return {
						category: key,
						label: categoryLabel(key),
						slugs: chs.map((c) => c.slug),
						minutes: chs.reduce((m, c) => m + minutesOf(c.meta.readingTime), 0)
					};
				})
		);
		const tr = t.roadmap[lvl.n];
		return {
			...lvl,
			title: tr?.title ?? lvl.title,
			blurb: tr?.blurb ?? lvl.blurb,
			outcomes: tr?.outcomes ?? lvl.outcomes,
			tracks,
			totalCh: tracks.reduce((n, tk) => n + tk.slugs.length, 0),
			minutes: tracks.reduce((n, tk) => n + tk.minutes, 0)
		};
	});

	onMount(() => progress.hydrate());
</script>

<Seo title={t.notesTitle} description={t.notesDesc} />

<div class="mx-auto max-w-5xl px-5 sm:px-8" lang="bn">
	<PageBanner title={t.notesTitle} description={t.notesDesc} />

	<JourneyHeader {total} />

	<!-- The roadmap already lists every track; a second grid of ~40 badges below
		 it said nothing new and doubled the page's length. Track completion now
		 shows inline on the roadmap row instead. -->
	<Roadmap {levels} />
</div>
