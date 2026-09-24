<script lang="ts">
	/**
	 * A kit is one chain of steps over the shared toolkit state. Steps are looked
	 * up by id, so adding the remote-job kit later is a registry entry plus the
	 * genuinely new step components — this page does not change.
	 */
	import { onMount } from 'svelte';
	import Seo from '$lib/components/Seo.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { toolkit } from '$lib/toolkit/store.svelte';
	import EvidenceStep from '$lib/components/toolkit/EvidenceStep.svelte';
	import PositioningStep from '$lib/components/toolkit/PositioningStep.svelte';
	import ProfileStep from '$lib/components/toolkit/ProfileStep.svelte';
	import GigStep from '$lib/components/toolkit/GigStep.svelte';
	import ProposalStep from '$lib/components/toolkit/ProposalStep.svelte';
	import FunnelStep from '$lib/components/toolkit/FunnelStep.svelte';

	let { data } = $props();
	const kit = $derived(data.kit);

	let active = $state(0);
	const step = $derived(kit.steps[active]);

	onMount(() => toolkit.hydrate());

	// One autosave for the whole kit: the forms bind straight into the state
	// proxy, and this deep-reads it so any nested edit re-runs the effect.
	$effect(() => {
		toolkit.autosave();
	});

	let importing = $state(false);
	let importError = $state('');

	function download() {
		const blob = new Blob([toolkit.exportJSON()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `toolkit-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function onFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		const ok = toolkit.importJSON(await file.text());
		importError = ok ? '' : 'ফাইলটা পড়া গেল না — এটা কি এই টুলের এক্সপোর্ট করা JSON?';
		importing = false;
	}
</script>

<Seo title={kit.tagline} description={kit.description} />

<div class="mx-auto max-w-4xl px-5 sm:px-8" lang="bn">
	<nav class="pt-2 text-sm text-muted"><a href="/tools" class="hover:text-fg"><Icon name="arrowLeft" size={14} /> সব টুল</a></nav>

	<header class="head">
		<h1 class="title-page">{kit.title}</h1>
		<p class="desc">{kit.description}</p>
	</header>

	{#if kit.status === 'planned'}
		<p class="planned">এই কিটটা এখনো তৈরি হচ্ছে।</p>
	{:else}
		<ol class="stepper">
			{#each kit.steps as s, i (s.id)}
				<li>
					<button class="pill" class:is-on={i === active} onclick={() => (active = i)}>
						<span class="num">{i + 1}</span>
						{s.label}
					</button>
				</li>
			{/each}
		</ol>

		<section class="panel">
			<header class="panel-head">
				<div>
					<h2 class="panel-title">{step.label}</h2>
					<p class="panel-blurb">{step.blurb}</p>
				</div>
				{#if step.reading}
					<a class="reading" href={`/series/${step.reading.series}/${step.reading.part}`}>
						{step.reading.label} পড়ো
						<Icon name="arrowUpRight" size={12} />
					</a>
				{/if}
			</header>

			{#if !toolkit.ready}
				<p class="loading">লোড হচ্ছে…</p>
			{:else if step.id === 'evidence'}
				<EvidenceStep />
			{:else if step.id === 'positioning'}
				<PositioningStep />
			{:else if step.id === 'profile'}
				<ProfileStep />
			{:else if step.id === 'gig'}
				<GigStep />
			{:else if step.id === 'proposal'}
				<ProposalStep />
			{:else if step.id === 'funnel'}
				<FunnelStep />
			{/if}
		</section>

		<nav class="pager">
			<button class="nav" disabled={active === 0} onclick={() => (active -= 1)}><Icon name="arrowLeft" size={14} /> আগের ধাপ</button>
			<button class="nav" disabled={active === kit.steps.length - 1} onclick={() => (active += 1)}
				>পরের ধাপ <Icon name="arrowRight" size={14} /></button
			>
		</nav>

		<footer class="data">
			<span class="data-label">তোমার ডেটা এই ব্রাউজারেই আছে</span>
			<div class="data-actions">
				<button class="link" onclick={download}>এক্সপোর্ট</button>
				<button class="link" onclick={() => (importing = !importing)}>ইমপোর্ট</button>
				<button
					class="link danger"
					onclick={() => confirm('সব মুছে যাবে। নিশ্চিত?') && toolkit.reset()}
				>
					সব মুছে ফেলো
				</button>
			</div>
			{#if importing}
				<input type="file" accept="application/json" onchange={onFile} class="file" />
			{/if}
			{#if importError}
				<p class="err">{importError}</p>
			{/if}
		</footer>
	{/if}
</div>

<style>
	.head {
		margin: 1.5rem 0 1.75rem;
	}


	.desc {
		margin: 0.5rem 0 0;
		max-width: 68ch;
		font-size: 0.9375rem;
		line-height: 1.75;
		color: var(--muted);
	}

	.planned {
		padding: 1.25rem;
		border: 1px solid transparent;
		background: color-mix(in oklab, var(--fg) 4%, transparent);
		border-radius: var(--radius-card);
		color: var(--muted);
	}

	.stepper {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0 0 1rem;
		padding: 0;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid transparent;
		border-radius: 999px;
		background: color-mix(in oklab, var(--fg) 5%, transparent);
		color: var(--muted);
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.pill.is-on {
		background: color-mix(in oklab, var(--accent) 12%, var(--bg));
		color: var(--accent);
		font-weight: 600;
	}

	.num {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		opacity: 0.7;
	}

	.panel {
		padding: 1.25rem;
		border: 1px solid transparent;
		background: color-mix(in oklab, var(--fg) 4%, transparent);
		border-radius: var(--radius-card);
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.panel-title {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.panel-blurb {
		margin: 0.2rem 0 0;
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--muted);
		max-width: 60ch;
	}

	.reading {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--accent);
		text-decoration: none;
		white-space: nowrap;
	}

	.reading:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.loading {
		color: var(--muted);
		font-size: 0.875rem;
	}

	.pager {
		display: flex;
		justify-content: space-between;
		margin-top: 1rem;
	}

	.nav {
		background: none;
		border: 0;
		font-size: 0.875rem;
		color: var(--muted);
		cursor: pointer;
	}

	.nav:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.nav:not(:disabled):hover {
		color: var(--fg);
	}

	.data {
		margin: 2.5rem 0 1rem;
		padding-top: 1rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
	}

	.data-label {
		font-size: 0.75rem;
		color: var(--muted);
	}

	.data-actions {
		display: flex;
		gap: 0.9rem;
		margin-left: auto;
	}

	.link {
		background: none;
		border: 0;
		padding: 0;
		font-size: 0.8125rem;
		color: var(--muted);
		cursor: pointer;
	}

	.link:hover {
		color: var(--fg);
	}

	.link.danger:hover {
		color: #d94a4a;
	}

	.file {
		font-size: 0.8125rem;
		flex-basis: 100%;
	}

	.err {
		flex-basis: 100%;
		margin: 0;
		font-size: 0.8125rem;
		color: #d94a4a;
	}
</style>
