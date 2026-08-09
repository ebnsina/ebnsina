<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import LevelBadge from '$lib/components/content/LevelBadge.svelte';
	import TrackBadge from '$lib/components/notes/TrackBadge.svelte';
	import LocaleToggle from '$lib/components/notes/LocaleToggle.svelte';
	import { GROUP_ORDER } from '$lib/data/categories';
	import { catColor } from '$lib/colors';
	import { progress, xpForLevel } from '$lib/progress.svelte';
	import { nt } from '$lib/i18n/notes';

	let { data } = $props();

	const t = $derived(nt(data.locale));
	const base = $derived(data.base);

	onMount(() => progress.hydrate());

	const trackColor = $derived(catColor(Math.max(0, GROUP_ORDER.indexOf(data.meta.group))));

	const slugs = $derived(data.chapters.map((c) => c.slug));
	const doneCount = $derived(progress.ready ? progress.doneIn(data.category, slugs) : 0);
	const trackXp = $derived(
		progress.ready
			? data.chapters.reduce(
					(s, c) => s + (progress.isDone(data.category, c.slug) ? xpForLevel(c.meta.level) : 0),
					0
				)
			: 0
	);

	// recommended next = first chapter (in order) not yet completed
	const nextChapter = $derived(
		progress.ready ? data.chapters.find((c) => !progress.isDone(data.category, c.slug)) : undefined
	);
	const allDone = $derived(
		progress.ready && doneCount === data.chapters.length && data.chapters.length > 0
	);
</script>

<Seo title={`${data.meta.label} — Notes`} description={data.meta.description} />

<div class="mx-auto max-w-5xl px-5 sm:px-8" lang={data.locale}>
	<header class="mb-8">
		<div class="flex items-center justify-between gap-3">
			<a
				href={base}
				class="text-[10px] font-semibold uppercase tracking-widest text-muted transition-colors hover:text-fg"
				>{t.backToNotes}</a
			>
			<LocaleToggle locale={data.locale} available={data.hasCounterpart} />
		</div>
		<h1 class="mb-3 mt-3 font-serif text-3xl font-semibold tracking-tight">{data.meta.label}</h1>
		<p class="text-lg text-muted">{data.meta.description}</p>
	</header>

	<!-- Track progress + guidance -->
	<!-- Track progress: one line, no panel. -->
	<div class="mb-10">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="font-pixel text-sm">
				<span class="text-fg">{doneCount}/{data.chapters.length}</span>
				<span class="text-muted">{t.chapterTail(trackXp)}</span>
			</p>
			{#if allDone}
				<div class="flex items-center gap-3">
					<span class="inline-flex items-center gap-1.5 font-pixel text-sm text-accent">
						<Icon name="trophy" size={15} />
						{t.trackMastered}
					</span>
					<TrackBadge label={data.meta.label} color={trackColor} earned size="sm" />
				</div>
			{:else if nextChapter}
				<a
					href={`${base}/${data.category}/${nextChapter.slug}`}
					class="rounded-2xl bg-accent-solid px-4 py-2 font-pixel text-xs text-white transition-colors hover:bg-[color-mix(in_oklch,var(--accent-solid)_82%,black)]"
					>{doneCount === 0 ? t.startHere : t.continueWord} →</a
				>
			{/if}
		</div>
	</div>

	<!-- Step marker: just the chapter number, or a tick once read. The bordered
		 circle and the connector rail it hung on are gone — the ordered list is
		 already sequential, so the rail was drawing something the numbers said. -->
	{#snippet stepNode(ch: (typeof data.chapters)[number], isDone: boolean, isNext: boolean)}
		<span
			class="w-6 shrink-0 font-mono text-[0.65rem] transition-colors"
			class:text-accent={isDone || isNext}
			class:text-muted={!isDone && !isNext}
		>
			{#if isDone}
				<Icon name="check" size={13} strokeWidth={3} />
			{:else}
				{String(ch.meta.chapter).padStart(2, '0')}
			{/if}
		</span>
	{/snippet}

	<!-- The path. Chapters are a *list*, so they read as hairline-separated rows
		 rather than a stack of full-bleed gradient bars — 25 of those in a column
		 was the single biggest source of visual noise on this page. -->
	<ol class="relative">
		{#each data.chapters as ch (ch.slug)}
			{@const isDone = progress.ready && progress.isDone(data.category, ch.slug)}
			{@const isNext = nextChapter?.slug === ch.slug}
			<li class="relative flex gap-4">
				<a
					href={`${base}/${data.category}/${ch.slug}`}
					class="group -mx-2.5 flex min-w-0 flex-1 items-center gap-3 px-2.5 py-3 transition-colors hover:bg-[color-mix(in_oklch,var(--fg)_4%,transparent)] sm:gap-4"
				>
					{@render stepNode(ch, isDone, isNext)}
					<span class="min-w-0 flex-1">
						<span class="flex items-center gap-2">
							<span class="truncate font-semibold transition-colors group-hover:text-accent"
								>{ch.meta.title}</span
							>
							{#if isNext}
								<span
									class="shrink-0 rounded-lg bg-accent-solid px-2 py-0.5 font-pixel text-[0.55rem] uppercase tracking-wide text-white"
									>{doneCount === 0 ? t.startBadge : t.nextBadge}</span
								>
							{/if}
						</span>
						<span class="mt-0.5 block truncate text-sm text-muted">{ch.meta.subtitle}</span>
					</span>
					<span class="hidden flex-shrink-0 sm:block"
						><LevelBadge level={ch.meta.level} label={t.levels[ch.meta.level]} /></span
					>
					<span
						class="hidden flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted sm:block"
						>{ch.meta.readingTime}</span
					>
					<Icon
						name="arrowRight"
						size={16}
						class="hidden shrink-0 -translate-x-1 text-muted opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 sm:block"
					/>
				</a>
			</li>
		{/each}
	</ol>
</div>
