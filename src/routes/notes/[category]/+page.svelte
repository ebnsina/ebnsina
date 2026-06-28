<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, Trophy, ArrowRight } from '@lucide/svelte';
	import Seo from '$lib/components/Seo.svelte';
	import LevelBadge from '$lib/components/content/LevelBadge.svelte';
	import TrackBadge from '$lib/components/notes/TrackBadge.svelte';
	import { GROUP_ORDER } from '$lib/data/categories';
	import { catColor } from '$lib/colors';
	import { progress, xpForLevel } from '$lib/progress.svelte';

	let { data } = $props();

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
	const pct = $derived(data.chapters.length ? Math.round((doneCount / data.chapters.length) * 100) : 0);

	// recommended next = first chapter (in order) not yet completed
	const nextChapter = $derived(
		progress.ready ? data.chapters.find((c) => !progress.isDone(data.category, c.slug)) : undefined
	);
	const allDone = $derived(progress.ready && doneCount === data.chapters.length && data.chapters.length > 0);
</script>

<Seo title={`${data.meta.label} — Notes`} description={data.meta.description} />

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<header class="mb-8">
		<a
			href="/notes"
			class="text-[10px] font-semibold uppercase tracking-widest text-muted transition-colors hover:text-fg"
			>← Notes</a
		>
		<h1 class="mb-3 mt-3 font-serif text-5xl font-semibold tracking-tight">{data.meta.label}</h1>
		<p class="text-lg text-muted">{data.meta.description}</p>
	</header>

	<!-- Track progress + guidance -->
	<div
		class="mb-8 rounded-2xl border border-[color-mix(in_oklch,var(--fg)_8%,transparent)] bg-[color-mix(in_oklch,var(--fg)_3%,var(--bg))] p-5"
	>
		<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
			<p class="font-pixel text-sm">
				<span class="text-fg">{doneCount}/{data.chapters.length}</span>
				<span class="text-muted"> chapters · {trackXp} XP earned</span>
			</p>
			{#if allDone}
				<div class="flex items-center gap-3">
					<span class="inline-flex items-center gap-1.5 font-pixel text-sm text-accent">
						<Trophy size={15} /> Track mastered
					</span>
					<TrackBadge label={data.meta.label} color={trackColor} earned size="sm" />
				</div>
			{:else if nextChapter}
				<a
					href={`/notes/${data.category}/${nextChapter.slug}`}
					class="rounded-2xl bg-fg px-4 py-2 font-pixel text-xs text-bg transition-colors hover:bg-accent"
					>{doneCount === 0 ? 'Start here' : 'Continue'} →</a
				>
			{/if}
		</div>
		<div class="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--fg)_10%,transparent)]">
			<div
				class="h-full rounded-full bg-accent transition-[width] duration-500"
				style="width: {pct}%"
			></div>
		</div>
	</div>

	<!-- node circle, shared between the desktop rail and the inline mobile badge -->
	{#snippet stepNode(ch: (typeof data.chapters)[number], isDone: boolean, isNext: boolean)}
		<span
			class="grid size-7 shrink-0 place-items-center rounded-full border-2 font-pixel text-[0.6rem] transition-colors"
			class:border-accent={isDone || isNext}
			class:bg-accent={isDone}
			class:text-bg={isDone}
			class:text-accent={isNext && !isDone}
			class:border-[color-mix(in_oklch,var(--fg)_18%,transparent)]={!isDone && !isNext}
			class:text-muted={!isDone && !isNext}
		>
			{#if isDone}
				<Check size={13} strokeWidth={3} />
			{:else}
				{String(ch.meta.chapter).padStart(2, '0')}
			{/if}
		</span>
	{/snippet}

	<!-- The path -->
	<ol class="relative space-y-2">
		{#each data.chapters as ch, i (ch.slug)}
			{@const isDone = progress.ready && progress.isDone(data.category, ch.slug)}
			{@const isNext = nextChapter?.slug === ch.slug}
			<li class="relative flex gap-4">
				<!-- node + connector rail (desktop only — mobile uses the inline badge in the card) -->
				<div class="relative hidden w-7 shrink-0 flex-col items-center sm:flex">
					{#if i > 0}
						<span class="absolute -top-2 h-2 w-px bg-[color-mix(in_oklch,var(--fg)_12%,transparent)]"></span>
					{/if}
					<span class="z-10 mt-3.5">{@render stepNode(ch, isDone, isNext)}</span>
					{#if i < data.chapters.length - 1}
						<span class="w-px flex-1 bg-[color-mix(in_oklch,var(--fg)_12%,transparent)]"></span>
					{/if}
				</div>

				<a
					href={`/notes/${data.category}/${ch.slug}`}
					class="group mb-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pr-2 sm:gap-4"
				>
					<!-- inline step badge (mobile only) -->
					<span class="sm:hidden">{@render stepNode(ch, isDone, isNext)}</span>
					<span class="min-w-0 flex-1">
						<span class="flex items-center gap-2">
							<span class="truncate font-semibold transition-colors group-hover:text-accent"
								>{ch.meta.title}</span
							>
							{#if isNext}
								<span class="shrink-0 rounded-lg bg-accent px-2 py-0.5 font-pixel text-[0.55rem] uppercase tracking-wide text-bg">{doneCount === 0 ? 'Start' : 'Next'}</span>
							{/if}
						</span>
						<span class="mt-0.5 block truncate text-sm text-muted">{ch.meta.subtitle}</span>
					</span>
					<span class="hidden flex-shrink-0 sm:block"><LevelBadge level={ch.meta.level} /></span>
					<span
						class="hidden flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted sm:block"
						>{ch.meta.readingTime}</span
					>
					<ArrowRight
						size={16}
						class="hidden shrink-0 -translate-x-1 text-muted opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 sm:block"
					/>
				</a>
			</li>
		{/each}
	</ol>
</div>
