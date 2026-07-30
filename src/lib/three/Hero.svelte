<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { CAT_COLORS } from '$lib/colors';
	import { threeEnabled } from './enabled';

	let HeroCanvas = $state<Component<{ accent?: string }> | null>(null);
	// A star needs to sit high on the indigo ramp — the darker steps can't carry
	// light. Picked explicitly rather than hashed, since there's only one hero.
	const accent = CAT_COLORS[6];

	onMount(() => {
		// Skip WebGL entirely on phones / reduced-motion (perf + battery).
		if (!threeEnabled()) return;
		// Lazy-load the WebGL bundle so three.js never blocks first paint.
		let cancelled = false;
		import('./HeroCanvas.svelte').then((m) => {
			if (!cancelled) HeroCanvas = m.default;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<div class="hero-canvas" aria-hidden="true">
	{#if HeroCanvas}
		<HeroCanvas {accent} />
	{/if}
</div>

<style>
	.hero-canvas {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		/* weight the object to the right; fade its left so it sits behind the headline softly */
		-webkit-mask-image: radial-gradient(ellipse 60% 72% at 66% 50%, #000 48%, transparent 100%);
		mask-image: radial-gradient(ellipse 60% 72% at 66% 50%, #000 48%, transparent 100%);
	}
</style>
