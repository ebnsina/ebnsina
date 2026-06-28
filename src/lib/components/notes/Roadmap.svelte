<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, ListChecks, Clock, ArrowRight, Landmark, Lock } from '@lucide/svelte';
	import LevelBadge from '$lib/components/content/LevelBadge.svelte';
	import { catFor } from '$lib/colors';
	import { progress } from '$lib/progress.svelte';

	type Track = { category: string; label: string; slugs: string[]; minutes: number };
	type Level = {
		n: number;
		title: string;
		level: string;
		blurb: string;
		outcomes: string[];
		tracks: Track[];
		totalCh: number;
		minutes: number;
	};

	let { levels }: { levels: Level[] } = $props();

	onMount(() => progress.hydrate());

	// harmonised level hues — same constant L/C family as the categorical palette
	const LEVEL_COLOR: Record<string, string> = {
		beginner: 'oklch(0.6 0.11 145)',
		intermediate: 'oklch(0.6 0.11 70)',
		advanced: 'oklch(0.6 0.11 30)',
		mastery: 'oklch(0.6 0.11 295)'
	};

	const fmtH = (m: number) => (m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`);

	// continuous timeline line: stop at the first/last dot rather than overrunning
	const lineStyle = (idx: number, len: number) => {
		if (len <= 1) return 'display:none';
		if (idx === 0) return 'top:50%; bottom:-1.75rem;';
		if (idx === len - 1) return 'top:0; height:50%;';
		return 'top:0; bottom:-1.75rem;';
	};
	const initials = (s: string) =>
		s
			.split(/[\s/&]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0])
			.join('')
			.toUpperCase();

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
</script>

<section class="mb-14">
	<div class="mb-8 flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted">The path</p>
			<h2 class="mt-1 font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
				A guided route, start to mastery
			</h2>
			<p class="mt-2 max-w-xl text-sm text-muted">
				Four levels, in order. Follow the line top to bottom — or jump anywhere you like.
			</p>
		</div>
		{#if !allDone && next}
			<a
				href={`/notes/${next.category}/${next.slug}`}
				class="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-fg px-5 py-2.5 font-pixel text-xs text-bg transition-colors hover:bg-accent"
				>{doneTotal === 0 ? 'Begin path' : 'Continue path'} <ArrowRight size={14} /></a
			>
		{/if}
	</div>

	<div class="space-y-12 lg:space-y-16">
		{#each levels as lvl (lvl.n)}
			{@const done = progress.ready ? lvl.tracks.reduce((n, t) => n + progress.doneIn(t.category, t.slugs), 0) : 0}
			{@const pct = lvl.totalCh ? Math.round((done / lvl.totalCh) * 100) : 0}
			{@const isCurrent = next ? lvl.tracks.some((t) => t.category === next.category) : false}
			{@const color = LEVEL_COLOR[lvl.level]}
			<div class="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[19rem_1fr]">
				<!-- left: sticky level card -->
				<div class="lg:sticky lg:top-24">
					<div
						class="rounded-2xl border p-6"
						style="border-color: color-mix(in oklch, {color} 30%, transparent); background: color-mix(in oklch, {color} 6%, var(--bg));"
					>
						<div class="flex items-center justify-between">
							<span class="font-pixel text-[0.6rem] uppercase tracking-[0.18em] text-muted"
								>Level {lvl.n}</span
							>
							<LevelBadge level={lvl.level} />
						</div>
						<h3 class="mt-2 font-display text-2xl font-bold tracking-tight">{lvl.title}</h3>

						<div
							class="mt-4 flex items-center gap-5 border-y py-2.5 font-mono text-xs text-muted"
							style="border-color: color-mix(in oklch, var(--fg) 8%, transparent);"
						>
							<span class="inline-flex items-center gap-1.5"
								><ListChecks size={14} /> {lvl.tracks.length} tracks</span
							>
							<span class="inline-flex items-center gap-1.5"
								><Clock size={14} /> {fmtH(lvl.minutes)}</span
							>
						</div>

						<p class="mt-4 text-sm leading-relaxed text-muted">{lvl.blurb}</p>

						<div class="mt-5 border-t pt-4" style="border-color: color-mix(in oklch, var(--fg) 8%, transparent);">
							<p class="mb-2.5 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted">
								You'll learn
							</p>
							<ul class="space-y-1.5">
								{#each lvl.outcomes as o (o)}
									<li class="flex items-start gap-2 text-sm">
										<Check size={14} strokeWidth={3} color={color} class="mt-1 shrink-0" />
										<span>{o}</span>
									</li>
								{/each}
							</ul>
						</div>

						<div class="mt-5 flex items-center gap-3">
							<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--fg)_10%,transparent)]">
								<div class="h-full rounded-full bg-accent transition-[width] duration-500" style="width: {pct}%"></div>
							</div>
							<span class="shrink-0 font-pixel text-[0.62rem] text-muted">{done}/{lvl.totalCh}</span>
						</div>
					</div>
				</div>

				<!-- right: timeline of tracks -->
				<ol class="relative space-y-7">
					{#each lvl.tracks as t, idx (t.category)}
						{@const td = progress.ready ? progress.doneIn(t.category, t.slugs) : 0}
						{@const tdone = t.slugs.length > 0 && td === t.slugs.length}
						{@const isNext = next ? t.category === next.category : false}
						{@const c = catFor(t.category)}
						<li class="relative flex items-center gap-4 sm:gap-5">
							<!-- node + connecting line -->
							<div class="relative flex w-3 shrink-0 items-center justify-center self-stretch">
								<span
									class="absolute left-1/2 w-px -translate-x-1/2 bg-[color-mix(in_oklch,var(--fg)_12%,transparent)]"
									style={lineStyle(idx, lvl.tracks.length)}
								></span>
								<span
									class="corner-round relative size-3 rounded-full border-2 transition-colors"
									class:bg-accent={tdone || isNext}
									style={tdone || isNext
										? 'border-color: var(--accent);'
										: 'background: var(--bg); border-color: color-mix(in oklch, var(--fg) 25%, transparent);'}
								>
									{#if isNext}
										<span class="corner-round absolute -inset-1.5 -z-10 rounded-full bg-[color-mix(in_oklch,var(--accent)_22%,transparent)]"></span>
									{/if}
								</span>
							</div>

							<!-- card -->
							<a
								href={`/notes/${t.category}`}
								class="group flex flex-1 items-center gap-4 rounded-2xl border border-transparent px-2.5 py-2 transition-colors hover:border-[color-mix(in_oklch,var(--fg)_10%,transparent)] hover:bg-[color-mix(in_oklch,var(--fg)_3%,transparent)]"
							>
								<span
									class="grid size-11 shrink-0 place-items-center rounded-xl font-display text-sm font-bold"
									style="color: {c}; background: color-mix(in oklch, {c} 14%, var(--bg)); border: 1px solid color-mix(in oklch, {c} 30%, transparent);"
									aria-hidden="true">{initials(t.label)}</span
								>
								<span class="min-w-0 flex-1">
									<span class="flex items-center gap-2">
										<span class="font-semibold tracking-tight transition-colors group-hover:text-accent"
											>{t.label}</span
										>
										{#if tdone}
											<Check size={13} strokeWidth={3} color="var(--accent)" />
										{/if}
									</span>
									<span class="mt-0.5 block font-mono text-xs text-muted">
										{t.slugs.length} chapters · {fmtH(t.minutes)}{#if td > 0 && !tdone} · {td} done{/if}
									</span>
								</span>
								<ArrowRight
									size={16}
									class="shrink-0 text-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
								/>
							</a>
						</li>
					{/each}
				</ol>
			</div>
		{/each}

		<!-- capstone: the path goal -->
		<div
			class="flex flex-col items-center rounded-2xl border px-6 py-12 text-center sm:py-14"
			style={allDone
				? 'border-color: color-mix(in oklch, var(--accent) 30%, transparent); background: color-mix(in oklch, var(--accent) 6%, var(--bg));'
				: 'border-color: color-mix(in oklch, var(--fg) 8%, transparent); background: color-mix(in oklch, var(--fg) 2%, transparent);'}
		>
			<!-- hexagonal badge -->
			<div class="relative">
				<div
					class="grid size-24 place-items-center"
					style="clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); color: {allDone
						? '#fff'
						: 'color-mix(in oklch, var(--fg) 40%, transparent)'}; {allDone
						? 'background: linear-gradient(155deg, color-mix(in oklch, var(--accent) 92%, #000), var(--accent));'
						: 'background: linear-gradient(160deg, color-mix(in oklch, var(--fg) 11%, transparent), color-mix(in oklch, var(--fg) 5%, transparent));'}"
					aria-hidden="true"
				>
					<Landmark size={38} />
				</div>
				<span
					class="corner-round absolute -right-1 -top-1 grid size-7 place-items-center rounded-full border-2"
					style="border-color: var(--bg); color: {allDone
						? '#fff'
						: 'color-mix(in oklch, var(--fg) 55%, transparent)'}; background: {allDone
						? 'var(--accent)'
						: 'color-mix(in oklch, var(--fg) 16%, var(--bg))'};"
					aria-hidden="true"
				>
					{#if allDone}
						<Check size={13} strokeWidth={3} />
					{:else}
						<Lock size={12} />
					{/if}
				</span>
			</div>

			<h3 class="mt-6 font-display text-2xl font-bold tracking-tight sm:text-3xl">
				The Architect Path
			</h3>
			<p class="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
				{#if allDone}
					Every level cleared — the <span class="font-semibold text-accent">Architect</span> badge is
					yours. That's the full stack, top to bottom.
				{:else if doneTotal === 0}
					Work through all four levels to earn the <span class="font-semibold text-accent"
						>Architect</span
					> badge. It's a long road, but it starts with a single chapter.
				{:else}
					{totalCh - doneTotal} chapters stand between you and the
					<span class="font-semibold text-accent">Architect</span> badge. Keep the momentum going.
				{/if}
			</p>

			{#if !allDone && next}
				<a
					href={`/notes/${next.category}/${next.slug}`}
					class="mt-7 inline-flex items-center gap-2 rounded-2xl bg-accent px-6 py-3 text-sm font-semibold text-bg transition-colors hover:bg-fg"
					>{doneTotal === 0 ? 'Begin Path' : 'Continue Path'} <ArrowRight size={16} /></a
				>
			{:else if allDone}
				<span
					class="mt-7 inline-flex items-center gap-2 rounded-2xl bg-accent px-6 py-3 text-sm font-semibold text-bg"
					>Path complete <Check size={16} strokeWidth={3} /></span
				>
			{/if}

			<span class="mt-5 font-pixel text-xs text-muted">{doneTotal}/{totalCh} chapters</span>
		</div>
	</div>
</section>
