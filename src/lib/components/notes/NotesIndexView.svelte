<script lang="ts">
	import { onMount } from 'svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { getCategoryGroups, GROUP_ORDER, CATEGORIES } from '$lib/data/categories';
	import { categoryLabel } from '$lib/data/categories.bn';
	import { ROADMAP } from '$lib/data/roadmap';
	import { getTotalChapters, getTracks, getChapters } from '$lib/content';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import JourneyHeader from '$lib/components/notes/JourneyHeader.svelte';
	import Roadmap from '$lib/components/notes/Roadmap.svelte';
	import TrackBadge from '$lib/components/notes/TrackBadge.svelte';
	import LocaleToggle from '$lib/components/notes/LocaleToggle.svelte';
	import { progress } from '$lib/progress.svelte';
	import { catColor } from '$lib/colors';
	import { nt, notesBase, type Locale } from '$lib/i18n/notes';

	let { locale = 'en' as Locale }: { locale?: Locale } = $props();

	const t = $derived(nt(locale));
	const base = $derived(notesBase(locale));

	const groups = getCategoryGroups();
	const total = getTotalChapters();

	// Build the 4-level path: each level pulls whole tracks from its groups,
	// with chapter counts + estimated time derived from the content metadata.
	// Level title/blurb/outcomes localize via the roadmap overlay; track labels
	// via the localized category labels.
	const minutesOf = (rt: string) => parseInt(rt, 10) || 0;
	const levels = $derived(
		ROADMAP.map((lvl) => {
			const tracks = lvl.groups.flatMap((g) =>
				(groups[g] ?? []).map(({ key }) => {
					const chs = getChapters(key);
					return {
						category: key,
						label: categoryLabel(key, locale),
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
		})
	);

	onMount(() => progress.hydrate());

	// One badge per track, coloured by its group (matches the folders), ordered to match.
	const tracks = $derived(
		getTracks()
			.map((tk) => ({
				...tk,
				label: categoryLabel(tk.category, locale),
				color: catColor(Math.max(0, GROUP_ORDER.indexOf(CATEGORIES[tk.category]?.group ?? '')))
			}))
			.sort(
				(a, b) =>
					GROUP_ORDER.indexOf(CATEGORIES[a.category]?.group) -
					GROUP_ORDER.indexOf(CATEGORIES[b.category]?.group)
			)
	);

	const earnedCount = $derived(
		progress.ready
			? tracks.filter((tk) => progress.isTrackComplete(tk.category, tk.slugs)).length
			: 0
	);
</script>

<Seo title={t.notesTitle} description={t.notesDesc} />

<div class="mx-auto max-w-5xl px-5 sm:px-8" lang={locale}>
	<div class="flex justify-end pt-4">
		<LocaleToggle {locale} />
	</div>
	<PageBanner eyebrow={t.notesTitle} title={t.notesTitle} description={t.notesDesc} shape="graph" />

	<JourneyHeader {total} {locale} />

	<Roadmap {levels} {locale} />

	<!-- Trophy case: a badge per track, earned by completing every chapter in it -->
	<section class="mt-14 border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] pt-10">
		<div class="mb-6 flex items-baseline justify-between gap-4">
			<h2 class="font-display text-xl font-bold tracking-tight">{t.badges}</h2>
			<span class="font-pixel text-xs text-muted"
				>{t.tracksMastered(earnedCount, tracks.length)}</span
			>
		</div>
		<div class="flex flex-wrap justify-center gap-x-3 gap-y-6 sm:justify-start">
			{#each tracks as trk (trk.category)}
				<a href={`${base}/${trk.category}`} class="transition-transform hover:-translate-y-0.5">
					<TrackBadge
						label={trk.label}
						color={trk.color}
						earned={progress.ready && progress.isTrackComplete(trk.category, trk.slugs)}
						done={progress.ready ? progress.doneIn(trk.category, trk.slugs) : 0}
						total={trk.slugs.length}
					/>
				</a>
			{/each}
		</div>
	</section>
</div>
