<script lang="ts">
	/**
	 * Funnel tracker.
	 *
	 * Both series open on the same argument: people prepare for the stage they
	 * are not failing at. The only cure is numbers, so this records the four that
	 * matter per week and names the stage where the drop-off actually is.
	 */
	import { toolkit } from '$lib/toolkit/store.svelte';
	import Icon from '$lib/components/Icon.svelte';

	const totals = $derived.by(() =>
		toolkit.funnel.reduce(
			(acc, w) => ({
				sent: acc.sent + w.sent,
				replies: acc.replies + w.replies,
				calls: acc.calls + w.calls,
				technical: acc.technical + w.technical,
				offers: acc.offers + w.offers
			}),
			{ sent: 0, replies: 0, calls: 0, technical: 0, offers: 0 }
		)
	);

	const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

	/** The diagnosis, in the series' own terms: where the number collapses is the
	 *  problem, and everything else is wasted effort. */
	const verdict = $derived.by(() => {
		const t = totals;
		if (t.sent < 15)
			return { text: 'আরও কিছু সপ্তাহের ডেটা দরকার — ১৫টার নিচে অনুপাত অর্থহীন।', tone: 'quiet' };
		if (pct(t.replies, t.sent) < 5)
			return {
				text: 'রিপ্লাই ৫%-এর নিচে — সমস্যা পজিশনিং, প্রোফাইল বা টার্গেটিংয়ে। আরও পাঠিয়ে লাভ নেই।',
				tone: 'bad'
			};
		if (t.replies >= 5 && pct(t.calls, t.replies) < 30)
			return { text: 'রিপ্লাই আসছে কিন্তু কল হচ্ছে না — শুরুর কথোপকথনটা দেখো।', tone: 'warn' };
		if (t.calls >= 4 && pct(t.technical, t.calls) < 40)
			return {
				text: 'কলে গিয়ে আটকাচ্ছ — পরিচয় আর ব্যবহারিক প্রশ্নগুলোর উত্তর তৈরি করো।',
				tone: 'warn'
			};
		if (t.technical >= 3 && !t.offers)
			return { text: 'টেকনিক্যাল রাউন্ডে থামছ — এখানেই প্রস্তুতির সময় দাও।', tone: 'warn' };
		return { text: 'ফানেল স্বাভাবিক দেখাচ্ছে — চালিয়ে যাও।', tone: 'good' };
	});

	function addWeek() {
		const d = new Date();
		d.setDate(d.getDate() - d.getDay());
		toolkit.addWeek(d.toISOString().slice(0, 10));
	}
</script>

<div class="step">
	<p class="lede">
		প্রতি সপ্তাহে চারটা সংখ্যা। যে ধাপে সংখ্যাটা ভেঙে পড়ে, সেটাই তোমার আসল সমস্যা — বাকি সব ধাপে
		খাটুনি মানে সময় নষ্ট।
	</p>

	{#if toolkit.funnel.length}
		<div class="totals">
			{#each [['পাঠানো', totals.sent, 100], ['রিপ্লাই', totals.replies, pct(totals.replies, totals.sent)], ['কল', totals.calls, pct(totals.calls, totals.sent)], ['টেকনিক্যাল', totals.technical, pct(totals.technical, totals.sent)], ['অফার', totals.offers, pct(totals.offers, totals.sent)]] as [label, n, share] (label)}
				<div class="stat">
					<span class="stat-n">{n}</span>
					<span class="stat-label">{label}</span>
					<span class="stat-share">{share}%</span>
				</div>
			{/each}
		</div>

		<p class="verdict" data-tone={verdict.tone}>{verdict.text}</p>

		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>সপ্তাহ</th>
						<th>পাঠানো</th>
						<th>রিপ্লাই</th>
						<th>কল</th>
						<th>টেক</th>
						<th>অফার</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each toolkit.funnel as w (w.id)}
						<tr>
							<td class="week">{w.weekOf}</td>
							{#each ['sent', 'replies', 'calls', 'technical', 'offers'] as k (k)}
								<td>
									<input
										class="num"
										type="number"
										min="0"
										value={w[k as 'sent']}
										oninput={(e) =>
											toolkit.updateWeek(w.id, { [k]: Number(e.currentTarget.value) || 0 })}
									/>
								</td>
							{/each}
							<td>
								<button class="del" onclick={() => toolkit.removeWeek(w.id)} aria-label="মুছে ফেলো">
									<Icon name="close" size={13} />
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty"><p>এখনো কোনো সপ্তাহ যোগ করোনি।</p></div>
	{/if}

	<button class="add" onclick={addWeek}>এই সপ্তাহ যোগ করো</button>
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

	.totals {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.5rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius-card);
	}

	.stat-n {
		font-family: var(--font-pixel, var(--font-mono));
		font-size: 1.25rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.stat-label {
		font-size: 0.6875rem;
		color: var(--muted);
	}

	.stat-share {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: color-mix(in oklch, var(--fg) 45%, transparent);
	}

	.verdict {
		margin: 0;
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius-button);
		font-size: 0.875rem;
		line-height: 1.6;
		background: color-mix(in oklch, var(--cl) 10%, var(--bg));
		color: var(--fg);
		--cl: var(--accent);
	}

	.verdict[data-tone='bad'] {
		--cl: #d94a4a;
	}
	.verdict[data-tone='warn'] {
		--cl: #c98a1b;
	}
	.verdict[data-tone='good'] {
		--cl: #2f9e6f;
	}

	.table-wrap {
		overflow-x: auto;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}

	.table th {
		text-align: left;
		font-weight: 600;
		color: var(--muted);
		font-size: 0.6875rem;
		padding: 0.3rem 0.4rem;
	}

	.table td {
		padding: 0.25rem 0.4rem;
		border-top: 1px solid var(--rule);
	}

	.week {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.num {
		width: 4rem;
		padding: 0.3rem 0.4rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius-button);
		background: color-mix(in oklch, var(--fg) 2%, var(--bg));
		color: var(--fg);
		font: inherit;
		font-variant-numeric: tabular-nums;
	}

	.del {
		background: none;
		border: 0;
		color: var(--muted);
		cursor: pointer;
		padding: 0.2rem;
	}

	.del:hover {
		color: #d94a4a;
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

	.add {
		align-self: flex-start;
		padding: 0.5rem 0.9rem;
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
