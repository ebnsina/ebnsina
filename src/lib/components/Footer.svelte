<script lang="ts">
	import { SITE } from '$lib/config';
	import { CAT_VIVID } from '$lib/colors';
	import { onMount } from 'svelte';
	const year = new Date().getFullYear();

	// Drawn from the site's own palette so the footer stays on-brand:
	// olive (--accent, the brand colour) + the harmonised category family.
	// `value` is what we write to --accent; `null` resets to the default olive.
	const swatches = [
		{ name: 'Olive', hex: '#5a6c23', value: null },
		{ name: 'Blue', hex: CAT_VIVID[0], value: CAT_VIVID[0] },
		{ name: 'Plum', hex: CAT_VIVID[2], value: CAT_VIVID[2] },
		{ name: 'Amber', hex: CAT_VIVID[4], value: CAT_VIVID[4] },
		{ name: 'Teal', hex: CAT_VIVID[6], value: CAT_VIVID[6] }
	];

	let active = $state<string | null>(null);

	onMount(() => {
		active = localStorage.getItem('brand-accent');
	});

	function pick(value: string | null) {
		const root = document.documentElement;
		if (value) {
			root.style.setProperty('--accent', value);
			localStorage.setItem('brand-accent', value);
		} else {
			root.style.removeProperty('--accent');
			localStorage.removeItem('brand-accent');
		}
		active = value;
		window.dispatchEvent(new Event('themechange'));
	}
</script>

<footer class="mt-12" style="border-top: 1px solid color-mix(in oklch, var(--fg) 6%, transparent)">
	<div
		class="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-10"
	>
		<div class="flex items-center gap-3">
			<p>© {year} {SITE.name}.</p>
			<ul class="flex items-center gap-2">
				{#each swatches as swatch (swatch.name)}
					<li class="group relative flex">
						<button
							type="button"
							onclick={() => pick(swatch.value)}
							aria-label="Set brand colour to {swatch.name}"
							aria-pressed={active === swatch.value}
							class="block h-3 w-3 rounded-[4px] outline-none transition-transform duration-150 group-hover:scale-125 focus-visible:scale-125 {active ===
							swatch.value
								? 'ring-2 ring-fg/40 ring-offset-1 ring-offset-bg'
								: ''}"
							style="background: {swatch.hex}"
						></button>
						<span
							class="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs text-bg opacity-0 transition-opacity duration-150 group-hover:opacity-100"
							style="background: {swatch.hex}"
							role="tooltip">{swatch.name}</span
						>
					</li>
				{/each}
			</ul>
		</div>
		<div class="flex gap-4">
			<a href={SITE.social.github} class="hover:text-fg" target="_blank" rel="noopener">GitHub</a>
			<a href={SITE.social.twitter} class="hover:text-fg" target="_blank" rel="noopener">Twitter</a>
			<a href={SITE.social.linkedin} class="hover:text-fg" target="_blank" rel="noopener"
				>LinkedIn</a
			>
			<a href="/rss.xml" class="hover:text-fg">RSS</a>
		</div>
	</div>
</footer>
