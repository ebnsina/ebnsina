<script lang="ts">
	import { onMount } from 'svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';

	let {
		category,
		slug,
		level,
		nextHref = null
	}: { category: string; slug: string; level: string; nextHref?: string | null } = $props();

	const done = $derived(progress.ready && progress.isDone(category, slug));
	const xp = $derived(xpForLevel(level));

	let sentinel = $state<HTMLElement>();
	let toast = $state(false);
	let toastTimer: ReturnType<typeof setTimeout>;

	function celebrate() {
		toast = true;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = false), 3200);
	}

	function markDone() {
		if (progress.isDone(category, slug)) return;
		progress.complete(category, slug, level);
		celebrate();
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

<div bind:this={sentinel} class="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[color-mix(in_oklch,var(--fg)_8%,transparent)] bg-[color-mix(in_oklch,var(--accent)_5%,var(--bg))] px-5 py-4">
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
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
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
			class="rounded-full bg-fg px-4 py-2 font-pixel text-xs text-bg transition-colors hover:bg-accent"
			>Next chapter →</a
		>
	{/if}
</div>

{#if toast}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-fg px-5 py-2.5 font-pixel text-xs text-bg shadow-xl"
		role="status"
	>
		🎉 +{xp} XP · {progress.rank.name} · {progress.xp} XP total
	</div>
{/if}
