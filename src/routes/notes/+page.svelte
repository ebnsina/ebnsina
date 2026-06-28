<script lang="ts">
	import { onMount } from 'svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { getCategoryGroups, GROUP_ORDER, CATEGORIES } from '$lib/data/categories';
	import { ROADMAP } from '$lib/data/roadmap';
	import { getTotalChapters, getTracks, getChapters } from '$lib/content';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import JourneyHeader from '$lib/components/notes/JourneyHeader.svelte';
	import Roadmap from '$lib/components/notes/Roadmap.svelte';
	import TrackBadge from '$lib/components/notes/TrackBadge.svelte';
	import { progress } from '$lib/progress.svelte';
	import { catColor } from '$lib/colors';

	const groups = getCategoryGroups();
	const total = getTotalChapters();

	// Build the 4-level path: each level pulls whole tracks from its groups,
	// with chapter counts + estimated time derived from the content metadata.
	const minutesOf = (rt: string) => parseInt(rt, 10) || 0;
	const levels = ROADMAP.map((lvl) => {
		const tracks = lvl.groups.flatMap((g) =>
			(groups[g] ?? []).map(({ key, meta }) => {
				const chs = getChapters(key);
				return {
					category: key,
					label: meta.label,
					slugs: chs.map((c) => c.slug),
					minutes: chs.reduce((m, c) => m + minutesOf(c.meta.readingTime), 0)
				};
			})
		);
		return {
			...lvl,
			tracks,
			totalCh: tracks.reduce((n, t) => n + t.slugs.length, 0),
			minutes: tracks.reduce((n, t) => n + t.minutes, 0)
		};
	});

	onMount(() => progress.hydrate());

	// One badge per track, coloured by its group (matches the folders), ordered to match.
	const tracks = getTracks()
		.map((t) => {
			const meta = CATEGORIES[t.category];
			return {
				...t,
				label: meta?.label ?? t.category,
				color: catColor(Math.max(0, GROUP_ORDER.indexOf(meta?.group ?? '')))
			};
		})
		.sort(
			(a, b) =>
				GROUP_ORDER.indexOf(CATEGORIES[a.category]?.group) -
				GROUP_ORDER.indexOf(CATEGORIES[b.category]?.group)
		);

	const earnedCount = $derived(
		progress.ready ? tracks.filter((t) => progress.isTrackComplete(t.category, t.slugs)).length : 0
	);
</script>

<Seo
	title="Notes"
	description="Deep-dive series on systems, infrastructure, and engineering craft."
/>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="Notes"
		title="Notes"
		description="Deep-dive series on systems, infrastructure, and engineering craft."
		shape="graph"
	/>

	<JourneyHeader {total} />

	<Roadmap {levels} />

	<!-- Trophy case: a badge per track, earned by completing every chapter in it -->
	<section class="mt-14 border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] pt-10">
		<div class="mb-6 flex items-baseline justify-between gap-4">
			<h2 class="font-display text-xl font-bold tracking-tight">Badges</h2>
			<span class="font-pixel text-xs text-muted"
				>{earnedCount}/{tracks.length} tracks mastered</span
			>
		</div>
		<div class="flex flex-wrap justify-center gap-x-3 gap-y-6 sm:justify-start">
			{#each tracks as t (t.category)}
				<a href={`/notes/${t.category}`} class="transition-transform hover:-translate-y-0.5">
					<TrackBadge
						label={t.label}
						color={t.color}
						earned={progress.ready && progress.isTrackComplete(t.category, t.slugs)}
						done={progress.ready ? progress.doneIn(t.category, t.slugs) : 0}
						total={t.slugs.length}
					/>
				</a>
			{/each}
		</div>
	</section>
</div>
