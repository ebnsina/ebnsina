<script lang="ts">
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';

	type Theme = 'light' | 'color' | 'dark';
	const options: { value: Theme; label: string; icon: IconName }[] = [
		{ value: 'light', label: 'Light', icon: 'sun' },
		{ value: 'color', label: 'Colour', icon: 'palette' },
		{ value: 'dark', label: 'Dark', icon: 'moon' }
	];

	let theme = $state<Theme>('light');

	onMount(() => {
		const root = document.documentElement;
		theme = root.classList.contains('dark')
			? 'dark'
			: root.classList.contains('palette-color')
				? 'color'
				: 'light';
	});

	function apply(next: Theme) {
		theme = next;
		const root = document.documentElement;
		root.classList.toggle('dark', next === 'dark');
		root.classList.toggle('palette-color', next === 'color');
		localStorage.setItem('theme', next);
		window.dispatchEvent(new Event('themechange'));
	}

	// The new theme seeps out from the click (see .theme-vt in layout.css).
	function set(next: Theme, event: MouseEvent) {
		if (next === theme) return;
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduce || !document.startViewTransition) return apply(next);
		const root = document.documentElement;
		root.style.setProperty('--vt-x', `${event.clientX}px`);
		root.style.setProperty('--vt-y', `${event.clientY}px`);
		root.classList.add('theme-vt');
		document
			.startViewTransition(() => apply(next))
			.finished.finally(() => root.classList.remove('theme-vt'));
	}
</script>

<div class="switch" role="radiogroup" aria-label="Theme">
	{#each options as o (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={theme === o.value}
			aria-label={o.label}
			title={o.label}
			onclick={(e) => set(o.value, e)}
		>
			<Icon name={o.icon} size={15} />
		</button>
	{/each}
</div>

<style>
	.switch {
		display: inline-flex;
		gap: 0.125rem;
		padding: 0.125rem;
		border: 1px solid var(--rule-strong);
		border-radius: var(--radius-button);
	}
	button {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius-chip);
		color: var(--muted);
		transition:
			color 0.15s,
			background-color 0.15s;
	}
	button:hover {
		color: var(--fg);
	}
	button[aria-checked='true'] {
		background: var(--fg);
		color: var(--bg);
	}
</style>
