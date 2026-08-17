<script lang="ts">
	/**
	 * The evidence bank — the root of the whole toolkit.
	 *
	 * Everything downstream references these entries by id, so this is the only
	 * place a fact is typed. It is also where the critic is strictest: a piece of
	 * evidence with no measurement will be weak in a gig, weaker in a proposal
	 * and useless in an interview, so it is worth blocking here rather than four
	 * steps later.
	 */
	import { toolkit } from '$lib/toolkit/store.svelte';
	import { critiqueEvidence } from '$lib/toolkit/critic';
	import Findings from './Findings.svelte';
	import Field from './Field.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let openId = $state<string | null>(null);

	function add() {
		openId = toolkit.addEvidence();
	}

	function findingsFor(id: string) {
		const e = toolkit.evidenceById(id);
		return e ? critiqueEvidence(e) : [];
	}
</script>

<div class="step">
	<p class="lede">
		যা তুমি সত্যিই করেছ, তার একটা তালিকা। প্রতিটার জন্য: সমস্যা কী ছিল, তুমি কী করলে, আর সংখ্যাটা কত
		বদলাল। এই ভাণ্ডার থেকেই প্রোফাইল, গিগ আর প্রপোজাল — তিনটাই খাবে।
	</p>

	{#if !toolkit.evidence.length}
		<div class="empty">
			<p>এখনো কিছু নেই। শুরু করার সহজ প্রশ্ন — গত ছয় মাসে সবচেয়ে কঠিন কাজটা কী ছিল?</p>
		</div>
	{/if}

	<ul class="list">
		{#each toolkit.evidence as e (e.id)}
			{@const findings = findingsFor(e.id)}
			{@const isOpen = openId === e.id}
			<li class="card" class:is-open={isOpen}>
				<button class="row" onclick={() => (openId = isOpen ? null : e.id)}>
					<span class="row-title">{e.label || 'নামহীন প্রমাণ'}</span>
					<span class="row-meta">
						{#if findings.some((f) => f.severity === 'blocker')}
							<span class="dot" data-severity="blocker"></span>
						{:else if findings.length}
							<span class="dot" data-severity="warning"></span>
						{:else}
							<span class="dot" data-severity="ok"></span>
						{/if}
						{e.domain || '—'}
					</span>
				</button>

				{#if isOpen}
					<div class="body">
						<Field
							label="নাম"
							bind:value={e.label}
							placeholder="চেকআউট ডাবল-চার্জ"
							hint="তালিকায় চেনার জন্য — ছোট রাখো।"
						/>
						<div class="two">
							<Field
								label="ডোমেইন"
								bind:value={e.domain}
								placeholder="পেমেন্ট / ভিডিও / লজিস্টিকস"
							/>
							<Field label="স্কেল" bind:value={e.scale} placeholder="৪ মিলিয়ন MAU" />
						</div>
						<Field
							label="সমস্যা"
							bind:value={e.problem}
							rows={2}
							placeholder="সেলের দিনে ০.৪% অর্ডারে ডাবল চার্জ হচ্ছিল।"
						/>
						<Field
							label="তুমি কী করলে"
							bind:value={e.action}
							rows={3}
							minWords={12}
							placeholder="idempotency key আর রাতের reconciliation job ডিজাইন করেছি — distributed transaction বাদ দিয়েছি কারণ…"
							hint="সিদ্ধান্তটা লেখো: কোন পথ নিলে, কোনটা বাদ দিলে, কেন।"
						/>
						<div class="three">
							<Field label="আগে" bind:value={e.metric.before} placeholder="0.4" />
							<Field label="পরে" bind:value={e.metric.after} placeholder="0.02" />
							<Field label="একক" bind:value={e.metric.unit} placeholder="% orders" />
						</div>
						<Field
							label="পাবলিক লিংক (ঐচ্ছিক)"
							bind:value={e.artifact}
							placeholder="https://…"
							hint="লেখা, রিপো বা কেস স্টাডি — যাচাই করার মতো কিছু থাকলে।"
						/>

						<Findings {findings} />

						<div class="card-actions">
							<button class="link danger" onclick={() => toolkit.removeEvidence(e.id)}>
								মুছে ফেলো
							</button>
						</div>
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	<button class="add" onclick={add}>
		<Icon name="sparkles" size={14} />
		নতুন প্রমাণ যোগ করো
	</button>
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

	.empty {
		padding: 1.25rem;
		border: 1px dashed var(--rule);
		border-radius: var(--radius-card);
		color: var(--muted);
		font-size: 0.875rem;
	}

	.empty p {
		margin: 0;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.card {
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
		overflow: hidden;
	}

	.card.is-open {
		border-color: color-mix(in oklch, var(--accent) 40%, var(--rule));
	}

	.row {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.8rem 1rem;
		background: none;
		border: 0;
		cursor: pointer;
		text-align: left;
		color: var(--fg);
	}

	.row-title {
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.row-meta {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: var(--accent);
	}
	.dot[data-severity='blocker'] {
		background: #d94a4a;
	}
	.dot[data-severity='warning'] {
		background: #c98a1b;
	}
	.dot[data-severity='ok'] {
		background: #2f9e6f;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 0.4rem 1rem 1rem;
		border-top: 1px solid var(--rule);
	}

	.two,
	.three {
		display: grid;
		gap: 0.85rem;
	}

	@media (min-width: 640px) {
		.two {
			grid-template-columns: 1fr 1fr;
		}
		.three {
			grid-template-columns: 1fr 1fr 1fr;
		}
	}

	.card-actions {
		display: flex;
		justify-content: flex-end;
	}

	.link {
		background: none;
		border: 0;
		padding: 0;
		font-size: 0.8125rem;
		cursor: pointer;
		color: var(--muted);
	}

	.link.danger:hover {
		color: #d94a4a;
	}

	.add {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius-button);
		background: none;
		color: var(--fg);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}

	.add:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
