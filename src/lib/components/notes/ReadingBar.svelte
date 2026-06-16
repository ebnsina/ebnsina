<script lang="ts">
	import { onMount } from 'svelte';

	let pct = $state(0);

	function update() {
		const doc = document.documentElement;
		const max = doc.scrollHeight - window.innerHeight;
		pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
	}

	onMount(() => {
		update();
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		return () => {
			window.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
		};
	});
</script>

<div class="fixed inset-x-0 top-0 z-50 h-[3px] bg-transparent" aria-hidden="true">
	<div class="h-full bg-accent" style="width: {pct}%"></div>
</div>
