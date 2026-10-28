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
		gap: var(--step-0);
		padding-bottom: var(--step-4);
	}
	h1 {
		max-width: 20ch;
		font-size: var(--step-5);
		line-height: var(--leading-display);
		letter-spacing: var(--tracking-display);
	}
	.lede {
		max-width: 52ch;
		font-size: var(--step-1);
		line-height: var(--leading-ui);
		color: var(--muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--step--1);
		margin-top: var(--step-0);
	}
</style>
