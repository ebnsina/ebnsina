<script lang="ts">
	import { Canvas } from '@threlte/core';
	import BannerCloud from './BannerCloud.svelte';
	import type { ShapeName } from './shapes';

	let { accent = '#9c2a45', shape = 'cubes' }: { accent?: string; shape?: ShapeName } = $props();
</script>

<Canvas dpr={[1, 1.75]}>
	<BannerCloud {accent} {shape} />
</Canvas>
