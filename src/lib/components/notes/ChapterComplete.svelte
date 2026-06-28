<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, Trophy, Sparkles } from '@lucide/svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';

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

<div
	bind:this={sentinel}
	class="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[color-mix(in_oklch,var(--fg)_8%,transparent)] bg-[color-mix(in_oklch,var(--fg)_3%,var(--bg))] px-5 py-4"
>
	<div class="flex items-center gap-3">
		<button
			type="button"
			onclick={onToggle}
			class="grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors"
			class:border-accent={done}
			class:bg-accent={done}
			class:border-[color-mix(in_oklch,var(--fg)_22%,transparent)]={!done}
			aria-pressed={done}
			aria-label={done ? 'Mark chapter incomplete' : 'Mark chapter complete'}
		>
			{#if done}
				<Check size={14} strokeWidth={3} color="var(--bg)" />
			{/if}
		</button>
		<div>
			<p class="font-pixel text-sm">
				{done ? 'Chapter complete' : 'Finished reading?'}
			</p>
			<p class="font-pixel text-[0.7rem] text-muted">
				{done ? `+${xp} XP earned` : `Mark complete to earn ${xp} XP`}
			</p>
		</div>
	</div>

	{#if done && nextHref}
		<a
			href={nextHref}
			class="rounded-2xl bg-fg px-4 py-2 font-pixel text-xs text-bg transition-colors hover:bg-accent"
			>Next chapter →</a
		>
	{/if}
</div>

{#if toast}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-2.5 font-pixel text-xs shadow-xl"
		class:bg-fg={!trackMastered}
		class:text-bg={!trackMastered}
		class:bg-accent={trackMastered}
		class:text-white={trackMastered}
		role="status"
	>
		<span class="inline-flex items-center gap-2">
			{#if trackMastered}
				<Trophy size={14} />
				Track mastered — {trackLabel}!
			{:else}
				<Sparkles size={14} />
				+{xp} XP · {progress.rank.name} · {progress.xp} XP total
			{/if}
		</span>
	</div>
{/if}
