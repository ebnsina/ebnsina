<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { SvelteSet } from 'svelte/reactivity';
	import { Check, ChevronDown, Landmark } from '@lucide/svelte';
	import LevelBadge from '$lib/components/content/LevelBadge.svelte';
	import { progress } from '$lib/progress.svelte';

	type Track = { category: string; label: string; slugs: string[]; minutes: number };
	type Level = {
		n: number;
		title: string;
		level: string;
		blurb: string;
		tracks: Track[];
		totalCh: number;
		minutes: number;
	};

	let { levels }: { levels: Level[] } = $props();

	onMount(() => progress.hydrate());

	const LEVEL_COLOR: Record<string, string> = {
		beginner: 'oklch(0.7 0.2 130)',
		intermediate: 'oklch(0.74 0.16 85)',
		advanced: 'oklch(0.62 0.2 30)',
		mastery: 'oklch(0.55 0.15 280)'
	};

	const fmtTime = (m: number) => (m >= 60 ? `~${Math.round(m / 60)}h` : `~${m}m`);

	// every (category, slug) in path order — used to find where to begin/continue
	const ordered = $derived(
		levels.flatMap((l) => l.tracks.flatMap((t) => t.slugs.map((s) => ({ category: t.category, slug: s }))))
	);
	const totalCh = $derived(ordered.length);

	const doneTotal = $derived(
		progress.ready ? ordered.reduce((n, c) => n + (progress.isDone(c.category, c.slug) ? 1 : 0), 0) : 0
	);
	const next = $derived(
		progress.ready ? ordered.find((c) => !progress.isDone(c.category, c.slug)) : undefined
	);
	const allDone = $derived(progress.ready && doneTotal === totalCh && totalCh > 0);

	// the level the learner is currently on (first with an unfinished chapter)
	const currentN = $derived.by(() => {
		if (!next) return null;
		return levels.find((l) => l.tracks.some((t) => t.category === next!.category))?.n ?? null;
	});

	// progressive disclosure: the current level reads as open by default; once the
	// learner clicks anything, `open` becomes the source of truth (seeded with the
	// current level so closing it works) and their toggles take over.
	const open = new SvelteSet<number>();
	let touched = $state(false);

	const isOpen = (n: number) => (touched ? open.has(n) : n === currentN);

	function toggle(n: number) {
		if (!touched) {
			touched = true;
			if (currentN != null) open.add(currentN);
		}
		if (open.has(n)) open.delete(n);
		else open.add(n);
	}
</script>

<section class="mb-12">
	<div class="mb-7 flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">The path</p>
			<h2 class="mt-1 font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
				A guided route, start to mastery
			</h2>
			<p class="mt-2 max-w-xl text-sm text-muted">
				Four levels, in order. Open a level to see its tracks — or jump anywhere you like.
			</p>
		</div>
		{#if !allDone && next}
			<a
				href={`/notes/${next.category}/${next.slug}`}
				class="shrink-0 rounded-2xl bg-fg px-5 py-2.5 font-pixel text-xs text-bg transition-colors hover:bg-accent"
				>{doneTotal === 0 ? 'Begin path' : 'Continue path'} →</a
			>
		{/if}
	</div>

	<ol class="space-y-2.5">
		{#each levels as lvl, i (lvl.n)}
			{@const done = progress.ready ? lvl.tracks.reduce((n, t) => n + progress.doneIn(t.category, t.slugs), 0) : 0}
			{@const pct = lvl.totalCh ? Math.round((done / lvl.totalCh) * 100) : 0}
			{@const isCurrent = currentN === lvl.n}
			{@const levelOpen = isOpen(lvl.n)}
			{@const color = LEVEL_COLOR[lvl.level]}
			<li class="flex gap-4 sm:gap-5">
				<!-- rail -->
				<div class="relative flex w-9 shrink-0 flex-col items-center">
					<span
						class="z-10 grid size-9 place-items-center rounded-xl font-pixel text-sm transition-colors"
						style="color: {color}; background: color-mix(in oklch, {color} 16%, transparent); {pct === 100 ? `background: ${color}; color: #fff;` : ''}"
					>
						{lvl.n}
					</span>
					{#if i < levels.length}
						<span class="mt-1 w-px flex-1 bg-[color-mix(in_oklch,var(--fg)_12%,transparent)]"></span>
					{/if}
				</div>

				<!-- stage -->
				<div
					class="mb-1 flex-1 overflow-hidden rounded-2xl border transition-colors"
					class:border-[color-mix(in_oklch,var(--accent)_35%,transparent)]={isCurrent}
					class:border-[color-mix(in_oklch,var(--fg)_8%,transparent)]={!isCurrent}
				>
					<!-- summary header — the whole row toggles the level -->
					<button
						type="button"
						onclick={() => toggle(lvl.n)}
						aria-expanded={levelOpen}
						class="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[color-mix(in_oklch,var(--fg)_2.5%,transparent)]"
					>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
								<span class="font-pixel text-[0.6rem] uppercase tracking-wider text-muted"
									>Level {lvl.n}</span
								>
								<h3 class="font-display text-lg font-bold tracking-tight">{lvl.title}</h3>
								<LevelBadge level={lvl.level} />
								{#if isCurrent}
									<span class="rounded-lg bg-accent px-2 py-0.5 font-pixel text-[0.55rem] uppercase tracking-wide text-bg">You are here</span>
								{/if}
							</div>

							<!-- compact progress, always visible -->
							<div class="mt-2.5 flex items-center gap-3">
								<div class="h-1.5 max-w-xs flex-1 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--fg)_10%,transparent)]">
									<div class="h-full rounded-full bg-accent transition-[width] duration-500" style="width: {pct}%"></div>
								</div>
								<span class="shrink-0 font-pixel text-[0.62rem] text-muted"
									>{done}/{lvl.totalCh} · {lvl.tracks.length} tracks · {fmtTime(lvl.minutes)}</span
								>
							</div>
						</div>
						<ChevronDown
							size={18}
							class="shrink-0 text-muted transition-transform duration-200 {levelOpen ? 'rotate-180' : ''}"
						/>
					</button>

					<!-- detail panel — tracks revealed on expand -->
					{#if levelOpen}
						<div transition:slide={{ duration: 200 }}>
							<div class="border-t border-[color-mix(in_oklch,var(--fg)_8%,transparent)] px-5 pb-4 pt-3">
								<p class="mb-3 max-w-2xl text-sm leading-relaxed text-muted">{lvl.blurb}</p>
								<div class="grid grid-cols-1 gap-x-7 sm:grid-cols-2 lg:grid-cols-3">
									{#each lvl.tracks as t (t.category)}
										{@const td = progress.ready ? progress.doneIn(t.category, t.slugs) : 0}
										{@const tdone = t.slugs.length > 0 && td === t.slugs.length}
										<a
											href={`/notes/${t.category}`}
											class="group flex items-center justify-between gap-2 border-b border-[color-mix(in_oklch,var(--fg)_6%,transparent)] py-2 text-sm"
										>
											<span class="flex min-w-0 items-center gap-1.5">
												{#if tdone}
													<Check size={12} strokeWidth={3} color="var(--accent)" />
												{/if}
												<span
													class="truncate transition-colors group-hover:text-accent"
													class:text-accent={tdone}>{t.label}</span
												>
											</span>
											<span class="shrink-0 font-pixel text-[0.6rem] tabular-nums text-muted"
												>{td}/{t.slugs.length}</span
											>
										</a>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</div>
			</li>
		{/each}

		<!-- capstone -->
		<li class="flex gap-4 sm:gap-5">
			<div class="flex w-9 shrink-0 justify-center">
				<span
					class="grid size-9 place-items-center rounded-xl"
					style={allDone
						? 'background: var(--accent); color:#fff;'
						: 'background: color-mix(in oklch, var(--fg) 7%, transparent); color: color-mix(in oklch, var(--fg) 35%, transparent);'}
					aria-hidden="true"><Landmark size={18} /></span
				>
			</div>
			<div class="flex flex-1 flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_oklch,var(--fg)_8%,transparent)] px-5 py-4">
				<div>
					<p class="font-pixel text-sm" class:text-accent={allDone}>Architect</p>
					<p class="text-sm text-muted">
						{allDone
							? 'All four levels complete. You walked the whole path.'
							: 'Finish all four levels to earn the Architect badge.'}
					</p>
				</div>
				<span class="font-pixel text-xs text-muted">{doneTotal}/{totalCh}</span>
			</div>
		</li>
	</ol>
</section>
