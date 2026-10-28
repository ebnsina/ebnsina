<script lang="ts">
	// One digit on an odometer strip. It always rolls forward: 9 → 0 rolls to a
	// trailing 0 and then snaps back to the top without animating.
	let { digit }: { digit: number } = $props();

	let pos = $state(0);
	let animate = $state(true);
	let prev = 0;

	$effect(() => {
		const d = digit;
		if (d === prev) return;
		animate = true;
		pos = d < prev ? 10 : d;
		prev = d;
	});

	function settle() {
		if (pos !== 10) return;
		animate = false;
		pos = 0;
	}
</script>

<span class="roll" aria-hidden="true">
	<span
		class="strip"
		class:animate
		style="transform: translateY(-{pos * (100 / 11)}%)"
		ontransitionend={settle}
	>
		{#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as n, i (i)}<span>{n}</span>{/each}
	</span>
</span>

<style>
	.roll {
		display: inline-block;
		font-variant-numeric: tabular-nums;
		height: 1lh;
		overflow: hidden;
		vertical-align: bottom;
		border-radius: 0;
	}
	.strip {
		display: flex;
		flex-direction: column;
	}
	.strip.animate {
		transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.strip span {
		height: 1lh;
		text-align: center;
	}
	@media (prefers-reduced-motion: reduce) {
		.strip.animate {
			transition: none;
		}
	}
</style>
