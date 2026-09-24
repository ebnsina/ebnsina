<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { SITE } from '$lib/config';
	import ThemeToggle from './ThemeToggle.svelte';
	import SearchTrigger from './SearchTrigger.svelte';

	let open = $state(false);
	let scrolled = $state(false);

	onMount(() => {
		const onScroll = () => (scrolled = window.scrollY > 24);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	const isActive = (href: string) => {
		const base = href.split('#')[0];
		return base.length > 1 && page.url.pathname.startsWith(base);
	};
</script>

<!-- Transparent at rest so the header sits *inside* the hero rather than on a
	 bar above it; once scrolled it fades in a blurred, semi-opaque surface (and
	 only then a hairline) so content passing underneath stays legible. -->
<header class="site-header sticky top-0 z-40" class:is-scrolled={scrolled}>
	<div
		class="mx-auto flex h-14 min-w-0 max-w-5xl items-center justify-between gap-3 px-5 sm:h-16 sm:px-8"
	>
		<a
			href="/"
			class="logo shrink-0 font-display text-lg font-semibold tracking-tight"
			class:is-min={scrolled}
			aria-label={SITE.name}
		>
			<span class="lm-full">Ebn <span class="font-normal text-muted">Sina</span></span>
			<span class="lm-short" aria-hidden="true">E<span class="font-normal text-muted">S</span></span>
		</a>

		<nav class="hidden min-w-0 items-center gap-0.5 text-sm sm:flex">
			{#each SITE.nav as item (item.href)}
				<a
					href={item.href}
					class="shrink-0 rounded-xl px-3 py-2 text-sm transition-colors {isActive(item.href)
						? 'bg-[color-mix(in_oklch,var(--fg)_6%,transparent)] text-fg'
						: 'text-muted hover:bg-[color-mix(in_oklch,var(--fg)_4%,transparent)] hover:text-fg'}"
				>
					{item.label}
				</a>
			{/each}
			<span class="mx-1.5 h-4 w-px shrink-0 bg-rule"></span>
			<SearchTrigger />
			<ThemeToggle />
		</nav>

		<div class="flex items-center gap-1 sm:hidden">
			<SearchTrigger compact />
			<ThemeToggle />
			<button
				aria-label="Toggle menu"
				aria-expanded={open}
				onclick={() => (open = !open)}
				class="rounded-xl p-1.5 text-muted transition-colors hover:bg-[color-mix(in_oklch,var(--fg)_6%,transparent)] hover:text-fg"
			>
				<Icon name={open ? 'close' : 'menu'} size={20} />
			</button>
		</div>
	</div>

	{#if open}
		<div class="border-t border-rule bg-bg sm:hidden">
			<nav class="mx-auto flex max-w-5xl flex-col gap-1 px-5 py-3">
				{#each SITE.nav as item (item.href)}
					<a
						href={item.href}
						onclick={() => (open = false)}
						class="rounded-xl px-3 py-2.5 text-sm transition-colors {isActive(item.href)
							? 'bg-[color-mix(in_oklch,var(--fg)_6%,transparent)] text-fg'
							: 'text-muted hover:bg-[color-mix(in_oklch,var(--fg)_4%,transparent)] hover:text-fg'}"
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	{/if}
</header>

<style>
	/* The bar itself is painted by a pseudo-element rather than by `background`,
	   so the blur + tint can cross-fade on scroll without the nav links (which
	   must never blur) sitting inside a filtered layer. */
	.site-header::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		opacity: 0;
		background: color-mix(in oklch, var(--bg) 72%, transparent);
		/* no hand-written -webkit- alias: Lightning CSS prefixes from browserslist,
		   and writing both makes it drop the standard property */
		backdrop-filter: blur(14px) saturate(1.4);
		/* no bottom rule in either state — the blur alone separates the bar */
		transition: opacity 0.28s ease;
	}
	.site-header.is-scrolled::before {
		opacity: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.site-header::before {
			transition: none;
		}
	}

	/* Logo cross-fades "Ebn Sina" → "ES" on scroll. Both labels stack in one grid
	   cell so the box stays the full width (nav never shifts) and they fade. */
	.logo {
		display: inline-grid;
	}
	.lm-full,
	.lm-short {
		grid-area: 1 / 1;
		transition: opacity 0.3s ease;
	}
	.lm-short {
		opacity: 0;
	}
	.is-min .lm-full {
		opacity: 0;
	}
	.is-min .lm-short {
		opacity: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.lm-full,
		.lm-short {
			transition: none;
		}
	}
</style>
