<script lang="ts">
	import { onMount } from 'svelte';

	let dark = $state(false);

	onMount(() => {
		dark = document.documentElement.classList.contains('dark');
	});

	function apply() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		localStorage.setItem('theme', dark ? 'dark' : 'light');
		window.dispatchEvent(new Event('themechange'));
	}

	function toggle(event: MouseEvent) {
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		// Fall back to an instant switch where View Transitions aren't supported
		// or the user prefers reduced motion.
		if (reduce || !document.startViewTransition) {
			apply();
			return;
		}

		// Reveal the new theme as a circle growing from the click point.
		const x = event.clientX;
		const y = event.clientY;
		const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

		const transition = document.startViewTransition(apply);

		transition.ready.then(() => {
			document.documentElement.animate(
				{
					clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
				},
				{
					duration: 480,
					easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
					pseudoElement: '::view-transition-new(root)'
				}
			);
		});
	}
</script>

<button
	onclick={toggle}
	aria-label="Toggle colour theme"
	class="rounded-xl p-1.5 text-muted transition-colors hover:bg-[color-mix(in_oklch,var(--fg)_6%,transparent)] hover:text-fg"
>
	{#if dark}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<circle cx="12" cy="12" r="4" />
			<path
				d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"
			/>
		</svg>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
		</svg>
	{/if}
</button>
