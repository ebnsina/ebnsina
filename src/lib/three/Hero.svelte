<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';

	let HeroCanvas = $state<Component<{ accent?: string }> | null>(null);
	let accent = $state('#9c2a45');

	onMount(() => {
		const read = () => {
			const v = getComputedStyle(document.documentElement)
				.getPropertyValue('--accent-hex')
				.trim();
			if (v) accent = v;
		};
		read();
		window.addEventListener('themechange', read);

		// Lazy-load the WebGL bundle so three.js never blocks first paint.
		let cancelled = false;
		import('./HeroCanvas.svelte').then((m) => {
			if (!cancelled) HeroCanvas = m.default;
		});

		return () => {
			cancelled = true;
			window.removeEventListener('themechange', read);
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
		/* fade the object into the page edges */
		-webkit-mask-image: radial-gradient(ellipse 56% 70% at 73% 50%, #000 52%, transparent 100%);
		mask-image: radial-gradient(ellipse 56% 70% at 73% 50%, #000 52%, transparent 100%);
	}
</style>
