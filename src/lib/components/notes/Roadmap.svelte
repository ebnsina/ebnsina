<script lang="ts">
	/**
	 * The path, as four quiet sections rather than a gamified board.
	 *
	 * This replaced a layout built from sticky aurora level-cards and a dotted
	 * timeline rail with initial-tiles per track. That version encoded the same
	 * information three times over (rail + tile + label) and left the page feeling
	 * like a dashboard. Here a level is just a heading and a blurb, and its tracks
	 * are a plain two-column list of links — the hierarchy is carried by type and
	 * whitespace, which is what makes 40 tracks scannable instead of loud.
	 */
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LevelBadge from '$lib/components/content/LevelBadge.svelte';
	import { progress } from '$lib/progress.svelte';
	import { t } from '$lib/data/notes-strings';

	type Track = {
		category: string;
		label: string;
		slugs: string[];
		minutes: number;
	};
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

	const fmtH = (m: number) => (m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`);

	const ordered = $derived(
		levels.flatMap((l) =>
			l.tracks.flatMap((tk) => tk.slugs.map((s) => ({ category: tk.category, slug: s })))
		)
	);
	const doneTotal = $derived(
		progress.ready
			? ordered.reduce((n, c) => n + (progress.isDone(c.category, c.slug) ? 1 : 0), 0)
			: 0
	);
	const next = $derived(
		progress.ready ? ordered.find((c) => !progress.isDone(c.category, c.slug)) : undefined
	);
</script>

<section>
	<div class="mb-12 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
		<div class="max-w-lg">
			<h2 class="font-display text-xl font-semibold tracking-tight">{t.pathHeading}</h2>
			<p class="mt-1.5 text-sm leading-relaxed text-muted">{t.pathSub}</p>
		</div>
		{#if next}
			<a
				href={`/notes/${next.category}/${next.slug}`}
				class="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent"
			>
				{doneTotal === 0 ? t.beginPath : t.continuePath}
				<Icon
					name="arrowRight"
					size={14}
					class="transition-transform group-hover:translate-x-0.5"
				/>
			</a>
		{/if}
	</div>

	<div>
		{#each levels as lvl (lvl.n)}
			{@const done = progress.ready
				? lvl.tracks.reduce((n, tk) => n + progress.doneIn(tk.category, tk.slugs), 0)
				: 0}
			<section class="grid gap-x-12 gap-y-6 pb-16 lg:grid-cols-[15rem_1fr]">
				<!-- level: a heading, not a card -->
				<div class="lg:sticky lg:top-24 lg:self-start">
					<div class="flex items-center gap-2.5">
						<span class="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted">
							{t.levelWord(lvl.n)}
						</span>
						<LevelBadge level={lvl.level} label={t.levels[lvl.level]} />
					</div>
					<h3 class="mt-2 font-display text-lg font-semibold tracking-tight">{lvl.title}</h3>
					<p class="mt-2 text-sm leading-relaxed text-muted">{lvl.blurb}</p>
					<p class="mt-3 font-mono text-[0.68rem] text-muted">
						{t.tracksCount(lvl.tracks.length)} · {fmtH(lvl.minutes)}
						{#if done > 0}· {done}/{lvl.totalCh}{/if}
					</p>
				</div>

				<!-- its tracks: a plain list of links -->
				<ul class="grid gap-x-10 sm:grid-cols-2">
					{#each lvl.tracks as tk (tk.category)}
						{@const td = progress.ready ? progress.doneIn(tk.category, tk.slugs) : 0}
						{@const tdone = tk.slugs.length > 0 && td === tk.slugs.length}
						<li>
							<a
								href={`/notes/${tk.category}`}
								class="group -mx-2.5 flex items-baseline justify-between gap-4 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-[color-mix(in_oklch,var(--fg)_4%,transparent)]"
							>
								<span class="flex min-w-0 items-center gap-1.5">
									<span
										class="truncate text-sm font-medium transition-colors group-hover:text-accent"
										>{tk.label}</span
									>
									{#if tdone}
										<Icon name="check" size={12} strokeWidth={3} color="var(--accent)" />
									{/if}
								</span>
								<span class="shrink-0 font-mono text-[0.68rem] text-muted">
									{tk.slugs.length} · {fmtH(tk.minutes)}{#if td > 0 && !tdone}
										· {td}{/if}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</section>
