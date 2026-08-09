<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { LOCALE_LABEL, otherLocale, type Locale } from '$lib/i18n/notes';

	// `available` is false for BN-only content, which has no English page to
	// link to; rendering the toggle there would point at a 404.
	let { locale = 'en', available = true }: { locale?: Locale; available?: boolean } = $props();

	const target = $derived(otherLocale(locale));
	// The two locales mirror the same path structure: /notes/X ↔ /bn/notes/X.
	// Toggle by adding or stripping the /bn prefix on the current pathname.
	const href = $derived(
		target === 'bn' ? `/bn${page.url.pathname}` : page.url.pathname.replace(/^\/bn/, '')
	);
</script>

{#if available}
	<a
		{href}
		class="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklch,var(--fg)_12%,transparent)] px-3 py-1.5 font-pixel text-[0.6rem] text-muted transition-colors hover:text-fg"
		aria-label="Switch language"
		hreflang={target}
	>
		<Icon name="languages" size={13} />
		{LOCALE_LABEL[target]}
	</a>
{/if}
