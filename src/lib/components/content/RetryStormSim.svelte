<script lang="ts">
	import { onMount } from 'svelte';
	import './sim.css';
	import Icon from '$lib/components/Icon.svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';
	import {
		BREAKER,
		CAPACITY,
		CHALLENGE,
		NAIVE,
		RATE,
		RetrySim,
		SLOWDOWN,
		runChallenge,
		summarize,
		type Bucket
	} from '$lib/retry-sim';

	const LEVEL = 'intermediate';
	const SPEED = 6; // challenge replay: 60 simulated seconds in 10 real ones
	const CHART = 30; // seconds shown
	const LOAD_MAX = CAPACITY * 4;
	const n0 = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
	const n1 = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
	const pct = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 });

	let retries = $state(NAIVE.retries);
	let timeout = $state(NAIVE.timeout);
	let backoff = $state(NAIVE.backoff);
	let breaker = $state(NAIVE.breaker);
	let running = $state(true);
	let mode = $state<'sandbox' | 'challenge' | 'result'>('sandbox');

	let sim = new RetrySim({ ...NAIVE });
	let run = $state.raw<ReturnType<typeof runChallenge> | null>(null);
	let ranWith = $state.raw({ ...NAIVE }); // grade the run, not whatever the controls say now
	let playhead = 0;
	let snap = $state.raw(view([], 0));

	const settings = $derived({ retries, timeout, backoff, breaker });
	$effect(() => {
		sim.settings = settings; // sandbox picks up slider changes live
	});

	function view(bs: Bucket[], upto: number) {
		const last = bs[upto - 1];
		const from = Math.max(0, upto - CHART);
		return {
			t: upto,
			...summarize(bs.slice(Math.max(0, upto - 2), upto)),
			queue: last?.queue ?? 0,
			breaker: last?.breaker ?? 'closed',
			down: last?.down ?? false,
			chart: bs.slice(from, upto)
		};
	}

	function outage() {
		sim.startOutage(CHALLENGE.outageFor);
	}

	function startChallenge() {
		ranWith = { ...settings };
		run = runChallenge(ranWith);
		playhead = 0;
		mode = 'challenge';
		running = true;
	}

	function backToSandbox() {
		sim = new RetrySim({ ...settings });
		mode = 'sandbox';
		running = true;
	}

	function finish() {
		mode = 'result';
		running = false;
		if (won) progress.complete('challenge', 'retry-storm', LEVEL);
	}

	const won = $derived(!!run?.pass && ranWith.breaker);

	onMount(() => {
		progress.hydrate();
		let last = performance.now();
		let raf = requestAnimationFrame(function frame(now) {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (running && mode === 'challenge' && run) {
				playhead = Math.min(CHALLENGE.seconds, playhead + dt * SPEED);
				snap = view(run.sim.buckets, Math.floor(playhead));
				if (playhead >= CHALLENGE.seconds) finish();
			} else if (running && mode === 'sandbox') {
				sim.step(dt);
				snap = {
					...view(sim.buckets, Math.floor(sim.t)),
					queue: sim.queued,
					breaker: sim.breaker,
					down: sim.down
				};
			}
			raf = requestAnimationFrame(frame);
		});
		return () => cancelAnimationFrame(raf);
	});

	const BREAKER_LABEL = { closed: 'Closed', open: 'Open', 'half-open': 'Half-open' };
</script>

<figure class="sim surface" lang="bn">
	<div class="sim-head">
		<span class="eyebrow">Retry storm simulator</span>
		<span class="eyebrow">
			{mode === 'sandbox' ? 'খেলার মাঠ' : `চ্যালেঞ্জ · ${snap.t}s / ${CHALLENGE.seconds}s`}
		</span>
	</div>

	<div>
		<div class="sim-label">
			<span>Success rate (লাইন) আর dependency load (বার), শেষ {CHART} সেকেন্ড</span>
			{#if snap.down}<b>Outage চলছে</b>{/if}
		</div>
		<svg
			class="rs-chart"
			viewBox="0 0 {CHART * 10} 100"
			preserveAspectRatio="none"
			role="img"
			aria-label="Success rate {pct.format(snap.success)}, dependency load {n0.format(
				snap.load
			)} req/s"
		>
			{#each snap.chart as b, i (i)}
				{#if b.down}<rect class="rs-down" x={i * 10} y="0" width="10" height="100" />{/if}
				<rect
					class="rs-bar"
					x={i * 10 + 1.5}
					y={100 - Math.min(1, b.sent / LOAD_MAX) * 100}
					width="7"
					height={Math.min(1, b.sent / LOAD_MAX) * 100}
				/>
			{/each}
			<line
				class="rs-cap"
				x1="0"
				x2={CHART * 10}
				y1={100 - (CAPACITY / LOAD_MAX) * 100}
				y2={100 - (CAPACITY / LOAD_MAX) * 100}
			/>
			<polyline
				class="rs-line"
				points={snap.chart
					.map((b, i) => `${i * 10 + 5},${100 - (b.done ? b.ok / b.done : 1) * 100}`)
					.join(' ')}
			/>
		</svg>
		<div class="rs-breaker" aria-hidden="true">
			{#each snap.chart as b, i (i)}<span class:open={b.breaker !== 'closed'}></span>{/each}
		</div>
		<p class="rs-legend">
			ধূসর পটভূমি = outage · আড়াআড়ি রেখা = dependency capacity ({CAPACITY} req/s) · নিচের ঘর ভরা = breaker
			open
		</p>
	</div>

	<dl class="sim-stats">
		<div class:hot={snap.success < CHALLENGE.target}>
			<dt>Success</dt>
			<dd class="num">{pct.format(snap.success)}</dd>
		</div>
		<div class:hot={snap.load > CAPACITY}>
			<dt>Dependency load</dt>
			<dd class="num">{n0.format(snap.load)} req/s</dd>
		</div>
		<div>
			<dt>Attempt / request</dt>
			<dd class="num">{n1.format(snap.amp)}×</dd>
		</div>
		<div>
			<dt>Queue</dt>
			<dd class="num">{n0.format(snap.queue)}</dd>
		</div>
		<div>
			<dt>Breaker</dt>
			<dd class="num">{breaker ? BREAKER_LABEL[snap.breaker] : 'নেই'}</dd>
		</div>
	</dl>

	<div class="sim-controls">
		<label>
			<span>Retries <b class="num">{retries}</b></span>
			<input type="range" min="0" max="5" bind:value={retries} disabled={mode === 'challenge'} />
		</label>
		<label>
			<span>Timeout <b class="num">{n1.format(timeout)}s</b></span>
			<input
				type="range"
				min="0.5"
				max="5"
				step="0.5"
				bind:value={timeout}
				disabled={mode === 'challenge'}
			/>
		</label>
		<label class="rs-check">
			<input type="checkbox" bind:checked={backoff} disabled={mode === 'challenge'} />
			<span>Exponential backoff + jitter</span>
		</label>
		<label class="rs-check">
			<input type="checkbox" bind:checked={breaker} disabled={mode === 'challenge'} />
			<span
				>Circuit breaker <small>({pct.format(BREAKER.ratio)} fail → {BREAKER.open}s open)</small
				></span
			>
		</label>
	</div>

	<div class="sim-challenge">
		{#if mode === 'sandbox'}
			<p>
				<b>চ্যালেঞ্জ:</b> user traffic {RATE} req/s, dependency-র capacity {CAPACITY} req/s। {CHALLENGE.outageAt}
				সেকেন্ডে dependency {CHALLENGE.outageFor} সেকেন্ডের জন্য {SLOWDOWN} গুণ ধীর হয়ে যাবে। Outage
				শেষ হওয়ার
				{CHALLENGE.within} সেকেন্ডের মধ্যে success rate {pct.format(CHALLENGE.target)}-এর ওপরে
				ফিরিয়ে আনো, আর সেখানেই রাখো। শুরুর setting-টাই সবচেয়ে প্রচলিত: {NAIVE.retries}বার সাথে
				সাথে retry, {NAIVE.timeout}s timeout।
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={startChallenge}>চ্যালেঞ্জ চালাও</button>
				<button class="btn btn-ghost" onclick={outage} disabled={snap.down}>Outage দাও</button>
				<button class="btn btn-ghost" onclick={() => (running = !running)}>
					{running ? 'Pause' : 'Play'}
				</button>
			</div>
		{:else if mode === 'challenge'}
			<p>চলছে, {SPEED}× গতিতে…</p>
		{:else if run}
			<p class="sim-verdict" class:ok={run.pass}>
				<Icon name={won ? 'trophy' : run.pass ? 'check' : 'close'} size={18} />
				<b>
					{#if won}পাস, +{xpForLevel(LEVEL)} XP{:else if run.pass}পাস, কিন্তু retry ছাড়া{:else}ফেল{/if}
				</b>
				<span class="num">
					{run.recoverySeconds === null ? 'আর ফেরেনি' : `ফিরেছে ${run.recoverySeconds}s পরে`}
				</span>
			</p>
			<p>
				{#if won}
					Outage শেষ হওয়ার {run.recoverySeconds} সেকেন্ডের মধ্যে ফিরে এসেছে। Breaker open থাকার সময়
					নতুন attempt dependency পর্যন্ত যায়নি, fail fast হয়েছে, তাই জমে থাকা queue খালি হওয়ার সুযোগ
					পেয়েছে। Outage-এর পরে প্রতি request-এ গড়ে {n1.format(run.amp)}টা attempt, dependency-তে {n0.format(
						run.load
					)} req/s, capacity-র নিচে।
				{:else if run.pass}
					Retry বন্ধ, তাই amplification {n1.format(run.amp)}×, dependency কখনো নিজের capacity-র বেশি
					load পায়নি। কিন্তু এখন প্রতিটা ছোট network blip সরাসরি user-এর error হয়ে যাবে। Retry
					চালু রেখে breaker দিয়ে পাস করা যায় কিনা দেখো।
				{:else if run.amp * RATE > CAPACITY}
					Outage শেষ, dependency আবার পুরো গতিতে, তবুও সিস্টেম ফেরেনি। প্রতি user request-এ গড়ে
					{n1.format(run.amp)}টা attempt, মানে dependency-তে {n0.format(run.load)} req/s, অথচ capacity
					{CAPACITY}। Timeout হওয়া attempt-গুলোও queue-এ থেকে যায়: dependency {n0.format(
						run.wasted
					)}টা কাজ করেছে যার উত্তরের জন্য কেউ অপেক্ষা করছিল না। Queue তাই কখনো খালি হয় না, retry
					নিজেই overload টিকিয়ে রাখে। এটাই
					<b>retry storm</b>।
					{#if ranWith.backoff}Backoff retry-গুলো পিছিয়ে দিয়েছে, কিন্তু কমায়নি: প্রতিটা retry শেষ
						পর্যন্ত পাঠানো হয়েছেই।{/if}
				{:else}
					Retry-র চাপ নেই, তবুও {run.recoverySeconds === null
						? 'সময়ের মধ্যে ফেরেনি'
						: `ফিরতে ${run.recoverySeconds}s লেগেছে`}
					(সীমা {CHALLENGE.within}s)। Outage-এর সময় জমা হওয়া request-গুলোর timeout হয়ে গেছে,
					কিন্তু dependency সেগুলো queue থেকে একটা একটা করে শেষ করেছে, মোট {n0.format(run.wasted)}টা
					বৃথা কাজ। নতুন request সেই লাইনের পেছনে দাঁড়িয়ে timeout হয়েছে।
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
	.rs-chart {
		display: block;
		width: 100%;
		height: 8rem;
	}
	.rs-down {
		fill: var(--fg);
		opacity: 0.08;
	}
	.rs-bar {
		fill: var(--rule-strong);
	}
	.rs-cap {
		stroke: var(--muted);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.rs-line {
		fill: none;
		stroke: var(--fg);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.rs-breaker {
		display: grid;
		grid-template-columns: repeat(30, 1fr);
		gap: 2px;
		margin-top: 4px;
	}
	.rs-breaker span {
		height: 6px;
		border: 1px solid var(--rule);
	}
	.rs-breaker span.open {
		background: var(--fg);
		border-color: var(--fg);
	}
	.rs-legend {
		margin: 0.4rem 0 0;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.rs-check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.rs-check input {
		accent-color: var(--fg);
	}
</style>
