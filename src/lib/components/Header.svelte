<script lang="ts">
	import { page } from '$app/state';
	import { SITE } from '$lib/config';
	import ThemeToggle from './ThemeToggle.svelte';
	import SearchTrigger from './SearchTrigger.svelte';

	// `inset` is false inside the home hero, which already pads its edges.
	let { inset = true }: { inset?: boolean } = $props();

	const clock = new Intl.DateTimeFormat('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Asia/Dhaka'
	});
	// Prerendered without a time; the live clock starts once the page runs.
	let time = $state('UTC+6');

	$effect(() => {
		const tick = () => (time = clock.format(new Date()));
		tick();
		const id = setInterval(tick, 10_000);
		return () => clearInterval(id);
	});

	const isActive = (href: string) => {
		const base = href.split('#')[0];
		return base.length > 1 && page.url.pathname.startsWith(base);
	};
</script>

<!-- The home page's bar, used on every page: name left; links, Dhaka time and switches right. -->
<header class="site-header" class:inset>
	<a href="/" class="logo">{SITE.name}</a>
	<nav aria-label="Main">
		{#each SITE.nav as item (item.href)}
			<a href={item.href} class="link" class:is-active={isActive(item.href)}>{item.label}</a>
		{/each}
		<span class="clock">Bangladesh · {time}</span>
		<span class="tools">
			<SearchTrigger compact />
			<ThemeToggle />
		</span>
	</nav>
</header>

<style>
	.site-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		font-size: var(--step--1);
		color: var(--muted);
		border-radius: 0;
	}
	.inset {
		padding: var(--sina-gutter) var(--sina-gutter) 0;
	}
	.logo {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--fg);
	}
	nav {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}
	.link {
		transition: color 0.15s;
	}
	.link:hover,
	.link.is-active {
		color: var(--fg);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	@media (max-width: 900px) {
		.clock {
			display: none;
		}
	}
	@media (max-width: 639px) {
		nav {
			gap: 0.875rem;
		}
	}
</style>
