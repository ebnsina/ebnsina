<script lang="ts">
	// A rail table of contents. At rest it's a stack of hairline ticks in the
	// margin — one per heading, length encoding depth, ink encoding read/unread —
	// so it reads as a progress gauge rather than a menu. Hover or keyboard focus
	// expands it into a floating panel of titles; the two states crossfade in
	// place, and a single marker travels between rows instead of a dot per row.
	type Heading = { id: string; text: string; depth: number };

	let {
		headings,
		activeId,
		onnavigate
	}: {
		headings: Heading[];
		activeId: string;
		onnavigate: (e: MouseEvent, id: string) => void;
	} = $props();

	let open = $state(false);
	const activeIndex = $derived(headings.findIndex((h) => h.id === activeId));

	// The travelling marker: measured off the active row so it stays correct when
	// a long Bangla title wraps to two lines.
	let rows = $state<(HTMLLIElement | undefined)[]>([]);
	let markerY = $state(0);
	let markerShown = $state(false);

	$effect(() => {
		const row = activeIndex >= 0 ? rows[activeIndex] : undefined;
		if (!row) {
			markerShown = false;
			return;
		}
		markerY = row.offsetTop + row.offsetHeight / 2;
		markerShown = true;
	});

	function close() {
		open = false;
	}
</script>

<nav
	class="toc"
	class:open
	aria-label="Table of contents"
	onpointerenter={() => (open = true)}
	onpointerleave={close}
	onfocusin={() => (open = true)}
	onfocusout={close}
>
	<!-- Collapsed: the ticks. Links, so the rail alone is navigable. -->
	<ul class="ticks" aria-hidden={open}>
		{#each headings as h, i (h.id)}
			<li>
				<a
					class="tick"
					class:sub={h.depth === 3}
					class:read={activeIndex >= 0 && i < activeIndex}
					class:current={h.id === activeId}
					href={`#${h.id}`}
					aria-label={h.text}
					tabindex={open ? -1 : 0}
					onclick={(e) => {
						onnavigate(e, h.id);
						close();
					}}
				></a>
			</li>
		{/each}
	</ul>

	<!-- Expanded: the titles. -->
	<div class="panel" inert={!open}>
		<span class="label">Contents</span>
		<ul class="list">
			<span
				class="marker"
				class:shown={markerShown}
				style="transform: translateY({markerY}px)"
				aria-hidden="true"
			></span>
			{#each headings as h, i (h.id)}
				<li bind:this={rows[i]} style="--i: {i}">
					<a
						class="row"
						class:sub={h.depth === 3}
						class:current={h.id === activeId}
						href={`#${h.id}`}
						onclick={(e) => {
							onnavigate(e, h.id);
							close();
						}}
					>
						{h.text}
					</a>
				</li>
			{/each}
		</ul>
	</div>
</nav>

<style>
	/* Pinned to the viewport edge and vertically centred, so it never takes a
	   column from the article and never scrolls away. */
	.toc {
		position: fixed;
		right: 1.5rem;
		top: 50%;
		translate: 0 -50%;
		z-index: 30;
		/* Padding is hover surface — it keeps the pointer inside the nav while it
		   crosses from the ticks to the panel. */
		padding: 0.75rem 0 0.75rem 1.25rem;
	}
	@media (min-width: 1400px) {
		.toc {
			right: 2.5rem;
		}
	}

	/* ---------- ticks ---------- */

	.ticks {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
		padding-right: 2px;
		transition:
			opacity 0.18s ease,
			transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.toc.open .ticks {
		opacity: 0;
		transform: translateX(6px);
		pointer-events: none;
	}

	.tick {
		display: block;
		width: 20px;
		height: 1px;
		background: color-mix(in oklch, var(--fg) 16%, transparent);
		transition:
			width 0.25s cubic-bezier(0.22, 1, 0.36, 1),
			height 0.2s ease,
			background-color 0.2s ease;
	}
	.tick.sub {
		width: 12px;
	}
	/* Already behind you — inked in, so the rail doubles as a progress gauge. */
	.tick.read {
		background: color-mix(in oklch, var(--fg) 36%, transparent);
	}
	.tick:hover {
		width: 26px;
		background: color-mix(in oklch, var(--fg) 55%, transparent);
	}
	.tick.current {
		width: 26px;
		height: 2px;
		background: var(--fg);
	}
	.tick.current.sub {
		width: 18px;
	}
	.tick:focus-visible {
		outline: 1px solid var(--accent);
		outline-offset: 3px;
	}

	/* ---------- panel ---------- */

	.panel {
		position: absolute;
		/* Centred on the same axis as the rail — `translate` carries the centring
		   so `transform` stays free for the open/close slide. */
		top: 50%;
		translate: 0 -50%;
		right: 0;
		width: 17.5rem;
		max-height: calc(100vh - 6rem);
		overflow-y: auto;
		scrollbar-width: none;
		padding: 0.85rem 0.9rem 0.9rem 1.1rem;
		border: 1px solid var(--rule);
		/* Near-opaque: the panel overhangs the article's right edge, so the text
		   underneath must not read through it. */
		background: color-mix(in oklch, var(--bg) 97%, transparent);
		backdrop-filter: blur(14px);
		/* Neutral shadow, not fg-derived — an fg-tinted one becomes a glow in dark. */
		box-shadow: 0 14px 34px -20px rgb(0 0 0 / 0.4);
		opacity: 0;
		transform: translateX(8px);
		pointer-events: none;
		transition:
			opacity 0.2s ease,
			transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.panel::-webkit-scrollbar {
		display: none;
	}
	.toc.open .panel {
		opacity: 1;
		transform: translateX(0);
		pointer-events: auto;
	}

	.label {
		display: block;
		margin-bottom: 0.6rem;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.list {
		position: relative;
	}

	.row {
		display: block;
		padding: 0.2rem 0;
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--muted);
		text-decoration: none;
		/* Titles arrive in sequence behind the panel, top-down. */
		opacity: 0;
		transform: translateX(-4px);
		transition:
			opacity 0.2s ease,
			transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
			color 0.15s ease;
	}
	.toc.open .row {
		opacity: 1;
		transform: translateX(0);
		transition-delay: calc(40ms + var(--i) * 12ms);
	}
	.row.sub {
		padding-left: 0.75rem;
		font-size: 13px;
	}
	.row:hover {
		color: var(--fg);
	}
	.row.current {
		color: var(--accent);
		font-weight: 600;
	}

	/* One marker for the whole list, animated between rows. */
	.marker {
		position: absolute;
		left: -0.65rem;
		top: 0;
		width: 5px;
		height: 5px;
		margin-top: -2.5px;
		background: var(--accent);
		opacity: 0;
		transition:
			transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.2s ease;
	}
	.toc.open .marker.shown {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.ticks,
		.tick,
		.panel,
		.row,
		.marker {
			transition-duration: 0.01ms;
			transition-delay: 0ms;
		}
	}
</style>
