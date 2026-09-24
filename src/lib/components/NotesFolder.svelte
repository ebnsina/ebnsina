<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { CategoryMeta } from '$lib/data/categories';
	import { onMount } from 'svelte';

	let {
		name,
		items,
		aurora = ''
	}: {
		name: string;
		items: Array<{ key: string; meta: CategoryMeta }>;
		aurora?: string;
	} = $props();

	const preview = $derived(
		items
			.slice(0, 3)
			.map((i) => i.meta.label)
			.join(' · ')
	);

	let host = $state<HTMLElement>();
	let open = $state(false);
	let up = $state(false);
	// A click pins the panel: hovering away must not yank it out from under the
	// pointer once it was opened deliberately. Hover-opened panels still close
	// on leave.
	let pinned = $state(false);
	let maxH = $state(0);
	let hasHover = true;

	onMount(() => {
		hasHover = window.matchMedia('(hover: hover)').matches;
	});

	// Height is measured, not guessed: pick the side with room, then cap the
	// panel to the space actually there so a long track list scrolls instead of
	// running off the viewport (or up under the sticky header).
	function place() {
		if (!host) return;
		const GAP = 0; // the panel sits flush against the card
		const EDGE = 16; // breathing room at the viewport edge
		const HEADER = 76; // sticky header — never open underneath it
		const r = host.getBoundingClientRect();
		const below = window.innerHeight - r.bottom - GAP - EDGE;
		const above = r.top - GAP - EDGE - HEADER;
		const wanted = items.length * 52 + 24;

		up = below < Math.min(wanted, 380) && above > below;
		maxH = Math.max(140, Math.min(wanted, up ? above : below));
	}
	function show(pin = false) {
		place();
		open = true;
		if (pin) pinned = true;
	}
	function hide() {
		open = false;
		pinned = false;
	}
	function toggle(e: MouseEvent) {
		e.preventDefault();
		if (open && pinned) hide();
		else show(true);
	}
	function onEnter() {
		if (hasHover) show();
	}
	function onLeave() {
		if (hasHover && !pinned) open = false;
	}
	function onWindowPointerDown(e: PointerEvent) {
		if (pinned && host && !host.contains(e.target as Node)) hide();
	}
	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) hide();
	}
</script>

<svelte:window
	onresize={() => open && place()}
	onpointerdown={onWindowPointerDown}
	onkeydown={onWindowKeydown}
/>

<div
	bind:this={host}
	class="folder"
	class:open
	class:up
	style="{aurora};--panel-max:{maxH}px"
	onmouseenter={onEnter}
	onmouseleave={onLeave}
	onfocusin={() => show()}
	onfocusout={hide}
	role="group"
>
	<button class="card" type="button" aria-expanded={open} onclick={toggle}>
		<span class="back aurora-surface"></span>
		<span class="tab"></span>
		<span class="paper a"></span>
		<span class="paper b"></span>
		<span class="pocket aurora-surface">
			<span class="row">
				<span class="name">{name}</span>
				<span class="count">{items.length}</span>
			</span>
			<span class="preview">{preview}{items.length > 3 ? ` · +${items.length - 3}` : ''}</span>
			<span class="chev"><Icon name="caretDown" size={15} weight="bold" /></span>
		</span>
	</button>

	<div class="panel">
		{#each items as { key, meta } (key)}
			<a class="item" href={`/notes/${key}`}>
				<span class="item-name">{meta.label}</span>
				<span class="item-desc">{meta.description}</span>
			</a>
		{/each}
	</div>
</div>

<style>
	.folder {
		position: relative;
		z-index: 1;
		/* the folder's own aurora vars land on this root element; these two are
		   the light/dark ends of it, used for the trims and the open panel. */
		--c1: var(--au-1);
		--c2: var(--au-b2);
	}
	.folder.open {
		z-index: 50;
	}

	/* ---- the folder body ---- */
	.card {
		position: relative;
		display: block;
		width: 100%;
		height: 9rem;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: #fff;
		/* the back panel */
		border-radius: 0.55rem var(--radius-card) var(--radius-card) var(--radius-card);
	}
	/* back panel — the aurora itself (.aurora-surface paints it), plus a sheen */
	.back {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		box-shadow: 0 14px 30px -20px var(--au-b3);
		transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.back::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.22), transparent 38%);
	}
	/* folder tab */
	.tab {
		position: absolute;
		top: -0.6rem;
		left: 0.85rem;
		width: 3.6rem;
		height: 0.7rem;
		border-radius: 0.45rem 0.45rem 0 0;
		background: linear-gradient(180deg, var(--au-1), var(--au-b1));
		z-index: 0;
	}
	/* peeking papers */
	.paper {
		position: absolute;
		left: 50%;
		translate: -50% 0;
		width: 84%;
		height: 2.6rem;
		border-radius: 0.4rem;
		background: rgba(255, 255, 255, 0.92);
		box-shadow: 0 4px 8px -4px rgba(0, 0, 0, 0.25);
		transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.paper.a {
		top: 1.5rem;
		width: 80%;
		background: rgba(255, 255, 255, 0.78);
	}
	.paper.b {
		top: 1.95rem;
		width: 88%;
		background: rgba(255, 255, 255, 0.95);
	}
	.folder:hover .paper.a {
		transform: translateY(-0.28rem) rotate(-1.5deg);
	}
	.folder:hover .paper.b {
		transform: translateY(-0.14rem) rotate(1deg);
	}
	/* front pocket */
	.pocket {
		position: absolute;
		inset: auto 0 0 0;
		height: 5.6rem;
		padding: 0.75rem 0.95rem;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.25rem;
		border-radius: 0.55rem 0.55rem var(--radius-card) var(--radius-card);
		/* the wash darkens the same aurora so the pocket reads as a plane in
		   front of the back panel and the label stays legible */
		box-shadow:
			0 0 0 100px rgba(0, 0, 0, 0.26) inset,
			0 -1px 0 rgba(255, 255, 255, 0.25) inset,
			0 -10px 18px -16px rgba(0, 0, 0, 0.4);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.name {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.02rem;
		letter-spacing: -0.01em;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
	}
	.count {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		padding: 0.06rem 0.42rem;
		border-radius: 0.4rem;
		background: rgba(255, 255, 255, 0.24);
	}
	.preview {
		font-size: 0.73rem;
		color: rgba(255, 255, 255, 0.85);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-right: 1.2rem;
	}
	.chev {
		position: absolute;
		right: 0.8rem;
		bottom: 0.75rem;
		width: 15px;
		height: 15px;
		color: rgba(255, 255, 255, 0.9);
		transition: transform 0.25s ease;
	}
	.folder.open .chev {
		transform: rotate(180deg);
	}

	/* ---- the revealed content ---- */
	.panel {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.7rem 0.5rem 0.55rem;
		/* Capped to the room measured in place(), so a long list scrolls instead
		   of running past the viewport edge. */
		max-height: var(--panel-max, 22rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		border-radius: var(--radius-card);
		background: linear-gradient(180deg, color-mix(in oklch, var(--c1) 10%, #fff), #fff);
		border: 1px solid color-mix(in oklch, var(--c2) 22%, #ffffff);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.6) inset,
			0 26px 50px -22px rgba(0, 0, 0, 0.5);
		transform-origin: top center;
		opacity: 0;
		transform: translateY(-0.5rem) scale(0.98);
		pointer-events: none;
		transition:
			opacity 0.22s ease,
			transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.folder.up .panel {
		top: auto;
		bottom: 100%;
		transform-origin: bottom center;
		transform: translateY(0.5rem) scale(0.98);
	}
	.folder.open .panel {
		opacity: 1;
		transform: translateY(0) scale(1);
		pointer-events: auto;
	}
	.item {
		display: block;
		padding: 0.5rem 0.6rem;
		border-radius: var(--radius-button);
		transition: background 0.15s ease;
	}
	.item:hover {
		background: color-mix(in oklch, var(--c2) 12%, #fff);
	}
	.item-name {
		display: block;
		font-weight: 600;
		font-size: 0.92rem;
		color: #18181d;
	}
	.item:hover .item-name {
		color: var(--c2);
	}
	.item-desc {
		display: block;
		font-size: 0.76rem;
		line-height: 1.35;
		color: #61616b;
	}
	@media (prefers-reduced-motion: reduce) {
		.back,
		.paper,
		.panel,
		.chev {
			transition: none;
		}
	}
</style>
