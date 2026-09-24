<script lang="ts">
	/**
	 * The proposal composer — where the toolkit earns its keep.
	 *
	 * Paste a job post and the extractor surfaces the three things that decide
	 * the outcome before any writing does: the screening instruction, the
	 * questions actually asked, and the stated requirements. The screener check
	 * is the single highest-value thing in the whole tool, because ignoring one
	 * is an instant bin regardless of how good the rest is.
	 */
	import { toolkit } from '$lib/toolkit/store.svelte';
	import { extract, missingScreenerTokens } from '$lib/toolkit/extract';
	import { proposalSpec } from '$lib/toolkit/spec';
	import Field from './Field.svelte';
	import Findings from './Findings.svelte';
	import PromptCard from './PromptCard.svelte';
	import type { Finding } from '$lib/toolkit/types';

	const draft = $derived(toolkit.proposal());
	const p = $derived(toolkit.positioning);
	const found = $derived(extract(draft.jobPost));

	// Keep an answer slot per question the client asked, without discarding text
	// the reader already typed for a question that survives a post edit.
	$effect(() => {
		const wanted = found.questions;
		const kept = wanted.map(
			(q) => draft.answers.find((a) => a.question === q) ?? { question: q, answer: '' }
		);
		if (
			kept.length !== draft.answers.length ||
			kept.some((k, i) => k.question !== draft.answers[i]?.question)
		) {
			draft.answers = kept;
		}
	});

	const wholeDraft = $derived(
		[draft.opener, ...draft.answers.map((a) => a.answer), draft.closing].join('\n')
	);

	const missing = $derived(missingScreenerTokens(found, wholeDraft));

	const screenerFindings = $derived.by((): Finding[] =>
		missing.map((w) => ({
			severity: 'blocker' as const,
			field: 'screener',
			message: `ক্লায়েন্ট "${w}" শব্দটা চেয়েছে, তোমার লেখায় সেটা নেই।`,
			fix: 'ঠিক ওই শব্দটা যোগ করো — এটাই ওদের প্রথম ফিল্টার, আর এখানে বাদ পড়লে বাকি কিছুই পড়া হয় না।'
		}))
	);

	const chosen = $derived(toolkit.pickEvidence(draft.evidenceIds));
	const spec = $derived(proposalSpec(draft, found, p, chosen));
	const blocked = $derived(!draft.jobPost.trim());

	function toggleEvidence(id: string) {
		draft.evidenceIds = draft.evidenceIds.includes(id)
			? draft.evidenceIds.filter((x) => x !== id)
			: [...draft.evidenceIds, id];
	}
</script>

<div class="step">
	<Field
		label="জব পোস্ট"
		bind:value={draft.jobPost}
		rows={8}
		placeholder="ক্লায়েন্টের পুরো পোস্টটা এখানে পেস্ট করো…"
		hint="পুরোটা দাও — মাঝখানে লুকানো শর্তগুলোই সবচেয়ে বেশি বাদ পড়ে।"
	/>

	{#if draft.jobPost.trim()}
		<div class="read">
			<h3 class="read-title">পোস্টে যা আছে</h3>

			{#if found.screeners.length}
				<div class="block is-screener">
					<span class="block-label">স্ক্রিনিং শর্ত</span>
					<ul>
						{#each found.screeners as s (s)}
							<li>{s}</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if found.questions.length}
				<div class="block">
					<span class="block-label">প্রশ্ন ({found.questions.length})</span>
					<ul>
						{#each found.questions as q (q)}
							<li>{q}</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if found.requirements.length}
				<div class="block">
					<span class="block-label">শর্ত</span>
					<ul>
						{#each found.requirements as r (r)}
							<li>{r}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<div class="chips">
				{#each found.keywords as k (k)}
					<span class="chip">{k}</span>
				{/each}
				{#each found.budget as b (b)}
					<span class="chip is-meta">{b}</span>
				{/each}
			</div>

			{#if found.warnings.length}
				<Findings
					findings={found.warnings.map((w) => ({
						severity: 'warning' as const,
						field: 'post',
						message: w,
						fix: 'বিড করার আগে ভেবে দেখো — Connects সীমিত।'
					}))}
				/>
			{/if}
		</div>
	{/if}

	{#if toolkit.evidence.length}
		<div class="picker">
			<span class="label">কোন প্রমাণ ব্যবহার করবে (সর্বোচ্চ ২টা)</span>
			<div class="chips">
				{#each toolkit.evidence as e (e.id)}
					<button
						class="chip is-toggle"
						class:is-on={draft.evidenceIds.includes(e.id)}
						onclick={() => toggleEvidence(e.id)}
					>
						{e.label || 'নামহীন'}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<Field
		label="শুরুর লাইন"
		bind:value={draft.opener}
		rows={3}
		jobPost={draft.jobPost}
		placeholder="Duplicate charges at checkout usually come from retries, not from the gateway."
		hint="নিজের পরিচয় দিয়ে শুরু কোরো না — ওদের সমস্যাটা দিয়ে শুরু করো।"
		findings={screenerFindings}
	/>

	{#each draft.answers as a, i (a.question)}
		<Field label={`উত্তর ${i + 1}: ${a.question}`} bind:value={a.answer} rows={3} />
	{/each}

	<Field
		label="শেষ লাইন"
		bind:value={draft.closing}
		rows={2}
		placeholder="I can send a 20-minute walkthrough of how I'd approach the reconciliation. Want it?"
		hint="একটা নির্দিষ্ট পরবর্তী ধাপ দাও।"
	/>

	<PromptCard {spec} disabled={blocked} blockedReason="আগে জব পোস্টটা পেস্ট করো।" />
</div>

<style>
	.step {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.read {
		padding: 0.9rem 1rem;
		border: 1px solid transparent;
		background: color-mix(in oklab, var(--fg) 4%, transparent);
		border-radius: var(--radius-card);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.read-title {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.block-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--muted);
		margin-bottom: 0.3rem;
	}

	.block ul {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.block li {
		font-size: 0.8125rem;
		line-height: 1.55;
	}

	.is-screener {
		padding: 0.6rem 0.7rem;
		border-radius: var(--radius-button);
		background: color-mix(in oklch, #d94a4a 10%, var(--bg));
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.chip {
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		border: 1px solid transparent;
		background: color-mix(in oklab, var(--fg) 5%, transparent);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--muted);
	}

	.chip.is-meta {
		font-family: var(--font-sans);
		max-width: 28ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip.is-toggle {
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: 0.75rem;
		color: var(--fg);
	}

	.chip.is-toggle.is-on {
		border-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 12%, var(--bg));
		color: var(--accent);
	}

	.label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 600;
		margin-bottom: 0.4rem;
	}
</style>
