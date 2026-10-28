<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';
	import Contact from '$lib/components/home/Contact.svelte';
	import SearchPalette from '$lib/components/SearchPalette.svelte';
	import { onNavigate, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';

	let { children } = $props();
	// The home hero carries the header itself; every page shares the contact footer.
	const home = $derived(page.url.pathname === '/');

	// A subtle fade + lift between routes via the View Transitions API, for a
	// smooth app-like feel. Skipped where unsupported or for reduced-motion users.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const root = document.documentElement;
		root.classList.add('nav-vt');
		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(() => root.classList.remove('nav-vt'));
		});
	});

	afterNavigate(() => {
		if (typeof window !== 'undefined' && window.umami) {
			window.umami.track();
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<a
	href="#main"
	class="sr-only z-50 focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:rounded-xl focus:border focus:border-fg focus:bg-bg focus:px-3 focus:py-2"
	>Skip to content</a
>

{#if !home}<Header />{/if}
<SearchPalette />
<main id="main" class={home ? '' : 'pt-12 pb-24 sm:pt-16 sm:pb-32'}>
	{@render children()}
</main>
<Contact tall={home} />
