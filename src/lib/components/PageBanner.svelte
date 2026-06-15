<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import type { ShapeName } from '$lib/three/shapes';

	let {
		eyebrow,
		title,
		description,
		shape
	}: { eyebrow?: string; title: string; description?: string; shape: ShapeName } = $props();

	let Canvas3D = $state<Component<{ accent?: string; shape?: ShapeName }> | null>(null);
	let accent = $state('#9c2a45');

	onMount(() => {
		const read = () => {
			const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-hex').trim();
			if (v) accent = v;
		};
		read();
		window.addEventListener('themechange', read);

		// three.js is shared/cached after the first page; load it off the critical path.
		let cancelled = false;
		import('$lib/three/BannerCanvas.svelte').then((m) => {
			if (!cancelled) Canvas3D = m.default;
		});

		return () => {
			cancelled = true;
			window.removeEventListener('themechange', read);
		};
	});
</script>

<section class="mb-14 grid items-center gap-8 sm:mb-16 sm:grid-cols-[1fr_18rem]">
	<header>
		{#if eyebrow}
			<p class="mb-4 font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted">{eyebrow}</p>
		{/if}
		<h1 class="font-display text-[2.75rem] font-bold leading-[1.05] tracking-[-0.025em] sm:text-5xl">
			{title}
		</h1>
		{#if description}
			<p class="mt-4 max-w-xl text-lg leading-[1.65] text-muted">{description}</p>
		{/if}
	</header>

	<div class="hidden h-[15rem] sm:block" aria-hidden="true">
		{#if Canvas3D}
			<Canvas3D {accent} {shape} />
		{/if}
	</div>
</section>
