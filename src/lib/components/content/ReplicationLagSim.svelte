<script lang="ts">
	import { onMount } from 'svelte';
	import './sim.css';
	import Icon from '$lib/components/Icon.svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';
	import { CHALLENGE, LAG_SPREAD, ReplicationSim, type Routing } from '$lib/replication-sim';

	const LEVEL = 'beginner';
	const CHALLENGE_SPEED = 20;
	const num = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
	const pct = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 });
	const ROUTES: { id: Routing; label: string }[] = [
		{ id: 'replica', label: 'যেকোনো replica' },
		{ id: 'sticky', label: 'Read-your-writes' },
		{ id: 'primary', label: 'সবসময় primary' }
	];

	let lag = $state(2);
	let routing = $state<Routing>('replica');
	let stick = $state(1);
	let running = $state(true);
	let mode = $state<'sandbox' | 'challenge' | 'result'>('sandbox');
	let result = $state<{ stale: number; share: number; routing: Routing; stick: number } | null>(
		null
	);

	let sim = new ReplicationSim(2, 'replica', 1); // matches the initial controls above
	let snap = $state.raw(read());

	function read() {
		return {
			t: sim.t,
			reads: sim.reads,
			stale: sim.stale,
			writes: sim.writes,
			share: sim.primaryShare,
			recent: sim.recent.filter((r) => r.followUp).slice(-60)
		};
	}

	// Any control change starts a fresh sandbox run, so the counters describe one setup.
	function reset() {
		sim = new ReplicationSim(lag, routing, stick);
		snap = read();
	}

	function startChallenge() {
		lag = CHALLENGE.lag;
		sim = new ReplicationSim(CHALLENGE.lag, routing, stick, CHALLENGE.seed);
		result = null;
		mode = 'challenge';
		running = true;
	}

	function backToSandbox() {
		mode = 'sandbox';
		running = true;
		reset();
	}

	const worstLag = CHALLENGE.lag * LAG_SPREAD[1];
	const passed = $derived(
		!!result && result.stale === 0 && result.share <= CHALLENGE.maxPrimaryShare
	);

	function finish() {
		result = { stale: sim.stale, share: sim.primaryShare, routing, stick };
		mode = 'result';
		running = false;
		if (passed) progress.complete('challenge', 'read-your-writes', LEVEL);
	}

	onMount(() => {
		progress.hydrate();
		let last = performance.now();
		let raf = requestAnimationFrame(function frame(now) {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (running) {
				if (mode === 'challenge') {
					sim.step(Math.min(dt * CHALLENGE_SPEED, CHALLENGE.seconds - sim.t));
					if (sim.t >= CHALLENGE.seconds) finish();
				} else sim.step(dt);
				snap = read();
			}
			raf = requestAnimationFrame(frame);
		});
		return () => cancelAnimationFrame(raf);
	});
</script>

<figure class="sim surface" lang="bn">
	<div class="sim-head">
		<span class="eyebrow">Replication lag simulator</span>
		<span class="eyebrow">
			{mode === 'sandbox'
				? 'খেলার মাঠ'
				: `চ্যালেঞ্জ · ${Math.floor(snap.t)}s / ${CHALLENGE.seconds}s`}
		</span>
	</div>

	<div>
		<div class="sim-label">
			<span>Write-এর পরপরই নিজের ডেটা পড়া</span><span class="num">শেষ {snap.recent.length}টা</span>
		</div>
		<div class="rl-stream" aria-label="{snap.stale} stale reads so far">
			{#each snap.recent as r, i (i)}
				<span class="rl-read" class:primary={r.target === 0} class:stale={r.stale}></span>
			{/each}
		</div>
		<div class="rl-legend">
			<span><i class="rl-read"></i> replica থেকে, ঠিক ডেটা</span>
			<span><i class="rl-read primary"></i> primary থেকে</span>
			<span><i class="rl-read stale"></i> stale: নিজের write দেখেনি</span>
		</div>
	</div>

	<dl class="sim-stats">
		<div class:hot={snap.stale > 0}>
			<dt>Stale read</dt>
			<dd class="num">{snap.stale}</dd>
		</div>
		<div class:hot={snap.share > CHALLENGE.maxPrimaryShare}>
			<dt>Primary-তে read</dt>
			<dd class="num">{pct.format(snap.share)}</dd>
		</div>
		<div>
			<dt>মোট read</dt>
			<dd class="num">{snap.reads}</dd>
		</div>
		<div>
			<dt>Write</dt>
			<dd class="num">{snap.writes}</dd>
		</div>
	</dl>

	<div class="sim-controls">
		<fieldset class="rl-routes" disabled={mode === 'challenge'}>
			<legend>Read কোথায় যাবে</legend>
			{#each ROUTES as r (r.id)}
				<label>
					<input
						type="radio"
						name="rl-routing"
						value={r.id}
						checked={routing === r.id}
						onchange={() => {
							routing = r.id;
							if (mode === 'sandbox') reset();
						}}
					/>
					{r.label}
				</label>
			{/each}
		</fieldset>
		<div class="rl-sliders">
			<label>
				<span>Replica lag <b class="num">~{num.format(lag)} s</b></span>
				<input
					type="range"
					min="0"
					max="4"
					step="0.5"
					value={lag}
					disabled={mode !== 'sandbox'}
					oninput={(e) => {
						lag = +e.currentTarget.value;
						reset();
					}}
				/>
			</label>
			<label>
				<span
					>Primary-তে আটকে রাখার window <b class="num">{stick} s</b>
					{#if routing !== 'sticky'}<small>(শুধু read-your-writes-এ)</small>{/if}</span
				>
				<input
					type="range"
					min="0"
					max="30"
					value={stick}
					disabled={mode === 'challenge' || routing !== 'sticky'}
					oninput={(e) => {
						stick = +e.currentTarget.value;
						if (mode === 'sandbox') reset();
					}}
				/>
			</label>
		</div>
	</div>

	<div class="sim-challenge">
		{#if mode === 'sandbox'}
			<p>
				<b>চ্যালেঞ্জ:</b> replica গড়ে {CHALLENGE.lag}s পিছিয়ে। {CHALLENGE.seconds / 60} মিনিট ধরে
				<b>একজন user-ও যেন নিজের write মিস না করে</b>, আবার primary যেন মোট read-এর
				{pct.format(CHALLENGE.maxPrimaryShare)}-এর বেশি না নেয়। Routing আর window বেছে চালাও।
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={startChallenge}>চ্যালেঞ্জ চালাও</button>
				<button class="btn btn-ghost" onclick={() => (running = !running)}>
					{running ? 'Pause' : 'Play'}
				</button>
			</div>
		{:else if mode === 'challenge'}
			<p>{CHALLENGE_SPEED}× গতিতে চলছে…</p>
		{:else if result}
			<p class="sim-verdict" class:ok={passed}>
				<Icon name={passed ? 'trophy' : 'close'} size={18} />
				<b>{passed ? `পাস, +${xpForLevel(LEVEL)} XP` : 'ফেল'}</b>
				<span class="num">stale {result.stale} · primary {pct.format(result.share)}</span>
			</p>
			<p>
				{#if result.routing === 'primary'}
					কেউ stale ডেটা দেখেনি, কিন্তু primary একাই সব read নিচ্ছে। তাহলে replica রাখার মানেই থাকল
					না, আর read বাড়লে primary-ই আগে ভেঙে পড়বে।
				{:else if result.routing === 'replica'}
					{result.stale}টা read-এ user নিজের সদ্য করা write দেখেনি। Save করার পর page মাত্র কয়েকশো
					millisecond-এ reload হয়, কিন্তু replica তখনও ~{CHALLENGE.lag}s পিছিয়ে। User-এর চোখে মনে
					হয় save-ই হয়নি।
				{:else if result.stale > 0}
					Window ({result.stick}s) replica lag-এর চেয়ে ছোট। Lag কখনো কখনো {num.format(worstLag)}s
					পর্যন্ত যায়, তাই window শেষ হওয়ার পরেও replica পিছিয়ে থাকে আর {result.stale}টা read
					stale হয়।
				{:else if !passed}
					Stale নেই, কিন্তু window ({result.stick}s) দরকারের চেয়ে অনেক বড়। Write-এর পর অতক্ষণ
					user-এর সব read primary-তে যাচ্ছে, তাই primary-র ভাগ {pct.format(result.share)}-এ উঠে
					গেছে।
				{:else}
					Window ({result.stick}s) সবচেয়ে খারাপ lag-এর ({num.format(worstLag)}s) চেয়ে বড়, তাই কেউ
					নিজের write মিস করেনি। আর শুধু যারা এইমাত্র write করেছে তাদের read primary-তে যায়, বাকিরা
					replica-তেই থাকে। এটাই <b>read-your-writes</b> (session consistency)।
				{/if}
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={startChallenge}>আবার চালাও</button>
				<button class="btn btn-ghost" onclick={backToSandbox}>খেলার মাঠে ফেরো</button>
			</div>
		{/if}
	</div>
</figure>

<style>
	.rl-stream {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		min-height: 1.5rem;
	}
	.rl-read {
		display: inline-block;
		width: 12px;
		height: 12px;
		background: var(--fg);
		border: 1px solid var(--fg);
	}
	.rl-read.primary {
		background: transparent;
	}
	.rl-read.stale {
		background: repeating-linear-gradient(45deg, var(--fg) 0 2px, transparent 2px 4px);
	}
	.rl-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		margin-top: 0.6rem;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.rl-legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.rl-legend .rl-read {
		width: 10px;
		height: 10px;
	}
	.rl-routes {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		border: 0;
		font-size: 0.85rem;
	}
	.rl-routes legend {
		margin-bottom: 0.35rem;
		color: var(--muted);
	}
	.rl-routes label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.rl-routes input {
		accent-color: var(--fg);
	}
	.rl-sliders {
		display: grid;
		gap: 1rem;
	}
</style>
