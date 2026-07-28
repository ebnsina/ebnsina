<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import type { ShapeName } from '$lib/three/shapes';
	import { catFor } from '$lib/colors';
	import { threeEnabled } from '$lib/three/enabled';

	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		description,
		shape,
		actions
	}: {
		eyebrow?: string;
		title: string;
		description?: string;
		shape: ShapeName;
		/** optional controls rendered under the description (e.g. a locale toggle) */
		actions?: Snippet;
	} = $props();

	// each page's object gets its own colour (fixed, not theme-reactive)
	const accent = $derived(catFor(shape + title));

	let Canvas3D = $state<Component<{ accent?: string; shape?: ShapeName }> | null>(null);

	onMount(() => {
		// Don't even mount/run the canvas on phones or reduced-motion (it would
		// keep a render loop alive under `display:none` otherwise).
		if (!threeEnabled()) return;
		// three.js is shared/cached after the first page; load it off the critical path.
		let cancelled = false;
		import('$lib/three/BannerCanvas.svelte').then((m) => {
			if (!cancelled) Canvas3D = m.default;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<section class="mb-10 grid items-center gap-6 sm:mb-12 sm:grid-cols-[1fr_20rem]">
	<header>
		{#if eyebrow}
			<p class="mb-4 font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted">{eyebrow}</p>
		{/if}
		<h1
			class="font-display text-[1.6rem] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[1.9rem]"
		>
			{title}
		</h1>
		{#if description}
			<p class="mt-3.5 max-w-xl text-base leading-[1.6] text-muted">{description}</p>
		{/if}
		{#if actions}
			<div class="mt-5">{@render actions()}</div>
		{/if}
	</header>

	<div class="banner-3d hidden h-[15rem] sm:block" aria-hidden="true">
		{#if Canvas3D}
			<Canvas3D {accent} {shape} />
		{/if}
	</div>
</section>

<style>
	/* soft-fade the canvas edges so the object never looks hard-cropped */
	.banner-3d {
		-webkit-mask-image: radial-gradient(ellipse 82% 84% at 50% 50%, #000 60%, transparent 100%);
		mask-image: radial-gradient(ellipse 82% 84% at 50% 50%, #000 60%, transparent 100%);
	}
</style>
