<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
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

		// Tag the root so the clip-reveal CSS applies only to this transition,
		// not page-navigation transitions (which share the same `root` snapshot).
		const root = document.documentElement;
		root.classList.add('theme-vt');
		const transition = document.startViewTransition(apply);

		transition.ready.then(() => {
			root.animate(
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

		transition.finished.finally(() => root.classList.remove('theme-vt'));
	}
</script>

<button
	onclick={toggle}
	aria-label="Toggle colour theme"
	class="rounded-xl p-1.5 text-muted transition-colors hover:bg-[color-mix(in_oklch,var(--fg)_6%,transparent)] hover:text-fg"
>
	<Icon name={dark ? 'sun' : 'moon'} size={18} />
</button>
