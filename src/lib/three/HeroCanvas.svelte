<script lang="ts">
	import { Canvas } from '@threlte/core';
	import LatticeCloud from './LatticeCloud.svelte';

	let { accent = '#99a4f0' }: { accent?: string } = $props();
</script>

<Canvas dpr={[1, 1.75]}>
	<LatticeCloud {accent} />
</Canvas>
