<script lang="ts">
	import { page } from '$app/state';
	import { SITE } from '$lib/config';
	import ThemeToggle from './ThemeToggle.svelte';
	import SearchTrigger from './SearchTrigger.svelte';

	const isActive = (href: string) => {
		const base = href.split('#')[0];
		return base.length > 1 && page.url.pathname.startsWith(base);
	};
</script>

<!-- A slim bar in the page flow, not a sticky header: name left, three links and the switches right. -->
<header class="site-header">
	<a href="/" class="logo">{SITE.name}</a>
	<nav aria-label="Main">
		{#each SITE.nav as item (item.href)}
			<a href={item.href} class="link" class:is-active={isActive(item.href)}>{item.label}</a>
		{/each}
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
		gap: var(--step-0);
		height: 4rem;
		padding-inline: var(--sina-gutter);
		border-radius: 0;
	}
	.logo {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	nav {
		display: flex;
		align-items: center;
		gap: var(--step-1);
		font-size: var(--step--1);
	}
	.link {
		color: var(--muted);
		transition: color 0.15s;
	}
	.link:hover,
	.link.is-active {
		color: var(--fg);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: var(--step--1);
	}
	@media (max-width: 639px) {
		.site-header {
			height: 3.5rem;
		}
		nav {
			gap: var(--step--1);
		}
	}
</style>
