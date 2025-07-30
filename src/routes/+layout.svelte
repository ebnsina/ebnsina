<script lang="ts">
	import { dev } from '$app/environment';
	import { onNavigate } from '$app/navigation';
	import Footer from '$lib/components/shared/Footer.svelte';
	import Header from '$lib/components/shared/Header.svelte';
	import '$lib/styles/tailwind.css';
	import { inject } from '@vercel/analytics';

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	inject({ mode: dev ? 'development' : 'production' });
</script>

<svelte:head>
	<title>Ebn Sina - Svelte Expert & Full Stack Developer | JavaScript Instructor</title>
	<meta
		name="description"
		content="Ebn Sina is a Full Stack Developer specializing in Svelte, JavaScript, Node.js, and modern frontend frameworks. Instructor, mentor, and open-source contributor."
	/>
	<meta
		name="keywords"
		content="Ebn Sina, Svelte developer, Svelte expert, SvelteKit, JavaScript developer, Full Stack Developer, Node.js, React, Web Developer, Instructor, Frontend Mentor, Open Source, TypeScript, Software Engineer"
	/>
	<meta name="author" content="Ebn Sina" />
	<meta property="og:title" content="Ebn Sina - Svelte Expert & Full Stack Developer" />
	<meta
		property="og:description"
		content="Follow Ebn Sina, a Svelte and Full Stack JavaScript Developer creating high-performance web apps with SvelteKit, Node.js, and modern tech."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://ebnsina.vercel.app" />
	<meta property="og:image" content="https://ebnsina.vercel.app/og-image.jpg" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Ebn Sina - Svelte Expert & Full Stack Developer" />
	<meta
		name="twitter:description"
		content="Full Stack Developer and Instructor with a focus on SvelteKit, JavaScript, and modern web technologies."
	/>
	<meta name="twitter:image" content="https://ebnsina.vercel.app/twitter-card.jpg" />
	<link rel="canonical" href="https://ebnsina.vercel.app" />
</svelte:head>

<Header />
<main class="min-h-screen max-w-5xl mx-auto border-x border-slate-200">
	<slot />
</main>
<Footer />
