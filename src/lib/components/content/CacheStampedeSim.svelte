<script lang="ts">
	import { onMount } from 'svelte';
	import './sim.css';
	import Icon from '$lib/components/Icon.svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';
	import { CHALLENGE, DB_TIME, result as grade, StampedeSim, type Mode } from '$lib/stampede-sim';

	const LEVEL = 'intermediate';
	const CHALLENGE_SPEED = 8;
	const MODES: [Mode, string][] = [
		['none', 'None'],
		['lock', 'Lock'],
		['early', 'Early refresh']
	];
	const num = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

	let rate = $state(300);
	let ttl = $state(5);
	let mode = $state<Mode>('none');
	let running = $state(true);
	let phase = $state<'sandbox' | 'challenge' | 'result'>('sandbox');
	let result = $state<ReturnType<typeof grade> & { mode: Mode; ttl: number }>();

	let sim = new StampedeSim(300, 5, 'none'); // matches the initial controls above
	let snap = $state.raw(read());

	function read() {
		return {
			t: sim.t,
			left: Math.max(0, sim.expiresAt - sim.t),
			db: sim.db.length,
			waiting: sim.waiting,
			peakDb: sim.peakDb,
			slow: sim.slow,
			dbQueries: sim.dbQueries
		};
	}

	function reset(seed?: number) {
		sim = new StampedeSim(rate, ttl, mode, seed);
		snap = read();
	}

	function setRate(v: number) {
		rate = v;
		sim.setRate(v);
	}

	function startChallenge() {
		rate = CHALLENGE.rate;
		reset(CHALLENGE.seed);
		result = undefined;
		phase = 'challenge';
		running = true;
	}

	function backToSandbox() {
		phase = 'sandbox';
		reset();
		running = true;
	}

	function finish() {
		result = { ...grade(sim), mode, ttl };
		phase = 'result';
		running = false;
		if (result.pass) progress.complete('challenge', 'cache-stampede', LEVEL);
	}

	onMount(() => {
		progress.hydrate();
		let last = performance.now();
		let raf = requestAnimationFrame(function frame(now) {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (running) {
				if (phase === 'challenge') {
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
		<span class="eyebrow">Cache stampede simulator</span>
		<span class="eyebrow">
			{phase === 'sandbox'
				? 'খেলার মাঠ'
				: `চ্যালেঞ্জ · ${Math.floor(snap.t)}s / ${CHALLENGE.seconds}s`}
		</span>
	</div>

	<div class="cs-lanes">
		<div>
			<div class="sim-label">
				<span>Cache</span>
				<span class="num">{snap.left > 0 ? `TTL ${num.format(snap.left)}s বাকি` : 'expired'}</span>
			</div>
			<div class="cs-ttl"><span style:width="{Math.min(1, snap.left / ttl) * 100}%"></span></div>
		</div>
		<div>
			<div class="sim-label"><span>DB-তে এখন</span><span class="num">{snap.db}</span></div>
			<div class="cs-dots" aria-label="{snap.db} queries on the database">
				{#each { length: snap.db }, i (i)}<span class="cs-dot"></span>{/each}
			</div>
		</div>
		<div>
			<div class="sim-label"><span>অপেক্ষায়</span><span class="num">{snap.waiting}</span></div>
			<div class="cs-dots" aria-label="{snap.waiting} requests waiting">
				{#each { length: snap.waiting }, i (i)}<span class="cs-dot wait"></span>{/each}
			</div>
		</div>
	</div>

	<dl class="sim-stats">
		<div class:hot={snap.peakDb > CHALLENGE.dbLimit}>
			<dt>Peak DB</dt>
			<dd class="num">{snap.peakDb}</dd>
		</div>
		<div class:hot={snap.slow > 0}>
			<dt>ধীর request</dt>
			<dd class="num">{snap.slow}</dd>
		</div>
		<div>
			<dt>DB query মোট</dt>
			<dd class="num">{snap.dbQueries}</dd>
		</div>
	</dl>

	<div class="sim-controls">
		<label>
			<span>Traffic <b class="num">{rate} req/s</b></span>
			<input
				type="range"
				min="50"
				max="1000"
				step="50"
				value={rate}
				disabled={phase !== 'sandbox'}
				oninput={(e) => setRate(+e.currentTarget.value)}
			/>
		</label>
		<label>
			<span>TTL <b class="num">{ttl}s</b></span>
			<input
				type="range"
				min="2"
				max="30"
				value={ttl}
				disabled={phase === 'challenge'}
				oninput={(e) => {
					ttl = +e.currentTarget.value;
					sim.ttl = ttl;
				}}
			/>
		</label>
	</div>

	<div class="cs-modes" role="group" aria-label="Protection">
		{#each MODES as [m, label] (m)}
			<button
				class="btn {mode === m ? 'btn-solid' : 'btn-ghost'}"
				aria-pressed={mode === m}
				disabled={phase === 'challenge'}
				onclick={() => {
					mode = m;
					if (phase === 'sandbox') reset();
				}}>{label}</button
			>
		{/each}
	</div>

	<div class="sim-challenge">
		{#if phase === 'sandbox'}
			<p>
				<b>চ্যালেঞ্জ:</b> হোমপেজে {CHALLENGE.rate} req/s। {CHALLENGE.seconds} সেকেন্ড ধরে DB-তে একসাথে
				{CHALLENGE.dbLimit}টার বেশি query যাবে না, আর <b>কোনো</b> ইউজার rebuild-এর জন্য অপেক্ষা করবে না।
				TTL আর protection বেছে চালাও।
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={startChallenge}>চ্যালেঞ্জ চালাও</button>
				<button class="btn btn-ghost" onclick={() => (running = !running)}>
					{running ? 'Pause' : 'Play'}
				</button>
			</div>
		{:else if phase === 'challenge'}
			<p>
				TTL {ttl}s, {MODES.find(([m]) => m === mode)?.[1]} নিয়ে চলছে, {CHALLENGE_SPEED}× গতিতে…
			</p>
		{:else if result}
			<p class="sim-verdict" class:ok={result.pass}>
				<Icon name={result.pass ? 'trophy' : 'close'} size={18} />
				<b>{result.pass ? `পাস, +${xpForLevel(LEVEL)} XP` : 'ফেল'}</b>
				<span class="num">peak DB {result.peakDb} · ধীর {result.slow}</span>
			</p>
			<p>
				{#if result.peakDb > CHALLENGE.dbLimit}
					প্রতিবার TTL শেষ হতেই rebuild-এর {DB_TIME * 1000}ms-এ যত request এলো, সবাই নিজেই DB-তে
					গেল, peak
					{result.peakDb}টা একসাথে। TTL বাড়ালে stampede কম ঘনঘন হয়, কিন্তু প্রতিটা সমান বড়: {CHALLENGE.rate}
					req/s × {DB_TIME}s ≈ {CHALLENGE.rate * DB_TIME}টা query।
				{:else if result.slow > 0}
					DB বেঁচে গেল, peak মাত্র {result.peakDb}। কিন্তু প্রতিবার expire হওয়ার পর lock ধরা
					rebuild শেষ না হওয়া পর্যন্ত বাকিরা দাঁড়িয়ে রইল, মোট {result.slow}টা request ধীর। শূন্য
					latency spike চাইলে value expire হওয়ার <b>আগেই</b> refresh করতে হবে।
				{:else}
					একটা request-ও অপেক্ষা করেনি। মেয়াদ ফুরানোর একটু আগে কোনো একটা request value রিফ্রেশ করে
					দিল, তাই cache কখনো ফাঁকা হয়নি। XFetch নিজে coordination করে না, তাই মাঝেমধ্যে কয়েকটা
					request একসাথে refresh করে ফেলে: peak {result.peakDb}, 1 নয়।
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
	.cs-lanes {
		display: grid;
		gap: 1rem;
	}
	.cs-ttl {
		height: 0.6rem;
		border: 1px solid var(--rule-strong);
	}
	.cs-ttl span {
		display: block;
		height: 100%;
		background: var(--fg);
	}
	.cs-dots {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		min-height: 1.25rem;
		align-content: flex-start;
	}
	.cs-dot {
		width: 7px;
		height: 7px;
		background: var(--fg);
	}
	.cs-dot.wait {
		background: none;
		border: 1px solid var(--fg);
	}
	.cs-modes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
