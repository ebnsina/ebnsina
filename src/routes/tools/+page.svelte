<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { auroraFor } from '$lib/colors';
	import { reveal } from '$lib/actions';

	let { data } = $props();
</script>

<Seo
	title="Tools"
	description="Working tools that go with the series — an evidence bank, a profile and gig builder, and a proposal composer that reads the job post."
/>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		eyebrow="Tools"
		title="Tools"
		description="Kits that turn each series into something you actually fill in — your evidence, your profile, your proposal. Everything stays in your browser."
		shape="cubes"
	/>

	<div class="flex flex-col gap-4">
		{#each data.kits as kit (kit.slug)}
			{@const planned = kit.status === 'planned'}
			<svelte:element
				this={planned ? 'div' : 'a'}
				href={planned ? undefined : `/tools/${kit.slug}`}
				use:reveal
				class="kit aurora-surface"
				class:is-planned={planned}
				style={auroraFor(kit.title)}
			>
				<span class="eyebrow">
					{kit.steps.length} steps · {planned ? 'Coming soon' : 'Ready'}
				</span>
				<span class="title" lang="bn">{kit.title}</span>
				<span class="tagline">{kit.tagline}</span>
				{#if !planned}
					<span class="cta"><Icon name="arrowRight" size={16} color="#fff" /></span>
				{/if}
			</svelte:element>
		{/each}
	</div>

	<p class="note">
		No account, no upload. Everything you type is stored in this browser only — export it from any
		kit to move or back it up.
	</p>
</div>

<style>
	.kit {
		position: relative;
		display: grid;
		gap: 0.2rem;
		padding: 1.25rem 1.4rem;
		color: #fff;
		text-decoration: none;
		transition: transform 0.2s ease;
	}

	a.kit:hover {
		transform: translateY(-2px);
	}

	.is-planned {
		opacity: 0.55;
	}

	.eyebrow {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: rgba(255, 255, 255, 0.82);
	}

	.title {
		font-family: var(--font-serif, var(--font-display));
		font-size: 1.375rem;
		font-weight: 600;
		line-height: 1.25;
	}

	.tagline {
		font-size: 0.875rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.88);
		max-width: 60ch;
	}

	.cta {
		position: absolute;
		right: 1.4rem;
		top: 50%;
		translate: 0 -50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.16);
	}

	.note {
		margin: 1.5rem 0 0;
		font-size: 0.8125rem;
		color: var(--muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.kit {
			transition: none;
		}
	}
</style>
