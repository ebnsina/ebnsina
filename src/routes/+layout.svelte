<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { children } = $props();
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
