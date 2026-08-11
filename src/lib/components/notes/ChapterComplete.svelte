<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';
	import { t } from '$lib/data/notes-strings';

	let {
		category,
		slug,
		level,
		trackSlugs = [],
		trackLabel = '',
		nextHref = null
	}: {
		category: string;
		slug: string;
		level: string;
		trackSlugs?: string[];
		trackLabel?: string;
		nextHref?: string | null;
	} = $props();

	const done = $derived(progress.ready && progress.isDone(category, slug));
	const xp = $derived(xpForLevel(level));
	const rankName = $derived(t.ranks[progress.rank.name] ?? progress.rank.name);

	let sentinel = $state<HTMLElement>();
	let toast = $state(false);
	let trackMastered = $state(false);
	let toastTimer: ReturnType<typeof setTimeout>;

	function celebrate(mastered: boolean) {
		trackMastered = mastered;
		toast = true;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = false), mastered ? 4500 : 3200);
	}

	function markDone() {
		if (progress.isDone(category, slug)) return;
		progress.complete(category, slug, level);
		// completing this chapter may have finished the whole track
		celebrate(progress.isTrackComplete(category, trackSlugs));
	}

	function onToggle() {
		if (progress.isDone(category, slug)) {
			progress.uncomplete(category, slug);
		} else {
			markDone();
		}
	}

	onMount(() => {
		progress.hydrate();

		// Auto-complete when the reader reaches the end of the article.
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) if (e.isIntersecting) markDone();
			},
			{ threshold: 0.6 }
		);
		if (sentinel) io.observe(sentinel);
		return () => {
			io.disconnect();
			clearTimeout(toastTimer);
		};
	});
</script>

<!-- The completion control was a bordered panel with a ringed checkbox and two
	 stacked lines of status copy. It is now one row: a toggle, a short label, and
	 the onward link — no box, no restated XP line. -->
<div bind:this={sentinel} class="mt-14 flex flex-wrap items-center justify-between gap-4">
	<button
		type="button"
		onclick={onToggle}
		class="group inline-flex items-center gap-2.5 text-sm transition-colors"
		class:text-accent={done}
		class:text-muted={!done}
		aria-pressed={done}
		aria-label={done ? 'Mark chapter incomplete' : 'Mark chapter complete'}
	>
		<span
			class="grid size-5 shrink-0 place-items-center rounded-md border transition-colors"
			class:border-accent={done}
			class:bg-accent={done}
			class:border-[color-mix(in_oklch,var(--fg)_25%,transparent)]={!done}
		>
			{#if done}
				<Icon name="check" size={12} strokeWidth={3} color="#fff" />
			{/if}
		</span>
		<span class="group-hover:text-fg">
			{done ? t.chapterComplete : t.finishedReading}
		</span>
	</button>

	{#if done && nextHref}
		<a
			href={nextHref}
			class="group inline-flex items-center gap-1.5 text-sm font-medium text-accent"
		>
			{t.nextChapter}
			<Icon name="arrowRight" size={14} class="transition-transform group-hover:translate-x-0.5" />
		</a>
	{/if}
</div>

{#if toast}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-3xl px-5 py-2.5 font-pixel text-xs shadow-xl"
		class:bg-fg={!trackMastered}
		class:text-bg={!trackMastered}
		class:bg-accent={trackMastered}
		class:text-white={trackMastered}
		role="status"
	>
		<span class="inline-flex items-center gap-2">
			{#if trackMastered}
				<Icon name="trophy" size={14} />
				{t.toastMastered(trackLabel)}
			{:else}
				<Icon name="sparkles" size={14} />
				{t.toastXp(xp, rankName, progress.xp)}
			{/if}
		</span>
	</div>
{/if}
