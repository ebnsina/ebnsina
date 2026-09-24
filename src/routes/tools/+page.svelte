<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import PageBanner from '$lib/components/PageBanner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { reveal } from '$lib/actions';

	let { data } = $props();
</script>

<Seo
	title="Tools"
	description="Working tools that go with the series: an evidence bank, a profile and gig builder, and a proposal composer that reads the job post."
/>

<div class="mx-auto max-w-5xl px-5 sm:px-8">
	<PageBanner
		title="Tools"
		description="Kits that turn each series into something you actually fill in: your evidence, your profile, your proposal. Everything stays in your browser."
	/>

	<div class="flex flex-col gap-4">
		{#each data.kits as kit (kit.slug)}
			{@const planned = kit.status === 'planned'}
			<svelte:element
				this={planned ? 'div' : 'a'}
				href={planned ? undefined : `/tools/${kit.slug}`}
				use:reveal
				class="kit surface"
				class:is-planned={planned}
			>
				<span class="eyebrow inline-flex items-center gap-1.5">
					<Icon name="wrench" size={14} />
					{kit.steps.length} steps · {planned ? 'Coming soon' : 'Ready'}
				</span>
				<span class="title" lang="bn">{kit.title}</span>
				<span class="tagline">{kit.tagline}</span>
				{#if !planned}
					<span class="cta"><Icon name="arrowRight" size={16} /></span>
				{/if}
			</svelte:element>
		{/each}
	</div>

	<p class="note">
		No account, no upload. Everything you type is stored in this browser only. Export it from any
		kit to move or back it up.
	</p>
</div>

<style>
	.kit {
		position: relative;
		display: grid;
		gap: 0.2rem;
		padding: 1.25rem 1.4rem;
		text-decoration: none;
	}

	.is-planned {
		opacity: 0.55;
	}

	.eyebrow {
		font-family: var(--font-pixel);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--muted);
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
		color: var(--muted);
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
		background: color-mix(in oklch, var(--fg) 6%, transparent);
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
