<script lang="ts">
	import { onMount } from 'svelte';

	let {
		words,
		typeMs = 65,
		deleteMs = 32,
		holdMs = 1500
	}: { words: string[]; typeMs?: number; deleteMs?: number; holdMs?: number } = $props();

	// Before mount / reduced-motion: render the first title statically (no cursor).
	let text = $state('');
	let animate = $state(false);

	function shuffle(a: number[]) {
		const r = [...a];
		for (let i = r.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[r[i], r[j]] = [r[j], r[i]];
		}
		return r;
	}

	onMount(() => {
		if (words.length < 2) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		animate = true;

		// start showing the first word, then shuffle the rest into a random order
		let order = [0, ...shuffle(words.map((_, i) => i).slice(1))];
		let pos = 0;
		let wi = order[pos];
		let i = words[wi].length;
		let phase: 'type' | 'hold' | 'delete' = 'hold';
		let timer: ReturnType<typeof setTimeout>;
		text = words[wi];

		const tick = () => {
			const word = words[wi];
			if (phase === 'type') {
				i++;
				text = word.slice(0, i);
				if (i >= word.length) {
					phase = 'hold';
					timer = setTimeout(tick, holdMs);
				} else {
					timer = setTimeout(tick, typeMs);
				}
			} else if (phase === 'hold') {
				phase = 'delete';
				timer = setTimeout(tick, deleteMs);
			} else {
				i--;
				text = word.slice(0, i);
				if (i <= 0) {
					pos = (pos + 1) % order.length;
					if (pos === 0) order = shuffle(order);
					wi = order[pos];
					phase = 'type';
					timer = setTimeout(tick, typeMs);
				} else {
					timer = setTimeout(tick, deleteMs);
				}
			}
		};

		timer = setTimeout(tick, holdMs);
		return () => clearTimeout(timer);
	});
</script>

<span class="inline-flex items-baseline whitespace-nowrap">
	<span aria-hidden="true">{animate ? text : words[0]}</span>
	<span class="sr-only">{words[0]}</span>
	{#if animate}
		<span class="tw-cursor" aria-hidden="true"></span>
	{/if}
</span>

<style>
	.tw-cursor {
		display: inline-block;
		width: 1px;
		height: 1em;
		margin-left: 2px;
		translate: 0 0.1em;
		background: var(--accent);
		animation: tw-blink 1s steps(1) infinite;
	}
	@keyframes tw-blink {
		0%,
		50% {
			opacity: 1;
		}
		50.01%,
		100% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tw-cursor {
			animation: none;
		}
	}
</style>
