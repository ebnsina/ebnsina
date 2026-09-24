<script lang="ts">
	import { onMount } from 'svelte';
	import './sim.css';
	import Icon from '$lib/components/Icon.svelte';
	import { progress, xpForLevel } from '$lib/progress.svelte';
	import {
		CHALLENGE,
		KEYS,
		imbalance,
		loads,
		moved,
		place,
		runChallenge,
		type Strategy
	} from '$lib/sharding-sim';

	const LEVEL = 'intermediate';
	const VNODES = [1, 2, 5, 10, 20, 50, 100, 200];
	const pct = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 });
	const ratio = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

	let strategy = $state<Strategy>('modulo');
	let vIndex = $state(0);
	let nodes = $state(4);
	let prevNodes = $state(4);
	let result = $state<ReturnType<typeof runChallenge> & { strategy: Strategy; vnodes: number }>();

	const vnodes = $derived(VNODES[vIndex]);
	const owners = $derived(place(strategy, nodes, vnodes));
	const before = $derived(place(strategy, prevNodes, vnodes));
	const counts = $derived(loads(owners, nodes));
	const movedCount = $derived(moved(before, owners));
	const worst = $derived(imbalance(owners, nodes));
	const peak = $derived(Math.max(...counts));
	const passed = $derived(!!result?.pass);

	// Strategy or vnode changes are a new layout, not a migration: nothing "moved".
	function relayout(fn: () => void) {
		fn();
		prevNodes = nodes;
		result = undefined;
	}

	function resize(delta: number) {
		prevNodes = nodes;
		nodes += delta;
		result = undefined;
	}

	function challenge() {
		prevNodes = CHALLENGE.from;
		nodes = CHALLENGE.to;
		result = { ...runChallenge(strategy, vnodes), strategy, vnodes };
		if (result.pass) progress.complete('challenge', 'consistent-hashing', LEVEL);
	}

	onMount(() => progress.hydrate());
</script>

<figure class="sim surface" lang="bn">
	<div class="sim-head">
		<span class="eyebrow">Sharding simulator</span>
		<span class="eyebrow">{KEYS.length} key · {nodes} shard</span>
	</div>

	<div>
		<div class="sim-label">
			<span>প্রতিটা shard-এ কয়টা key</span><span class="num"
				>গড় {Math.round(KEYS.length / nodes)}</span
			>
		</div>
		<div class="sh-bars">
			{#each counts as c, i (i)}
				<div class="sh-bar">
					<span class="num">S{i + 1}</span>
					<span class="sh-track"
						><span class="sh-fill" style:width="{(c / peak) * 100}%"></span></span
					>
					<span class="num">{c}</span>
				</div>
			{/each}
		</div>
	</div>

	<div>
		<div class="sim-label">
			<span
				>{prevNodes === nodes
					? 'Key-গুলো'
					: `${prevNodes} → ${nodes} shard: যে key-গুলো সরেছে`}</span
			>
			<span class="num">{movedCount} moved</span>
		</div>
		<div class="sh-keys" aria-label="{movedCount} of {KEYS.length} keys moved">
			{#each owners as o, i (i)}<span class="sh-key" class:moved={o !== before[i]}></span>{/each}
		</div>
	</div>

	<dl class="sim-stats">
		<div class:hot={movedCount / KEYS.length > CHALLENGE.maxMoved}>
			<dt>সরেছে</dt>
			<dd class="num">{pct.format(movedCount / KEYS.length)}</dd>
		</div>
		<div class:hot={worst > CHALLENGE.maxImbalance}>
			<dt>সবচেয়ে ভরা shard</dt>
			<dd class="num">{ratio.format(worst)}× গড়</dd>
		</div>
		<div>
			<dt>Shard</dt>
			<dd class="num">{nodes}</dd>
		</div>
	</dl>

	<div class="sim-controls">
		<fieldset class="sh-strategy">
			<legend>Key কোন shard-এ যাবে</legend>
			<label>
				<input
					type="radio"
					name="sh-strategy"
					checked={strategy === 'modulo'}
					onchange={() => relayout(() => (strategy = 'modulo'))}
				/>
				<code>hash % N</code>
			</label>
			<label>
				<input
					type="radio"
					name="sh-strategy"
					checked={strategy === 'ring'}
					onchange={() => relayout(() => (strategy = 'ring'))}
				/>
				Consistent hashing
			</label>
		</fieldset>
		<label>
			<span
				>প্রতি shard-এ virtual node <b class="num">{vnodes}</b>
				{#if strategy === 'modulo'}<small>(শুধু consistent hashing-এ)</small>{/if}</span
			>
			<input
				type="range"
				min="0"
				max={VNODES.length - 1}
				value={vIndex}
				disabled={strategy === 'modulo'}
				oninput={(e) => relayout(() => (vIndex = +e.currentTarget.value))}
			/>
		</label>
	</div>

	<div class="sim-actions">
		<button class="btn btn-ghost" disabled={nodes >= 10} onclick={() => resize(1)}>Shard যোগ</button
		>
		<button class="btn btn-ghost" disabled={nodes <= 2} onclick={() => resize(-1)}
			>Shard সরাও</button
		>
	</div>

	<div class="sim-challenge">
		{#if !result}
			<p>
				<b>চ্যালেঞ্জ:</b>
				{CHALLENGE.from} থেকে {CHALLENGE.to} shard-এ যাও, কিন্তু {pct.format(CHALLENGE.maxMoved)}-এর
				বেশি key যেন না সরে, আর কোনো shard যেন গড়ের {ratio.format(CHALLENGE.maxImbalance)}×-এর বেশি
				ভরা না থাকে। Strategy আর virtual node বেছে চালাও।
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={challenge}>চ্যালেঞ্জ চালাও</button>
			</div>
		{:else}
			<p class="sim-verdict" class:ok={passed}>
				<Icon name={passed ? 'trophy' : 'close'} size={18} />
				<b>{passed ? `পাস, +${xpForLevel(LEVEL)} XP` : 'ফেল'}</b>
				<span class="num"
					>{pct.format(result.movedShare)} moved · {ratio.format(result.imbalance)}× গড়</span
				>
			</p>
			<p>
				{#if result.strategy === 'modulo'}
					{pct.format(result.movedShare)} key সরে গেছে। <code>hash % 4</code> আর
					<code>hash % 5</code>
					প্রায় কোনো key-র জন্যই এক উত্তর দেয় না, তাই একটা shard যোগ করলেই প্রায় সব ডেটা অন্য জায়গায়
					copy করতে হয়। আদর্শ হলো শুধু নতুন shard-এর ভাগটুকু সরানো: {pct.format(1 / CHALLENGE.to)}।
				{:else if !passed}
					Ring-এ প্রতিটা shard-এর মাত্র {result.vnodes}টা বিন্দু, তাই বিন্দুগুলোর মাঝের ফাঁক অসমান।
					যে shard বড় ফাঁক পেয়েছে সে গড়ের {ratio.format(result.imbalance)}× key নিচ্ছে{result.movedShare >
					CHALLENGE.maxMoved
						? `, আর নতুন shard-টা বড় একটা ফাঁক দখল করে ${pct.format(result.movedShare)} key টেনে নিয়েছে`
						: ''}। Virtual node বাড়াও।
				{:else}
					শুধু নতুন shard-এর ভাগের key সরেছে ({pct.format(result.movedShare)}), আর {result.vnodes}টা
					virtual node ring-টাকে এত সূক্ষ্মভাবে ভাগ করেছে যে সবচেয়ে ভরা shard-ও গড়ের কাছাকাছি।
				{/if}
			</p>
			<div class="sim-actions">
				<button class="btn btn-solid" onclick={challenge}>আবার চালাও</button>
			</div>
		{/if}
	</div>
</figure>

<style>
	.sh-bars {
		display: grid;
		gap: 4px;
	}
	.sh-bar {
		display: grid;
		grid-template-columns: 2.25rem 1fr 3rem;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}
	.sh-bar .num:last-child {
		text-align: right;
	}
	.sh-track {
		height: 0.7rem;
		background: var(--rule);
	}
	.sh-fill {
		display: block;
		height: 100%;
		background: var(--fg);
	}
	.sh-keys {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(5px, 1fr));
		gap: 1px;
	}
	.sh-key {
		aspect-ratio: 1;
		background: var(--rule);
	}
	.sh-key.moved {
		background: var(--fg);
	}
	.sh-strategy {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		border: 0;
		font-size: 0.85rem;
	}
	.sh-strategy legend {
		margin-bottom: 0.35rem;
		color: var(--muted);
	}
	.sh-strategy label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.sh-strategy input {
		accent-color: var(--fg);
	}
</style>
