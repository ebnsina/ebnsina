<script lang="ts">
	import { page } from '$app/state';
	import { SITE } from '$lib/config';
	import ThemeToggle from './ThemeToggle.svelte';

	let open = $state(false);

	const isActive = (href: string) => {
		const base = href.split('#')[0];
		return base.length > 1 && page.url.pathname.startsWith(base);
	};
</script>

<header
	class="sticky top-0 z-40 border-b border-[color-mix(in_oklch,var(--fg)_7%,transparent)] bg-bg"
>
	<div
		class="mx-auto flex h-14 min-w-0 max-w-5xl items-center justify-between gap-3 px-5 sm:h-16 sm:px-8"
	>
		<a
			href="/"
			class="group shrink-0 font-display text-lg font-semibold tracking-tight"
			aria-label={SITE.name}
		>
			Ebn <span class="text-accent">Sina</span>
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
			<ThemeToggle />
		</nav>

		<div class="flex items-center gap-2 sm:hidden">
			<ThemeToggle />
			<button
				aria-label="Toggle menu"
				aria-expanded={open}
				onclick={() => (open = !open)}
				class="rounded-xl p-1.5 text-muted transition-colors hover:bg-[color-mix(in_oklch,var(--fg)_6%,transparent)] hover:text-fg"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					{#if open}
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					{:else}
						<line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line
							x1="4"
							y1="18"
							x2="20"
							y2="18"
						/>
					{/if}
				</svg>
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
