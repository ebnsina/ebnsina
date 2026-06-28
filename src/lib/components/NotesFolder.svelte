<script lang="ts">
	import type { CategoryMeta } from '$lib/data/categories';
	import { onMount } from 'svelte';

	let {
		name,
		items,
		color = '#5b8fd6'
	}: { name: string; items: Array<{ key: string; meta: CategoryMeta }>; color?: string } = $props();

	const preview = $derived(
		items
			.slice(0, 3)
			.map((i) => i.meta.label)
			.join(' · ')
	);

	let host = $state<HTMLElement>();
	let open = $state(false);
	let up = $state(false);
	let hasHover = true;

	onMount(() => {
		hasHover = window.matchMedia('(hover: hover)').matches;
	});

	// decide whether to open downward or upward based on available space
	function place() {
		if (!host) return;
		const r = host.getBoundingClientRect();
		const panelH = Math.min(items.length * 50 + 36, 380);
		const below = window.innerHeight - r.bottom;
		up = below < panelH + 16 && r.top > below;
	}
	function show() {
		place();
		open = true;
	}
	function hide() {
		open = false;
	}
	function toggle(e: MouseEvent) {
		e.preventDefault();
		if (open) hide();
		else show();
	}
	function onEnter() {
		if (hasHover) show();
	}
	function onLeave() {
		if (hasHover) hide();
	}
</script>

<svelte:window onresize={() => open && place()} />

<div
	bind:this={host}
	class="folder"
	class:open
	class:up
	style="--c:{color}"
	onmouseenter={onEnter}
	onmouseleave={onLeave}
	onfocusin={show}
	onfocusout={hide}
	role="group"
>
	<button class="card" type="button" aria-expanded={open} onclick={toggle}>
		<span class="tab"></span>
		<span class="paper a"></span>
		<span class="paper b"></span>
		<span class="pocket">
			<span class="row">
				<span class="name">{name}</span>
				<span class="count">{items.length}</span>
			</span>
			<span class="preview">{preview}{items.length > 3 ? ` · +${items.length - 3}` : ''}</span>
			<svg
				class="chev"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.4"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg
			>
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
		/* derive a soft light shade + a darker shade from the single base colour */
		--c1: color-mix(in oklch, var(--c) 90%, #fff);
		--c2: color-mix(in oklch, var(--c) 72%, #000);
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
		border-radius: 0.55rem 0.85rem 0.85rem 0.85rem;
	}
	.card::before {
		/* back gradient + glossy sheen */
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.28), transparent 38%),
			linear-gradient(150deg, var(--c1), var(--c2));
		box-shadow: 0 14px 30px -20px var(--c2);
		transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	}
	/* folder tab */
	.tab {
		position: absolute;
		top: -0.6rem;
		left: 0.85rem;
		width: 3.6rem;
		height: 0.7rem;
		border-radius: 0.45rem 0.45rem 0 0;
		background: linear-gradient(180deg, var(--c1), color-mix(in oklch, var(--c1) 80%, #000));
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
		border-radius: 0.55rem 0.55rem 0.85rem 0.85rem;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.16), transparent 60%),
			linear-gradient(160deg, color-mix(in oklch, var(--c1) 92%, #fff), var(--c2));
		box-shadow:
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
		top: calc(100% + 0.4rem);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.7rem 0.5rem 0.55rem;
		border-radius: 0.85rem;
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
		bottom: calc(100% + 0.4rem);
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
		border-radius: 0.55rem;
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
		.card::before,
		.paper,
		.panel,
		.chev {
			transition: none;
		}
	}
</style>
