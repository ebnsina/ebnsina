<script lang="ts">
	import { onMount } from 'svelte';
	import './sim.css';
	import Icon from '$lib/components/Icon.svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';
	import { MAJORITY, NAMES, RaftSim } from '$lib/raft-sim';

	const SPEED = 0.15; // 1 real second = 150 ms of cluster time, slow enough to watch votes fly
	const SEED = 1;
	const XP = xpForLevel('advanced');
	const count = new Intl.NumberFormat('en');
	const POS = NAMES.map((_, i) => {
		const a = ((-90 + i * 72) * Math.PI) / 180;
		return { x: 150 + 78 * Math.cos(a), y: 100 + 78 * Math.sin(a) };
	});

	let sim = new RaftSim(SEED);
	let running = $state(true);
	let mode = $state<'sandbox' | 'challenge' | 'settling' | 'result'>('sandbox');
	let result = $state<{ lost: string[]; by: number[]; kept: number; writes: number } | null>(null);
	let snap = $state.raw(read());

	function read() {
		return {
			nodes: sim.nodes.map((n, i) => ({
				role: n.role,
				term: n.term,
				side: sim.side[i],
				log: n.log.map((e, k) => ({ v: e.value || '·', done: k < n.commit }))
			})),
			links: POS.flatMap((_, i) =>
				POS.slice(i + 1).flatMap((_, k) => (sim.connected(i, i + 1 + k) ? [[i, i + 1 + k]] : []))
			),
			msgs: sim.msgs.map((m) => {
				const p = Math.min(1, (sim.t - m.sent) / (m.at - m.sent));
				const a = POS[m.from];
				const b = POS[m.to];
				return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
			}),
			leaders: sim.leaders,
			term: Math.max(...sim.nodes.map((n) => n.term)),
			committed: sim.writes.filter((w) => sim.acked.has(w.id)).length,
			pending: sim.writes.filter((w) => !sim.acked.has(w.id)).length
		};
	}

	function toggle(i: number) {
		if (mode === 'settling' || mode === 'result') return;
		sim.side[i] = 1 - sim.side[i];
		snap = read();
	}

	function write(i: number) {
		sim.write(i, String.fromCharCode(65 + (sim.writes.length % 26)));
		snap = read();
	}

	function heal() {
		sim.heal();
		if (mode === 'challenge') mode = 'settling';
		snap = read();
	}

	function reset(next: 'sandbox' | 'challenge') {
		sim = new RaftSim(SEED);
		result = null;
		mode = next;
		running = true;
		snap = read();
	}

	function finish() {
		const out = sim.outcome();
		result = {
			lost: out.lost.map((w) => w.value),
			by: [...new Set(out.lost.map((w) => w.node))],
			kept: out.kept,
			writes: sim.writes.length
		};
		mode = 'result';
		if (result.lost.length) progress.complete('challenge', 'raft-partition', 'advanced');
	}

	onMount(() => {
		progress.hydrate();
		let last = performance.now();
		let settleUntil = Infinity;
		let raf = requestAnimationFrame(function frame(now) {
			// Cap the step so a backgrounded tab doesn't come back to a burst of elections.
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (running && mode !== 'result') {
				sim.step(dt * SPEED);
				if (mode === 'settling') {
					if (settleUntil === Infinity) settleUntil = sim.t + 5;
					if (sim.converged || sim.t > settleUntil) {
						settleUntil = Infinity;
						finish();
					}
				}
				snap = read();
			}
			raf = requestAnimationFrame(frame);
		});
		return () => cancelAnimationFrame(raf);
	});
</script>

<figure class="sim surface" lang="bn">
	<div class="sim-head">
		<span class="eyebrow">Raft simulator</span>
		<span class="eyebrow">
			{mode === 'sandbox' ? 'খেলার মাঠ' : mode === 'settling' ? 'মিলিয়ে দেখছি…' : 'চ্যালেঞ্জ'}
		</span>
	</div>

	<svg viewBox="0 0 300 205" class="rf-map" role="group" aria-label="Five-node Raft cluster">
		{#each snap.links as [a, b] (`${a}-${b}`)}
			<line x1={POS[a].x} y1={POS[a].y} x2={POS[b].x} y2={POS[b].y} class="rf-link" />
		{/each}
		{#each snap.msgs as m, k (k)}
			<rect x={m.x - 2.5} y={m.y - 2.5} width="5" height="5" class="rf-msg" />
		{/each}
		{#each snap.nodes as n, i (i)}
			<g
				class="rf-node rf-{n.role}"
				class:away={n.side === 1}
				role="button"
				tabindex="0"
				aria-label="{NAMES[i]}, {n.role}, term {n.term}. Move to the other side of the partition"
				onclick={() => toggle(i)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(i))}
			>
				<circle cx={POS[i].x} cy={POS[i].y} r="17" />
				<text x={POS[i].x} y={POS[i].y + 4} class="rf-term">{n.term}</text>
				<text x={POS[i].x} y={POS[i].y + (i === 0 ? -24 : 31)} class="rf-name">{NAMES[i]}</text>
			</g>
		{/each}
	</svg>

	<div class="rf-logs">
		{#each snap.nodes as n, i (i)}
			<div class="rf-row">
				<span class="rf-who"
					>{NAMES[i]}{#if n.role === 'leader'}<b> · leader</b>{/if}{#if n.side === 1}<small>
							· cut off</small
						>{/if}</span
				>
				<span class="rf-log">
					{#each n.log as e, k (k)}<span class="rf-cell" class:done={e.done}>{e.v}</span>{/each}
				</span>
			</div>
		{/each}
	</div>

	<dl class="sim-stats">
		<div>
			<dt>Term</dt>
			<dd class="num">{count.format(snap.term)}</dd>
		</div>
		<div class:hot={snap.leaders.length > 1}>
			<dt>Leader</dt>
			<dd class="num">{snap.leaders.length}</dd>
		</div>
		<div>
			<dt>Committed</dt>
			<dd class="num">{snap.committed}</dd>
		</div>
		<div>
			<dt>Uncommitted</dt>
			<dd class="num">{snap.pending}</dd>
		</div>
	</dl>

	<div class="sim-challenge">
		{#if mode === 'sandbox' || mode === 'challenge'}
			<p>
				কোনো node-এ ক্লিক করলে সেটা partition-এর অন্য পাশে চলে যায়, দুই পাশের মধ্যে কোনো message
				পৌঁছায় না। ভরা ঘর মানে committed, ফাঁকা ঘর মানে এখনো commit হয়নি।
			</p>
			{#if mode === 'challenge'}
				<p>
					<b>চ্যালেঞ্জ:</b> সিনা এখন leader। এমন একটা partition বানাও যাতে কোনো leader একটা write নিজের
					log-এ তুলে নেয়, কিন্তু heal করার পর সেই write হারিয়ে যায়।
				</p>
			{/if}
			<div class="sim-actions">
				{#each snap.leaders as l (l)}
					<button class="btn btn-solid" onclick={() => write(l)}>Write → {NAMES[l]}</button>
				{:else}
					<button class="btn btn-ghost" disabled>কোনো leader নেই</button>
				{/each}
				<button class="btn btn-ghost" onclick={heal}>
					{mode === 'challenge' ? 'Heal করে যাচাই করো' : 'Heal'}
				</button>
				{#if mode === 'sandbox'}
					<button class="btn btn-ghost" onclick={() => reset('challenge')}>চ্যালেঞ্জ শুরু</button>
					<button class="btn btn-ghost" onclick={() => (running = !running)}>
						{running ? 'Pause' : 'Play'}
					</button>
				{/if}
			</div>
		{:else if mode === 'settling'}
			<p>সবাই আবার যুক্ত। নতুন leader সবার log মিলিয়ে নিচ্ছে…</p>
		{:else if result}
			{@const passed = result.lost.length > 0}
			<p class="sim-verdict" class:ok={passed}>
				<Icon name={passed ? 'trophy' : 'close'} size={18} />
				<b>{passed ? `পাস, +${XP} XP` : 'এখনো কিছু হারায়নি'}</b>
			</p>
			<p>
				{#if passed}
					{result.lost.join(', ')} write-টা {result.by.map((i) => NAMES[i]).join(', ')}-এর log-এ
					উঠেছিল, কিন্তু majority-র ({MAJORITY}টা node) কাছে পৌঁছায়নি। তাই commit হয়নি, client
					কখনো "OK" পায়নি। Heal হতেই বড় দলের নতুন leader-এর log ওই জায়গায় বসে গেল। আর যে {result.kept}টা
					write commit হয়েছিল, তার একটাও হারায়নি। Raft শুধু সেটাই রাখার কথা দেয় যেটা commit
					হয়েছে।
				{:else if result.writes === 0}
					কোনো write-ই পাঠাওনি। আগে partition বানাও, তারপর যে পাশে leader আছে সেখানে write পাঠাও।
				{:else}
					{result.kept}টা write-ই majority-তে পৌঁছে commit হয়েছে, তাই heal-এর পরেও টিকে আছে।
					Committed write Raft কখনো মোছে না। হারাতে চাইলে leader-কে ছোট দলে আটকাও (সর্বোচ্চ {MAJORITY -
						1}টা node), তারপর ওর কাছে write পাঠাও।
				{/if}
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={() => reset('challenge')}>আবার চালাও</button>
				<button class="btn btn-ghost" onclick={() => reset('sandbox')}>খেলার মাঠে ফেরো</button>
			</div>
		{/if}
	</div>
</figure>

<style>
	.rf-map {
		width: 100%;
		max-width: 26rem;
		margin: 0 auto;
		display: block;
		overflow: visible;
	}
	.rf-link {
		stroke: var(--rule-strong);
		stroke-width: 1;
	}
	.rf-msg {
		fill: var(--fg);
	}
	.rf-node {
		cursor: pointer;
		outline: none;
	}
	.rf-node circle {
		fill: var(--bg);
		stroke: var(--fg);
		stroke-width: 1;
	}
	.rf-node.rf-candidate circle {
		stroke-width: 3;
	}
	.rf-node.rf-leader circle {
		fill: var(--fg);
	}
	.rf-node.away {
		opacity: 0.45;
	}
	.rf-node:focus-visible circle {
		stroke-width: 3;
	}
	.rf-term,
	.rf-name {
		text-anchor: middle;
		fill: var(--fg);
	}
	.rf-term {
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.rf-leader .rf-term {
		fill: var(--bg);
	}
	.rf-name {
		font-size: 11px;
	}
	.rf-logs {
		display: grid;
		gap: 0.4rem;
	}
	.rf-row {
		display: grid;
		grid-template-columns: 9rem 1fr;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.8rem;
	}
	.rf-who small {
		color: var(--muted);
	}
	.rf-log {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}
	.rf-cell {
		width: 1.35rem;
		height: 1.35rem;
		display: grid;
		place-items: center;
		border: 1px solid var(--fg);
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}
	.rf-cell.done {
		background: var(--fg);
		color: var(--bg);
	}
	@media (max-width: 480px) {
		.rf-row {
			grid-template-columns: 1fr;
			gap: 0.2rem;
		}
	}
</style>
