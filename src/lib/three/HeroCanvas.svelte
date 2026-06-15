<script lang="ts">
	import { Canvas } from '@threlte/core';
	import LaptopCloud from './LaptopCloud.svelte';

	let { accent = '#9c2a45' }: { accent?: string } = $props();
</script>

<Canvas dpr={[1, 1.75]}>
	<LaptopCloud {accent} />
</Canvas>
