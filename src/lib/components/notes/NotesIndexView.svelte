<script lang="ts">
	import { onMount } from 'svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { getCategoryGroups, CATEGORIES } from '$lib/data/categories';
	import { categoryLabel } from '$lib/data/categories.bn';
	import { ROADMAP } from '$lib/data/roadmap';
	import { getTotalChapters, getChapters } from '$lib/content';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import JourneyHeader from '$lib/components/notes/JourneyHeader.svelte';
	import Roadmap from '$lib/components/notes/Roadmap.svelte';
	import LocaleToggle from '$lib/components/notes/LocaleToggle.svelte';
	import { progress } from '$lib/progress.svelte';
	import { nt, type Locale } from '$lib/i18n/notes';

	let { locale = 'en' as Locale }: { locale?: Locale } = $props();

	const t = $derived(nt(locale));

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
						// avatar initials always use the English label (Bangla single letters read poorly)
						enLabel: CATEGORIES[key]?.label ?? key,
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
</script>

<Seo title={t.notesTitle} description={t.notesDesc} />

<div class="mx-auto max-w-5xl px-5 sm:px-8" lang={locale}>
	<PageBanner eyebrow={t.notesTitle} title={t.notesTitle} description={t.notesDesc} shape="graph">
		{#snippet actions()}
			<LocaleToggle {locale} />
		{/snippet}
	</PageBanner>

	<JourneyHeader {total} {locale} />

	<!-- The roadmap already lists every track; a second grid of ~40 badges below
		 it said nothing new and doubled the page's length. Track completion now
		 shows inline on the roadmap row instead. -->
	<Roadmap {levels} {locale} />
</div>
