<script lang="ts">
	/**
	 * Profile builder for both platforms. The two differ enough in their limits
	 * that a shared form with a platform switch is honest — the fields are the
	 * same job, the ceilings are not.
	 */
	import { toolkit } from '$lib/toolkit/store.svelte';
	import { overviewSpec } from '$lib/toolkit/spec';
	import Field from './Field.svelte';
	import PromptCard from './PromptCard.svelte';

	let platform = $state<'upwork' | 'fiverr'>('upwork');
	const profile = $derived(toolkit.profile(platform));
	const p = $derived(toolkit.positioning);

	const chosen = $derived(p.proofId ? toolkit.pickEvidence([p.proofId]) : []);
	const evidence = $derived(chosen.length ? chosen : toolkit.evidence.slice(0, 2));

	const spec = $derived(overviewSpec(p, evidence, platform));
	const blocked = $derived(!evidence.length || !p.domain.trim());
</script>

<div class="step">
	<div class="switch" role="tablist" aria-label="Platform">
		{#each ['upwork', 'fiverr'] as pl (pl)}
			<button
				role="tab"
				aria-selected={platform === pl}
				class="tab"
				class:is-on={platform === pl}
				onclick={() => (platform = pl as 'upwork' | 'fiverr')}
			>
				{pl === 'upwork' ? 'Upwork' : 'Fiverr'}
			</button>
		{/each}
	</div>

	<p class="lede">
		{#if platform === 'upwork'}
			Upwork-এ টাইটেল আর ওভারভিউয়ের প্রথম অংশটাই ক্লায়েন্ট সার্চে দেখা যায় — বাকিটা "see more"-এর
			পেছনে।
		{:else}
			Fiverr প্রোফাইল গিগের চেয়ে কম ওজন বহন করে, কিন্তু ক্লায়েন্ট অর্ডারের আগে একবার দেখে নেয়।
		{/if}
	</p>

	<Field
		label="টাইটেল"
		bind:value={profile.title}
		platform={platform === 'upwork' ? 'upwork' : undefined}
		limitKey={platform === 'upwork' ? 'title' : undefined}
		placeholder="Payments & order systems, reliability"
		hint="পজিশনিং ধাপের লাইনটাই এখানে বসে, ছোট করে।"
	/>

	<Field
		label="ওভারভিউ"
		bind:value={profile.overview}
		rows={8}
		platform={platform === 'upwork' ? 'upwork' : undefined}
		limitKey={platform === 'upwork' ? 'overview' : undefined}
		requireNumber
		minWords={40}
		placeholder="Checkout double-charges cost a marketplace 0.4% of orders during sales. I…"
	/>

	<PromptCard
		{spec}
		disabled={blocked}
		blockedReason="আগে পজিশনিং আর অন্তত একটা প্রমাণ পূরণ করো — না হলে AI-কে দেওয়ার মতো কোনো তথ্য থাকছে না।"
	/>
</div>

<style>
	.step {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.switch {
		display: inline-flex;
		gap: 0.25rem;
		padding: 0.2rem;
		border: 1px solid transparent;
		background: color-mix(in oklab, var(--fg) 4%, transparent);
		border-radius: var(--radius-button);
		align-self: flex-start;
	}

	.tab {
		padding: 0.35rem 0.8rem;
		border: 0;
		border-radius: calc(var(--radius-button) - 0.2rem);
		background: none;
		color: var(--muted);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
	}

	.tab.is-on {
		background: color-mix(in oklab, var(--accent) 12%, var(--bg));
		color: var(--accent);
	}

	.lede {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.7;
		color: var(--muted);
		max-width: 62ch;
	}
</style>
