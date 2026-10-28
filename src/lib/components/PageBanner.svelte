<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		description,
		lang,
		actions
	}: {
		eyebrow?: string;
		title: string;
		description?: string;
		lang?: string;
		/** optional controls rendered under the description */
		actions?: Snippet;
	} = $props();
</script>

<!-- Page title block, left-aligned on the page column like the home hero. Must be the first thing inside <main>. -->
<section class="page-hero">
	{#if eyebrow}
		<p class="eyebrow">{eyebrow}</p>
	{/if}
	<h1 {lang}>{title}</h1>
	{#if description}
		<p {lang} class="lede">{description}</p>
	{/if}
	{#if actions}
		<div class="actions">{@render actions()}</div>
	{/if}
</section>

<style>
	.page-hero {
		display: grid;
		justify-items: start;
		gap: 1.5rem;
		padding-block: clamp(2rem, 6vw, 5rem) clamp(3rem, 7vw, 6rem);
	}
	h1 {
		max-width: 16ch;
		font-size: clamp(2.75rem, 7vw, 6rem);
		font-weight: 400;
		line-height: 0.98;
		letter-spacing: -0.03em;
	}
	.lede {
		max-width: 40ch;
		font-family: var(--font-display);
		font-size: clamp(1.25rem, 2.2vw, 1.75rem);
		line-height: 1.3;
		letter-spacing: -0.015em;
		color: var(--muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--step--1);
	}
</style>
