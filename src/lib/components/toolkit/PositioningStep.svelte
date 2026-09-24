<script lang="ts">
	/**
	 * The two-line identity. Short step, disproportionate effect: it is reused
	 * verbatim at the top of the profile, inside the gig description, and as the
	 * frame of every proposal — so it is the one place where a vague answer
	 * spreads to everything downstream.
	 */
	import { onMount } from 'svelte';
	import { toolkit } from '$lib/toolkit/store.svelte';
	import Field from './Field.svelte';
	import Findings from './Findings.svelte';
	import type { Finding } from '$lib/toolkit/types';

	const p = $derived(toolkit.positioning);
	const proof = $derived(p.proofId ? toolkit.evidenceById(p.proofId) : undefined);

	// Stack is a list in storage but a comma-separated field in the UI. The
	// mirror is seeded once on mount and pushed back on input — deliberately not
	// through an effect, because writing state that the same effect reads is what
	// makes Svelte bail with `effect_update_depth_exceeded`.
	let stackText = $state('');

	onMount(() => {
		stackText = toolkit.positioning.stack.join(', ');
	});

	function pushStack() {
		toolkit.setPositioning({
			stack: stackText
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		});
	}

	const line = $derived(
		[
			p.role,
			p.domain && `— ${p.domain}`,
			p.problemType && `, ${p.problemType}`,
			p.stack.length ? `. ${p.stack.join(', ')}` : ''
		]
			.filter(Boolean)
			.join('')
	);

	const findings = $derived.by((): Finding[] => {
		const out: Finding[] = [];
		if (!p.domain.trim()) {
			out.push({
				severity: 'blocker',
				field: 'domain',
				message: 'ডোমেইন নেই — তুমি এখনো "সব পারি" অবস্থানে আছ।',
				fix: 'গত তিন বছরে সবচেয়ে বেশি সময় কোন সাবসিস্টেমে কেটেছে? সেটাই লেখো।'
			});
		}
		if (!p.problemType.trim()) {
			out.push({
				severity: 'warning',
				field: 'problemType',
				message: 'সমস্যার ধরন নেই — ডোমেইন একা যথেষ্ট না।',
				fix: 'স্কেল, রিলায়েবিলিটি, মাইগ্রেশন, লেটেন্সি, খরচ — কোনটায় তুমি ডাকা পড়ো?'
			});
		}
		if (!p.proofId) {
			out.push({
				severity: 'warning',
				field: 'proof',
				message: 'কোনো প্রমাণ বাছা হয়নি।',
				fix: 'ভাণ্ডার থেকে সবচেয়ে শক্ত প্রমাণটা বেছে দাও — এটাই সব জায়গায় সাথে যাবে।'
			});
		}
		if (p.stack.length > 6) {
			out.push({
				severity: 'nudge',
				field: 'stack',
				message: `${p.stack.length}টা টেকনোলজি — তালিকা যত লম্বা, ছাপ তত হালকা।`,
				fix: 'যেগুলোতে সত্যিই ইন্টারভিউ দিতে পারবে, সেই ৩–৫টা রাখো।'
			});
		}
		return out;
	});
</script>

<div class="step">
	<p class="lede">
		একটা বাক্য যেটা একজন অচেনা মানুষ পড়ে মনে রাখতে পারে। সূত্রটা: <strong
			>ডোমেইন × সমস্যার ধরন</strong
		>, স্ট্যাক তার পরে।
	</p>

	<div class="grid">
		<Field label="ভূমিকা" bind:value={p.role} placeholder="Senior Backend Engineer" />
		<Field label="ডোমেইন" bind:value={p.domain} placeholder="পেমেন্ট ও অর্ডার সিস্টেম" />
		<Field label="সমস্যার ধরন" bind:value={p.problemType} placeholder="রিলায়েবিলিটি" />
		<Field
			label="স্ট্যাক"
			bind:value={stackText}
			oninput={pushStack}
			placeholder="Go, PostgreSQL, Kafka"
			hint="কমা দিয়ে আলাদা করো।"
		/>
	</div>

	<div class="proof">
		<span class="label">সবচেয়ে শক্ত প্রমাণ</span>
		{#if toolkit.evidence.length}
			<select
				class="select"
				value={p.proofId ?? ''}
				onchange={(e) => toolkit.setPositioning({ proofId: e.currentTarget.value || undefined })}
			>
				<option value="">— বেছে নাও —</option>
				{#each toolkit.evidence as e (e.id)}
					<option value={e.id}>{e.label || 'নামহীন প্রমাণ'}</option>
				{/each}
			</select>
		{:else}
			<p class="hint">আগে প্রমাণের ভাণ্ডারে অন্তত একটা এন্ট্রি যোগ করো।</p>
		{/if}
	</div>

	{#if line.trim()}
		<div class="preview">
			<span class="label">যেভাবে দাঁড়াচ্ছে</span>
			<p class="line">{line}</p>
			{#if proof}
				<p class="line proof-line">
					{proof.problem}
					{#if proof.metric.before && proof.metric.after}
						— {proof.metric.before} → {proof.metric.after} {proof.metric.unit}
					{/if}
				</p>
			{/if}
		</div>
	{/if}

	<Findings {findings} />
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

	.grid {
		display: grid;
		gap: 0.9rem;
	}

	@media (min-width: 640px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
	}

	.select {
		width: 100%;
		padding: 0.55rem 0.7rem;
		border: 1px solid transparent;
		border-radius: var(--radius-button);
		background: color-mix(in oklch, var(--fg) 2%, var(--bg));
		color: var(--fg);
		font: inherit;
		font-size: 0.9375rem;
	}

	.hint {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--muted);
	}

	.preview {
		padding: 0.9rem 1rem;
		border-radius: var(--radius-card);
		background: color-mix(in oklab, var(--accent) 6%, var(--bg));
	}

	.line {
		margin: 0;
		font-size: 1rem;
		line-height: 1.6;
		font-weight: 600;
	}

	.proof-line {
		margin-top: 0.3rem;
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--muted);
	}
</style>
