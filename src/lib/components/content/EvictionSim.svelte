<script lang="ts">
	import { onMount } from 'svelte';
	import './sim.css';
	import Icon from '$lib/components/Icon.svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';
	import {
		CHALLENGE,
		EvictionSim,
		HOT,
		kindOf,
		runChallenge,
		SCAN_EVERY,
		SCAN_LEN,
		type Policy
	} from '$lib/eviction-sim';

	const LEVEL = 'beginner';
	const SPEED = 100; // requests per second in the sandbox
	const CHALLENGE_SPEED = 1500;
	const POLICIES: [Policy, string][] = [
		['lru', 'LRU'],
		['lfu', 'LFU'],
		['fifo', 'FIFO']
	];
	const pct = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 });
	const int = new Intl.NumberFormat('en');

	let slots = $state(20);
	let policy = $state<Policy>('lru');
	let running = $state(true);
	let phase = $state<'sandbox' | 'challenge' | 'result'>('sandbox');
	let result = $state<{ hitRatio: number; slots: number; policy: Policy; pass: boolean }>();

	let sim = new EvictionSim(20, 'lru'); // matches the initial controls above
	let acc = 0;
	let snap = $state.raw(read());

	function read() {
		return {
			n: sim.n,
			keys: sim.slots.map((s) => kindOf(s.key)),
			recent: sim.recentRatio,
			overall: sim.hitRatio,
			hot: sim.hotCached,
			evictions: sim.evictions,
			scanning: sim.scanLeft > 0
		};
	}

	function reset(seed?: number) {
		sim = new EvictionSim(slots, policy, seed);
		acc = 0;
		snap = read();
	}

	function startChallenge() {
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
		const pass = slots <= CHALLENGE.maxSlots && sim.hitRatio >= CHALLENGE.target;
		result = { hitRatio: sim.hitRatio, slots, policy, pass };
		phase = 'result';
		running = false;
		if (pass) progress.complete('challenge', 'eviction-policy', LEVEL);
	}

	// Numbers the postmortems quote, computed from the same seeded run rather than written in.
	const lruAtMax = $derived(result?.policy === 'lru' ? runChallenge(60, 'lru').hitRatio : 0);
	const minLfu = $derived(
		result?.policy === 'lfu' && !result.pass
			? Array.from({ length: CHALLENGE.maxSlots }, (_, i) => i + 1).find(
					(n) => runChallenge(n, 'lfu').pass
				)
			: 0
	);

	onMount(() => {
		progress.hydrate();
		let last = performance.now();
		let raf = requestAnimationFrame(function frame(now) {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (running) {
				// Whole requests only, so the stream is identical whatever the frame rate.
				acc += dt * (phase === 'challenge' ? CHALLENGE_SPEED : SPEED);
				let todo = Math.floor(acc);
				acc -= todo;
				if (phase === 'challenge') todo = Math.min(todo, CHALLENGE.requests - sim.n);
				sim.run(todo);
				if (phase === 'challenge' && sim.n >= CHALLENGE.requests) finish();
				snap = read();
			}
			raf = requestAnimationFrame(frame);
		});
		return () => cancelAnimationFrame(raf);
	});
</script>

<figure class="sim surface" lang="bn">
	<div class="sim-head">
		<span class="eyebrow">Eviction simulator</span>
		<span class="eyebrow">
			{phase === 'sandbox'
				? 'খেলার মাঠ'
				: `চ্যালেঞ্জ · ${int.format(snap.n)} / ${int.format(CHALLENGE.requests)}`}
		</span>
	</div>

	<div>
		<div class="sim-label">
			<span>Cache · {slots} slot</span>
			<span>{snap.scanning ? 'batch scan চলছে…' : ''}</span>
		</div>
		<div class="ev-grid" aria-label="{snap.hot} of {HOT} hot keys cached">
			{#each { length: slots }, i (i)}
				<span class="ev-cell {snap.keys[i] ?? 'empty'}"></span>
			{/each}
		</div>
		<div class="ev-legend">
			<span><i class="ev-cell hot"></i> hot key</span>
			<span><i class="ev-cell cold"></i> মাঝেমধ্যে পড়া key</span>
			<span><i class="ev-cell scan"></i> scan-এর key (একবারই পড়া)</span>
		</div>
	</div>

	<dl class="sim-stats">
		<div>
			<dt>Hit ratio (শেষ 500)</dt>
			<dd class="num">{pct.format(snap.recent)}</dd>
		</div>
		<div class:hot={phase !== 'sandbox' && snap.overall < CHALLENGE.target}>
			<dt>Hit ratio (মোট)</dt>
			<dd class="num">{pct.format(snap.overall)}</dd>
		</div>
		<div>
			<dt>Hot key cache-এ</dt>
			<dd class="num">{snap.hot}/{HOT}</dd>
		</div>
		<div>
			<dt>Evictions</dt>
			<dd class="num">{int.format(snap.evictions)}</dd>
		</div>
	</dl>

	<div class="sim-controls">
		<label>
			<span>Memory <b class="num">{slots} slot</b></span>
			<input
				type="range"
				min="5"
				max="60"
				value={slots}
				disabled={phase === 'challenge'}
				oninput={(e) => {
					slots = +e.currentTarget.value;
					sim.resize(slots);
				}}
			/>
		</label>
	</div>

	<div class="ev-policies" role="group" aria-label="Eviction policy">
		{#each POLICIES as [p, label] (p)}
			<button
				class="btn {policy === p ? 'btn-solid' : 'btn-ghost'}"
				aria-pressed={policy === p}
				disabled={phase === 'challenge'}
				onclick={() => {
					policy = p;
					if (phase === 'sandbox') reset();
				}}>{label}</button
			>
		{/each}
	</div>

	<div class="sim-challenge">
		{#if phase === 'sandbox'}
			<p>
				<b>চ্যালেঞ্জ:</b> মেমরি সর্বোচ্চ {CHALLENGE.maxSlots} slot। প্রতি {SCAN_EVERY} request পরপর একটা
				batch job {SCAN_LEN}টা নতুন key একবার করে পড়ে। {int.format(CHALLENGE.requests)} request জুড়ে
				hit ratio
				{pct.format(CHALLENGE.target)} বা তার বেশি রাখো। Memory আর policy বেছে চালাও।
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={startChallenge}>চ্যালেঞ্জ চালাও</button>
				<button class="btn btn-ghost" onclick={() => sim.scan()}>Batch scan চালাও</button>
				<button class="btn btn-ghost" onclick={() => (running = !running)}>
					{running ? 'Pause' : 'Play'}
				</button>
			</div>
		{:else if phase === 'challenge'}
			<p>{slots} slot, {policy.toUpperCase()} নিয়ে চলছে…</p>
		{:else if result}
			<p class="sim-verdict">
				<Icon name={result.pass ? 'trophy' : 'close'} size={18} />
				<b>{result.pass ? `পাস, +${xpForLevel(LEVEL)} XP` : 'ফেল'}</b>
				<span class="num">hit ratio {pct.format(result.hitRatio)}</span>
			</p>
			<p>
				{#if result.slots > CHALLENGE.maxSlots}
					মেমরি বাজেট {CHALLENGE.maxSlots} slot, তুমি নিলে {result.slots}। বেশি মেমরি কিনে সমস্যা
					ঢাকা যায় না, policy বদলাও।
				{:else if result.pass}
					Scan-এর key-গুলো একবারই পড়া হয়, তাই LFU-র চোখে ওদের frequency 1। ওরা নিজেরাই একে অপরকে
					বের করে দেয়, আর hot key-গুলো cache-এ অক্ষত থাকে।
				{:else if result.policy === 'lru'}
					প্রতিটা scan {SCAN_LEN}টা নতুন key আনে, আর LRU-র চোখে ওগুলোই "সবচেয়ে সাম্প্রতিক"। তাই
					scan একবার চলা মানে সব hot key cache থেকে বেরিয়ে যাওয়া। একে বলে <b>cache pollution</b>।
					60 slot দিলেও LRU পায় মাত্র
					{pct.format(lruAtMax)}।
				{:else if result.policy === 'fifo'}
					FIFO জনপ্রিয়তা দেখেই না, সবচেয়ে আগে ঢোকা key-টাই বের করে দেয়, সেটা hot হলেও। তাই
					scan-এর ঢেউ hot key-গুলোকেও ঠেলে বের করে দেয়।
				{:else}
					Policy ঠিক আছে, কিন্তু {result.slots} slot-এ {HOT}টা hot key আর বাকি traffic-এর জায়গা হয়
					না। LFU-র লাগে অন্তত {minLfu} slot।
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
	.ev-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(1.1rem, 1fr));
		gap: 3px;
	}
	.ev-cell {
		display: inline-block;
		aspect-ratio: 1;
		min-width: 0.8rem;
		border: 1px solid var(--rule-strong);
	}
	.ev-cell.hot {
		background: var(--fg);
		border-color: var(--fg);
	}
	.ev-cell.cold {
		background: color-mix(in oklab, var(--fg) 25%, transparent);
	}
	.ev-cell.scan {
		background: repeating-linear-gradient(45deg, var(--muted) 0 2px, transparent 2px 5px);
	}
	.ev-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		margin-top: 0.6rem;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.ev-legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.ev-legend .ev-cell {
		width: 0.8rem;
	}
	.ev-policies {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
