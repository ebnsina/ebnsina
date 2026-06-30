<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { onNavigate } from '$app/navigation';

	let { children } = $props();

	// iOS-style page transitions: the incoming page slides in from the right
	// while the outgoing page parallaxes left and dims; back navigation reverses
	// it. Direction comes from the history delta (negative = back). Skipped where
	// unsupported or for reduced-motion users.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const root = document.documentElement;
		const back = navigation.type === 'popstate' && navigation.delta < 0;
		root.classList.add('nav-vt', back ? 'nav-back' : 'nav-fwd');
		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(() =>
				root.classList.remove('nav-vt', 'nav-back', 'nav-fwd')
			);
		});
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<a
	href="#main"
	class="sr-only z-50 focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:rounded-2xl focus:border focus:border-fg focus:bg-bg focus:px-3 focus:py-2"
	>Skip to content</a
>

<Header />
<main id="main" class="py-12 sm:py-20">
	{@render children()}
</main>
<Footer />
