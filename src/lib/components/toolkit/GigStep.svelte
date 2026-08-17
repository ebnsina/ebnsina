<script lang="ts">
	/**
	 * Fiverr gig builder.
	 *
	 * The two things this catches that a blank editor doesn't: a title that fits
	 * the field but truncates on the card, and packages that differ only in price
	 * — which is the most common reason a three-tier gig sells nothing but Basic.
	 */
	import { onMount } from 'svelte';
	import { toolkit } from '$lib/toolkit/store.svelte';
	import { gigSpec } from '$lib/toolkit/spec';
	import { FIVERR } from '$lib/toolkit/limits';
	import Field from './Field.svelte';
	import Findings from './Findings.svelte';
	import PromptCard from './PromptCard.svelte';
	import type { Finding } from '$lib/toolkit/types';

	const gig = $derived(toolkit.gig());
	const p = $derived(toolkit.positioning);
	const evidence = $derived(toolkit.evidence.slice(0, 2));

	// Seeded once, pushed on input — see the note in PositioningStep about why
	// this is not an effect.
	let tagText = $state('');

	onMount(() => {
		tagText = toolkit.gig().tags.join(', ');
	});

	function pushTags() {
		gig.tags = tagText
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
			.slice(0, FIVERR.tags.max);
	}

	const tagFindings = $derived.by((): Finding[] => {
		const raw = tagText.split(',').filter((t) => t.trim()).length;
		if (raw > FIVERR.tags.max) {
			return [
				{
					severity: 'blocker',
					field: 'tags',
					message: `${raw}টা ট্যাগ লিখেছ, Fiverr নেয় ${FIVERR.tags.max}টা।`,
					fix: 'সবচেয়ে নির্দিষ্ট পাঁচটা রাখো — বিস্তৃত ট্যাগে তুমি হাজারজনের ভিড়ে পড়বে।'
				}
			];
		}
		return [];
	});

	/** Tiers that differ only in price teach the buyer nothing, so nobody upgrades. */
	const packageFindings = $derived.by((): Finding[] => {
		const filled = gig.packages.filter((pk) => pk.price.trim() || pk.includes.length);
		if (filled.length < 2) return [];
		const sameScope = filled.every((pk) => pk.includes.join('|') === filled[0].includes.join('|'));
		if (sameScope) {
			return [
				{
					severity: 'warning',
					field: 'packages',
					message: 'প্যাকেজগুলোতে শুধু দাম আলাদা, কাজ এক।',
					fix: 'উপরের ধাপে বাড়তি কী পাওয়া যায় সেটা স্পষ্ট করো — না হলে কেউ আপগ্রেড করবে না।'
				}
			];
		}
		return [];
	});

	const spec = $derived(gigSpec(gig, p, evidence));
	const blocked = $derived(!gig.title.trim() || !evidence.length);
</script>

<div class="step">
	<p class="lede">
		গিগের সবচেয়ে ভারী দুটো জায়গা টাইটেল আর প্যাকেজ। বর্ণনা পড়া হয় তৃতীয়ে — যদি প্রথম দুটো কাজ
		করে।
	</p>

	<Field
		label="গিগ টাইটেল"
		bind:value={gig.title}
		platform="fiverr"
		limitKey="gigTitle"
		placeholder="I will fix duplicate charges in your Stripe checkout"
	/>

	<Field
		label="সার্চ ট্যাগ"
		bind:value={tagText}
		oninput={pushTags}
		placeholder="stripe, payments, idempotency, checkout, node"
		hint="কমা দিয়ে, সর্বোচ্চ পাঁচটা।"
		findings={tagFindings}
	/>

	<div class="packages">
		<span class="label">প্যাকেজ</span>
		<div class="pkg-grid">
			{#each gig.packages as pk, i (i)}
				<div class="pkg">
					<input class="pkg-name" bind:value={pk.name} placeholder="Basic" />
					<div class="pkg-row">
						<input class="pkg-input" bind:value={pk.price} placeholder="$" inputmode="numeric" />
						<input
							class="pkg-input"
							bind:value={pk.deliveryDays}
							placeholder="দিন"
							inputmode="numeric"
						/>
						<input class="pkg-input" bind:value={pk.revisions} placeholder="রিভিশন" />
					</div>
					<textarea
						class="pkg-includes"
						rows="3"
						placeholder="কী কী থাকছে — এক লাইনে একটা"
						value={pk.includes.join('\n')}
						oninput={(e) =>
							(pk.includes = e.currentTarget.value.split('\n').filter((l) => l.trim()))}
					></textarea>
				</div>
			{/each}
		</div>
		<Findings findings={packageFindings} />
	</div>

	<Field
		label="বর্ণনা"
		bind:value={gig.description}
		rows={8}
		platform="fiverr"
		limitKey="gigDescription"
		placeholder="What you get, what I need from you, and what this gig does not cover."
		hint="কী অন্তর্ভুক্ত নয় — সেটাও লেখো। স্কোপ নিয়ে বিরোধই রেটিং নষ্ট করে।"
	/>

	<PromptCard {spec} disabled={blocked} blockedReason="আগে টাইটেল আর অন্তত একটা প্রমাণ দাও।" />
</div>

<style>
	.step {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.lede {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.7;
		color: var(--muted);
		max-width: 62ch;
	}

	.label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 600;
		margin-bottom: 0.45rem;
	}

	.pkg-grid {
		display: grid;
		gap: 0.7rem;
	}

	@media (min-width: 768px) {
		.pkg-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.pkg {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.7rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.pkg-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.35rem;
	}

	.pkg-name,
	.pkg-input,
	.pkg-includes {
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius-button);
		background: color-mix(in oklch, var(--fg) 2%, var(--bg));
		color: var(--fg);
		font: inherit;
		font-size: 0.8125rem;
		resize: vertical;
	}

	.pkg-name {
		font-weight: 600;
	}

	.pkg-name:focus,
	.pkg-input:focus,
	.pkg-includes:focus {
		outline: none;
		border-color: var(--accent);
	}
</style>
