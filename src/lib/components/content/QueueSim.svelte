<script lang="ts">
	import { onMount } from 'svelte';
	import './sim.css';
	import Icon from '$lib/components/Icon.svelte';
	import { progress } from '$lib/progress.svelte';
	import { CHALLENGE, MIN_WORKERS, QueueSim } from '$lib/queue-sim';

	const PER_WORKER = 10; // mean service ≈ 100 ms → ~10 req/s per worker
	const CHALLENGE_SPEED = 6;
	const ms = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
	const pct = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 });

	let rate = $state(20);
	let workers = $state(3);
	let running = $state(true);
	let mode = $state<'sandbox' | 'challenge' | 'result'>('sandbox');
	let result = $state<{ p99: number; dropped: number; workers: number } | null>(null);

	let sim = new QueueSim(20, 3); // matches the initial slider values above
	let snap = $state.raw(read());

	function read() {
		return {
			t: sim.t,
			queue: sim.queue.length,
			jobs: sim.workers.map((w) => (w ? Math.min(1, (sim.t - w.start) / (w.end - w.start)) : -1)),
			p50: sim.percentile(0.5, 10),
			p99: sim.percentile(0.99, mode === 'sandbox' ? 10 : Infinity),
			dropped: sim.dropped
		};
	}

	const load = $derived(rate / (workers * PER_WORKER));

	function setRate(v: number) {
		rate = v;
		sim.setRate(v);
	}
	function setWorkers(v: number) {
		workers = v;
		sim.setWorkers(v);
	}

	function startChallenge() {
		rate = CHALLENGE.rate;
		sim = new QueueSim(CHALLENGE.rate, workers, CHALLENGE.seed);
		result = null;
		mode = 'challenge';
		running = true;
	}

	function backToSandbox() {
		mode = 'sandbox';
		sim.dropped = 0;
		running = true;
	}

	function finish() {
		result = { p99: sim.percentile(0.99), dropped: sim.dropped, workers };
		mode = 'result';
		running = false;
		if (passed && workers === MIN_WORKERS)
			progress.complete('challenge', 'queue-capacity', 'intermediate');
	}

	const passed = $derived(!!result && result.dropped === 0 && result.p99 <= CHALLENGE.budget);

	onMount(() => {
		progress.hydrate();
		let last = performance.now();
		let raf = requestAnimationFrame(function frame(now) {
			// Cap the step so a backgrounded tab doesn't come back to a minute of backlog.
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
		<span class="eyebrow">Queue simulator</span>
		<span class="eyebrow">
			{mode === 'sandbox'
				? 'খেলার মাঠ'
				: `চ্যালেঞ্জ · ${ms.format(snap.t)}s / ${CHALLENGE.seconds}s`}
		</span>
	</div>

	<div class="qs-flow">
		<div class="qs-lane">
			<div class="sim-label">
				<span>Queue</span><span class="num">{snap.queue}</span>
			</div>
			<div class="qs-queue" aria-label="{snap.queue} requests waiting">
				{#each { length: snap.queue }, i (i)}<span class="qs-dot"></span>{/each}
			</div>
		</div>
		<div class="qs-lane">
			<div class="sim-label">
				<span>Workers</span><span class="num"
					>{snap.jobs.filter((j) => j >= 0).length}/{workers} busy</span
				>
			</div>
			<div class="qs-workers">
				{#each snap.jobs as j, i (i)}
					<span class="qs-worker" class:draining={i >= workers}>
						{#if j >= 0}<span class="qs-fill" style:width="{j * 100}%"></span>{/if}
					</span>
				{/each}
			</div>
		</div>
	</div>

	<dl class="sim-stats">
		<div>
			<dt>p50</dt>
			<dd class="num">{ms.format(snap.p50 * 1000)} ms</dd>
		</div>
		<div class:hot={snap.p99 > CHALLENGE.budget}>
			<dt>p99</dt>
			<dd class="num">{ms.format(snap.p99 * 1000)} ms</dd>
		</div>
		<div>
			<dt>Load</dt>
			<dd class="num">{pct.format(load)}</dd>
		</div>
		<div>
			<dt>Dropped</dt>
			<dd class="num">{snap.dropped}</dd>
		</div>
	</dl>

	<div class="sim-controls">
		<label>
			<span>Traffic <b class="num">{rate} req/s</b></span>
			<input
				type="range"
				min="0"
				max="80"
				value={rate}
				disabled={mode !== 'sandbox'}
				oninput={(e) => setRate(+e.currentTarget.value)}
			/>
		</label>
		<label>
			<span
				>Workers <b class="num">{workers}</b> <small>(≈ {workers * PER_WORKER} req/s)</small></span
			>
			<input
				type="range"
				min="1"
				max="10"
				value={workers}
				disabled={mode === 'challenge'}
				oninput={(e) => setWorkers(+e.currentTarget.value)}
			/>
		</label>
	</div>

	<div class="sim-challenge">
		{#if mode === 'sandbox'}
			<p>
				<b>চ্যালেঞ্জ:</b> traffic {CHALLENGE.rate} req/s-এ স্থির। {CHALLENGE.seconds} সেকেন্ড ধরে p99
				{ms.format(CHALLENGE.budget * 1000)} ms-এর নিচে রাখতে <b>সবচেয়ে কম</b> কয়টা worker লাগবে? ওপরের
				slider-এ worker সংখ্যা বেছে চালাও।
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={startChallenge}>চ্যালেঞ্জ চালাও</button>
				<button class="btn btn-ghost" onclick={() => (running = !running)}>
					{running ? 'Pause' : 'Play'}
				</button>
			</div>
		{:else if mode === 'challenge'}
			<p>{workers} worker নিয়ে চলছে, {CHALLENGE_SPEED}× গতিতে…</p>
		{:else if result}
			<p class="sim-verdict" class:ok={passed}>
				<Icon
					name={passed ? (result.workers === MIN_WORKERS ? 'trophy' : 'check') : 'close'}
					size={18}
				/>
				<b>
					{#if !passed}ফেল{:else if result.workers === MIN_WORKERS}পাস, +20 XP{:else}পাস, কিন্তু খরচ
						বেশি{/if}
				</b>
				<span class="num">p99 {ms.format(result.p99 * 1000)} ms</span>
			</p>
			<p>
				{#if result.dropped > 0}
					Queue ভরে গিয়ে {result.dropped}টা request drop হয়েছে। {result.workers} worker-এর capacity
					(≈{result.workers * PER_WORKER} req/s) traffic-এর চেয়েই কম, তাই queue শুধু বাড়তেই থাকে, কখনো
					খালি হয় না।
				{:else if !passed}
					গড় হিসাবে capacity ({result.workers * PER_WORKER} req/s) traffic-এর ({CHALLENGE.rate})
					চেয়ে বেশি, তবুও ফেল। Load {pct.format(CHALLENGE.rate / (result.workers * PER_WORKER))}-এ
					worker প্রায় কখনো ফাঁকা থাকে না, তাই request-গুলো একসাথে চলে এলে (burst) queue জমে যায়
					আর সেটা খালি হতে অনেক সময় লাগে। ওই অপেক্ষাটাই p99-এ ধরা পড়ে।
				{:else if result.workers > MIN_WORKERS}
					বাজেটের মধ্যে আছে, কিন্তু এর চেয়ে কম worker দিয়েও চলে। বাড়তি worker মানে বাড়তি সার্ভার
					খরচ, কমিয়ে আবার চেষ্টা করো।
				{:else}
					হিসাব বলে {CHALLENGE.rate} ÷ {PER_WORKER} = {CHALLENGE.rate / PER_WORKER}, মানে {Math.ceil(
						CHALLENGE.rate / PER_WORKER
					)}টা worker-ই যথেষ্ট। কিন্তু লাগল {MIN_WORKERS}টা। Capacity-র কাছাকাছি গেলে latency
					সরলরেখায় বাড়ে না, হঠাৎ লাফিয়ে ওঠে। এখানে পাস করতে load
					{pct.format(CHALLENGE.rate / (MIN_WORKERS * PER_WORKER))}-এ নামাতে হলো। বাকিটা burst
					সামলানোর জায়গা (headroom)।
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
	.qs-flow {
		display: grid;
		gap: 1rem;
	}
	.qs-queue {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		min-height: 2rem;
		align-content: flex-start;
	}
	.qs-dot {
		width: 7px;
		height: 7px;
		background: var(--fg);
	}
	.qs-workers {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(3.5rem, 1fr));
		gap: 6px;
	}
	.qs-worker {
		position: relative;
		height: 1.75rem;
		border: 1px solid var(--rule-strong);
		overflow: hidden;
	}
	.qs-worker.draining {
		border-style: dashed;
	}
	.qs-fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--fg);
	}
</style>
