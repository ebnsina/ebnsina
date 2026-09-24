<script lang="ts">
	import { onMount } from 'svelte';
	import './sim.css';
	import Icon from '$lib/components/Icon.svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';
	import {
		ALGOS,
		BACKENDS,
		CHALLENGE,
		LbSim,
		MEAN_WORK,
		SLOTS,
		SLOW_INDEX,
		percentile,
		type Algo
	} from '$lib/lb-sim';

	const LEVEL = 'beginner';
	const CHALLENGE_SPEED = 6;
	const ms = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
	const one = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
	const LABEL: Record<Algo, string> = {
		'round-robin': 'Round-robin',
		random: 'Random',
		'least-conn': 'Least-conn',
		'two-choices': 'Two choices'
	};

	let rate = $state(24);
	let slow = $state(3);
	let algo = $state<Algo>('round-robin');
	let running = $state(true);
	let mode = $state<'sandbox' | 'challenge' | 'result'>('sandbox');
	let result = $state<{ p99: number; dropped: number; algo: Algo } | null>(null);

	let sim = new LbSim(24, 'round-robin', 3); // matches the initial control values above
	let snap = $state.raw(read());

	// The same challenge run with no slow backend: the floor any algorithm can reach.
	const baseline = new LbSim(CHALLENGE.rate, 'least-conn', 1, CHALLENGE.seed);
	baseline.step(CHALLENGE.seconds);
	const baseP99 = percentile(baseline.done, 0.99);

	function read() {
		const since = mode === 'sandbox' ? sim.t - 10 : -Infinity;
		return {
			t: sim.t,
			backends: sim.backends.map((b) => ({
				inFlight: sim.inFlight(b),
				p99: percentile(b.done, 0.99, since),
				slow: b.slow
			})),
			p50: percentile(sim.done, 0.5, since),
			p99: percentile(sim.done, 0.99, since),
			dropped: sim.dropped
		};
	}

	function setAlgo(a: Algo) {
		algo = a;
		sim.algo = a;
	}
	function setRate(v: number) {
		rate = v;
		sim.setRate(v);
	}
	function setSlow(v: number) {
		slow = v;
		sim.setSlow(v);
	}

	function startChallenge() {
		rate = CHALLENGE.rate;
		slow = CHALLENGE.slow;
		sim = new LbSim(CHALLENGE.rate, algo, CHALLENGE.slow, CHALLENGE.seed);
		result = null;
		mode = 'challenge';
		running = true;
	}

	function backToSandbox() {
		mode = 'sandbox';
		running = true;
	}

	const passed = $derived(!!result && result.dropped === 0 && result.p99 <= CHALLENGE.budget);
	// What the slow backend can finish per second vs what an even split sends it.
	const slowCap = SLOTS / (MEAN_WORK * CHALLENGE.slow);
	const evenShare = CHALLENGE.rate / BACKENDS;

	function finish() {
		result = { p99: percentile(sim.done, 0.99), dropped: sim.dropped, algo };
		mode = 'result';
		running = false;
		if (passed) progress.complete('challenge', 'lb-slow-backend', LEVEL);
	}

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
		<span class="eyebrow">Load balancer simulator</span>
		<span class="eyebrow">
			{mode === 'sandbox'
				? 'খেলার মাঠ'
				: `চ্যালেঞ্জ · ${ms.format(snap.t)}s / ${CHALLENGE.seconds}s`}
		</span>
	</div>

	<div class="lb-backends">
		{#each snap.backends as b, i (i)}
			<div class="lb-row">
				<div class="sim-label">
					<span
						>s{i + 1}{#if i === SLOW_INDEX}&nbsp;· {one.format(b.slow)}× ধীর{/if}</span
					>
					<span class="num">{b.inFlight} in-flight · p99 {ms.format(b.p99 * 1000)} ms</span>
				</div>
				<div class="lb-dots" aria-label="{b.inFlight} requests on s{i + 1}">
					{#each { length: b.inFlight }, j (j)}<span class="lb-dot" class:busy={j < SLOTS}
						></span>{/each}
				</div>
			</div>
		{/each}
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
			<dt>Dropped</dt>
			<dd class="num">{snap.dropped}</dd>
		</div>
	</dl>

	<div class="lb-algos" role="group" aria-label="Algorithm">
		{#each ALGOS as a (a)}
			<button
				class="btn {algo === a ? 'btn-solid' : 'btn-ghost'}"
				aria-pressed={algo === a}
				disabled={mode === 'challenge'}
				onclick={() => setAlgo(a)}>{LABEL[a]}</button
			>
		{/each}
	</div>

	<div class="sim-controls">
		<label>
			<span>Traffic <b class="num">{rate} req/s</b></span>
			<input
				type="range"
				min="0"
				max="60"
				value={rate}
				disabled={mode !== 'sandbox'}
				oninput={(e) => setRate(+e.currentTarget.value)}
			/>
		</label>
		<label>
			<span>s{SLOW_INDEX + 1} কতটা ধীর <b class="num">{slow}×</b></span>
			<input
				type="range"
				min="1"
				max="8"
				value={slow}
				disabled={mode !== 'sandbox'}
				oninput={(e) => setSlow(+e.currentTarget.value)}
			/>
		</label>
	</div>

	<div class="sim-challenge">
		{#if mode === 'sandbox'}
			<p>
				<b>চ্যালেঞ্জ:</b> traffic {CHALLENGE.rate} req/s, আর s{SLOW_INDEX + 1} বাকিদের চেয়ে
				{CHALLENGE.slow}× ধীর। {CHALLENGE.seconds} সেকেন্ড ধরে p99
				{ms.format(CHALLENGE.budget * 1000)} ms-এর নিচে রাখবে কোন algorithm? ওপর থেকে একটা বেছে চালাও।
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={startChallenge}>চ্যালেঞ্জ চালাও</button>
				<button class="btn btn-ghost" onclick={() => (running = !running)}>
					{running ? 'Pause' : 'Play'}
				</button>
			</div>
		{:else if mode === 'challenge'}
			<p>{LABEL[algo]} দিয়ে চলছে, {CHALLENGE_SPEED}× গতিতে…</p>
		{:else if result}
			<p class="sim-verdict">
				<Icon name={passed ? 'trophy' : 'close'} size={18} />
				<b>{passed ? `পাস, +${xpForLevel(LEVEL)} XP` : 'ফেল'}</b>
				<span class="num">p99 {ms.format(result.p99 * 1000)} ms</span>
			</p>
			<p>
				{#if result.algo === 'round-robin'}
					Round-robin চোখ বন্ধ করে প্রতি {BACKENDS}টা request-এর একটা s{SLOW_INDEX + 1}-এ পাঠায়,
					মানে সেকেন্ডে {evenShare}টা। কিন্তু {CHALLENGE.slow}× ধীর s{SLOW_INDEX + 1} সেকেন্ডে শেষ করতে
					পারে মাত্র ~{one.format(slowCap)}টা। বাকিগুলো তার queue-তে জমতেই থাকে ({result.dropped}টা
					drop), অথচ পাশের server-গুলো প্রায় বসে থাকে।
				{:else if result.algo === 'random'}
					Random-ও গড়ে প্রতি {BACKENDS}টার একটা s{SLOW_INDEX + 1}-এ পাঠায়, সেকেন্ডে ~{evenShare}টা,
					যেখানে সে পারে ~{one.format(slowCap)}টা। কে কতটা ব্যস্ত সেটা না দেখলে ধীর server-এর queue
					বাড়তেই থাকে ({result.dropped}টা drop)।
				{:else if result.algo === 'least-conn'}
					Least-connections কারো speed জানে না, শুধু গোনে কার হাতে কয়টা request। s{SLOW_INDEX + 1} ধীর
					বলে তার হাতে request আটকে থাকে, তাই নতুন request আপনা থেকেই অন্যদিকে চলে যায়। তবুও p99 ধীর
					server ছাড়া যা হতো ({ms.format(baseP99 * 1000)} ms) তার চেয়ে বেশি: যে request-গুলো s{SLOW_INDEX +
						1}-এ পড়ে, সেগুলো ধীরই থাকে।
				{:else}
					Two choices দুটো random backend দেখে কম ব্যস্তটায় পাঠায়। সবগুলো না দেখেও ফল
					least-connections-এর কাছাকাছি, আর অনেকগুলো load balancer instance-এর মধ্যে কোনো shared
					state লাগে না।
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
	.lb-backends {
		display: grid;
		gap: 0.9rem;
	}
	.lb-dots {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		min-height: 7px;
	}
	.lb-dot {
		width: 7px;
		height: 7px;
		border: 1px solid var(--fg);
	}
	.lb-dot.busy {
		background: var(--fg);
	}
	.lb-algos {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
		gap: 0.5rem;
	}
</style>
