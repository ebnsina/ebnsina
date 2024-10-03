<script lang="ts">
	import { dev } from '$app/environment';
	import { onNavigate } from '$app/navigation';
	import Footer from '$lib/components/shared/Footer.svelte';
	import { inject } from '@vercel/analytics';
	import '$lib/styles/tailwind.css';

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
	<title>Ebn Sina - Full Stack Developer | Instructor | JS Evangelist</title>
</svelte:head>

<div class="flex flex-col justify-between min-h-screen">
	<main class="container mx-auto max-w-xl px-4 md:px-0 py-10">
		<slot />
	</main>
	<Footer />
</div>

<style lang="postcss">
	:global(html) {
		background-color: theme(colors.gray.100);
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes fade-out {
		to {
			opacity: 0;
		}
	}

	@keyframes slide-from-right {
		from {
			transform: translateX(30px);
		}
	}

	@keyframes slide-to-left {
		to {
			transform: translateX(-30px);
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		:root::view-transition-old(root) {
			animation:
				90ms cubic-bezier(0.4, 0, 1, 1) both fade-out,
				300ms cubic-bezier(0.4, 0, 0.2, 1) both slide-to-left;
		}

		:root::view-transition-new(root) {
			animation:
				210ms cubic-bezier(0, 0, 0.2, 1) 90ms both fade-in,
				300ms cubic-bezier(0.4, 0, 0.2, 1) both slide-from-right;
		}
	}
</style>
